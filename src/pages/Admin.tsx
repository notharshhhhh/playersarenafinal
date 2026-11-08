import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Shield, Users, Trophy, DollarSign, Settings, 
  Search, Ban, Unlock, Wallet, Plus, Minus, Trash2, 
  Clock, Map as MapIcon, Users as UsersIcon, LogOut,
  CheckCircle2, AlertCircle, Loader2, Save, RefreshCw,
  Edit2, Copy, Upload, Gamepad2, Key, Check, CheckCheck,
  ListChecks, FileText, Sparkles, PlusCircle, RotateCcw,
  Filter, ChevronUp, ChevronDown, Send, Bell, Image as ImageIcon, Megaphone, AlertTriangle, UserCheck, ChevronRight, Gift,
  Globe, ExternalLink
} from 'lucide-react';
import { Page, User, Tournament, Banner, PaymentGateway, StaffMember } from '../types';
import { db, auth, storage, handleFirestoreError, OperationType, resolvedFirebaseConfig } from '../lib/firebase';
import { formatMatchTime } from '../utils/dateUtils';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';
import AdminNotificationsTab from '../components/AdminNotificationsTab';
import AdminStaffTab from '../components/AdminStaffTab';
import MediaLibraryTab from '../components/MediaLibraryTab';
import MediaPickerModal from '../components/MediaPickerModal';

import { 
  collection, doc, onSnapshot, updateDoc, deleteDoc,
  addDoc, serverTimestamp, runTransaction, writeBatch,
  query, where, orderBy, getDocs, getDoc, increment, setDoc
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import { usePopup } from '../components/PopupProvider';
import { readStaffSettlement, writeStaffSettlement } from '../services/staffMatchService';
import AdvancedLoader from '../components/AdvancedLoader';

interface AdminPageProps {
  user?: User | null;
  onPageChange: (page: Page, id?: string) => void;
}

enum AdminTab {
  DASHBOARD = 'dashboard',
  STAFF = 'staff',
  PAYMENT = 'payment',
  DEPOSITS = 'deposits',
  WITHDRAWALS = 'withdrawals',
  SETTINGS = 'settings',
  GAMES = 'games',
  MODES = 'modes',
  MATCHES = 'matches',
  ANNOUNCEMENTS = 'announcements',
  BANNERS = 'banners',
  NOTIFICATIONS = 'notifications',
  USERS = 'users',
  TRANSACTIONS = 'transactions',
  RULES = 'rules',
  REFERRAL = 'referral',
  MEDIA = 'media'
}

// Built-in rule presets for various game modes and sections
const RULE_PRESETS: Record<string, { title: string; category: string; rules: string[] }> = {
  battle_royale: {
    title: 'Battle Royale',
    category: 'Battle Royale',
    rules: [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: Strictly mobile & tablet devices only. Emulators/PC are 100% prohibited.',
      'Registration Name: Enter exact in-game IGN without font errors or unsupported special characters.',
      'Anti-Teaming Rule: Teaming with opponents is strictly prohibited and results in permanent ban.',
      'Hacking & Scripts: Zero-tolerance policy for aimbots, auto-headshots, speed hacks, or modified game files.',
      'Late Entry: Room closes 2 minutes before match start time. Late entry is not entertained.',
      'Screenshot Policy: In case of ranking/kill dispute, high-definition final match screenshot is mandatory.',
      'Match Result Policy: Scores will be verified by the admin team post-match before prize distribution.',
      'Cancellation & Refund Policy: If a match is cancelled by admin, 100% of entry fee is refunded back to wallet instantly.'
    ]
  },
  clash_squad: {
    title: 'Clash Squad (4v4 / Duo)',
    category: 'Clash Squad',
    rules: [
      'Level Requirement: Minimum Level 40 in Free Fire account.',
      'Headshot Rate: Clash Squad headshot rate must remain below 70%.',
      'Device Requirements: Mobile & Tablet only. Emulators will be immediately kicked and banned.',
      'Gun Attributes: Gun attributes and character skill settings will be as per custom room setup.',
      'Grenades & Items: Usage of limited tactical items will follow room preset rules.',
      'Teaming & Sabotage: Teaming or intentional feeding is strictly forbidden.',
      'Screenshot Policy: Winning team captain must submit end-game score screenshot in case of dispute.',
      'Prize Distribution: Winnings will be credited automatically to winning player/team wallets post verification.',
      'Admin Decision: Admin ruling will be final and binding for all participants.'
    ]
  },
  lone_wolf: {
    title: 'Lone Wolf (1v1 / 2v2)',
    category: 'Lone Wolf',
    rules: [
      'Level Requirement: Level 30+ Free Fire profile.',
      'Headshot Rate: Lone Wolf headshot rate maximum 75%.',
      'Device Requirements: Mobile / Tablet players only. No PC / Emulators.',
      'Fair Duel: One-on-one duel requires true sportsman spirit without glitch exploiting.',
      'Weapon Restrictions: Respect custom weapon restrictions if specified in room title (e.g. M1887 only, Sniper only).',
      'Disconnect Policy: If a player disconnects mid-round, rematch will only be granted if admin verifies technical glitch.',
      'Screenshot Requirement: Final victory screen screenshot mandatory for dispute settlement.',
      'Instant Payout: Winnings credited within 10-15 minutes after match confirmation.'
    ]
  },
  custom_room: {
    title: 'Custom Room / Tournament',
    category: 'Custom Room',
    rules: [
      'All standard esports tournament fairplay rules apply.',
      'Slot Assignment: Players must join ONLY their assigned slot number. Wrong slot leads to kick without refund.',
      'Room Settings: Custom room parameters (Ammo, Fall Damage, Character Skills) are set as specified in match title.',
      'No third-party crosshairs, config files, or GFX tools allowed.',
      'Admin decision is final in all dispute settlements.'
    ]
  },
  sniper_only: {
    title: 'Sniper Only Challenge',
    category: 'Sniper Only',
    rules: [
      'Only Sniper Rifles (AWM, Kar98k, M82B, Barrett) are permitted for combat.',
      'Using pistols, melee, or AR/SMG weapons will result in immediate disqualification with 0 points.',
      'No emulator or modified script allowed.',
      'Final kill feed and damage screenshot must be submitted.'
    ]
  },
  four_v_four: {
    title: '4v4 Clash Duel',
    category: '4v4 Clash',
    rules: [
      'Full squad (4 players) must be ready before room launch time.',
      'All 4 players must have registered with valid IGNs.',
      'No roof camping or out-of-bounds wall glitching.',
      'First team to win the required round count wins the contest.'
    ]
  },
  one_v_one: {
    title: '1v1 Duel Arena',
    category: '1v1 Duel',
    rules: [
      'Pure 1v1 head-to-head showdown on chosen map.',
      'Gun selection rules as specified in room rules (e.g. Desert Eagle only or Shotgun only).',
      'No wall-trapping or infinite gloo wall glitch.',
      'Proof screenshot required for claiming bounty prize.'
    ]
  }
};

export default function AdminPage({ user, onPageChange }: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>(AdminTab.DASHBOARD);
  const [users, setUsers] = useState<User[]>([]);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<{ isOpen: boolean, matchId: string }>({ isOpen: false, matchId: '' });
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [selectedMatchResults, setSelectedMatchResults] = useState<Tournament | null>(null);
  const [playerResults, setPlayerResults] = useState<Record<string, number>>({}); // userId -> value (kills or rank)
  const [playerPositionResults, setPlayerPositionResults] = useState<Record<string, number>>({}); // userId -> rank (for PER KILL matches)
  const { showConfirm, showSuccess, showError, showWarning, showInstructions } = usePopup();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Dynamic Rules State for All Game Mode Sections
  const [gameRulesDocs, setGameRulesDocs] = useState<Record<string, { id: string; title: string; category?: string; section?: string; rules: string[]; updatedAt?: any }>>({});
  const [gameModesList, setGameModesList] = useState<any[]>([]);
  const [activeRuleTab, setActiveRuleTab] = useState<string>('battle_royale');
  const [activeSectionTitle, setActiveSectionTitle] = useState<string>('Battle Royale');
  const [activeSectionCategory, setActiveSectionCategory] = useState<string>('Battle Royale');
  const [ruleText, setRuleText] = useState('');
  const [ruleList, setRuleList] = useState<string[]>([]);
  const [ruleEditMode, setRuleEditMode] = useState<'interactive' | 'raw'>('interactive');
  const [newSingleRuleText, setNewSingleRuleText] = useState('');
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [newSectionForm, setNewSectionForm] = useState({ title: '', category: '', template: 'battle_royale' });

  // Room ID & Password Declaration State
  const [isDeclareRoomModalOpen, setIsDeclareRoomModalOpen] = useState(false);
  const [selectedDeclareRoomMatch, setSelectedDeclareRoomMatch] = useState<Tournament | null>(null);
  const [declareRoomForm, setDeclareRoomForm] = useState({
    roomId: '',
    roomPassword: '',
    setStatusLive: true,
    customNotes: '',
    sendNotificationOnRoomDeclare: true
  });
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'need_room' | 'room_ready' | 'live' | 'completed'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<any>(null);
  const [gamesList, setGamesList] = useState<any[]>([]);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<any | null>(null);
  const [gameForm, setGameForm] = useState({ id: '', title: '', subtitle: 'TOURNAMENTS', image: '', order: 1 });
  const gameFileInputRef = React.useRef<HTMLInputElement>(null);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [announcementsList, setAnnouncementsList] = useState<{ id: string; text: string; link: string; isActive: boolean }[]>([]);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementLink, setAnnouncementLink] = useState('rules');
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);

  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [bannerType, setBannerType] = useState<Banner['type']>('main');
  const [bannerOrder, setBannerOrder] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'game' | 'banner' | null>(null);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [gatewayForm, setGatewayForm] = useState({
    name: '',
    apiKey: '',
    secretKey: '',
    merchantId: '',
    webhookSecret: '',
    upiId: ''
  });
  const [staffCount, setStaffCount] = useState(0);

  // Manual Payment, QR, App Logo, App Name, and Limits state
  const [manualUpiId, setManualUpiId] = useState('8707088647@fam');
  const [manualQrUrl, setManualQrUrl] = useState('https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=8707088647@fam&pn=KhelGalli');
  const [paymentAppsList, setPaymentAppsList] = useState<{ id: string; name: string; iconUrl: string }[]>([
    { id: 'phonepe', name: 'Phone Pay', iconUrl: 'https://img.icons8.com/color/96/phone-pe.png' },
    { id: 'paytm', name: 'Paytm', iconUrl: 'https://img.icons8.com/color/96/paytm.png' },
    { id: 'gpay', name: 'Google Pay', iconUrl: 'https://img.icons8.com/color/96/google-pay-india.png' },
    { id: 'bhim', name: 'BHIM UPI', iconUrl: 'https://img.icons8.com/color/96/bhim.png' }
  ]);
  const [newPaymentAppName, setNewPaymentAppName] = useState('');
  const [newPaymentAppIcon, setNewPaymentAppIcon] = useState('');
  const [appNameSetting, setAppNameSetting] = useState(() => {
    try {
      const cached = localStorage.getItem('kg_app_branding');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.appName) return parsed.appName;
      }
    } catch {}
    return 'KIDS ADDA';
  });
  const [appLogoUrlSetting, setAppLogoUrlSetting] = useState(() => {
    try {
      const cached = localStorage.getItem('kg_app_branding');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.appLogoUrl) return parsed.appLogoUrl;
      }
    } catch {}
    return 'https://i.ibb.co/n8jPYbMP/image.png';
  });
  const [minDepositSetting, setMinDepositSetting] = useState(10);
  const [maxDepositSetting, setMaxDepositSetting] = useState(50000);
  const [minWithdrawSetting, setMinWithdrawSetting] = useState(50);
  const [maxWithdrawSetting, setMaxWithdrawSetting] = useState(25000);
  const [signupBonusSetting, setSignupBonusSetting] = useState(0);
  const [maxBonusPerMatchSetting, setMaxBonusPerMatchSetting] = useState(100);
  const [depositFilter, setDepositFilter] = useState<'pending' | 'completed' | 'failed' | 'all'>('pending');
  const [withdrawFilter, setWithdrawFilter] = useState<'pending' | 'completed' | 'failed' | 'all'>('pending');
  const [copiedVercelDomain, setCopiedVercelDomain] = useState(false);

  const qrFileInputRef = React.useRef<HTMLInputElement>(null);
  const logoFileInputRef = React.useRef<HTMLInputElement>(null);

  // Modal back handlers
  useModalBackHandler(isDeleteConfirmOpen.isOpen, () => setIsDeleteConfirmOpen({ isOpen: false, matchId: '' }));
  useModalBackHandler(isResultModalOpen, () => setIsResultModalOpen(false));
  useModalBackHandler(isBannerModalOpen, () => setIsBannerModalOpen(false));
  useModalBackHandler(isGameModalOpen, () => setIsGameModalOpen(false));
  useModalBackHandler(isDeclareRoomModalOpen, () => setIsDeclareRoomModalOpen(false));
  useModalBackHandler(isAddSectionModalOpen, () => setIsAddSectionModalOpen(false));
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const downloadURL = await uploadOriginalImage(file, (p) => setUploadProgress(p));
      setManualQrUrl(downloadURL);
      showSuccess('QR Code Uploaded', 'New UPI QR code image is ready. Click SAVE to publish it for users.');
    } catch (err) {
      console.error('QR upload failed:', err);
      showError('QR Upload Failed', 'Could not upload QR image. Please try again or paste a direct image URL.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const downloadURL = await uploadOriginalImage(file, (p) => setUploadProgress(p));
      setAppLogoUrlSetting(downloadURL);
      showSuccess('App Logo Uploaded', 'New app logo image is ready. Click SAVE to apply across the app.');
    } catch (err) {
      console.error('Logo upload failed:', err);
      showError('Logo Upload Failed', 'Could not upload App Logo. Please try again or paste a direct URL.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveManualPaymentSettings = async () => {
    setIsProcessing(true);
    const cleanAppName = appNameSetting.trim() || 'KIDS ADDA';
    const cleanLogoUrl = appLogoUrlSetting.trim() || 'https://i.ibb.co/n8jPYbMP/image.png';

    // Immediately update localStorage and dispatch event so all headers update without delay
    try {
      const brandingPayload = { appName: cleanAppName, appLogoUrl: cleanLogoUrl };
      localStorage.setItem('kg_app_branding', JSON.stringify(brandingPayload));
      window.dispatchEvent(new CustomEvent('app-branding-updated', { detail: brandingPayload }));
    } catch {}

    try {
      const payload = {
        appName: cleanAppName,
        appLogoUrl: cleanLogoUrl,
        upiId: manualUpiId.trim() || '8707088647@fam',
        qrCodeUrl: manualQrUrl.trim(),
        manualPayment: {
          upiId: manualUpiId.trim() || '8707088647@fam',
          qrCodeUrl: manualQrUrl.trim(),
          merchantName: cleanAppName,
          paymentApps: paymentAppsList
        },
        limits: {
          minDeposit: Number(minDepositSetting) || 10,
          maxDeposit: Number(maxDepositSetting) || 50000,
          minWithdraw: Number(minWithdrawSetting) || 50,
          maxWithdraw: Number(maxWithdrawSetting) || 25000
        },
        signupBonus: Math.max(0, Number(signupBonusSetting) || 0),
        bonusSettings: {
          signupBonus: Math.max(0, Number(signupBonusSetting) || 0),
          maxBonusPerMatchPercent: Math.max(0, Math.min(100, Number(maxBonusPerMatchSetting) || 100)),
          enableSignupBonus: (Number(signupBonusSetting) || 0) > 0,
          updatedAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      };

      await Promise.allSettled([
        setDoc(doc(db, 'appSettings', 'referral_support'), payload, { merge: true }),
        setDoc(doc(db, 'appSettings', 'general'), {
          appName: cleanAppName,
          appLogoUrl: cleanLogoUrl,
          updatedAt: serverTimestamp()
        }, { merge: true })
      ]);

      setAppSettings((prev: any) => ({ ...(prev || {}), ...payload }));
      showSuccess(
        'SETTINGS UPDATED!',
        `App branding (${cleanAppName}), manual UPI QR settings, limits, and bonus settings have been saved.`
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'appSettings/referral_support');
      showError('SAVE FAILED', 'Failed to save settings to the database.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveBonusSettings = async (overrideBonus?: number) => {
    setIsProcessing(true);
    const targetBonus = overrideBonus !== undefined ? Math.max(0, overrideBonus) : Math.max(0, Number(signupBonusSetting) || 0);
    const targetMaxMatchBonus = Math.max(0, Math.min(100, Number(maxBonusPerMatchSetting) || 100));
    try {
      const payload = {
        signupBonus: targetBonus,
        bonusSettings: {
          signupBonus: targetBonus,
          maxBonusPerMatchPercent: targetMaxMatchBonus,
          enableSignupBonus: targetBonus > 0,
          updatedAt: serverTimestamp()
        }
      };
      await setDoc(doc(db, 'appSettings', 'referral_support'), payload, { merge: true });
      setAppSettings((prev: any) => ({ ...(prev || {}), ...payload }));
      setSignupBonusSetting(targetBonus);
      showSuccess(
        'BONUS SETTINGS UPDATED!',
        targetBonus === 0
          ? 'Signup bonus set to ₹0. Newly registered players will receive ₹0 bonus.'
          : `Signup bonus set to ₹${targetBonus}. Newly registered players will receive ₹${targetBonus} in their Bonus Wallet.`
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'appSettings/referral_support');
      showError('SAVE ERROR', 'Failed to save bonus settings to database.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveDeposit = async (tx: any) => {
    if (!tx?.id || tx.status === 'completed' || processingTxId === tx.id) return;

    const depositAmount = Number(tx.amount || 0);
    const displayName = tx.userName || users.find((u) => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'confirm',
      badge: 'APPROVE DEPOSIT REQUEST',
      title: `Approve ₹${depositAmount} Deposit?`,
      message: `Verify UTR (${tx.utr || 'N/A'}) for ${displayName}. Approving will immediately credit +₹${depositAmount} to their Deposit Wallet.`,
      instructions: [
        `₹${depositAmount} will be added to ${displayName}'s Deposit Wallet.`,
        'Transaction status will change from PENDING to SUCCESS.',
        'User will receive an instant wallet credit notification.',
      ],
      confirmText: 'APPROVE & CREDIT',
      cancelText: 'CANCEL',
    });

    if (!confirmed) return;

    setProcessingTxId(tx.id);
    setIsProcessing(true);
    try {
      // Optimistically update local state immediately for snappy UI
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'completed' } : item))
      );

      let approved = false;

      // 1. Try server-side Admin API first (bypasses client security rule constraints)
      try {
        const res = await fetch('/api/admin/approve-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
          body: JSON.stringify({
            txId: tx.id,
            userId: tx.userId,
            amount: depositAmount,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.success) {
          approved = true;
        }
      } catch {}

      // 2. Fallback to client-side Firestore writes using setDoc({ merge: true }) so missing user docs never fail
      if (!approved) {
        await setDoc(
          doc(db, 'transactions', tx.id),
          {
            status: 'completed',
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (tx.userId && depositAmount > 0) {
          const userRef = doc(db, 'users', tx.userId);
          const userSnap = await getDoc(userRef);
          const currentDep = userSnap.exists() ? Number(userSnap.data()?.wallet?.deposit || 0) : 0;
          const currentWins = userSnap.exists() ? Number(userSnap.data()?.wallet?.winnings || 0) : 0;
          const currentBonus = userSnap.exists() ? Number(userSnap.data()?.wallet?.bonus || 0) : 0;
          await setDoc(
            userRef,
            {
              wallet: {
                deposit: currentDep + depositAmount,
                winnings: currentWins,
                bonus: currentBonus,
              },
            },
            { merge: true }
          );
        }
      }

      // Notify user
      try {
        await addDoc(collection(db, 'notifications'), {
          title: '✅ Deposit Approved!',
          message: `Your deposit of ₹${depositAmount} (UTR: ${tx.utr || 'N/A'}) has been verified and added to your Deposit Wallet.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: [],
        });
      } catch {}

      showSuccess(
        'DEPOSIT APPROVED!',
        `₹${depositAmount} has been credited to ${displayName}'s Deposit Wallet.`
      );
    } catch (e: any) {
      console.error('Deposit approval error:', e);
      // Revert optimistic state on error
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'pending' } : item))
      );
      showError('APPROVAL FAILED', e?.message || 'Failed to approve deposit request.');
    } finally {
      setProcessingTxId(null);
      setIsProcessing(false);
    }
  };

  const handleRejectDeposit = async (tx: any) => {
    if (!tx?.id || tx.status === 'failed' || processingTxId === tx.id) return;

    const depositAmount = Number(tx.amount || 0);
    const displayName = tx.userName || users.find((u) => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'REJECT DEPOSIT REQUEST',
      title: `Reject ₹${depositAmount} Deposit?`,
      message: `Are you sure you want to reject ${displayName}'s deposit request (UTR: ${tx.utr || 'N/A'})?`,
      instructions: [
        'NO amount (₹0) will be added to the user Deposit Wallet.',
        'Transaction status will be marked as REJECTED.',
        'User will be notified that their UTR could not be verified.',
      ],
      confirmText: 'YES, REJECT',
      cancelText: 'CANCEL',
    });

    if (!confirmed) return;

    setProcessingTxId(tx.id);
    setIsProcessing(true);
    try {
      // Optimistically update local state immediately
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'failed' } : item))
      );

      let rejected = false;
      try {
        const res = await fetch('/api/admin/reject-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
          body: JSON.stringify({ txId: tx.id }),
        });
        const data = await res.json();
        if (res.ok && data?.success) rejected = true;
      } catch {}

      if (!rejected) {
        await setDoc(
          doc(db, 'transactions', tx.id),
          {
            status: 'failed',
            rejectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      try {
        await addDoc(collection(db, 'notifications'), {
          title: '❌ Deposit Request Rejected',
          message: `Your deposit request of ₹${depositAmount} could not be verified. No amount was added to your wallet. Please check your UTR.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: [],
        });
      } catch {}

      showWarning(
        'DEPOSIT REJECTED',
        `Deposit request of ₹${depositAmount} by ${displayName} was rejected. ₹0 was added to their wallet.`
      );
    } catch (e: any) {
      console.error('Reject deposit error:', e);
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'pending' } : item))
      );
      showError('REJECTION FAILED', e?.message || 'Failed to reject deposit.');
    } finally {
      setProcessingTxId(null);
      setIsProcessing(false);
    }
  };

  const handleApproveWithdrawal = async (tx: any) => {
    if (!tx?.id || tx.status === 'completed' || processingTxId === tx.id) return;

    const withdrawAmount = Number(tx.amount || 0);
    const displayName = tx.userName || users.find((u) => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'confirm',
      badge: 'CONFIRM PAYOUT SENT',
      title: `Mark ₹${withdrawAmount} Withdrawal Paid?`,
      message: `Confirm that you have transferred ₹${withdrawAmount} to ${displayName}'s UPI ID (${tx.upiId || 'N/A'}).`,
      instructions: [
        'Ensure UPI payout has been completed before marking Success.',
        'Transaction status will be updated to SUCCESS.',
      ],
      confirmText: 'MARK PAID (SUCCESS)',
      cancelText: 'CANCEL',
    });

    if (!confirmed) return;

    setProcessingTxId(tx.id);
    setIsProcessing(true);
    try {
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'completed' } : item))
      );

      let approved = false;
      try {
        const res = await fetch('/api/admin/approve-withdrawal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
          body: JSON.stringify({ txId: tx.id }),
        });
        const data = await res.json();
        if (res.ok && data?.success) approved = true;
      } catch {}

      if (!approved) {
        await setDoc(
          doc(db, 'transactions', tx.id),
          {
            status: 'completed',
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      try {
        await addDoc(collection(db, 'notifications'), {
          title: '💸 Withdrawal Sent!',
          message: `Your withdrawal of ₹${withdrawAmount} to ${tx.upiId || 'your UPI ID'} has been processed successfully.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: [],
        });
      } catch {}

      showSuccess(
        'WITHDRAWAL COMPLETED!',
        `Withdrawal of ₹${withdrawAmount} for ${displayName} has been marked as PAID.`
      );
    } catch (e: any) {
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'pending' } : item))
      );
      showError('UPDATE FAILED', e?.message || 'Failed to mark withdrawal success');
    } finally {
      setProcessingTxId(null);
      setIsProcessing(false);
    }
  };

  const handleRejectWithdrawal = async (tx: any) => {
    if (!tx?.id || tx.status === 'failed' || processingTxId === tx.id) return;

    const withdrawAmount = Number(tx.amount || 0);
    const displayName = tx.userName || users.find((u) => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'REJECT & REFUND WITHDRAWAL',
      title: `Reject ₹${withdrawAmount} Withdrawal?`,
      message: `Rejecting this request will automatically refund ₹${withdrawAmount} back to ${displayName}'s Winnings Wallet.`,
      instructions: [
        `+₹${withdrawAmount} will be refunded to ${displayName}'s Winnings balance.`,
        'Withdrawal request will be marked as REJECTED.',
      ],
      confirmText: 'REJECT & REFUND',
      cancelText: 'CANCEL',
    });

    if (!confirmed) return;

    setProcessingTxId(tx.id);
    setIsProcessing(true);
    try {
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'failed' } : item))
      );

      let rejected = false;
      try {
        const res = await fetch('/api/admin/reject-withdrawal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
          body: JSON.stringify({
            txId: tx.id,
            userId: tx.userId,
            amount: withdrawAmount,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.success) rejected = true;
      } catch {}

      if (!rejected) {
        await setDoc(
          doc(db, 'transactions', tx.id),
          {
            status: 'failed',
            rejectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (tx.userId && withdrawAmount > 0) {
          const userRef = doc(db, 'users', tx.userId);
          const userSnap = await getDoc(userRef);
          const currentDep = userSnap.exists() ? Number(userSnap.data()?.wallet?.deposit || 0) : 0;
          const currentWins = userSnap.exists() ? Number(userSnap.data()?.wallet?.winnings || 0) : 0;
          const currentBonus = userSnap.exists() ? Number(userSnap.data()?.wallet?.bonus || 0) : 0;
          await setDoc(
            userRef,
            {
              wallet: {
                deposit: currentDep,
                winnings: currentWins + withdrawAmount,
                bonus: currentBonus,
              },
            },
            { merge: true }
          );
        }
      }

      try {
        await addDoc(collection(db, 'notifications'), {
          title: '⚠️ Withdrawal Rejected & Refunded',
          message: `Your withdrawal request of ₹${withdrawAmount} was rejected and ₹${withdrawAmount} has been refunded to your Winnings wallet.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: [],
        });
      } catch {}

      showWarning(
        'WITHDRAWAL REJECTED & REFUNDED',
        `Withdrawal of ₹${withdrawAmount} was rejected and refunded to ${displayName}'s Winnings Wallet.`
      );
    } catch (e: any) {
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'pending' } : item))
      );
      showError('REJECTION FAILED', e?.message || 'Failed to reject withdrawal');
    } finally {
      setProcessingTxId(null);
      setIsProcessing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log("File picked for banner upload:", file.name);
    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      const downloadURL = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      console.log("Uploaded successfully at 100% original quality:", downloadURL);
      setImageUrl(downloadURL);
      setUploadProgress(100);
    } catch (error: any) {
      console.error('Upload Process Error:', error);
      showError('UPLOAD FAILED', 'Banner upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGameImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(10);
    try {
      const downloadURL = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setGameForm(prev => ({ ...prev, image: downloadURL }));
      setUploadProgress(100);
    } catch (error) {
      console.error('Game image upload error:', error);
      showError('UPLOAD FAILED', 'Game image upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveGame = async () => {
    if (!gameForm.title.trim()) {
      showWarning('GAME TITLE REQUIRED', 'Please enter a Game Title (e.g. FREE FIRE or BGMI).');
      return;
    }
    const cleanId = (gameForm.id || gameForm.title).toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
    if (!cleanId) {
      showWarning('INVALID GAME ID', 'Please enter a valid alphanumeric Game Title.');
      return;
    }

    setIsProcessing(true);
    try {
      await setDoc(doc(db, 'games', cleanId), {
        id: cleanId,
        title: gameForm.title.trim().toUpperCase(),
        subtitle: (gameForm.subtitle || 'TOURNAMENTS').trim().toUpperCase(),
        image: gameForm.image.trim() || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1000&auto=format&fit=crop',
        order: Number(gameForm.order) || gamesList.length + 1,
        isActive: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsGameModalOpen(false);
      setEditingGame(null);
      setGameForm({ id: '', title: '', subtitle: 'TOURNAMENTS', image: '', order: 1 });
      showSuccess('GAME ARENA SAVED', 'Game Arena has been saved and published to the Home screen.');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'games');
      showError('SAVE FAILED', 'Could not save Game Arena.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteGame = async (gameId: string, title: string) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'DELETE GAME ARENA',
      title: `Delete "${title}"?`,
      message: `Are you sure you want to remove the "${title}" Game Arena from the Home screen?`,
      confirmText: 'YES, DELETE',
      cancelText: 'CANCEL',
    });
    if (!confirmed) return;
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'games', gameId));
      showSuccess('GAME DELETED', `"${title}" has been removed.`);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `games/${gameId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveAnnouncementItem = async () => {
    const cleanText = announcementText.trim().toUpperCase();
    if (!cleanText) {
      showWarning('TEXT REQUIRED', 'Please enter announcement text before publishing.');
      return;
    }
    setIsProcessing(true);
    try {
      // Remove default placeholder when admin saves a real announcement so the new text is immediately primary on Home
      let baseItems = announcementsList.filter(item => item.id !== 'default_fairplay');

      if (editingAnnouncementId && editingAnnouncementId !== 'default_fairplay') {
        baseItems = baseItems.map(item =>
          item.id === editingAnnouncementId
            ? { ...item, text: cleanText, link: announcementLink.trim() || 'rules', isActive: true }
            : item
        );
      } else {
        baseItems = [
          {
            id: `ann_${Date.now()}`,
            text: cleanText,
            link: announcementLink.trim() || 'rules',
            isActive: true
          },
          ...baseItems
        ];
      }

      setAnnouncementsList(baseItems);
      try {
        localStorage.setItem('kg_announcements_cache', JSON.stringify(baseItems));
      } catch {}

      await Promise.allSettled([
        setDoc(doc(db, 'appSettings', 'referral_support'), {
          announcements: baseItems,
          activeAnnouncementText: cleanText,
          updatedAt: serverTimestamp()
        }, { merge: true }),
        setDoc(doc(db, 'appSettings', 'announcements'), {
          items: baseItems,
          activeText: cleanText,
          updatedAt: serverTimestamp()
        }, { merge: true })
      ]);

      setAnnouncementText('');
      setAnnouncementLink('rules');
      setEditingAnnouncementId(null);
    } catch (e) {
      console.error('Failed to save announcement:', e);
      handleFirestoreError(e, OperationType.WRITE, 'appSettings/referral_support');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleAnnouncement = async (id: string) => {
    setIsProcessing(true);
    try {
      const updatedItems = announcementsList.map(item =>
        item.id === id ? { ...item, isActive: !item.isActive } : item
      );
      setAnnouncementsList(updatedItems);
      try {
        localStorage.setItem('kg_announcements_cache', JSON.stringify(updatedItems));
      } catch {}

      await Promise.allSettled([
        setDoc(doc(db, 'appSettings', 'referral_support'), {
          announcements: updatedItems,
          updatedAt: serverTimestamp()
        }, { merge: true }),
        setDoc(doc(db, 'appSettings', 'announcements'), {
          items: updatedItems,
          updatedAt: serverTimestamp()
        }, { merge: true })
      ]);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'appSettings/referral_support');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'DELETE ANNOUNCEMENT',
      title: 'Delete Announcement?',
      message: 'This announcement will be removed from the Home page ticker.',
      confirmText: 'DELETE',
      cancelText: 'CANCEL',
    });
    if (!confirmed) return;
    setIsProcessing(true);
    try {
      const updatedItems = announcementsList.filter(item => item.id !== id);
      setAnnouncementsList(updatedItems);
      try {
        localStorage.setItem('kg_announcements_cache', JSON.stringify(updatedItems));
      } catch {}

      await Promise.allSettled([
        setDoc(doc(db, 'appSettings', 'referral_support'), {
          announcements: updatedItems,
          updatedAt: serverTimestamp()
        }, { merge: true }),
        setDoc(doc(db, 'appSettings', 'announcements'), {
          items: updatedItems,
          updatedAt: serverTimestamp()
        }, { merge: true })
      ]);
      showSuccess('ANNOUNCEMENT REMOVED', 'Announcement has been deleted.');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'appSettings/referral_support');
    } finally {
      setIsProcessing(false);
    }
  };

  // Real-time listeners
  useEffect(() => {

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubGames = onSnapshot(collection(db, 'games'), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99));
      setGamesList(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'games'));

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      setMatches(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Tournament)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'));

    const unsubTrans = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any));
      list.sort((a, b) => {
        const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt?.toDate === 'function' ? a.createdAt.toDate().getTime() : 0);
        const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt?.toDate === 'function' ? b.createdAt.toDate().getTime() : 0);
        return tB - tA;
      });
      setTransactions(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    const unsubRules = onSnapshot(collection(db, 'gameRules'), (snapshot) => {
      const docsMap: Record<string, any> = {};
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        docsMap[docSnap.id] = {
          id: docSnap.id,
          title: data.title || data.section || data.type || docSnap.id.replace(/_/g, ' '),
          category: data.category || data.title || 'General',
          section: data.section || data.title || docSnap.id,
          rules: data.rules || [],
          updatedAt: data.updatedAt
        };
      });
      setGameRulesDocs(docsMap);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'gameRules'));

    const unsubModes = onSnapshot(collection(db, 'gameModes'), (snapshot) => {
      setGameModesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'gameModes'));

    const unsubSettings = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setAppSettings(data);
        if (Array.isArray(data?.announcements)) {
          setAnnouncementsList(data.announcements);
        }
        if (data?.appName) setAppNameSetting(data.appName);
        if (data?.appLogoUrl) setAppLogoUrlSetting(data.appLogoUrl);
        const manual = data?.manualPayment || {};
        if (manual.upiId || data?.upiId) setManualUpiId(manual.upiId || data.upiId);
        if (manual.qrCodeUrl || data?.qrCodeUrl) setManualQrUrl(manual.qrCodeUrl || data.qrCodeUrl);
        if (Array.isArray(manual.paymentApps) && manual.paymentApps.length > 0) {
          setPaymentAppsList(manual.paymentApps);
        }
        const limits = data?.limits || {};
        if (limits.minDeposit !== undefined) setMinDepositSetting(Number(limits.minDeposit));
        if (limits.maxDeposit !== undefined) setMaxDepositSetting(Number(limits.maxDeposit));
        if (limits.minWithdraw !== undefined) setMinWithdrawSetting(Number(limits.minWithdraw));
        if (limits.maxWithdraw !== undefined) setMaxWithdrawSetting(Number(limits.maxWithdraw));
        if (data?.signupBonus !== undefined) {
          setSignupBonusSetting(Number(data.signupBonus));
        } else if (data?.bonusSettings?.signupBonus !== undefined) {
          setSignupBonusSetting(Number(data.bonusSettings.signupBonus));
        }
        if (data?.bonusSettings?.maxBonusPerMatchPercent !== undefined) {
          setMaxBonusPerMatchSetting(Number(data.bonusSettings.maxBonusPerMatchPercent));
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'appSettings/referral_support'));

    const unsubAnnouncements = onSnapshot(doc(db, 'appSettings', 'announcements'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (Array.isArray(data?.items)) {
          setAnnouncementsList(data.items);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'appSettings/announcements'));

    const unsubBanners = onSnapshot(collection(db, 'banners'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
      list.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
      setBanners(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'banners'));

    const unsubGateways = onSnapshot(collection(db, 'paymentSettings'), (snapshot) => {
      setPaymentGateways(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentGateway)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'paymentSettings'));

    const unsubStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      setStaffCount(snapshot.size);
    }, (err) => console.warn('Admin staff listener error:', err));

    setLoading(false);
    return () => {
      unsubUsers();
      unsubGames();
      unsubMatches();
      unsubTrans();
      unsubRules();
      unsubModes();
      unsubSettings();
      unsubAnnouncements();
      unsubBanners();
      unsubGateways();
      unsubStaff();
    };
  }, []);

  const [isInitializingStarter, setIsInitializingStarter] = useState(false);

  const handleInitializeStarterPack = async () => {
    const confirmed = await showConfirm({
      variant: 'instruction',
      badge: 'INITIALIZE FIRESTORE DATABASE',
      title: 'Initialize Starter Data into Firestore?',
      message: 'This will seed starter Games (Free Fire, BGMI), dynamic Tournament Modes, Fair-Play Rules, and default Announcements directly into your Firestore database.',
      confirmText: 'INITIALIZE DATABASE',
      cancelText: 'CANCEL',
    });
    if (!confirmed) return;

    setIsInitializingStarter(true);
    try {
      const batch = writeBatch(db);

      // 1. Starter Games
      batch.set(doc(db, 'games', 'freefire'), {
        id: 'freefire',
        title: 'FREE FIRE',
        subtitle: 'TOURNAMENTS',
        image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1000&auto=format&fit=crop',
        order: 1,
        isActive: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      batch.set(doc(db, 'games', 'bgmi'), {
        id: 'bgmi',
        title: 'BATTLEGROUNDS MOBILE INDIA',
        subtitle: 'TOURNAMENTS',
        image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1000&auto=format&fit=crop',
        order: 2,
        isActive: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Starter Modes for Free Fire
      const ffModes = [
        { id: 'br_solo', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop', order: 1 },
        { id: 'br_duo', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop', order: 2 },
        { id: 'br_squad', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop', order: 3 },
        { id: 'cs_solo', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop', order: 4 },
        { id: 'cs_squad', title: 'CS SQUAD', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop', order: 5 },
        { id: 'lone_wolf_solo', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=800&auto=format&fit=crop', order: 6 },
      ];
      ffModes.forEach(m => {
        batch.set(doc(db, 'gameModes', `freefire_${m.id}`), {
          ...m,
          id: m.id,
          gameId: 'freefire',
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      // 3. Starter Modes for BGMI
      const bgmiModes = [
        { id: 'erangel_solo', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop', order: 1 },
        { id: 'erangel_squad', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop', order: 2 },
        { id: 'tdm_4v4', title: 'TDM 4V4', subtitle: 'Team Deathmatch', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=800&auto=format&fit=crop', order: 3 },
      ];
      bgmiModes.forEach(m => {
        batch.set(doc(db, 'gameModes', `bgmi_${m.id}`), {
          ...m,
          id: m.id,
          gameId: 'bgmi',
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      // 4. Default Rules
      Object.entries(RULE_PRESETS).forEach(([key, preset]) => {
        batch.set(doc(db, 'gameRules', key), {
          id: key,
          title: preset.title,
          section: preset.title,
          category: preset.category,
          rules: preset.rules,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      // 5. Default Announcements
      const defaultAnnouncements = [
        { id: 'ann_welcome', text: 'WELCOME TO KIDS ADDA - PLAY FAIR & EARN REAL CASH PRIZES', link: 'rules', isActive: true }
      ];
      batch.set(doc(db, 'appSettings', 'announcements'), {
        items: defaultAnnouncements,
        activeText: defaultAnnouncements[0].text,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 6. Default App Settings
      batch.set(doc(db, 'appSettings', 'referral_support'), {
        appName: 'KIDS ADDA',
        appLogoUrl: 'https://i.ibb.co/n8jPYbMP/image.png',
        announcements: defaultAnnouncements,
        limits: {
          minDeposit: 10,
          maxDeposit: 50000,
          minWithdraw: 50,
          maxWithdraw: 25000
        },
        manualPayment: {
          upiId: manualUpiId || '8707088647@fam',
          qrCodeUrl: manualQrUrl || 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=8707088647@fam&pn=KidsAdda',
          merchantName: 'KIDS ADDA',
          paymentApps: paymentAppsList
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();

      showSuccess(
        'FIRESTORE INITIALIZED!',
        'Starter pack (Games, Tournament Modes, Rules, and Announcements) has been saved into your Firestore database.'
      );
    } catch (err: any) {
      console.error('Failed to initialize starter pack:', err);
      showError('INITIALIZATION FAILED', err?.message || 'Failed to initialize Firestore starter data.');
    } finally {
      setIsInitializingStarter(false);
    }
  };

  // Dashboard Stats
  const totalUsers = users.length;
  const totalMatches = matches.length;
  const totalJoinedPlayers = matches.reduce((acc, m) => acc + (m.playersCount || 0), 0);
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit')
    .reduce((acc, t) => acc + (t.amount || 0), 0);
  const totalWithdrawals = transactions
    .filter(t => t.type === 'withdrawal')
    .reduce((acc, t) => acc + (t.amount || 0), 0);

  // User Actions
  const handleBanUser = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { isBanned: !currentStatus });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleUpdateBalance = async (userId: string, amount: number, type: 'deposit' | 'withdrawal') => {
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('User not found');
        
        const userData = userSnap.data() as User;
        const currentDeposit = userData.wallet?.deposit || 0;
        
        if (type === 'withdrawal' && currentDeposit < amount) {
          throw new Error('Insufficient deposit balance');
        }

        const newDeposit = type === 'deposit' ? currentDeposit + amount : currentDeposit - amount;
        
        transaction.update(userRef, { "wallet.deposit": newDeposit });
        
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId,
          type,
          amount,
          status: 'completed',
          title: `Admin ${type}`,
          createdAt: serverTimestamp()
        });
      });
      showSuccess('BALANCE UPDATED', `Player balance ${type}ed by ₹${amount} successfully.`);
    } catch (e: any) {
      showError('UPDATE FAILED', e.message || 'Balance update failed');
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      showSuccess('RESET EMAIL SENT', `Password reset link has been sent to ${email}.`);
    } catch (e) {
      showError('EMAIL FAILED', 'Failed to send password reset email.');
      console.error(e);
    }
  };


  const processDeleteMatch = async () => {
    const { matchId } = isDeleteConfirmOpen;

    if (!matchId || typeof matchId !== "string") {
      console.error("Invalid matchId provided for deletion:", matchId);
      return;
    }

    setIsProcessing(true);
    try {
      console.log("Deleting matchId:", matchId);

      await runTransaction(db, async (tx) => {
        const matchRef = doc(db, "matches", matchId);
        const matchSnap = await tx.get(matchRef);
        
        if (!matchSnap.exists()) {
           console.warn("Match document does not exist:", matchId);
           return; 
        }

        const matchData = matchSnap.data() as Tournament;
        const players = matchData.players || [];
        const entryFee = Number(matchData.entryFee || 0);

        // 1. Process Refunds - Only if NOT completed
        if (matchData.status !== 'completed' && players.length > 0 && entryFee > 0) {
          for (const player of players) {
            if (!player.userId || typeof player.userId !== 'string') continue;
            
            const userRef = doc(db, "users", player.userId);
            
            // Refund entry fee using increment to wallet.deposit
            tx.update(userRef, { 
              "wallet.deposit": increment(entryFee)
            });

            // Record refund transaction
            const transCol = collection(db, "transactions");
            const newTransRef = doc(transCol);
            tx.set(newTransRef, {
              userId: player.userId,
              type: 'refund',
              amount: entryFee,
              matchId,
              status: 'completed',
              title: `REFUND: ${matchData.displayId || '#000'}`,
              createdAt: serverTimestamp()
            });
          }
        }

        // 2. Delete Match
        tx.delete(matchRef);
      });

      setIsDeleteConfirmOpen({ isOpen: false, matchId: '' });
      showSuccess('MATCH DELETED', 'Match deleted successfully and joined players were refunded.');
    } catch (e) {
      console.error("Error during match deletion:", e);
      handleFirestoreError(e, OperationType.DELETE, `matches/${matchId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclareResult = (match: Tournament) => {
    setSelectedMatchResults(match);
    setPlayerResults({});
    setPlayerPositionResults({});
    setIsResultModalOpen(true);
  };

  const handleEditMatch = (m: Tournament) => {
    console.log("Navigating to edit match:", m.id);
    if (!m.id) {
      console.error("Match ID is missing!");
      return;
    }
    onPageChange(Page.ADMIN_EDIT_MATCH, m.id);
  };

  const handleDuplicateMatch = async (m: Tournament) => {
    console.log("Navigating to duplicate match:", m.id);
    if (!m.id) {
       console.error("Duplicate failed: Match object or ID missing");
       alert("Cannot duplicate: Match data missing");
       return;
    }
    onPageChange(Page.ADMIN_CREATE_MATCH, m.id);
  };

  const handleSubmitResult = async () => {
    if (!selectedMatchResults || !selectedMatchResults.id) {
       console.error("No valid match selected for results declaration");
       return;
    }
    
    console.log("Submitting results for matchId:", selectedMatchResults.id);
    setIsProcessing(true);

    try {
      await runTransaction(db, async (tx) => {
        const matchId = selectedMatchResults.id!;
        const players = selectedMatchResults.players || [];

        // 0. Staff claim settlement (READS): pay the claiming staff once, only on first completion
        const liveMatchSnap = await tx.get(doc(db, 'matches', matchId));
        const liveMatch: any = liveMatchSnap.exists() ? liveMatchSnap.data() : {};
        if (liveMatch.status === 'cancelled') throw new Error('This match was terminated and is locked.');
        const firstCompletion = liveMatch.status !== 'completed' && !liveMatch.resultsDeclared;
        const staffSettlement = firstCompletion ? await readStaffSettlement(tx, matchId, liveMatch.claimedBy) : null;
        
        // 1. Collect all User References and Snapshots (READS)
        const userDocs: { ref: any, snap: any, userId: string, player: any }[] = [];
        for (const player of players) {
          const userId = player.userId;
          if (!userId || typeof userId !== 'string') continue;
          const userRef = doc(db, 'users', userId);
          const snap = await tx.get(userRef);
          userDocs.push({ ref: userRef, snap, userId, player });
        }
        
        // 2. Process and Apply Updates (WRITES)
        for (const { ref: userRef, snap: uSnap, userId, player } of userDocs) {
          if (uSnap.exists()) {
            let winningAmount = 0;

            if (selectedMatchResults.section === 'Battle Royale') {
              if (selectedMatchResults.prizeType === 'perKill') {
                const playerKey = `${player.userId}_${player.slot}`;
                const kills = playerResults[playerKey] || 0;
                const killsWinning = kills * (selectedMatchResults.perKillAmount || 0);
                const rank = playerPositionResults[playerKey] || 0;
                const positionWinning = selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
                winningAmount = killsWinning + positionWinning;
              } else if (selectedMatchResults.prizeType === 'survival') {
                const rank = playerResults[`${player.userId}_${player.slot}`] || 0;
                winningAmount = selectedMatchResults.prizeDistribution?.[rank] || 0;
              }
            } else {
              // For Clash Squad / Lone Wolf, if rank is 1, give them the prize pool
              const rank = playerResults[`${player.userId}_${player.slot}`] || 0;
              if (rank === 1) {
                winningAmount = selectedMatchResults.prizePool || 0;
              }
            }

            // Prepare updates object
            const updates: any = {
              'stats.matchesPlayed': increment(1)
            };

            if (winningAmount > 0) {
              updates["wallet.winnings"] = increment(winningAmount);
              updates['stats.totalWinnings'] = increment(winningAmount);

              // Create Transaction record
              const transCol = collection(db, 'transactions');
              const transRef = doc(transCol);
              tx.set(transRef, {
                userId,
                type: 'win',
                amount: winningAmount,
                matchId: matchId,
                status: 'completed',
                title: `WON IN MATCH: ${selectedMatchResults.displayId || '#000'}`,
                createdAt: serverTimestamp()
              });
            }
            
            // Add kills if applicable
            if (selectedMatchResults.prizeType === 'perKill') {
              updates['stats.totalKills'] = increment(playerResults[`${player.userId}_${player.slot}`] || 0);
              if (Number(playerPositionResults[`${player.userId}_${player.slot}`]) === 1) {
                updates['stats.totalWins'] = increment(1);
              }
            } else {
              if (Number(playerResults[`${player.userId}_${player.slot}`]) === 1) {
                updates['stats.totalWins'] = increment(1);
              }
            }

            tx.update(userRef, updates);
          }
        }

        // Mark match as completed and save results summary
        const matchRef = doc(db, 'matches', matchId);
        
        const resultsArray = players.map(player => {
          const playerKey = `${player.userId}_${player.slot}`;
          const score = playerResults[playerKey] || 0;
          let winningAmount = 0;

          if (selectedMatchResults.section === 'Battle Royale') {
            if (selectedMatchResults.prizeType === 'perKill') {
              const kills = score;
              const killsWinning = kills * (selectedMatchResults.perKillAmount || 0);
              const rank = playerPositionResults[playerKey] || 0;
              const positionWinning = selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
              winningAmount = killsWinning + positionWinning;
            } else if (selectedMatchResults.prizeType === 'survival') {
              winningAmount = selectedMatchResults.prizeDistribution?.[score] || 0;
            }
          } else {
            if (score === 1) {
              winningAmount = selectedMatchResults.prizePool || 0;
            }
          }

          return {
            userId: player.userId,
            slot: player.slot,
            username: player.username,
            ign: player.ign,
            rankOrKills: score,
            positionRank: playerPositionResults[playerKey] || null,
            winningAmount,
            killsWinning: selectedMatchResults.prizeType === 'perKill' ? score * (selectedMatchResults.perKillAmount || 0) : 0,
            positionWinning: selectedMatchResults.prizeType === 'perKill' ? (selectedMatchResults.positionPrizeDistribution?.[playerPositionResults[playerKey] || 0] || 0) : 0
          };
        });

        const resultsRef = doc(db, 'matchResults', matchId);
        tx.set(resultsRef, {
          matchId,
          matchTitle: selectedMatchResults.title,
          section: selectedMatchResults.section,
          prizeType: selectedMatchResults.prizeType || null,
          results: resultsArray,
          createdAt: serverTimestamp()
        });

        const adminMatchUpdate: any = { status: 'completed' };
        if (firstCompletion) {
          const staffPaid = writeStaffSettlement(
            tx, staffSettlement, matchId, liveMatch, 'success',
            { id: user?.id || 'admin', name: user?.username || 'Admin' }
          );
          adminMatchUpdate.settlement = 'success';
          adminMatchUpdate.settledAt = serverTimestamp();
          adminMatchUpdate.staffPaid = staffPaid;
        }
        tx.update(matchRef, adminMatchUpdate);
      });

      setIsResultModalOpen(false);
      showSuccess('RESULTS DECLARED!', 'Match results have been published and winners credited!');
    } catch (e) {
      console.error("Error during result submission:", e);
      handleFirestoreError(e, OperationType.UPDATE, `matches/${selectedMatchResults.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract all unique sections combining presets, gameModes, and Firestore gameRules docs
  const allAvailableRuleSections = React.useMemo(() => {
    const map: Record<string, { id: string; title: string; category: string; rulesCount: number; isPreset: boolean }> = {};

    // 1. Add standard presets
    Object.keys(RULE_PRESETS).forEach(key => {
      const p = RULE_PRESETS[key];
      const firestoreDoc = gameRulesDocs[key];
      map[key] = {
        id: key,
        title: firestoreDoc?.title || p.title,
        category: firestoreDoc?.category || p.category,
        rulesCount: firestoreDoc?.rules ? firestoreDoc.rules.length : p.rules.length,
        isPreset: true
      };
    });

    // 2. Add gameModes from Firestore
    gameModesList.forEach(m => {
      const rawKey = (m.id || m.title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
      if (rawKey && !map[rawKey]) {
        const firestoreDoc = gameRulesDocs[rawKey];
        map[rawKey] = {
          id: rawKey,
          title: firestoreDoc?.title || m.title || m.subtitle || rawKey.replace(/_/g, ' '),
          category: firestoreDoc?.category || m.category || 'Custom Mode',
          rulesCount: firestoreDoc?.rules?.length || 0,
          isPreset: false
        };
      }
    });

    // 3. Add any existing documents from gameRulesDocs
    Object.keys(gameRulesDocs).forEach(key => {
      const docData = gameRulesDocs[key];
      if (!map[key]) {
        map[key] = {
          id: key,
          title: docData.title || key.replace(/_/g, ' '),
          category: docData.category || 'Custom Section',
          rulesCount: docData.rules?.length || 0,
          isPreset: false
        };
      } else {
        map[key].title = docData.title || map[key].title;
        map[key].category = docData.category || map[key].category;
        map[key].rulesCount = docData.rules?.length || 0;
      }
    });

    return Object.values(map);
  }, [gameRulesDocs, gameModesList]);

  // Sync active section content whenever section changes or Firestore rules update
  useEffect(() => {
    const currentDoc = gameRulesDocs[activeRuleTab];
    if (currentDoc && currentDoc.rules && currentDoc.rules.length > 0) {
      setRuleList(currentDoc.rules);
      setRuleText(currentDoc.rules.join('\n'));
      setActiveSectionTitle(currentDoc.title || activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory(currentDoc.category || 'General');
    } else if (RULE_PRESETS[activeRuleTab]) {
      const p = RULE_PRESETS[activeRuleTab];
      setRuleList(p.rules);
      setRuleText(p.rules.join('\n'));
      setActiveSectionTitle(p.title);
      setActiveSectionCategory(p.category);
    } else {
      const defaultSample = [
        'Fair Play: No hacking, scripts or third-party tools allowed.',
        'Device Requirements: Mobile & tablet devices only. Strictly no emulators.',
        'Verification: High-definition victory/final scorecard screenshot mandatory in case of dispute.',
        'Match Entry: Room closes 2 minutes before match start time.',
        'Admin Decision: Admin decision is final and binding for all participants.'
      ];
      setRuleList(defaultSample);
      setRuleText(defaultSample.join('\n'));
      setActiveSectionTitle(activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory('General');
    }
  }, [activeRuleTab, gameRulesDocs]);

  // Save current active section rules
  const handleSaveCurrentSectionRules = async () => {
    setIsProcessing(true);
    try {
      const finalRules = ruleEditMode === 'raw' 
        ? ruleText.split('\n').map(r => r.trim()).filter(r => r.length > 0)
        : ruleList.map(r => r.trim()).filter(r => r.length > 0);

      if (finalRules.length === 0) {
        alert('Please provide at least one rule item.');
        setIsProcessing(false);
        return;
      }

      await setDoc(doc(db, 'gameRules', activeRuleTab), {
        id: activeRuleTab,
        title: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
        section: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
        category: activeSectionCategory.trim() || 'General',
        rules: finalRules,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setRuleList(finalRules);
      setRuleText(finalRules.join('\n'));
      showSuccess('RULES SAVED!', `Rules for "${activeSectionTitle}" have been updated.`);
    } catch (e) {
      console.error("Error saving rules:", e);
      handleFirestoreError(e, OperationType.UPDATE, `gameRules/${activeRuleTab}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a single rule to interactive list
  const handleAddSingleRule = () => {
    if (!newSingleRuleText.trim()) return;
    const updated = [...ruleList, newSingleRuleText.trim()];
    setRuleList(updated);
    setRuleText(updated.join('\n'));
    setNewSingleRuleText('');
  };

  // Delete a single rule from interactive list
  const handleDeleteSingleRule = (index: number) => {
    const updated = ruleList.filter((_, i) => i !== index);
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  // Move rule up or down
  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === ruleList.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...ruleList];
    const item = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = item;
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  // Load a preset template into active section
  const handleApplyPresetTemplate = async (presetKey: string) => {
    if (RULE_PRESETS[presetKey]) {
      const preset = RULE_PRESETS[presetKey];
      const confirmed = await showConfirm({
        variant: 'instruction',
        badge: 'LOAD PRESET RULES',
        title: `Load "${preset.title}" Rules?`,
        message: `This will load ${preset.rules.length} preset fair-play rules into the current editor.`,
        confirmText: 'LOAD PRESET',
        cancelText: 'CANCEL',
      });
      if (confirmed) {
        setRuleList([...preset.rules]);
        setRuleText(preset.rules.join('\n'));
      }
    }
  };

  // Create new section rules document
  const handleAddNewSectionSubmit = async () => {
    if (!newSectionForm.title.trim()) {
      showWarning('TITLE REQUIRED', 'Please enter a section title / name.');
      return;
    }
    const cleanId = newSectionForm.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    if (!cleanId) {
      showWarning('INVALID TITLE', 'Please enter a valid section title.');
      return;
    }

    setIsProcessing(true);
    try {
      const starterTemplate = RULE_PRESETS[newSectionForm.template] || RULE_PRESETS.battle_royale;
      const initialRules = [...starterTemplate.rules];

      await setDoc(doc(db, 'gameRules', cleanId), {
        id: cleanId,
        title: newSectionForm.title.trim(),
        section: newSectionForm.title.trim(),
        category: newSectionForm.category.trim() || newSectionForm.title.trim(),
        rules: initialRules,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setActiveRuleTab(cleanId);
      setActiveSectionTitle(newSectionForm.title.trim());
      setActiveSectionCategory(newSectionForm.category.trim() || newSectionForm.title.trim());
      setRuleList(initialRules);
      setRuleText(initialRules.join('\n'));
      setIsAddSectionModalOpen(false);
      setNewSectionForm({ title: '', category: '', template: 'battle_royale' });
      showSuccess('SECTION CREATED', `Section rules for "${newSectionForm.title}" created!`);
    } catch (err) {
      console.error('Failed to create new rule section:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete custom section rules
  const handleDeleteCustomSectionRules = async (secId: string, secTitle: string) => {
    if (['battle_royale', 'clash_squad', 'lone_wolf'].includes(secId)) {
      showWarning('PROTECTED SECTION', 'Default game mode sections cannot be deleted. You can edit their rules instead.');
      return;
    }
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'DELETE RULE SECTION',
      title: `Delete "${secTitle}" Rules?`,
      message: 'Are you sure you want to remove this custom rule section?',
      confirmText: 'DELETE',
      cancelText: 'CANCEL',
    });
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'gameRules', secId));
      setActiveRuleTab('battle_royale');
      showSuccess('SECTION REMOVED', `Rules for "${secTitle}" have been deleted.`);
    } catch (err) {
      console.error('Failed to delete section rules:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Room ID & Password Modal Handlers
  const handleOpenDeclareRoomModal = (m: Tournament) => {
    setSelectedDeclareRoomMatch(m);
    setDeclareRoomForm({
      roomId: m.roomId || '',
      roomPassword: m.roomPassword || '',
      setStatusLive: m.status !== 'completed',
      customNotes: (m as any).roomNotes || '',
      sendNotificationOnRoomDeclare: true
    });
    setIsDeclareRoomModalOpen(true);
  };

  const handleSaveDeclareRoom = async () => {
    if (!selectedDeclareRoomMatch) return;
    setIsProcessing(true);
    try {
      const cleanRoomId = declareRoomForm.roomId.trim();
      const cleanPass = declareRoomForm.roomPassword.trim();

      const updates: any = {
        roomId: cleanRoomId,
        roomPassword: cleanPass,
        roomNotes: declareRoomForm.customNotes.trim(),
        roomDeclaredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (declareRoomForm.setStatusLive && selectedDeclareRoomMatch.status !== 'completed') {
        updates.status = 'ongoing';
      }

      await updateDoc(doc(db, 'matches', selectedDeclareRoomMatch.id), updates);

      // Auto push notification to match players if checked
      if (declareRoomForm.sendNotificationOnRoomDeclare && cleanRoomId) {
        try {
          await addDoc(collection(db, 'notifications'), {
            title: `🔑 Room ID & Pass Ready: ${selectedDeclareRoomMatch.title}`,
            message: `Room ID: ${cleanRoomId} | Password: ${cleanPass || 'No Password'}. Join immediately in Free Fire!`,
            type: 'room_creds',
            audience: 'match',
            targetMatchId: selectedDeclareRoomMatch.id,
            targetMatchTitle: selectedDeclareRoomMatch.title,
            actionPage: Page.TOURNAMENTS,
            actionText: 'View Credentials',
            createdAt: serverTimestamp(),
            readBy: []
          });
        } catch (notifErr) {
          console.warn('Could not auto push notification:', notifErr);
        }
      }

      setIsDeclareRoomModalOpen(false);
      setSelectedDeclareRoomMatch(null);
      showSuccess('ROOM CREDENTIALS LIVE!', 'Players can now view the Room ID & Password in their match lobby.');
    } catch (err: any) {
      console.error('Failed to declare room:', err);
      handleFirestoreError(err, OperationType.UPDATE, `matches/${selectedDeclareRoomMatch.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearRoomCredentials = async (matchId: string) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'CLEAR ROOM CREDENTIALS',
      title: 'Clear Room ID & Password?',
      message: 'This will clear the published Room ID and Password for this match.',
      confirmText: 'CLEAR',
      cancelText: 'CANCEL',
    });
    if (!confirmed) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'matches', matchId), {
        roomId: '',
        roomPassword: '',
        roomNotes: '',
        updatedAt: serverTimestamp()
      });
      if (isDeclareRoomModalOpen) {
        setIsDeclareRoomModalOpen(false);
        setSelectedDeclareRoomMatch(null);
      }
      showSuccess('CREDENTIALS CLEARED', 'Room credentials have been cleared.');
    } catch (err) {
      console.error('Failed to clear room:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyCredential = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveSettings = async (data: any) => {
    setIsProcessing(true);
    try {
      const mergedData = {
        ...data,
        appName: appNameSetting.trim() || data?.appName || 'KIDS ADDA',
        appLogoUrl: appLogoUrlSetting.trim() || data?.appLogoUrl || 'https://i.ibb.co/n8jPYbMP/image.png',
      };
      await setDoc(doc(db, 'appSettings', 'referral_support'), mergedData, { merge: true });
      showSuccess('SETTINGS SAVED!', 'Referral & Support settings have been updated.');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'appSettings/referral_support');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveBanner = async () => {
    if (!imageUrl) {
      showWarning('IMAGE REQUIRED', 'Please upload a banner image or paste an image URL.');
      return;
    }
    setIsProcessing(true);
    try {
      const bannerData = {
        imageUrl,
        redirectUrl: redirectUrl || '',
        type: bannerType,
        order: Number(bannerOrder),
        isActive: true,
        updatedAt: serverTimestamp()
      };

      // If bottom banner is selected, only allow ONE bottom banner (overwrite/remove any previous bottom banners)
      if (bannerType === 'bottom' || bannerType === 'freefire') {
        const existingBottom = banners.filter(b => b.type === 'bottom' || b.type === 'freefire');
        const batch = writeBatch(db);
        existingBottom.forEach(eb => {
          if (eb.id && eb.id !== editingBanner?.id) {
            batch.delete(doc(db, 'banners', eb.id));
          }
        });
        await batch.commit();
        await setDoc(doc(db, 'banners', editingBanner?.id || 'single_bottom_banner'), {
          ...bannerData,
          type: 'bottom',
          createdAt: serverTimestamp()
        }, { merge: true });
      } else if (editingBanner?.id) {
        await updateDoc(doc(db, 'banners', editingBanner.id), bannerData);
      } else {
        await addDoc(collection(db, 'banners'), {
          ...bannerData,
          createdAt: serverTimestamp()
        });
      }
      setIsBannerModalOpen(false);
      setEditingBanner(null);
      setImageUrl('');
      setRedirectUrl('');
      showSuccess('BANNER PUBLISHED!', 'Promotional banner is now live on the Home screen.');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'banners');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBanner = async (id: string) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'DELETE BANNER',
      title: 'Delete Promotional Banner?',
      message: 'Are you sure you want to permanently delete this banner?',
      confirmText: 'DELETE BANNER',
      cancelText: 'CANCEL',
    });
    if (!confirmed) return;
    
    setDeletingBannerId(id);
    try {
      await deleteDoc(doc(db, 'banners', id));
      showSuccess('BANNER DELETED', 'Promotional banner was removed.');
    } catch (e) {
      console.error("Error deleting banner:", e);
      showError('DELETE FAILED', 'Could not delete banner.');
      handleFirestoreError(e, OperationType.DELETE, `banners/${id}`);
    } finally {
      setDeletingBannerId(null);
    }
  };

  const handleToggleGateway = async (gatewayId: string, currentStatus: boolean) => {
    setIsProcessing(true);
    const nextActive = !currentStatus;

    // 1. Optimistically update local state immediately so the toggle switch stays in the exact position clicked
    setPaymentGateways((prev) => {
      const exists = prev.some((g) => g.id === gatewayId);
      if (nextActive) {
        const updated = prev.map((g) => ({
          ...g,
          isActive: g.id === gatewayId,
        }));
        if (!exists) {
          updated.push({ id: gatewayId, name: gatewayId.toUpperCase(), isActive: true });
        }
        return updated;
      } else {
        return prev.map((g) => ({
          ...g,
          isActive: g.id === gatewayId ? false : g.isActive,
        }));
      }
    });

    try {
      const batch = writeBatch(db);
      if (nextActive) {
        // Enforce only one active gateway: deactivate all others first
        paymentGateways.forEach((g) => {
          if (g.id !== gatewayId && g.isActive) {
            batch.set(doc(db, 'paymentSettings', g.id), { isActive: false }, { merge: true });
          }
        });
        batch.set(
          doc(db, 'paymentSettings', gatewayId),
          {
            id: gatewayId,
            isActive: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        batch.set(
          doc(db, 'appSettings', 'referral_support'),
          {
            autoGatewayActive: true,
            activeGatewayId: gatewayId,
            manualPaymentActive: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await batch.commit();
        try {
          localStorage.setItem('kg_payment_mode', JSON.stringify({ mode: 'auto', gatewayId }));
        } catch {}
        showSuccess(
          'AUTO GATEWAY ENABLED',
          `${gatewayId.toUpperCase()} is now ON. Manual QR/UTR deposit is hidden and users will pay via ${gatewayId.toUpperCase()}.`
        );
      } else {
        // Turning OFF the gateway -> Deactivate all auto gateways so Manual Payment System starts functioning immediately!
        paymentGateways.forEach((g) => {
          batch.set(doc(db, 'paymentSettings', g.id), { isActive: false, updatedAt: serverTimestamp() }, { merge: true });
        });
        batch.set(
          doc(db, 'paymentSettings', gatewayId),
          {
            id: gatewayId,
            isActive: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        batch.set(
          doc(db, 'appSettings', 'referral_support'),
          {
            autoGatewayActive: false,
            activeGatewayId: null,
            manualPaymentActive: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await batch.commit();
        try {
          localStorage.setItem('kg_payment_mode', JSON.stringify({ mode: 'manual', gatewayId: null }));
        } catch {}
        showWarning(
          'MANUAL PAYMENT SYSTEM ACTIVE',
          `${gatewayId.toUpperCase()} Gateway has been turned OFF. Manual UPI QR Code & 12-Digit UTR deposit system is now active for all users.`
        );
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `paymentSettings/${gatewayId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveGateway = async () => {
    if (!gatewayForm.name) {
      showWarning('NAME REQUIRED', 'Please enter a Payment Gateway name.');
      return;
    }
    setIsProcessing(true);
    try {
      const gId = editingGateway?.id || gatewayForm.name.toLowerCase().replace(/\s+/g, '_');
      const existing = paymentGateways.find((g) => g.id === gId);
      const gatewayData = {
        ...gatewayForm,
        id: gId,
        isActive: existing ? Boolean(existing.isActive) : Boolean(editingGateway?.isActive),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'paymentSettings', gId), gatewayData, { merge: true });
      
      setIsGatewayModalOpen(false);
      setEditingGateway(null);
      setGatewayForm({
        name: '',
        apiKey: '',
        secretKey: '',
        merchantId: '',
        webhookSecret: '',
        upiId: ''
      });
      showSuccess('GATEWAY CONFIGURED!', 'Payment gateway credentials have been saved.');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'paymentSettings');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <AdvancedLoader
        fullScreen
        text="LOADING ADMIN CONTROL"
        subtext="FETCHING LIVE USERS, MATCHES & WALLETS..."
      />
    );
  }

  return (
    <div className="pb-24 max-w-lg mx-auto bg-[#f8f9fc] dark:bg-background min-h-screen text-slate-900 dark:text-white transition-colors">
      <div className="px-5 py-7">
        {/* Top Admin Header matching Reference Image */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3.5">
            <button 
              onClick={() => onPageChange(Page.PROFILE)}
              className="w-11 h-11 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl flex items-center justify-center text-slate-700 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-white shadow-sm transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase italic text-slate-900 dark:text-white leading-none">
                ADMIN <span className="text-[#F37A1F]">PANEL</span>
              </h2>
              <p className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500 mt-1">
                PRODUCTION VERSION 2.0
              </p>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">LIVE</span>
          </div>
        </div>

        {/* Horizontal Tab Navigation matching Reference Image */}
        <div className="flex gap-2.5 mb-7 overflow-x-auto pb-2 no-scrollbar">
          {Object.values(AdminTab).map((tab) => {
            const pendingDepositsCount = transactions.filter(t => t.type === 'deposit' && t.status === 'pending').length;
            const pendingWithdrawsCount = transactions.filter(t => (t.type === 'withdrawal' || t.type === 'withdraw') && t.status === 'pending').length;
            const badgeCount =
              tab === AdminTab.DEPOSITS
                ? pendingDepositsCount
                : tab === AdminTab.WITHDRAWALS
                ? pendingWithdrawsCount
                : tab === AdminTab.STAFF
                ? staffCount
                : 0;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-2 ${
                  activeTab === tab 
                    ? 'bg-[#F37A1F] border-[#F37A1F] text-black shadow-[0_8px_22px_rgba(243,122,32,0.38)]' 
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 shadow-xs'
                }`}
              >
                <span>{tab}</span>
                {badgeCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${
                    activeTab === tab
                      ? 'bg-white text-[#F37A1F]'
                      : 'bg-amber-500 text-white'
                  }`}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="w-full">
          {activeTab === AdminTab.DASHBOARD && (
            <div
              key="dashboard"
              className="space-y-4 animate-fadeIn"
            >
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Total Users" value={totalUsers} icon={Users} color="text-blue-400" />
                <StatCard label="Total Matches" value={totalMatches} icon={Trophy} color="text-purple-400" />
                <StatCard label="Joined Players" value={totalJoinedPlayers} icon={UsersIcon} color="text-orange-400" />
                <StatCard label="Revenue" value={`₹${totalDeposits - totalWithdrawals}`} icon={DollarSign} color="text-emerald-400" />
              </div>

              {/* Staff Management High-Impact Action */}
              <button 
                onClick={() => setActiveTab(AdminTab.STAFF)}
                className="w-full p-4.5 bg-gradient-to-r from-purple-900/30 via-indigo-950/40 to-neutral-900 border border-purple-500/30 rounded-3xl flex items-center justify-between px-5 active:scale-[0.99] transition-all shadow-md group hover:border-purple-500/50"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                    <UserCheck size={22} className="stroke-[2.2]" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-tight text-white">
                        Staff &amp; Role Management
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {staffCount} Active Staff
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-neutral-400 mt-0.5 block">
                      Appoint Finance Managers, Tournament Organizers &amp; Delegate Duties
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-purple-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>

              {/* Bonus Settings High-Impact Action */}
              <button 
                onClick={() => setActiveTab(AdminTab.SETTINGS)}
                className="w-full p-4.5 bg-gradient-to-r from-amber-950/40 via-yellow-950/30 to-neutral-900 border border-amber-500/30 rounded-3xl flex items-center justify-between px-5 active:scale-[0.99] transition-all shadow-md group hover:border-amber-500/50"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Gift size={22} className="stroke-[2.2]" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-tight text-white">
                        Signup Bonus Management
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                        signupBonusSetting === 0
                          ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {signupBonusSetting === 0 ? '₹0 BONUS (OFF)' : `+₹${signupBonusSetting} PER USER`}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-neutral-400 mt-0.5 block">
                      {signupBonusSetting === 0 
                        ? 'New players get ₹0 bonus on registration. Click to configure.'
                        : `New players receive ₹${signupBonusSetting} in bonus wallet. Click to modify.`}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setActiveTab(AdminTab.DEPOSITS)}
                  className="p-4 bg-purple-600/15 border border-purple-500/30 rounded-3xl flex flex-col items-center gap-2 active:scale-[0.97] transition-all shadow-lg"
                >
                  <Wallet className="text-purple-400" size={26} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                    Deposit Requests ({transactions.filter(t => t.type === 'deposit' && t.status === 'pending').length})
                  </span>
                </button>
                <button 
                  onClick={() => setActiveTab(AdminTab.WITHDRAWALS)}
                  className="p-4 bg-emerald-600/15 border border-emerald-500/30 rounded-3xl flex flex-col items-center gap-2 active:scale-[0.97] transition-all shadow-lg"
                >
                  <DollarSign className="text-emerald-400" size={26} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    Withdraw Requests ({transactions.filter(t => (t.type === 'withdrawal' || t.type === 'withdraw') && t.status === 'pending').length})
                  </span>
                </button>
                <button 
                  onClick={() => setActiveTab(AdminTab.GAMES)}
                  className="p-5 bg-purple-600/10 border border-purple-500/20 rounded-3xl flex flex-col items-center gap-2.5 active:scale-[0.97] transition-all shadow-xl"
                >
                  <Gamepad2 className="text-purple-500" size={28} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">1. Manage Games</span>
                </button>
                <button 
                  onClick={() => onPageChange(Page.ADMIN_MODES)}
                  className="p-5 bg-purple-600/10 border border-purple-500/20 rounded-3xl flex flex-col items-center gap-2.5 active:scale-[0.97] transition-all shadow-xl"
                >
                  <Trophy className="text-purple-500" size={28} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">2. Tournament Modes</span>
                </button>
                <button 
                  onClick={() => setActiveTab(AdminTab.MATCHES)}
                  className="p-5 bg-purple-600/10 border border-purple-500/20 rounded-3xl flex flex-col items-center gap-2.5 active:scale-[0.97] transition-all shadow-xl"
                >
                  <PlusCircle className="text-purple-500" size={28} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">3. Manage Matches</span>
                </button>
                <button 
                  onClick={() => setActiveTab(AdminTab.BANNERS)}
                  className="p-5 bg-emerald-600/10 border border-emerald-500/20 rounded-3xl flex flex-col items-center gap-2.5 active:scale-[0.97] transition-all shadow-xl"
                >
                  <ImageIcon className="text-emerald-400" size={28} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">4. Manage Banners</span>
                </button>
                <button 
                  onClick={() => setActiveTab(AdminTab.SETTINGS)}
                  className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-3xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-all shadow-xl"
                >
                  <Settings className="text-blue-400" size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">App & Limits Settings</span>
                </button>
                <button 
                  onClick={() => setActiveTab(AdminTab.ANNOUNCEMENTS)}
                  className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-3xl flex items-center justify-center gap-2.5 active:scale-[0.97] transition-all shadow-xl"
                >
                  <Megaphone className="text-amber-400" size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Announcements</span>
                </button>
              </div>

              {/* Fresh Firestore Notice Banner */}
              {gamesList.length === 0 && (
                <div className="p-5 bg-gradient-to-br from-purple-950/60 via-neutral-900 to-black border-2 border-purple-500/40 rounded-3xl relative overflow-hidden shadow-2xl">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                      <Sparkles size={24} className="animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-purple-500 text-black">
                          Fresh Firestore Database
                        </span>
                      </div>
                      <h3 className="text-sm font-black italic uppercase tracking-tight text-white mt-1.5">
                        No Games Or Modes In Database
                      </h3>
                      <p className="text-[10px] text-neutral-300 font-medium leading-relaxed mt-1">
                        Your connected Firestore database is empty. You can either initialize the ready-to-play Starter Pack (Free Fire, BGMI, modes, fair-play rules & default announcement) in 1-click, or create games and modes manually.
                      </p>
                      <div className="flex flex-wrap gap-2.5 mt-4">
                        <button
                          onClick={handleInitializeStarterPack}
                          disabled={isInitializingStarter}
                          className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 transition-all active:scale-[0.97] flex items-center gap-2 disabled:opacity-50"
                        >
                          {isInitializingStarter ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Sparkles size={13} />
                          )}
                          <span>Initialize Starter Pack</span>
                        </button>
                        <button
                          onClick={() => setActiveTab(AdminTab.GAMES)}
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.97] shadow-xs"
                        >
                          + Create Game Manually
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-6 bg-white dark:bg-neutral-900/60 border border-slate-200 dark:border-neutral-800 rounded-3xl mt-4 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                    <Shield size={12} className="text-purple-500" /> Firestore Data Inventory
                  </h4>
                  <button
                    onClick={handleInitializeStarterPack}
                    disabled={isInitializingStarter}
                    className="flex items-center gap-1.5 px-3 py-1 bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white border border-purple-500/30 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    {isInitializingStarter ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    <span>Seed Starter Pack</span>
                  </button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Games</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{gamesList.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Modes</p>
                    <p className="text-sm font-black text-purple-600 dark:text-purple-400 mt-0.5">{gameModesList.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Announcements</p>
                    <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{announcementsList.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Matches</p>
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{matches.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Users</p>
                    <p className="text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">{users.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Transactions</p>
                    <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{transactions.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Banners</p>
                    <p className="text-sm font-black text-pink-600 dark:text-pink-400 mt-0.5">{banners.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Gateways</p>
                    <p className="text-sm font-black text-cyan-600 dark:text-cyan-400 mt-0.5">{paymentGateways.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Staff</p>
                    <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{staffCount}</p>
                  </div>
                </div>

                <div className="space-y-4 pt-2 border-t border-white/5">
                  <HealthBar label="Database" status="Operational" />
                  <HealthBar label="Auth Service" status="Operational" />
                  <HealthBar label="Storage" status="Optimal" />
                </div>
              </div>
            </div>
          )}

          {activeTab === AdminTab.STAFF && (
            <motion.div
              key="staff"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminStaffTab users={users} onPageChange={onPageChange} />
            </motion.div>
          )}

          {activeTab === AdminTab.GAMES && (
            <motion.div
              key="games"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <button
                onClick={() => {
                  setEditingGame(null);
                  setGameForm({ id: '', title: '', subtitle: 'TOURNAMENTS', image: '', order: gamesList.length + 1 });
                  setIsGameModalOpen(true);
                }}
                className="w-full py-5 bg-purple-600 hover:bg-purple-500 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-600/20 active:scale-[0.97] transition-all text-black"
              >
                <Plus size={18} />
                <span className="text-xs font-black uppercase tracking-widest">Add New Game (e.g. FREE FIRE, BGMI)</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={async () => {
                    const batch = writeBatch(db);
                    batch.set(doc(db, 'games', 'freefire'), {
                      id: 'freefire',
                      title: 'FREE FIRE',
                      subtitle: 'TOURNAMENTS',
                      image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1000&auto=format&fit=crop',
                      order: 1,
                      isActive: true
                    }, { merge: true });
                    batch.set(doc(db, 'games', 'bgmi'), {
                      id: 'bgmi',
                      title: 'BATTLEGROUNDS MOBILE INDIA',
                      subtitle: 'TOURNAMENTS',
                      image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1000&auto=format&fit=crop',
                      order: 2,
                      isActive: true
                    }, { merge: true });
                    await batch.commit();
                    alert('FREE FIRE & BGMI added!');
                  }}
                  className="col-span-2 py-3 bg-white dark:bg-neutral-900 border border-purple-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-600/20 transition-all shadow-xs"
                >
                  ⚡ Quick Seed FREE FIRE & BGMI
                </button>
              </div>

              <div className="space-y-4">
                {gamesList.map((g) => (
                  <div key={g.id} className="p-4 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl flex items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 dark:bg-black border border-slate-200 dark:border-white/10 shrink-0">
                        <SafeImage src={g.image} alt={g.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          FAIRPLAY : ON
                        </span>
                        <h4 className="text-sm font-black italic uppercase text-slate-900 dark:text-white truncate mt-1">{g.title}</h4>
                        <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">ID: {g.id} • Order #{g.order || 1}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onPageChange(Page.ADMIN_MODES)}
                        className="px-3 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl text-[9px] font-black uppercase tracking-wider"
                      >
                        Modes
                      </button>
                      <button
                        onClick={() => {
                          setEditingGame(g);
                          setGameForm({ id: g.id, title: g.title, subtitle: g.subtitle || 'TOURNAMENTS', image: g.image || '', order: g.order || 1 });
                          setIsGameModalOpen(true);
                        }}
                        className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500 hover:text-white transition-all"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteGame(g.id, g.title)}
                        className="p-2.5 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.MODES && (
            <motion.div
              key="modes_redirect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl text-center space-y-4 shadow-xs"
            >
              <Gamepad2 size={40} className="text-purple-500 mx-auto" />
              <h3 className="text-base font-black italic uppercase text-slate-900 dark:text-white">Tournament Modes Manager</h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400">Select a Game (Free Fire, BGMI, etc.) and manage all tournament modes inside it.</p>
              <button
                onClick={() => onPageChange(Page.ADMIN_MODES)}
                className="w-full py-4 bg-purple-600 text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg"
              >
                Open Tournament Modes Manager
              </button>
            </motion.div>
          )}

          {activeTab === AdminTab.NOTIFICATIONS && (
            <motion.div
              key="notifications"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminNotificationsTab 
                matches={matches} 
                users={users} 
                onPageChange={onPageChange} 
              />
            </motion.div>
          )}

          {activeTab === AdminTab.USERS && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                <input 
                  type="text"
                  placeholder="Search by username..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all shadow-xs placeholder:text-slate-400 dark:placeholder:text-neutral-500"
                />
              </div>

              <div className="space-y-3">
                {users
                  .filter(u => String(u.username || u.email || '').toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((u) => (
                  <div 
                    key={u.id}
                    onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, u.id)}
                    className="p-4 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-purple-500 transition-all shadow-xs text-slate-900 dark:text-white"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-black flex items-center justify-center text-slate-400 dark:text-neutral-700 border border-slate-200 dark:border-white/5">
                        <Users size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black italic">{u.username || 'Player'}</h4>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600">{u.email || u.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-emerald-400 italic">
                        ₹{(u.wallet?.deposit || 0) + (u.wallet?.winnings || 0) + (u.wallet?.bonus || 0)}
                      </span>
                      {u.isBanned && <Ban size={14} className="text-red-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.MATCHES && (
            <motion.div
              key="matches"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="space-y-4">
                <button 
                  onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                  className="w-full py-5 bg-purple-600 hover:bg-purple-500 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-600/30 active:scale-[0.97] transition-all text-black"
                >
                  <Plus size={18} />
                  <span className="text-xs font-black uppercase tracking-widest">Create New Match</span>
                </button>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                  <input 
                    type="text"
                    placeholder="Search by Match ID, Title or Section..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl py-4 pl-12 pr-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all shadow-xs placeholder:text-slate-400 dark:placeholder:text-neutral-500"
                  />
                </div>

                {/* Match Status Filters */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { id: 'all', label: `All (${matches.length})` },
                    { 
                      id: 'need_room', 
                      label: `⚠️ Need Room ID (${matches.filter(m => (!m.roomId || !m.roomPassword) && m.status !== 'completed').length})` 
                    },
                    { 
                      id: 'room_ready', 
                      label: `🔑 Room Ready (${matches.filter(m => m.roomId && m.roomPassword && m.status !== 'completed').length})` 
                    },
                    { 
                      id: 'live', 
                      label: `⚡ Live (${matches.filter(m => m.status === 'ongoing').length})` 
                    },
                    { 
                      id: 'completed', 
                      label: `🏆 Completed (${matches.filter(m => m.status === 'completed').length})` 
                    }
                  ].map((filterItem) => (
                    <button
                      key={filterItem.id}
                      onClick={() => setMatchStatusFilter(filterItem.id as any)}
                      className={`px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
                        matchStatusFilter === filterItem.id
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-sm'
                          : 'bg-neutral-900/80 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {filterItem.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {matches
                  .filter(m => {
                    const matchText = (m.displayId || '') + ' ' + (m.title || '') + ' ' + (m.section || '') + ' ' + (m.map || '');
                    const matchesSearch = matchText.toLowerCase().includes(searchTerm.toLowerCase());
                    if (!matchesSearch) return false;

                    if (matchStatusFilter === 'need_room') {
                      return (!m.roomId || !m.roomPassword) && m.status !== 'completed';
                    }
                    if (matchStatusFilter === 'room_ready') {
                      return m.roomId && m.roomPassword && m.status !== 'completed';
                    }
                    if (matchStatusFilter === 'live') {
                      return m.status === 'ongoing';
                    }
                    if (matchStatusFilter === 'completed') {
                      return m.status === 'completed';
                    }
                    return true;
                  })
                  .map((m) => {
                    const hasRoomCreds = Boolean(m.roomId && m.roomPassword);
                    return (
                      <div key={m.id} className="p-5 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl relative overflow-hidden group shadow-sm text-slate-900 dark:text-white">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-[10px] font-black text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-lg border border-purple-500/20 shrink-0">
                              {m.displayId || '#000'}
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-600 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-md shrink-0">
                              {m.section || m.mode || 'Battle Royale'}
                            </span>
                            {m.status === 'completed' ? (
                              <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0">
                                Completed
                              </span>
                            ) : m.status === 'ongoing' ? (
                              <span className="bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full animate-pulse shrink-0">
                                Live / Ongoing
                              </span>
                            ) : (
                              <span className="bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0">
                                Upcoming
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDuplicateMatch(m);
                              }}
                              className="p-2 bg-purple-500/10 text-purple-500 rounded-lg hover:bg-purple-500 transition-colors hover:text-white"
                              title="Duplicate Match"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleEditMatch(m);
                              }}
                              className="p-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 transition-colors hover:text-white"
                              title="Edit Match"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsDeleteConfirmOpen({ isOpen: true, matchId: m.id });
                              }}
                              className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 transition-colors hover:text-white"
                              title="Delete Match"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <h4 className="text-sm font-black italic mb-3 text-white">{m.title}</h4>

                        <div className="flex gap-4 mb-4">
                          <div className="flex items-center gap-1.5 text-neutral-400">
                            <Clock size={12} className="text-neutral-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest">{formatMatchTime(m.time)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-neutral-400">
                            <MapIcon size={12} className="text-neutral-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest">{m.map}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between py-3 border-y border-neutral-800/80">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Players Joined</p>
                            <p className="text-xs font-black italic text-white">{m.playersCount}/{m.totalSlots || m.maxPlayers}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Entry Fee</p>
                            <p className="text-xs font-black text-emerald-400 italic leading-none">{m.entryFee === 0 ? 'FREE' : `₹${m.entryFee}`}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Prize Pool</p>
                            <p className="text-xs font-black text-amber-400 italic leading-none">{m.prizeType === 'perKill' ? `₹${m.perKillAmount}/kill` : `₹${m.prizePool}`}</p>
                          </div>
                        </div>

                        {/* Room Credentials Banner */}
                        <div className="mt-4 p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/60 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key size={14} className={hasRoomCreds ? "text-emerald-400" : "text-amber-400"} />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-neutral-300">Room Credentials</span>
                            </div>
                            {hasRoomCreds ? (
                              <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                Declared & Live
                              </span>
                            ) : (
                              <span className="text-[8px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                Pending
                              </span>
                            )}
                          </div>

                          {hasRoomCreds ? (
                            <div className="grid grid-cols-2 gap-2 bg-white dark:bg-neutral-900/90 p-2.5 rounded-xl border border-slate-200 dark:border-neutral-800">
                              <div className="flex items-center justify-between pr-1">
                                <div>
                                  <p className="text-[7px] font-black text-neutral-500 uppercase">Room ID</p>
                                  <p className="text-xs font-black text-white font-mono">{m.roomId}</p>
                                </div>
                                <button 
                                  onClick={() => handleCopyCredential(m.roomId!, `room_${m.id}`)}
                                  className="p-1 text-neutral-400 hover:text-white"
                                  title="Copy Room ID"
                                >
                                  {copiedKey === `room_${m.id}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                              </div>
                              <div className="flex items-center justify-between pr-1 border-l border-neutral-800 pl-2">
                                <div>
                                  <p className="text-[7px] font-black text-neutral-500 uppercase">Password</p>
                                  <p className="text-xs font-black text-white font-mono">{m.roomPassword}</p>
                                </div>
                                <button 
                                  onClick={() => handleCopyCredential(m.roomPassword!, `pass_${m.id}`)}
                                  className="p-1 text-neutral-400 hover:text-white"
                                  title="Copy Password"
                                >
                                  {copiedKey === `pass_${m.id}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[9px] font-bold text-neutral-500 italic">
                              Room ID & Password not declared yet. Click below to publish credentials to players.
                            </p>
                          )}

                          {/* Quick Inline Inputs */}
                          <div className="flex items-center gap-2 pt-1">
                            <input 
                              type="text" 
                              placeholder="Room ID"
                              defaultValue={m.roomId || ''}
                              id={`quick_room_${m.id}`}
                              className="flex-1 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                            />
                            <input 
                              type="text" 
                              placeholder="Pass"
                              defaultValue={m.roomPassword || ''}
                              id={`quick_pass_${m.id}`}
                              className="flex-1 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                            />
                            <button
                              onClick={async () => {
                                const idInput = document.getElementById(`quick_room_${m.id}`) as HTMLInputElement;
                                const passInput = document.getElementById(`quick_pass_${m.id}`) as HTMLInputElement;
                                const rId = idInput ? idInput.value.trim() : '';
                                const rPass = passInput ? passInput.value.trim() : '';
                                const updates: any = { 
                                  roomId: rId, 
                                  roomPassword: rPass, 
                                  updatedAt: serverTimestamp() 
                                };
                                if (rId && m.status === 'upcoming') {
                                  updates.status = 'ongoing';
                                }
                                await updateDoc(doc(db, 'matches', m.id), updates);
                                alert('Room credentials updated!');
                              }}
                              className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl border border-neutral-700 active:scale-[0.97] transition-all"
                              title="Save Credentials Quick"
                            >
                              <Save size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Action Buttons: Declare Room Modal & Declare Result */}
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          <button 
                            onClick={() => handleOpenDeclareRoomModal(m)}
                            className="py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                          >
                            <Key size={13} className="text-purple-400" />
                            {hasRoomCreds ? 'Edit Room Info' : 'Declare Room'}
                          </button>

                          {m.status !== 'completed' ? (
                            <button 
                              onClick={() => handleDeclareResult(m)}
                              className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                            >
                              <Trophy size={13} />
                              Declare Result
                            </button>
                          ) : (
                            <div className="py-3 bg-neutral-800/60 border border-neutral-800 rounded-xl text-[10px] font-black uppercase tracking-wider text-neutral-500 text-center flex items-center justify-center gap-1.5">
                              <CheckCheck size={13} className="text-emerald-500" />
                              Result Declared
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.TRANSACTIONS && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between mb-4">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500">History Log</h4>
                 <RefreshCw size={14} className="text-neutral-700 animate-spin-slow" />
              </div>
              {transactions.map((t) => (
                <div key={t.id} className="p-4 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl flex items-center justify-between shadow-xs text-slate-900 dark:text-white">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 ${
                      t.type === 'deposit' || t.type === 'refund' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                    }`}>
                      {t.type === 'deposit' ? <Plus size={16} /> : t.type === 'refund' ? <CheckCircle2 size={16} /> : <Minus size={16} />}
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{t.type}</h4>
                      <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600">ID: {t.id.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-black italic ${
                      t.type === 'deposit' || t.type === 'refund' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {t.type === 'deposit' || t.type === 'refund' ? '+' : '-'}₹{t.amount}
                    </p>
                    <p className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">
                      {typeof t.createdAt?.toDate === 'function' ? t.createdAt.toDate().toLocaleDateString() : (t.date || 'Recent')}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === AdminTab.RULES && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Header & Add Section Action */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    <ListChecks size={16} className="text-purple-400" />
                    Game Mode Regulations
                  </h3>
                  <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mt-0.5">
                    Customize rules for all game mode sections
                  </p>
                </div>
                <button
                  onClick={() => setIsAddSectionModalOpen(true)}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-[0.97] transition-all shadow-md shadow-purple-600/20"
                >
                  <PlusCircle size={13} />
                  Add Section
                </button>
              </div>

              {/* Dynamic Horizontal Section Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {allAvailableRuleSections.map((sec) => {
                  const isActive = activeRuleTab === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActiveRuleTab(sec.id)}
                      className={`px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2 ${
                        isActive
                          ? 'bg-purple-600 border-purple-500 text-black shadow-lg shadow-purple-600/30'
                          : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-white hover:border-purple-300 dark:hover:border-neutral-700 shadow-xs'
                      }`}
                    >
                      <span>{sec.title}</span>
                      <span className={`text-[8px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-black/40 text-purple-200' : 'bg-neutral-800 text-neutral-500'
                      }`}>
                        {sec.rulesCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Section Rule Configuration Card */}
              <div className="p-6 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl space-y-5 shadow-xs">
                {/* Section Meta Inputs */}
                <div className="grid grid-cols-2 gap-3 pb-4 border-b border-neutral-800">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Section Title</label>
                    <input 
                      type="text"
                      value={activeSectionTitle}
                      onChange={(e) => setActiveSectionTitle(e.target.value)}
                      placeholder="e.g. Battle Royale"
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Category Tag</label>
                    <input 
                      type="text"
                      value={activeSectionCategory}
                      onChange={(e) => setActiveSectionCategory(e.target.value)}
                      placeholder="e.g. BR Esports"
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                </div>

                {/* Editor Mode Switcher */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 p-1 bg-slate-100 dark:bg-black rounded-xl border border-slate-200 dark:border-neutral-800">
                    <button
                      onClick={() => setRuleEditMode('interactive')}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all ${
                        ruleEditMode === 'interactive' ? 'bg-purple-600 text-black' : 'text-neutral-500'
                      }`}
                    >
                      Interactive Builder ({ruleList.length})
                    </button>
                    <button
                      onClick={() => setRuleEditMode('raw')}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all ${
                        ruleEditMode === 'raw' ? 'bg-purple-600 text-black' : 'text-neutral-500'
                      }`}
                    >
                      Multi-line Text
                    </button>
                  </div>

                  {/* Preset Template Loaders */}
                  <div className="relative group">
                    <button className="text-[8px] font-black uppercase tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                      <Sparkles size={11} />
                      Load Preset
                    </button>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl p-1.5 shadow-2xl z-20 w-48 space-y-1">
                      {Object.keys(RULE_PRESETS).map(pKey => (
                        <button
                          key={pKey}
                          onClick={() => handleApplyPresetTemplate(pKey)}
                          className="text-left px-3 py-2 rounded-lg text-[9px] font-bold text-neutral-300 hover:bg-purple-600 hover:text-white transition-colors"
                        >
                          {RULE_PRESETS[pKey].title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Interactive Builder Mode */}
                {ruleEditMode === 'interactive' ? (
                  <div className="space-y-3">
                    {/* Add Single Rule Input */}
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Add a new rule item (e.g. Device Requirement, Headshot Limit)..."
                        value={newSingleRuleText}
                        onChange={(e) => setNewSingleRuleText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSingleRule();
                          }
                        }}
                        className="flex-1 bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                      />
                      <button
                        onClick={handleAddSingleRule}
                        className="px-4 py-3 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-[0.97] transition-all shadow-md shadow-purple-600/20"
                      >
                        Add
                      </button>
                    </div>

                    {/* Rule List Items */}
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1 no-scrollbar">
                      {ruleList.length === 0 ? (
                        <div className="py-8 text-center bg-slate-50 dark:bg-black/40 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-800">
                          <p className="text-[10px] font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-wider">No rules in this section yet</p>
                          <p className="text-[8px] text-slate-400 dark:text-neutral-600 mt-1">Use the input above or load a starter preset</p>
                        </div>
                      ) : (
                        ruleList.map((r, idx) => (
                          <div key={idx} className="p-3.5 bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-neutral-800/80 rounded-2xl flex items-start gap-3 group">
                            <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-neutral-800 text-purple-600 dark:text-purple-400 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <input 
                                type="text"
                                value={r}
                                onChange={(e) => {
                                  const updated = [...ruleList];
                                  updated[idx] = e.target.value;
                                  setRuleList(updated);
                                  setRuleText(updated.join('\n'));
                                }}
                                className="w-full bg-transparent text-xs text-slate-800 dark:text-neutral-200 font-medium outline-none focus:text-purple-600 dark:focus:text-white"
                              />
                            </div>
                            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                              <button 
                                onClick={() => handleMoveRule(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1 hover:text-purple-500 disabled:opacity-20 text-slate-400 dark:text-neutral-400"
                                title="Move Up"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button 
                                onClick={() => handleMoveRule(idx, 'down')}
                                disabled={idx === ruleList.length - 1}
                                className="p-1 hover:text-purple-500 disabled:opacity-20 text-slate-400 dark:text-neutral-400"
                                title="Move Down"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteSingleRule(idx)}
                                className="p-1 hover:text-red-500 text-slate-400 dark:text-neutral-500"
                                title="Delete Rule"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  /* Multi-line Raw Mode */
                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-slate-500 dark:text-neutral-500 uppercase tracking-widest">
                      Enter one rule per line ({ruleText.split('\n').filter(r => r.trim().length > 0).length} lines detected)
                    </p>
                    <textarea
                      value={ruleText}
                      onChange={(e) => {
                        setRuleText(e.target.value);
                        setRuleList(e.target.value.split('\n').filter(r => r.trim().length > 0));
                      }}
                      placeholder="Enter match rules here..."
                      className="w-full h-80 bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 text-[11px] font-medium text-slate-800 dark:text-neutral-300 outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all resize-none no-scrollbar leading-loose font-mono"
                    />
                  </div>
                )}

                {/* Save Regulations & Section Actions */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={handleSaveCurrentSectionRules}
                    disabled={isProcessing}
                    className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save "{activeSectionTitle}" Regulations
                  </button>

                  {!['battle_royale', 'clash_squad', 'lone_wolf'].includes(activeRuleTab) && (
                    <button
                      onClick={() => handleDeleteCustomSectionRules(activeRuleTab, activeSectionTitle)}
                      disabled={isProcessing}
                      className="w-full py-2.5 text-red-400 hover:text-red-300 text-[8px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Delete This Custom Section Rules
                    </button>
                  )}
                </div>
              </div>

              {/* Guidelines Info Banner */}
              <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl">
                 <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest leading-relaxed flex items-center gap-1.5">
                   <Sparkles size={12} />
                   Live Sync: Rules configured here are dynamically matched to user screens by Section and Mode name.
                 </p>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.REFERRAL && (
            <motion.div
              key="referral"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Referral Settings */}
              <div className="p-6 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl space-y-6 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Referral Engine</h3>
                   <Copy size={16} className="text-purple-500" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Base Referral URL (e.g. https://khelgalli.in)</label>
                    <input 
                      type="text"
                      placeholder="https://yourapp.dom"
                      value={appSettings?.referral?.baseUrl || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, baseUrl: e.target.value }
                      })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Per Referral Reward (₹)</label>
                    <input 
                      type="number"
                      value={appSettings?.referral?.perReferralReward || 0}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, perReferralReward: Number(e.target.value) }
                      })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Reward Type</label>
                    <select 
                      value={appSettings?.referral?.rewardType || 'deposit'}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, rewardType: e.target.value }
                      })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] appearance-none shadow-none ring-0"
                    >
                      <option value="deposit" className="bg-white dark:bg-neutral-900 text-slate-900 dark:text-white">Deposit Only</option>
                      <option value="bonus" className="bg-white dark:bg-neutral-900 text-slate-900 dark:text-white">Bonus Only</option>
                      <option value="both" className="bg-white dark:bg-neutral-900 text-slate-900 dark:text-white">Both (Split)</option>
                    </select>
                  </div>

                  {appSettings?.referral?.rewardType === 'both' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Deposit %</label>
                        <input 
                          type="number"
                          value={appSettings?.referral?.depositPercentage || 50}
                          onChange={(e) => setAppSettings({
                            ...appSettings,
                            referral: { ...appSettings?.referral, depositPercentage: Number(e.target.value) }
                          })}
                          className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Bonus %</label>
                        <input 
                          type="number"
                          value={appSettings?.referral?.bonusPercentage || 50}
                          onChange={(e) => setAppSettings({
                            ...appSettings,
                            referral: { ...appSettings?.referral, bonusPercentage: Number(e.target.value) }
                          })}
                          className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">New User Reward (₹)</label>
                    <input 
                      type="number"
                      value={appSettings?.referral?.newUserReward || 0}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, newUserReward: Number(e.target.value) }
                      })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-purple-600 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Referral configuration
                </button>
              </div>

              {/* Support Settings */}
              <div className="p-6 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl space-y-6 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Customer support</h3>
                   <UsersIcon size={16} className="text-blue-500" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1">WhatsApp link</label>
                    <input 
                      type="text"
                      placeholder="https://wa.me/..."
                      value={appSettings?.support?.whatsapp || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, whatsapp: e.target.value }
                      })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1">Telegram link</label>
                    <input 
                      type="text"
                      placeholder="https://t.me/..."
                      value={appSettings?.support?.telegram || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, telegram: e.target.value }
                      })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1">support email</label>
                    <input 
                      type="email"
                      placeholder="support@example.com"
                      value={appSettings?.support?.email || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, email: e.target.value }
                      })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/30 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Update support links
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.ANNOUNCEMENTS && (
            <motion.div
              key="announcements"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Live Home Announcement Preview Card */}
              <div className="p-5 bg-white dark:bg-neutral-900 border border-purple-500/30 rounded-3xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black italic uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                      <Megaphone size={15} className="text-purple-400" />
                      Home Announcement Bar (Above Slider)
                    </h3>
                    <p className="text-[8px] font-black uppercase tracking-widest text-purple-400 mt-0.5">
                      Live Preview on Home Screen
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Real-Time Sync
                  </span>
                </div>

                {/* Exact visual preview of the Home announcement bar */}
                <div className="bg-white rounded-[22px] p-3 flex items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-2xl bg-[rgba(243,122,32,0.15)] flex items-center justify-center shrink-0">
                      <Megaphone className="w-5 h-5 text-[#FF9A4D] stroke-[2]" />
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 stroke-[2.3]" />
                      <p className="text-[11px] font-black uppercase tracking-tight text-slate-900 truncate">
                        {(announcementText.trim() || announcementsList.find(a => a.isActive)?.text || 'FOLLOW THE RULES - ENJOY FAIR GAMEPLAY').toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Add / Edit Announcement Form */}
              <div className="p-6 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black italic uppercase tracking-wider text-slate-900 dark:text-white">
                    {editingAnnouncementId ? 'Edit Announcement' : 'Add New Announcement'}
                  </h4>
                  {editingAnnouncementId && (
                    <button
                      onClick={() => {
                        setEditingAnnouncementId(null);
                        setAnnouncementText('');
                        setAnnouncementLink('rules');
                      }}
                      className="text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Announcement Message *
                  </label>
                  <input
                    type="text"
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="e.g. FOLLOW THE RULES - ENJOY FAIR GAMEPLAY"
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3.5 text-xs font-bold uppercase text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Tap Action / Destination
                  </label>
                  <select
                    value={announcementLink}
                    onChange={(e) => setAnnouncementLink(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  >
                    <option value="rules">Open Fairplay & Match Rules Modal</option>
                    <option value="tournaments">Go to Tournaments Lobby</option>
                    <option value="leaderboard">Go to Leaderboard</option>
                    <option value="wallet">Go to My Wallet</option>
                  </select>
                </div>

                <button
                  onClick={handleSaveAnnouncementItem}
                  disabled={isProcessing}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {editingAnnouncementId ? 'Update Announcement' : 'Publish Announcement'}
                </button>
              </div>

              {/* Active Announcements List */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">
                  Published Announcements ({announcementsList.length})
                </h4>

                {announcementsList.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 bg-white dark:bg-neutral-900 border rounded-3xl flex items-center justify-between gap-3 shadow-xs ${
                      item.isActive ? 'border-purple-500/40' : 'border-neutral-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                        <Megaphone size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
                          {item.text}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            item.isActive
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-neutral-800 text-neutral-500'
                          }`}>
                            {item.isActive ? 'Active on Home' : 'Hidden'}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                            Action: {item.link || 'rules'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleAnnouncement(item.id)}
                        className={`px-2.5 py-2 rounded-xl text-[8px] font-black uppercase tracking-wider border transition-all ${
                          item.isActive
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                        }`}
                      >
                        {item.isActive ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingAnnouncementId(item.id);
                          setAnnouncementText(item.text);
                          setAnnouncementLink(item.link || 'rules');
                        }}
                        className="p-2 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500 hover:text-white transition-all"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteAnnouncement(item.id)}
                        className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.BANNERS && (
            <motion.div
              key="banners"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => {
                    setEditingBanner(null);
                    setImageUrl('');
                    setRedirectUrl('');
                    setBannerType('main');
                    setBannerOrder(banners.filter(b => b.type === 'main' || b.type === 'offer').length);
                    setIsBannerModalOpen(true);
                  }}
                  className="py-4 px-3 bg-purple-600 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 active:scale-[0.97] transition-all text-black"
                >
                  <Plus size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Add Slider Banner</span>
                </button>
                <button 
                  onClick={() => {
                    const existingBottom = banners.find(b => b.type === 'bottom' || b.type === 'freefire');
                    setEditingBanner(existingBottom || null);
                    setImageUrl(existingBottom?.imageUrl || '');
                    setRedirectUrl(existingBottom?.redirectUrl || '');
                    setBannerType('bottom');
                    setBannerOrder(0);
                    setIsBannerModalOpen(true);
                  }}
                  className="py-4 px-3 bg-emerald-600 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.97] transition-all text-white"
                >
                  <ImageIcon size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Set Bottom Banner (Max 1)</span>
                </button>
              </div>

              {/* Single Bottom Banner Preview */}
              <div className="p-5 bg-white dark:bg-neutral-900 border border-emerald-500/30 rounded-3xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black italic uppercase tracking-wider text-slate-900 dark:text-white">Bottom Home Banner (Only 1 Allowed)</h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Displayed at the bottom of Home Page</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Single Slot
                  </span>
                </div>
                {(() => {
                  const bottomB = banners.find(b => (b.type === 'bottom' || b.type === 'freefire') && b.isActive !== false);
                  if (!bottomB) {
                    return (
                      <div className="py-8 text-center border border-dashed border-neutral-800 rounded-2xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">No Bottom Banner Attached</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      <div className="relative aspect-[16/7] rounded-2xl overflow-hidden border border-white/10">
                        <SafeImage src={bottomB.imageUrl} alt="Bottom Banner" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black text-neutral-400 truncate max-w-[200px]">
                          {bottomB.redirectUrl || 'No redirect link'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingBanner(bottomB);
                              setImageUrl(bottomB.imageUrl);
                              setRedirectUrl(bottomB.redirectUrl || '');
                              setBannerType('bottom');
                              setBannerOrder(0);
                              setIsBannerModalOpen(true);
                            }}
                            className="p-2 bg-blue-500/10 text-blue-500 rounded-xl hover:bg-blue-500 hover:text-white transition-all"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteBanner(bottomB.id!)}
                            disabled={deletingBannerId === bottomB.id}
                            className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                          >
                            {deletingBannerId === bottomB.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Top Carousel Banners */}
              <div className="space-y-4">
                <h4 className="text-xs font-black italic uppercase tracking-wider text-neutral-400 ml-1">Top Slider Banners</h4>
                {banners.filter(b => b.isActive !== false && b.type !== 'bottom' && b.type !== 'freefire').map((b) => (
                  <div key={b.id} className="p-4 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl group shadow-xs">
                    <div className="relative aspect-video rounded-2xl overflow-hidden mb-4 border border-white/5">
                      <SafeImage 
                        src={b.imageUrl} 
                        alt="" 
                        className="w-full h-full"
                      />
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2 z-20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[8px] font-black uppercase text-white tracking-widest">{b.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[8px] font-black uppercase text-neutral-600 tracking-widest mb-1">Order: {b.order}</p>
                        {b.redirectUrl && <p className="text-[8px] font-black text-purple-400 truncate max-w-[150px]">{b.redirectUrl}</p>}
                      </div>
                      <div className="flex gap-2">
                         <button 
                          onClick={() => {
                            setEditingBanner(b);
                            setImageUrl(b.imageUrl);
                            setRedirectUrl(b.redirectUrl || '');
                            setBannerType(b.type);
                            setBannerOrder(b.order);
                            setIsBannerModalOpen(true);
                          }}
                          className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl hover:bg-blue-500 hover:text-white transition-all"
                         >
                          <Edit2 size={16} />
                         </button>
                         <button 
                          onClick={() => handleDeleteBanner(b.id!)}
                          disabled={deletingBannerId === b.id}
                          className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                         >
                          {deletingBannerId === b.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                         </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.PAYMENT && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="p-6 bg-purple-600/10 border border-purple-500/20 rounded-3xl flex items-center justify-between shadow-xl">
                 <div>
                   <h3 className="text-sm font-black italic uppercase tracking-tight text-white mb-1">Payment Gateways</h3>
                   <p className="text-[8px] font-black uppercase tracking-widest text-purple-500">Enable/Disable payment providers</p>
                 </div>
                 <button 
                  onClick={() => {
                    setEditingGateway(null);
                    setGatewayForm({
                      name: '',
                      apiKey: '',
                      secretKey: '',
                      merchantId: '',
                      webhookSecret: '',
                      upiId: ''
                    });
                    setIsGatewayModalOpen(true);
                  }}
                  className="p-3 bg-purple-600 rounded-xl text-black active:scale-90 transition-all shadow-lg"
                 >
                   <Plus size={20} />
                 </button>
              </div>

              {/* Active Deposit Mode Banner */}
              {(() => {
                const activeGw = paymentGateways.find((g) => g.isActive === true && appSettings?.autoGatewayActive !== false);
                return (
                  <div
                    className={`p-4 rounded-3xl border flex items-center justify-between gap-3 ${
                      activeGw
                        ? 'bg-purple-500/10 border-purple-500/30'
                        : 'bg-emerald-500/10 border-emerald-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                          activeGw ? 'bg-purple-600 text-black' : 'bg-emerald-500 text-white'
                        }`}
                      >
                        <Wallet size={18} />
                      </div>
                      <div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400 block">
                          CURRENT ACTIVE DEPOSIT SYSTEM
                        </span>
                        <h4 className="text-xs font-black italic uppercase text-white">
                          {activeGw
                            ? `AUTO GATEWAY: ${(activeGw.name || activeGw.id).toUpperCase()}`
                            : 'MANUAL QR & 12-DIGIT UTR SYSTEM (ACTIVE)'}
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab(AdminTab.DEPOSITS)}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-300 shrink-0"
                    >
                      Manual Settings
                    </button>
                  </div>
                );
              })()}

              <div className="space-y-4">
                {['razorpay', 'cashfree', 'zapupi', 'custom'].map(gId => {
                  const gateway = paymentGateways.find(g => g.id === gId);
                  const isConfigured = Boolean(gateway && (gateway.apiKey || gateway.secretKey || gateway.merchantId || gateway.upiId));
                  const isActive = Boolean(gateway?.isActive === true && appSettings?.autoGatewayActive !== false);

                  return (
                    <div key={gId} className={`p-5 bg-white dark:bg-neutral-900 border rounded-3xl transition-all shadow-xs ${isActive ? 'border-purple-500 shadow-[0_0_20px_rgba(243,122,32,0.1)]' : 'border-slate-200 dark:border-neutral-800'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isActive ? 'bg-purple-600 border-purple-400 text-black' : 'bg-slate-100 dark:bg-black border-slate-200 dark:border-neutral-800 text-slate-400 dark:text-neutral-600'}`}>
                            <DollarSign size={20} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black italic uppercase tracking-tight text-slate-900 dark:text-white">{gateway?.name || gId.toUpperCase()}</h4>
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-black uppercase tracking-widest ${isConfigured ? 'text-emerald-500' : 'text-neutral-600'}`}>
                                {isConfigured ? 'Configured' : 'Not Configured'}
                              </span>
                              {isActive ? (
                                <span className="text-[8px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded-full border border-purple-500/30">ON (Auto Mode)</span>
                              ) : (
                                <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">OFF</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingGateway(gateway || { id: gId, name: gId.toUpperCase(), isActive: false });
                              setGatewayForm({
                                name: gateway?.name || gId.toUpperCase(),
                                apiKey: gateway?.apiKey || '',
                                secretKey: gateway?.secretKey || '',
                                merchantId: gateway?.merchantId || '',
                                webhookSecret: gateway?.webhookSecret || '',
                                upiId: gateway?.upiId || ''
                              });
                              setIsGatewayModalOpen(true);
                            }}
                            className="p-2 text-neutral-400 hover:text-white bg-neutral-800/80 rounded-xl transition-colors"
                            title="Configure Gateway Credentials"
                          >
                            <Settings size={16} />
                          </button>
                          <button 
                            type="button"
                            disabled={isProcessing}
                            onClick={() => {
                              // When turning ON an unconfigured gateway with no keys, open modal to configure first.
                              // When turning OFF (isActive === true), NEVER open the modal—always toggle OFF immediately!
                              if (!isActive && !isConfigured) {
                                setEditingGateway({ id: gId, name: gId.toUpperCase(), isActive: true });
                                setGatewayForm({
                                  name: gId.toUpperCase(),
                                  apiKey: '',
                                  secretKey: '',
                                  merchantId: '',
                                  webhookSecret: '',
                                  upiId: ''
                                });
                                setIsGatewayModalOpen(true);
                                return;
                              }
                              handleToggleGateway(gId, isActive);
                            }}
                            className={`w-12 h-6 rounded-full relative transition-all ${isActive ? 'bg-purple-600' : 'bg-neutral-800'}`}
                          >
                            <motion.div 
                              className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-lg"
                              animate={{ x: isActive ? 24 : 0 }}
                            />
                          </button>
                        </div>
                      </div>
                      
                      {isConfigured && (
                        <div className="grid grid-cols-2 gap-2 pt-4 border-t border-white/5">
                          <div>
                            <p className="text-[7px] font-black uppercase tracking-widest text-neutral-600">Merchant ID</p>
                            <p className="text-[9px] font-bold text-neutral-400 truncate">{gateway?.merchantId || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[7px] font-black uppercase tracking-widest text-neutral-600">API Key</p>
                            <p className="text-[9px] font-bold text-neutral-400 truncate">{gateway?.apiKey ? '••••••••' : 'N/A'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.DEPOSITS && (
            <motion.div
              key="deposits"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Hidden file input for QR code upload */}
              <input
                type="file"
                ref={qrFileInputRef}
                onChange={handleQrImageUpload}
                accept="image/*"
                className="hidden"
              />

              {/* 1. MANUAL PAYMENT SETTINGS CARD (Exact Match to Reference Image) */}
              <div className="rounded-[30px] p-6 bg-[rgba(243,122,32,0.15)] dark:bg-[#111111] border border-purple-200/80 dark:border-purple-500/25 shadow-[0_10px_30px_rgba(243,122,32,0.08)] space-y-5">
                {/* Header Row: MANUAL PAYMENT SETTINGS + SAVE Button */}
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                    MANUAL PAYMENT SETTINGS
                  </h3>
                  <button
                    type="button"
                    onClick={handleSaveManualPaymentSettings}
                    disabled={isProcessing}
                    className="px-5 py-2.5 rounded-2xl bg-[#F37A1F] hover:bg-[#D9660F] text-black text-[10px] font-black uppercase tracking-widest shadow-[0_6px_18px_rgba(243,122,32,0.35)] flex items-center gap-2 active:scale-[0.97] transition-all"
                  >
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>SAVE</span>
                  </button>
                </div>

                {/* UPI ID Input */}
                <div className="space-y-2">
                  <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-purple-200/70 ml-1 block">
                    UPI ID
                  </label>
                  <input
                    type="text"
                    value={manualUpiId}
                    onChange={(e) => setManualUpiId(e.target.value)}
                    placeholder="8707088647@fam"
                    className="w-full bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3.5 text-xs font-extrabold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] shadow-xs"
                  />
                </div>

                {/* QR CODE URL (OR UPLOAD IMAGE) */}
                <div className="space-y-2">
                  <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-purple-200/70 ml-1 block">
                    QR CODE URL (OR UPLOAD IMAGE)
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="text"
                      value={manualQrUrl}
                      onChange={(e) => setManualQrUrl(e.target.value)}
                      placeholder="https://i.ibb.co/..."
                      className="flex-1 min-w-0 bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3.5 text-xs font-extrabold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => qrFileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-3.5 rounded-2xl bg-[#FFC48F]/70 dark:bg-purple-500/25 border border-purple-300/60 dark:border-purple-400/30 text-[#D9660F] dark:text-purple-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 active:scale-[0.97] transition-all"
                    >
                      {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      <span>UPLOAD</span>
                    </button>
                  </div>
                </div>

                {/* QR PREVIEW Card */}
                <div className="bg-white/95 dark:bg-[#111111] rounded-3xl p-4 border border-purple-100 dark:border-purple-500/20 flex items-center gap-5 shadow-xs">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-amber-50 border border-slate-200 dark:border-white/10 p-1.5 shrink-0">
                    <SafeImage
                      src={manualQrUrl}
                      alt="QR Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-purple-200/70 block">
                      QR PREVIEW
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 mt-1 block">
                      Shown to users during manual deposit
                    </span>
                  </div>
                </div>

                {/* PAYMENT APPS (SHOWN TO USERS) */}
                <div className="space-y-3 pt-1">
                  <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-purple-200/70 ml-1 block">
                    PAYMENT APPS (SHOWN TO USERS)
                  </label>

                  <div className="space-y-2.5">
                    {paymentAppsList.map((app) => (
                      <div
                        key={app.id}
                        className="bg-white dark:bg-[#111111] rounded-2xl p-3.5 border border-purple-100/80 dark:border-purple-500/15 flex items-center justify-between shadow-xs"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200/60 dark:border-white/10 p-1.5 flex items-center justify-center shrink-0">
                            <SafeImage
                              src={app.iconUrl}
                              alt={app.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {app.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setPaymentAppsList((prev) => prev.filter((item) => item.id !== app.id))
                          }
                          className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Payment App Row */}
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={newPaymentAppName}
                      onChange={(e) => setNewPaymentAppName(e.target.value)}
                      placeholder="Add UPI App Name (e.g. FamPay)"
                      className="flex-1 bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newPaymentAppName.trim()) return;
                        setPaymentAppsList((prev) => [
                          ...prev,
                          {
                            id: `app_${Date.now()}`,
                            name: newPaymentAppName.trim(),
                            iconUrl:
                              newPaymentAppIcon.trim() ||
                              'https://img.icons8.com/color/96/bhim.png',
                          },
                        ]);
                        setNewPaymentAppName('');
                        setNewPaymentAppIcon('');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#F37A1F] text-black text-[10px] font-black uppercase tracking-wider shrink-0"
                    >
                      + Add App
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. DEPOSIT REQUESTS MANAGEMENT SECTION (Pending -> Success / Reject) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                      USER DEPOSIT REQUESTS
                    </h3>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                      Verify UTR & Approve or Reject Manual Deposits
                    </p>
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="grid grid-cols-4 gap-2 bg-white dark:bg-neutral-900 p-1.5 rounded-2xl border border-slate-200/70 dark:border-neutral-800">
                  {(['pending', 'completed', 'failed', 'all'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDepositFilter(st)}
                      className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                        depositFilter === st
                          ? 'bg-[#F37A1F] text-black shadow-sm'
                          : 'text-slate-500 dark:text-neutral-400'
                      }`}
                    >
                      {st === 'completed' ? 'Success' : st === 'failed' ? 'Rejected' : st}
                    </button>
                  ))}
                </div>

                {/* Deposit Requests List */}
                {(() => {
                  const depositRequests = transactions.filter((t) => {
                    if (t.type !== 'deposit') return false;
                    if (depositFilter === 'all') return true;
                    return (t.status || 'completed') === depositFilter;
                  });

                  if (depositRequests.length === 0) {
                    return (
                      <div className="p-10 bg-white dark:bg-neutral-900 border border-slate-200/70 dark:border-neutral-800 rounded-3xl text-center">
                        <Wallet size={28} className="mx-auto text-slate-300 dark:text-neutral-700 mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                          No {depositFilter} deposit requests found
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {depositRequests.map((req) => {
                        const matchedUser = users.find((u) => u.id === req.userId);
                        const displayName = req.userName || matchedUser?.username || 'Player';
                        const displayEmail = req.userEmail || matchedUser?.email || '';
                        const isPending = req.status === 'pending';
                        const isSuccess = req.status === 'completed';

                        return (
                          <div
                            key={req.id}
                            className="p-5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl space-y-4 shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black italic uppercase text-slate-900 dark:text-white">
                                    {displayName}
                                  </span>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                      isPending
                                        ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                        : isSuccess
                                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                        : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                                    }`}
                                  >
                                    {isPending ? 'PENDING' : isSuccess ? 'SUCCESS' : 'REJECTED'}
                                  </span>
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 mt-0.5">
                                  {displayEmail || `User ID: ${req.userId?.slice(0, 8)}`}
                                </p>
                              </div>

                              <div className="text-right">
                                <span className="text-xl font-black italic text-emerald-500">
                                  +₹{req.amount}
                                </span>
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                                  {req.date || (req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString() : 'Recent')}
                                </p>
                              </div>
                            </div>

                            {/* UTR / Reference Box */}
                            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-black/60 border border-slate-200/60 dark:border-neutral-800 flex items-center justify-between">
                              <div>
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 block">
                                  UTR / REFERENCE NO.
                                </span>
                                <span className="text-xs font-black font-mono text-[#F37A1F] dark:text-purple-400">
                                  {req.utr || 'N/A (Auto/Admin)'}
                                </span>
                              </div>
                              {req.utr && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyCredential(req.utr, `utr_${req.id}`)}
                                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                                >
                                  {copiedKey === `utr_${req.id}` ? (
                                    <Check size={12} className="text-emerald-500" />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                  <span>{copiedKey === `utr_${req.id}` ? 'Copied' : 'Copy UTR'}</span>
                                </button>
                              )}
                            </div>

                            {/* Action Buttons for Pending Requests */}
                            {isPending && (
                              <div className="grid grid-cols-2 gap-3 pt-1">
                                <button
                                  type="button"
                                  disabled={processingTxId === req.id}
                                  onClick={() => handleApproveDeposit(req)}
                                  className="py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all btn-press disabled:opacity-50"
                                >
                                  {processingTxId === req.id ? (
                                    <Loader2 size={15} className="animate-spin" />
                                  ) : (
                                    <CheckCircle2 size={15} />
                                  )}
                                  <span>
                                    {processingTxId === req.id ? 'Processing...' : 'Approve (Success)'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={processingTxId === req.id}
                                  onClick={() => handleRejectDeposit(req)}
                                  className="py-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/30 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all btn-press disabled:opacity-50"
                                >
                                  {processingTxId === req.id ? (
                                    <Loader2 size={15} className="animate-spin" />
                                  ) : (
                                    <Ban size={15} />
                                  )}
                                  <span>Reject</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.WITHDRAWALS && (
            <motion.div
              key="withdrawals"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="p-5 rounded-3xl bg-[rgba(243,122,32,0.15)] dark:bg-[#111111] border border-purple-200/80 dark:border-purple-500/25 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                    WITHDRAWAL REQUESTS
                  </h3>
                  <p className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 mt-0.5">
                    Send payout to user UPI & mark Success or Reject (Auto-Refunds)
                  </p>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="grid grid-cols-4 gap-2 bg-white dark:bg-neutral-900 p-1.5 rounded-2xl border border-slate-200/70 dark:border-neutral-800">
                {(['pending', 'completed', 'failed', 'all'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setWithdrawFilter(st)}
                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                      withdrawFilter === st
                        ? 'bg-[#F37A1F] text-black shadow-sm'
                        : 'text-slate-500 dark:text-neutral-400'
                    }`}
                  >
                    {st === 'completed' ? 'Success' : st === 'failed' ? 'Rejected' : st}
                  </button>
                ))}
              </div>

              {(() => {
                const withdrawRequests = transactions.filter((t) => {
                  if (t.type !== 'withdrawal' && t.type !== 'withdraw') return false;
                  if (withdrawFilter === 'all') return true;
                  return (t.status || 'completed') === withdrawFilter;
                });

                if (withdrawRequests.length === 0) {
                  return (
                    <div className="p-10 bg-white dark:bg-neutral-900 border border-slate-200/70 dark:border-neutral-800 rounded-3xl text-center">
                      <DollarSign size={28} className="mx-auto text-slate-300 dark:text-neutral-700 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                        No {withdrawFilter} withdrawal requests found
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {withdrawRequests.map((req) => {
                      const matchedUser = users.find((u) => u.id === req.userId);
                      const displayName = req.userName || matchedUser?.username || 'Player';
                      const displayEmail = req.userEmail || matchedUser?.email || '';
                      const isPending = req.status === 'pending';
                      const isSuccess = req.status === 'completed';

                      return (
                        <div
                          key={req.id}
                          className="p-5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl space-y-4 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black italic uppercase text-slate-900 dark:text-white">
                                  {displayName}
                                </span>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                    isPending
                                      ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                      : isSuccess
                                      ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                      : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                                  }`}
                                >
                                  {isPending ? 'PENDING' : isSuccess ? 'SUCCESS' : 'REJECTED'}
                                </span>
                              </div>
                              <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 mt-0.5">
                                {displayEmail || `User ID: ${req.userId?.slice(0, 8)}`}
                              </p>
                            </div>

                            <div className="text-right">
                              <span className="text-xl font-black italic text-amber-500">
                                ₹{req.amount}
                              </span>
                              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                                {req.date || (req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString() : 'Recent')}
                              </p>
                            </div>
                          </div>

                          {/* Destination UPI ID Box */}
                          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-black/60 border border-slate-200/60 dark:border-neutral-800 flex items-center justify-between">
                            <div>
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 block">
                                PAYOUT UPI ID
                              </span>
                              <span className="text-xs font-black font-mono text-[#F37A1F] dark:text-purple-400">
                                {req.upiId || 'Not Provided'}
                              </span>
                            </div>
                            {req.upiId && (
                              <button
                                type="button"
                                onClick={() => handleCopyCredential(req.upiId, `upi_${req.id}`)}
                                className="px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                              >
                                {copiedKey === `upi_${req.id}` ? (
                                  <Check size={12} className="text-emerald-500" />
                                ) : (
                                  <Copy size={12} />
                                )}
                                <span>{copiedKey === `upi_${req.id}` ? 'Copied' : 'Copy UPI'}</span>
                              </button>
                            )}
                          </div>

                          {isPending && (
                            <div className="grid grid-cols-2 gap-3 pt-1">
                              <button
                                type="button"
                                disabled={processingTxId === req.id}
                                onClick={() => handleApproveWithdrawal(req)}
                                className="py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all btn-press disabled:opacity-50"
                              >
                                {processingTxId === req.id ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : (
                                  <CheckCircle2 size={15} />
                                )}
                                <span>
                                  {processingTxId === req.id ? 'Processing...' : 'Mark Paid (Success)'}
                                </span>
                              </button>
                              <button
                                type="button"
                                disabled={processingTxId === req.id}
                                onClick={() => handleRejectWithdrawal(req)}
                                className="py-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/30 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all btn-press disabled:opacity-50"
                              >
                                {processingTxId === req.id ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : (
                                  <Ban size={15} />
                                )}
                                <span>Reject & Refund</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </motion.div>
          )}

          {activeTab === AdminTab.SETTINGS && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Hidden file input for App Logo upload */}
              <input
                type="file"
                ref={logoFileInputRef}
                onChange={handleLogoImageUpload}
                accept="image/*"
                className="hidden"
              />

              {/* 1. APP BRANDING & LIMITS SETTINGS CARD (Styled like Reference Image) */}
              <div className="rounded-[30px] p-6 bg-[rgba(243,122,32,0.15)] dark:bg-[#111111] border border-purple-200/80 dark:border-purple-500/25 shadow-[0_10px_30px_rgba(243,122,32,0.08)] space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                    APP BRANDING & WALLET LIMITS
                  </h3>
                  <button
                    type="button"
                    onClick={handleSaveManualPaymentSettings}
                    disabled={isProcessing}
                    className="px-5 py-2.5 rounded-2xl bg-[#F37A1F] hover:bg-[#D9660F] text-black text-[10px] font-black uppercase tracking-widest shadow-[0_6px_18px_rgba(243,122,32,0.35)] flex items-center gap-2 active:scale-[0.97] transition-all"
                  >
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>SAVE</span>
                  </button>
                </div>

                {/* App Name */}
                <div className="space-y-2">
                  <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-purple-200/70 ml-1 block">
                    APP NAME
                  </label>
                  <input
                    type="text"
                    value={appNameSetting}
                    onChange={(e) => setAppNameSetting(e.target.value)}
                    placeholder="KIDS ADDA"
                    className="w-full bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3.5 text-xs font-extrabold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] shadow-xs"
                  />
                </div>

                {/* App Logo URL or Upload */}
                <div className="space-y-2">
                  <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-purple-200/70 ml-1 block">
                    APP LOGO URL (OR UPLOAD IMAGE)
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="text"
                      value={appLogoUrlSetting}
                      onChange={(e) => setAppLogoUrlSetting(e.target.value)}
                      placeholder="https://i.ibb.co/..."
                      className="flex-1 min-w-0 bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3.5 text-xs font-extrabold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-3.5 rounded-2xl bg-[#FFC48F]/70 dark:bg-purple-500/25 border border-purple-300/60 dark:border-purple-400/30 text-[#D9660F] dark:text-purple-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 active:scale-[0.97] transition-all"
                    >
                      {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      <span>UPLOAD</span>
                    </button>
                  </div>
                </div>

                {/* App Logo Preview */}
                <div className="bg-white/95 dark:bg-[#111111] rounded-3xl p-4 border border-purple-100 dark:border-purple-500/20 flex items-center gap-4 shadow-xs">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-white/10 shrink-0">
                    <SafeImage
                      src={appLogoUrlSetting}
                      alt="App Logo Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-purple-200/70 block">
                      LOGO & HEADER PREVIEW
                    </span>
                    <span className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white mt-0.5 block">
                      {appNameSetting || 'KIDS ADDA'}
                    </span>
                  </div>
                </div>

                {/* QR Code & UPI ID also accessible in Settings */}
                <div className="space-y-2 pt-2 border-t border-purple-200/60 dark:border-purple-500/20">
                  <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-purple-200/70 ml-1 block">
                    MANUAL DEPOSIT UPI ID
                  </label>
                  <input
                    type="text"
                    value={manualUpiId}
                    onChange={(e) => setManualUpiId(e.target.value)}
                    placeholder="8707088647@fam"
                    className="w-full bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3.5 text-xs font-extrabold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] shadow-xs"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-purple-200/70 ml-1 block">
                    QR CODE URL (OR UPLOAD IMAGE)
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="text"
                      value={manualQrUrl}
                      onChange={(e) => setManualQrUrl(e.target.value)}
                      placeholder="https://i.ibb.co/..."
                      className="flex-1 min-w-0 bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3.5 text-xs font-extrabold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => qrFileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-3.5 rounded-2xl bg-[#FFC48F]/70 dark:bg-purple-500/25 border border-purple-300/60 dark:border-purple-400/30 text-[#D9660F] dark:text-purple-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 active:scale-[0.97] transition-all"
                    >
                      {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      <span>UPLOAD</span>
                    </button>
                  </div>
                </div>

                {/* Deposit & Withdrawal Min/Max Limits */}
                <div className="pt-2 border-t border-purple-200/60 dark:border-purple-500/20 space-y-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:text-purple-200 block ml-1">
                    DEPOSIT & WITHDRAWAL LIMITS (₹)
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-purple-200/70 ml-1 block">
                        MIN DEPOSIT (₹)
                      </label>
                      <input
                        type="number"
                        value={minDepositSetting}
                        onChange={(e) => setMinDepositSetting(Number(e.target.value))}
                        className="w-full bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-[#F37A1F]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-purple-200/70 ml-1 block">
                        MAX DEPOSIT (₹)
                      </label>
                      <input
                        type="number"
                        value={maxDepositSetting}
                        onChange={(e) => setMaxDepositSetting(Number(e.target.value))}
                        className="w-full bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-[#F37A1F]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-purple-200/70 ml-1 block">
                        MIN WITHDRAWAL (₹)
                      </label>
                      <input
                        type="number"
                        value={minWithdrawSetting}
                        onChange={(e) => setMinWithdrawSetting(Number(e.target.value))}
                        className="w-full bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-[#F37A1F]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-purple-200/70 ml-1 block">
                        MAX WITHDRAWAL (₹)
                      </label>
                      <input
                        type="number"
                        value={maxWithdrawSetting}
                        onChange={(e) => setMaxWithdrawSetting(Number(e.target.value))}
                        className="w-full bg-white dark:bg-[#111111] border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-[#F37A1F]"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveManualPaymentSettings}
                  disabled={isProcessing}
                  className="w-full py-4 rounded-2xl bg-[#F37A1F] hover:bg-[#D9660F] text-black text-xs font-black uppercase tracking-widest shadow-[0_8px_24px_rgba(243,122,32,0.35)] flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  <span>SAVE ALL SETTINGS</span>
                </button>
              </div>

              {/* 2. BONUS MANAGEMENT CARD (Exact User Requirement) */}
              <div className="rounded-[30px] p-6 bg-gradient-to-br from-amber-500/10 via-purple-950/20 to-neutral-900 border border-amber-500/30 shadow-[0_10px_30px_rgba(245,158,11,0.08)] space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Gift size={20} />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                        <span>BONUS MANAGEMENT</span>
                      </h3>
                      <p className="text-[9px] font-extrabold uppercase tracking-widest text-amber-200/70">
                        Signup Welcome Bonus & Match Entry Bonus Rules
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                      signupBonusSetting === 0 
                        ? 'bg-neutral-800 text-neutral-400 border-neutral-700' 
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-xs'
                    }`}>
                      {signupBonusSetting === 0 ? '₹0 BONUS (OFF)' : `+₹${signupBonusSetting} ACTIVE`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSaveBonusSettings()}
                      disabled={isProcessing}
                      className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-[10px] font-black uppercase tracking-widest shadow-[0_6px_18px_rgba(245,158,11,0.3)] flex items-center gap-1.5 active:scale-[0.97] transition-all"
                    >
                      {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      <span>SAVE BONUS</span>
                    </button>
                  </div>
                </div>

                {/* Explanation Banner */}
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/20 text-xs flex items-start gap-3">
                  <Sparkles size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-amber-100 leading-relaxed">
                      Control the exact bonus awarded to newly registered users. If you set the signup bonus to <span className="font-black text-amber-300">₹0</span>, users will receive strictly <span className="font-black text-amber-300">₹0 rupees</span> in their bonus wallet.
                    </p>
                    <p className="text-[10px] font-medium text-amber-200/60">
                      Note: New user deposit wallet is always initialized to ₹0. Only the configured signup bonus is credited to their bonus wallet.
                    </p>
                  </div>
                </div>

                {/* Input: Signup Bonus Amount */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-neutral-300 ml-1 block">
                      NEW USER SIGNUP BONUS (₹)
                    </label>
                    <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-wider">
                      Current: ₹{signupBonusSetting}
                    </span>
                  </div>
                  
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-black text-amber-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={signupBonusSetting}
                      onChange={(e) => setSignupBonusSetting(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-full bg-[#111111] border border-amber-500/30 focus:border-amber-400 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-black text-white outline-none shadow-xs transition-colors"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[8.5px] font-black uppercase tracking-wider text-neutral-500 mr-1">
                      QUICK PRESETS:
                    </span>
                    {[
                      { label: '₹0 (NO BONUS)', val: 0, highlight: signupBonusSetting === 0 },
                      { label: '₹10', val: 10, highlight: signupBonusSetting === 10 },
                      { label: '₹25', val: 25, highlight: signupBonusSetting === 25 },
                      { label: '₹50', val: 50, highlight: signupBonusSetting === 50 },
                      { label: '₹100', val: 100, highlight: signupBonusSetting === 100 },
                      { label: '₹200', val: 200, highlight: signupBonusSetting === 200 }
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => {
                          setSignupBonusSetting(preset.val);
                          handleSaveBonusSettings(preset.val);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-[0.97] border ${
                          preset.highlight
                            ? 'bg-amber-500 text-black border-amber-400 shadow-sm shadow-amber-500/25 font-black'
                            : 'bg-white dark:bg-neutral-900/90 text-slate-700 dark:text-neutral-300 border-slate-200 dark:border-neutral-800 hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-white shadow-xs'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Match Entry Bonus Utilization */}
                <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="text-[9.5px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-neutral-300 ml-1 block">
                      MAX BONUS USABLE PER TOURNAMENT MATCH ENTRY (%)
                    </label>
                    <span className="text-[9.5px] font-black text-amber-500">
                      {maxBonusPerMatchSetting}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={maxBonusPerMatchSetting}
                    onChange={(e) => setMaxBonusPerMatchSetting(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] font-bold text-slate-400 dark:text-neutral-500 px-1">
                    <span>0% (Deposit only)</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100% (Full Bonus Usable)</span>
                  </div>
                </div>

                {/* Live Preview Box */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-black/40 border border-slate-200 dark:border-white/5 space-y-2">
                  <span className="text-[8.5px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 block">
                    NEW USER STARTING WALLET PREVIEW:
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
                      <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 block">DEPOSIT</span>
                      <span className="text-xs font-black text-slate-800 dark:text-neutral-300 mt-0.5 block">₹0</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
                      <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 block">WINNINGS</span>
                      <span className="text-xs font-black text-slate-800 dark:text-neutral-300 mt-0.5 block">₹0</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-500/30">
                      <span className="text-[8px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block">BONUS</span>
                      <span className="text-xs font-black text-amber-700 dark:text-amber-300 mt-0.5 block">₹{signupBonusSetting}</span>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  type="button"
                  onClick={() => handleSaveBonusSettings()}
                  disabled={isProcessing}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-black uppercase tracking-widest shadow-[0_8px_24px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  <span>APPLY & SAVE BONUS SETTINGS</span>
                </button>
              </div>

              {/* 3. FIREBASE & VERCEL HOSTING SETUP CARD */}
              <div className="rounded-[30px] p-6 bg-gradient-to-br from-blue-50/90 via-white to-purple-50/60 dark:from-slate-900 dark:via-neutral-900 dark:to-[#12111c] border border-blue-200/80 dark:border-blue-500/30 shadow-[0_10px_35px_rgba(59,130,246,0.12)] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/15 dark:bg-blue-500/20 border border-blue-300/60 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Globe size={20} />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-black italic uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        <span>FIREBASE & VERCEL HOSTING SETUP</span>
                      </h3>
                      <p className="text-[9px] font-extrabold uppercase tracking-widest text-blue-600/80 dark:text-blue-300/70">
                        Google Login Domain Authorization & Hosting Guide
                      </p>
                    </div>
                  </div>

                  <a
                    href={`https://console.firebase.google.com/project/${resolvedFirebaseConfig.projectId}/authentication/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest shadow-[0_6px_18px_rgba(37,99,235,0.35)] flex items-center gap-1.5 active:scale-[0.97] transition-all self-start sm:self-auto"
                  >
                    <span>OPEN FIREBASE CONSOLE</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                {/* Vercel Domain Info Box */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-black/40 border border-blue-300/60 dark:border-blue-500/20 space-y-3 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-300 block">
                        CURRENT HOSTING DOMAIN (VERCEL / CUSTOM)
                      </span>
                      <span className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-0.5 block select-all">
                        {typeof window !== 'undefined' ? window.location.hostname : 'khel-galli-ecsu.vercel.app'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const domain = typeof window !== 'undefined' ? window.location.hostname : '';
                        navigator.clipboard.writeText(domain);
                        setCopiedVercelDomain(true);
                        setTimeout(() => setCopiedVercelDomain(false), 2500);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 self-start sm:self-auto transition-all active:scale-[0.97]"
                    >
                      {copiedVercelDomain ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedVercelDomain ? 'COPIED!' : 'COPY DOMAIN'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/5">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block">FIREBASE PROJECT ID</span>
                      <span className="text-xs font-mono font-bold text-neutral-200 mt-0.5 block">{resolvedFirebaseConfig.projectId}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block">AUTH DOMAIN</span>
                      <span className="text-xs font-mono font-bold text-neutral-200 mt-0.5 block">{resolvedFirebaseConfig.authDomain}</span>
                    </div>
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-2.5 text-xs text-neutral-300">
                  <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>How to fix Google Login on Vercel:</span>
                  </p>
                  <p className="text-[10.5px] text-neutral-300 leading-relaxed font-medium">
                    Firebase strictly blocks OAuth logins from any website domain not added to <strong>Authorized domains</strong>. Follow these 4 quick steps:
                  </p>

                  <div className="space-y-2 font-medium text-[11px]">
                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">1</span>
                      <span>Click <strong>Open Firebase Console</strong> above to go directly to Authentication settings.</span>
                    </div>
                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">2</span>
                      <span>Under the <strong>Settings</strong> tab, scroll down to <strong>Authorized domains</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">3</span>
                      <span>Click <strong>Add domain</strong>, paste your Vercel domain (<code className="text-blue-300 font-mono">{typeof window !== 'undefined' ? window.location.hostname : 'khel-galli-ecsu.vercel.app'}</code>) and click <strong>Save</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">4</span>
                      <span>Also add <code className="text-blue-300 font-mono">*.vercel.app</code> to cover all preview deployments. Takes effect immediately with no rebuild!</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.MEDIA && (
            <MediaLibraryTab currentUser={user} />
          )}
        </div>
      </div>

      {/* User Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 text-slate-900 dark:text-white rounded-t-[3rem] p-8 pb-12 border-t border-slate-200 dark:border-neutral-800 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-black italic">Manage User</h3>
                <button onClick={() => setSelectedUser(null)} className="p-2 text-slate-400 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-white text-2xl">&times;</button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-black rounded-2xl border border-slate-200 dark:border-neutral-800">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Current Balance</p>
                    <p className="text-xl font-black italic text-emerald-600 dark:text-emerald-400">
                      ₹{(selectedUser.wallet?.deposit || 0) + (selectedUser.wallet?.winnings || 0) + (selectedUser.wallet?.bonus || 0)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'deposit')}
                      className="p-3 bg-emerald-500 rounded-xl text-white shadow-lg shadow-emerald-500/20 active:scale-[0.97]"
                    >
                      <Plus size={18} />
                    </button>
                    <button 
                      onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'withdrawal')}
                      className="p-3 bg-transparent border-[1.5px] border-[#FF3B3B] rounded-xl text-[#FF3B3B] active:scale-[0.97]"
                    >
                      <Minus size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-black rounded-2xl border border-slate-200 dark:border-neutral-800">
                  <div>
                    <h4 className="text-xs font-black italic mb-1">Account Safety</h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">
                      {selectedUser.isBanned ? 'User is Banned' : 'User is Active'}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleBanUser(selectedUser.id!, selectedUser.isBanned || false)}
                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border ${
                      selectedUser.isBanned 
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-500' 
                        : 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-500'
                    } transition-all active:scale-[0.97]`}
                  >
                    {selectedUser.isBanned ? <Unlock size={14} /> : <Ban size={14} />}
                    {selectedUser.isBanned ? 'Unban' : 'Ban User'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-black rounded-2xl border border-slate-200 dark:border-neutral-800">
                  <div>
                    <h4 className="text-xs font-black italic mb-1">Password Management</h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Send Reset Link</p>
                  </div>
                  <button 
                    onClick={() => handleResetPassword(selectedUser.email)}
                    className="px-6 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-slate-300 dark:border-neutral-700 text-slate-900 dark:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-[0.97]"
                  >
                    Reset Password
                  </button>
                </div>

                <div className="p-6 bg-slate-50 dark:bg-black rounded-2xl border border-slate-200 dark:border-neutral-800">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 mb-4">Account Details</h4>
                   <div className="space-y-4">
                      <DetailRow label="Username" value={selectedUser.username} />
                      <DetailRow label="Email" value={selectedUser.email} />
                      <DetailRow label="Phone" value={selectedUser.phone || 'N/A'} />
                      <DetailRow label="Wallet" value={`₹${(selectedUser.wallet?.deposit || 0) + (selectedUser.wallet?.winnings || 0) + (selectedUser.wallet?.bonus || 0)}`} />
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen.isOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs bg-white dark:bg-neutral-900 text-slate-900 dark:text-white rounded-[30px] p-8 border border-slate-200 dark:border-neutral-800 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-lg font-black italic mb-2">Delete Match?</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-8 leading-relaxed">
                This will delete the match and refund all joined players automatically.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsDeleteConfirmOpen({ isOpen: false, matchId: '' })}
                  className="py-4 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-[0.97] transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={processDeleteMatch}
                  disabled={isProcessing}
                  className="py-4 bg-transparent border-[1.5px] border-[#FF3B3B] text-[#FF3B3B] hover:bg-[#FF3B3B]/10 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Result Modal */}
      <AnimatePresence>
        {isResultModalOpen && selectedMatchResults && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 text-slate-900 dark:text-white rounded-[30px] p-8 border border-slate-200 dark:border-neutral-800 shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                   <h3 className="text-lg font-black italic">Declare Result</h3>
                   <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mt-1">{selectedMatchResults.title}</p>
                </div>
                <button onClick={() => setIsResultModalOpen(false)} className="text-neutral-500 text-2xl">&times;</button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
                <div className="bg-slate-50 dark:bg-black/40 rounded-2xl p-4 border border-slate-200 dark:border-white/5 space-y-2">
                   <p className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Match Info</p>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] text-slate-500 dark:text-neutral-500 uppercase font-black">Type</p>
                        <p className="text-[10px] font-black text-slate-900 dark:text-white italic">
                          {selectedMatchResults.section === 'Battle Royale' 
                            ? (selectedMatchResults.prizeType === 'perKill' ? 'Per Kill' : 'Survival')
                            : selectedMatchResults.section}
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-500 dark:text-neutral-500 uppercase font-black">Prize Pool</p>
                        <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 italic">
                          {selectedMatchResults.section === 'Battle Royale'
                            ? (selectedMatchResults.prizeType === 'perKill' ? `₹${selectedMatchResults.perKillAmount}/kill` : 'Split')
                            : `₹${selectedMatchResults.prizePool}`}
                        </p>
                      </div>
                   </div>
                </div>

                <div className="space-y-3">
                   <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">Enter Results for Participants</p>
                   {selectedMatchResults.playersCount === 0 ? (
                     <div className="text-center py-10">
                        <UsersIcon size={32} className="mx-auto text-slate-300 dark:text-neutral-700 mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 italic">No players have joined this match</p>
                     </div>
                   ) : (
                     <div className="space-y-2">
                        {(selectedMatchResults.players || []).map(player => {
                            const playerKey = `${player.userId}_${player.slot}`;
                            const kills = playerResults[playerKey] || 0;
                            const rank = playerPositionResults[playerKey] || 0;
                            const killsReward = kills * (selectedMatchResults.perKillAmount || 0);
                            const posReward = selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
                            const totalReward = killsReward + posReward;

                            return (
                              <div key={playerKey} className="p-4 bg-slate-50 dark:bg-black/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div 
                                    onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, player.userId)}
                                    className="flex items-center gap-3 cursor-pointer group"
                                  >
                                   <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-white/5 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                      <UsersIcon size={16} />
                                   </div>
                                   <div>
                                     <h4 className="text-[10px] font-black italic group-hover:text-primary transition-colors leading-none mb-1 text-slate-900 dark:text-white">{player.ign}</h4>
                                     <p className="text-[7px] text-slate-500 dark:text-neutral-500 font-bold uppercase tracking-widest">{player.username}</p>
                                   </div>
                                </div>
                                {totalReward > 0 && (
                                  <div className="text-right">
                                    <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 italic">₹{totalReward}</p>
                                    <p className="text-[6px] text-slate-500 dark:text-neutral-500 font-bold uppercase">Total Winnings</p>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-[7px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">
                                    {selectedMatchResults.section === 'Battle Royale' 
                                      ? (selectedMatchResults.prizeType === 'perKill' ? 'Kills' : 'Rank')
                                      : 'Rank (1=Win)'}
                                  </label>
                                  <div className="relative">
                                    <input 
                                      type="number"
                                      placeholder="0"
                                      value={playerResults[`${player.userId}_${player.slot}`] || ''}
                                      onChange={(e) => setPlayerResults({ ...playerResults, [`${player.userId}_${player.slot}`]: Number(e.target.value) })}
                                      className="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-[10px] font-black italic text-slate-900 dark:text-white focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] outline-none"
                                    />
                                    {selectedMatchResults.prizeType === 'perKill' && killsReward > 0 && (
                                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-emerald-600 dark:text-emerald-400">₹{killsReward}</span>
                                    )}
                                  </div>
                                </div>

                                {selectedMatchResults.prizeType === 'perKill' && (
                                  <div className="space-y-1.5">
                                    <label className="text-[7px] font-black uppercase tracking-widest text-neutral-500 ml-1">Rank (Optional)</label>
                                    <div className="relative">
                                      <select 
                                        value={rank}
                                        onChange={(e) => setPlayerPositionResults({ ...playerPositionResults, [`${player.userId}_${player.slot}`]: Number(e.target.value) })}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[10px] font-black italic text-white focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] outline-none appearance-none"
                                      >
                                        <option value={0}>No Rank</option>
                                        {Array.from({ length: selectedMatchResults.positionWinnersCount || 0 }).map((_, idx) => (
                                          <option key={idx + 1} value={idx + 1}>Rank {idx + 1}</option>
                                        ))}
                                      </select>
                                      {posReward > 0 && (
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-emerald-500">₹{posReward}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {selectedMatchResults.prizeType === 'perKill' && totalReward > 0 && (
                                <div className="pt-3 border-t border-white/5 flex justify-between items-center px-1">
                                  <div className="flex gap-3">
                                    <p className="text-[7px] text-neutral-600 font-bold uppercase tracking-tight">Kills: <span className="text-white">₹{killsReward}</span></p>
                                    {posReward > 0 && (
                                      <p className="text-[7px] text-neutral-600 font-bold uppercase tracking-tight">Rank: <span className="text-white">₹{posReward}</span></p>
                                    )}
                                  </div>
                                  <p className="text-[8px] font-black text-emerald-400 italic">Total: ₹{totalReward}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                     </div>
                   )}
                </div>
              </div>

              <button 
                onClick={handleSubmitResult}
                disabled={isProcessing || selectedMatchResults.playersCount === 0}
                className="w-full mt-8 py-5 bg-purple-600 text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Finalize & Declare Results'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Banner Management Modal */}
      <AnimatePresence>
        {isBannerModalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[70] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 text-slate-900 dark:text-white rounded-[30px] p-8 border border-slate-200 dark:border-neutral-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-black italic">{editingBanner ? 'Edit Banner' : 'New Banner'}</h3>
                <button onClick={() => setIsBannerModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:text-neutral-500 text-2xl transition-colors dark:hover:text-white">&times;</button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Banner Placement</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'main', label: 'Top Slider' },
                      { id: 'offer', label: 'Offer Slider' },
                      { id: 'bottom', label: 'Bottom (Single)' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setBannerType(t.id as any)}
                        className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                          bannerType === t.id || (t.id === 'bottom' && bannerType === 'freefire')
                            ? 'bg-purple-600 border-purple-500 text-black' 
                            : 'bg-slate-100 dark:bg-black border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-500'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {(bannerType === 'bottom' || bannerType === 'freefire') && (
                    <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 ml-1">
                      Note: Only 1 Bottom Banner is displayed on the Home Page. Saving will replace any existing bottom banner.
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Banner Image</label>
                  
                  {imageUrl ? (
                    <div className="relative group aspect-video rounded-2xl overflow-hidden border border-slate-200 dark:border-neutral-800 bg-slate-100 dark:bg-black">
                      <SafeImage 
                        src={imageUrl} 
                        alt="Preview" 
                        className="w-full h-full"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all z-20">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-white text-black text-[10px] font-black uppercase rounded-lg shadow-xl active:scale-[0.97] transition-all"
                        >
                          Change Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full aspect-video rounded-3xl border-2 border-dashed border-slate-200 dark:border-neutral-800 flex flex-col items-center justify-center gap-3 hover:border-purple-500/50 hover:bg-slate-50 dark:hover:bg-neutral-900/50 transition-all group"
                    >
                      {isUploading ? (
                        <Loader2 size={32} className="text-purple-500 animate-spin" />
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-neutral-900 flex items-center justify-center text-slate-500 dark:text-neutral-500 group-hover:text-purple-500 transition-colors">
                            <Upload size={24} />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400">Upload Banner Image</p>
                        </>
                      )}
                    </button>
                  )}
                  
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />

                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Or paste direct image URL (https://...)"
                      className="flex-1 bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setMediaPickerTarget('banner');
                        setIsMediaPickerOpen(true);
                      }}
                      className="px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-300 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all"
                      title="Select from saved Media Library"
                    >
                      <ImageIcon size={13} />
                      <span>Library</span>
                    </button>
                  </div>
                  
                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-purple-400">UPLOADING...</span>
                        <span className="text-[8px] font-black text-purple-400">{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-black rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className="h-full bg-purple-600"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Redirect Link (Optional)</label>
                  <input 
                    type="text"
                    value={redirectUrl}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                {bannerType !== 'bottom' && bannerType !== 'freefire' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Display Order</label>
                    <input 
                      type="number"
                      value={bannerOrder}
                      onChange={(e) => setBannerOrder(Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                )}

                <button 
                  onClick={handleSaveBanner}
                  disabled={isProcessing || isUploading || !imageUrl}
                  className="w-full py-5 bg-purple-600 text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-3 active:scale-[0.97] transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : isUploading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isUploading ? 'Uploading Image...' : editingBanner ? 'Update Banner' : 'Publish Banner'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Game Management Modal */}
      <AnimatePresence>
        {isGameModalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[75] flex items-center justify-center p-5">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 text-slate-900 dark:text-white rounded-[30px] p-8 border border-slate-200 dark:border-neutral-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black italic uppercase">{editingGame ? 'Edit Game Arena' : 'Add Game Arena'}</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">E.g. FREE FIRE, BGMI, COD MOBILE</p>
                </div>
                <button onClick={() => setIsGameModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:text-neutral-500 text-2xl transition-colors dark:hover:text-white">&times;</button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Game Name *</label>
                  <input
                    type="text"
                    value={gameForm.title}
                    onChange={(e) => setGameForm({ ...gameForm, title: e.target.value })}
                    placeholder="e.g. FREE FIRE or BGMI"
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Subtitle / Tag</label>
                    <input
                      type="text"
                      value={gameForm.subtitle}
                      onChange={(e) => setGameForm({ ...gameForm, subtitle: e.target.value })}
                      placeholder="e.g. TOURNAMENTS"
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Display Order</label>
                    <input
                      type="number"
                      value={gameForm.order}
                      onChange={(e) => setGameForm({ ...gameForm, order: Number(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Game Cover Image *</label>
                  {gameForm.image ? (
                    <div className="relative group aspect-square w-40 mx-auto rounded-3xl overflow-hidden border border-slate-200 dark:border-neutral-800 bg-slate-100 dark:bg-black">
                      <SafeImage src={gameForm.image} alt="Game Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all z-20">
                        <button
                          type="button"
                          onClick={() => gameFileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-white text-black text-[9px] font-black uppercase rounded-lg shadow-xl"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => gameFileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full py-8 rounded-3xl border-2 border-dashed border-slate-200 dark:border-neutral-800 flex flex-col items-center justify-center gap-2 hover:border-purple-500/50 hover:bg-slate-50 dark:hover:bg-neutral-900/40 transition-all"
                    >
                      {isUploading ? (
                        <Loader2 size={28} className="text-purple-500 animate-spin" />
                      ) : (
                        <>
                          <Upload size={22} className="text-neutral-500" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Upload Game Cover</span>
                        </>
                      )}
                    </button>
                  )}

                  <input
                    type="file"
                    ref={gameFileInputRef}
                    onChange={handleGameImageUpload}
                    accept="image/*"
                    className="hidden"
                  />

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={gameForm.image}
                      onChange={(e) => setGameForm({ ...gameForm, image: e.target.value })}
                      placeholder="Or paste image URL (https://...)"
                      className="flex-1 bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setMediaPickerTarget('game');
                        setIsMediaPickerOpen(true);
                      }}
                      className="px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-300 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all"
                      title="Select from saved Media Library"
                    >
                      <ImageIcon size={13} />
                      <span>Library</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveGame}
                  disabled={isProcessing || isUploading}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {editingGame ? 'Update Game Arena' : 'Create Game Arena'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Gateway Modal */}
      <AnimatePresence>
        {isGatewayModalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[70] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 text-slate-900 dark:text-white rounded-[30px] p-8 border border-slate-200 dark:border-neutral-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-black italic">{editingGateway ? 'Gateway Settings' : 'Add Gateway'}</h3>
                <button onClick={() => setIsGatewayModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:text-neutral-500 text-2xl transition-colors dark:hover:text-white">&times;</button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Gateway Name</label>
                  <input 
                    type="text"
                    value={gatewayForm.name}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })}
                    placeholder="Razorpay, Cashfree, etc."
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {editingGateway?.id !== 'zapupi' && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Merchant ID</label>
                    <input 
                      type="text"
                      value={gatewayForm.merchantId}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, merchantId: e.target.value })}
                      placeholder="MID_123..."
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">UPI ID (Optional)</label>
                    <input 
                      type="text"
                      value={gatewayForm.upiId}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, upiId: e.target.value })}
                      placeholder="merchant@upi"
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">{editingGateway?.id === 'zapupi' ? 'ZapUPI API Key' : 'API Key'}</label>
                  <input 
                    type="password"
                    value={gatewayForm.apiKey}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, apiKey: e.target.value })}
                    placeholder="Enter Public API Key"
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                {editingGateway?.id !== 'zapupi' && (
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Secret Key / Token</label>
                  <input 
                    type="password"
                    value={gatewayForm.secretKey}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, secretKey: e.target.value })}
                    placeholder="Enter Secret Key"
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>
                )}

                {editingGateway?.id !== 'zapupi' && (
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Webhook Secret (Optional)</label>
                  <input 
                    type="password"
                    value={gatewayForm.webhookSecret}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, webhookSecret: e.target.value })}
                    placeholder="Enter Webhook Secret"
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>
                )}

                <div className="pt-4">
                  <button 
                    onClick={handleSaveGateway}
                    disabled={isProcessing}
                    className="w-full py-5 bg-purple-600 hover:bg-purple-500 text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-3 active:scale-[0.97] transition-all disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {editingGateway ? 'Save Configuration' : 'Create Gateway'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Room Credentials Modal */}
      <AnimatePresence>
        {isDeclareRoomModalOpen && selectedDeclareRoomMatch && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[75] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-white dark:bg-neutral-900 text-slate-900 dark:text-white border border-slate-200 dark:border-neutral-800 rounded-[30px] p-7 shadow-2xl overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black italic uppercase text-slate-900 dark:text-white tracking-wide">
                      Declare Room Credentials
                    </h3>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">
                      Match: {selectedDeclareRoomMatch.displayId || selectedDeclareRoomMatch.id.slice(0, 6)} • {selectedDeclareRoomMatch.title}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsDeclareRoomModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 flex items-center justify-center text-slate-500 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 py-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 ml-1">
                    Custom Room ID *
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={declareRoomForm.roomId}
                      onChange={(e) => setDeclareRoomForm({ ...declareRoomForm, roomId: e.target.value })}
                      placeholder="e.g. 19284752"
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3.5 text-sm font-bold font-mono text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                    {declareRoomForm.roomId && (
                      <button
                        onClick={() => handleCopyCredential(declareRoomForm.roomId, 'modal_room')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-white"
                      >
                        {copiedKey === 'modal_room' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 ml-1">
                    Room Password *
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={declareRoomForm.roomPassword}
                      onChange={(e) => setDeclareRoomForm({ ...declareRoomForm, roomPassword: e.target.value })}
                      placeholder="e.g. 1234 or freefire"
                      className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3.5 text-sm font-bold font-mono text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                    />
                    {declareRoomForm.roomPassword && (
                      <button
                        onClick={() => handleCopyCredential(declareRoomForm.roomPassword, 'modal_pass')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-white"
                      >
                        {copiedKey === 'modal_pass' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 ml-1">
                    Match Status Transition
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeclareRoomForm({ ...declareRoomForm, setStatusLive: true })}
                      className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                        declareRoomForm.setStatusLive
                          ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-black border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-500'
                      }`}
                    >
                      ⚡ Mark Live / Ongoing
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeclareRoomForm({ ...declareRoomForm, setStatusLive: false })}
                      className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                        !declareRoomForm.setStatusLive
                          ? 'bg-blue-500/20 border-blue-500 text-blue-600 dark:text-blue-300'
                          : 'bg-slate-100 dark:bg-black border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-500'
                      }`}
                    >
                      🕒 Keep Existing Status
                    </button>
                  </div>
                </div>

                {/* Auto Push Notification Toggle */}
                <div 
                  onClick={() => setDeclareRoomForm({ 
                    ...declareRoomForm, 
                    sendNotificationOnRoomDeclare: !declareRoomForm.sendNotificationOnRoomDeclare 
                  })}
                  className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                    declareRoomForm.sendNotificationOnRoomDeclare 
                      ? 'bg-purple-600/15 border-purple-500/50 text-slate-900 dark:text-white' 
                      : 'bg-slate-50 dark:bg-black border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      declareRoomForm.sendNotificationOnRoomDeclare 
                        ? 'bg-purple-500 text-black' 
                        : 'bg-neutral-800 text-neutral-500'
                    }`}>
                      <Bell size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-white">
                        Auto Push Notification
                      </p>
                      <p className="text-[8px] text-neutral-400 font-medium">
                        Instantly alert joined players with Room ID & Pass
                      </p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    declareRoomForm.sendNotificationOnRoomDeclare 
                      ? 'bg-purple-600 border-purple-500 text-black' 
                      : 'border-neutral-700 bg-neutral-900'
                  }`}>
                    {declareRoomForm.sendNotificationOnRoomDeclare && <Check size={12} />}
                  </div>
                </div>

                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                  <p className="text-[8px] font-bold text-purple-300 leading-relaxed">
                    💡 Once declared, players who joined this match will immediately see Room ID & Password on their Match Details screen and in their My Matches lobby.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleSaveDeclareRoom}
                  disabled={isProcessing}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Publish Room Credentials
                </button>

                {(selectedDeclareRoomMatch.roomId || selectedDeclareRoomMatch.roomPassword) && (
                  <button
                    onClick={() => handleClearRoomCredentials(selectedDeclareRoomMatch.id)}
                    disabled={isProcessing}
                    className="w-full py-2.5 text-neutral-500 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} />
                    Clear Credentials
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add New Game Mode Section Rules Modal */}
      <AnimatePresence>
        {isAddSectionModalOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[75] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-white dark:bg-neutral-900 text-slate-900 dark:text-white border border-slate-200 dark:border-neutral-800 rounded-[30px] p-7 shadow-2xl overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black italic uppercase text-slate-900 dark:text-white tracking-wide">
                      Create Mode Section Rules
                    </h3>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">
                      Add a new game section with tailored rules
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAddSectionModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 flex items-center justify-center text-slate-500 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 py-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 ml-1">
                    Section Name / Game Mode *
                  </label>
                  <input 
                    type="text"
                    value={newSectionForm.title}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, title: e.target.value })}
                    placeholder="e.g. Clash Squad 2v2, Lone Wolf Pro, Daily Scrims"
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 ml-1">
                    Category Tag
                  </label>
                  <input 
                    type="text"
                    value={newSectionForm.category}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, category: e.target.value })}
                    placeholder="e.g. Custom Tournament, Duo Scrims"
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400 ml-1">
                    Initial Rules Preset
                  </label>
                  <select
                    value={newSectionForm.template}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, template: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all"
                  >
                    {Object.keys(RULE_PRESETS).map((pKey) => (
                      <option key={pKey} value={pKey} className="bg-white dark:bg-neutral-900 text-slate-900 dark:text-white">
                        {RULE_PRESETS[pKey].title} ({RULE_PRESETS[pKey].rules.length} rules)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleAddNewSectionSubmit}
                  disabled={isProcessing}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                  Create Section & Rules
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => {
          setIsMediaPickerOpen(false);
          setMediaPickerTarget(null);
        }}
        defaultCategory={mediaPickerTarget === 'game' ? 'game' : 'banner'}
        title={mediaPickerTarget === 'game' ? 'Select Game Cover from Library' : 'Select Banner Image from Library'}
        onSelect={(url) => {
          if (mediaPickerTarget === 'game') {
            setGameForm(prev => ({ ...prev, image: url }));
          } else if (mediaPickerTarget === 'banner') {
            setImageUrl(url);
          }
        }}
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl p-5 flex flex-col justify-between h-32 relative overflow-hidden group shadow-xs">
      <Icon size={48} className={`absolute -right-2 -bottom-2 opacity-10 ${color} group-hover:scale-110 transition-transform`} />
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-500 relative z-10">{label}</p>
      <p className="text-2xl font-black italic tracking-tighter truncate relative z-10 text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function HealthBar({ label, status }: any) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500">{status}</span>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: any) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-white/5">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-600">{label}</span>
      <span className="text-[10px] font-bold text-slate-800 dark:text-neutral-300">{value}</span>
    </div>
  );
}

