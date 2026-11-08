import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Shield, ShieldCheck, ShieldAlert, UserCheck, 
  Wallet, DollarSign, Trophy, Users, Search, CheckCircle2, 
  AlertCircle, AlertTriangle, Loader2, Sparkles, Plus, Clock, 
  Key, Send, ChevronRight, X, Eye, FileText, Ban, ExternalLink,
  RefreshCw, Check, LogOut, CheckCheck, Image as ImageIcon, Lock, Ticket, XCircle
} from 'lucide-react';
import { 
  Page, User, Tournament, StaffRole, Transaction, PaymentGateway 
} from '../types';
import { ADMIN_EMAILS } from '../constants';
import { db } from '../lib/firebase';
import { 
  collection, doc, onSnapshot, getDoc, setDoc, addDoc, 
  serverTimestamp, deleteDoc, query, where, orderBy, limit 
} from 'firebase/firestore';
import { usePopup } from '../components/PopupProvider';
import { formatMatchTime } from '../utils/dateUtils';
import SafeImage from '../components/SafeImage';
import MediaLibraryTab from '../components/MediaLibraryTab';
import DeclareResultModal from '../components/DeclareResultModal';
import { claimMatch, terminateMatch, releaseClaim, isMatchFinal } from '../services/staffMatchService';

interface StaffPanelProps {
  user: User;
  onPageChange: (page: Page, param?: string) => void;
}

enum StaffTab {
  OVERVIEW = 'overview',
  DEPOSITS = 'deposits',
  WITHDRAWALS = 'withdrawals',
  MATCHES = 'matches',
  ROOMS = 'rooms',
  RESULTS = 'results',
  TRANSACTIONS = 'transactions',
  USERS = 'users',
  NOTIFICATIONS = 'notifications',
  MEDIA = 'media'
}

export default function StaffPanel({ user, onPageChange }: StaffPanelProps) {
  const { showConfirm, showSuccess, showError, showWarning } = usePopup();

  // Role detection
  const isSuperAdmin = user?.isAdmin || 
    ADMIN_EMAILS.map(e => e.toLowerCase()).includes((user?.email || '').toLowerCase());

  const isStaff = Boolean(user?.isStaff && user?.staffStatus !== 'suspended') || isSuperAdmin;

  // Active role can be previewed/switched by Super Admin, or fixed to user's assigned role
  const initialRole: StaffRole = user?.staffRole || (isSuperAdmin ? 'ALL' : 'FINANCE_MANAGER');
  const [activeRole, setActiveRole] = useState<StaffRole>(initialRole);

  // Tab State
  const defaultTab = activeRole === 'TOURNAMENT_ORGANIZER' ? StaffTab.MATCHES : StaffTab.OVERVIEW;
  const [activeTab, setActiveTab] = useState<StaffTab>(defaultTab);

  // Data states
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [depositFilter, setDepositFilter] = useState<'pending' | 'completed' | 'failed' | 'all'>('pending');
  const [withdrawFilter, setWithdrawFilter] = useState<'pending' | 'completed' | 'failed' | 'all'>('pending');

  // Room declaration modal state
  const [selectedMatchForRoom, setSelectedMatchForRoom] = useState<Tournament | null>(null);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [roomPasswordInput, setRoomPasswordInput] = useState('');
  const [isSavingRoom, setIsSavingRoom] = useState(false);

  // Tournament Result Declaration state
  const [selectedMatchForResults, setSelectedMatchForResults] = useState<Tournament | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [resultsMatchFilter, setResultsMatchFilter] = useState<'all' | 'pending' | 'completed'>('all');

  // Match claim system state (which match is currently being claimed / terminated / released)
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!isStaff) {
      setLoading(false);
      return;
    }

    const unsubTrans = onSnapshot(collection(db, 'transactions'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      list.sort((a, b) => {
        const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
        const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
        return tB - tA;
      });
      setTransactions(list);
    }, (err) => console.warn('Staff transactions listener error:', err));

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
      list.sort((a: any, b: any) => Number(b.matchNumber || 0) - Number(a.matchNumber || 0));
      setMatches(list);
    }, (err) => console.warn('Staff matches listener error:', err));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      setLoading(false);
    }, (err) => {
      console.warn('Staff users listener error:', err);
      setLoading(false);
    });

    return () => {
      unsubTrans();
      unsubMatches();
      unsubUsers();
    };
  }, [isStaff]);

  // Unauthorized Screen
  if (!isStaff) {
    return (
      <div className="min-h-screen bg-transparent text-white flex items-center justify-center p-5">
        <div className="w-full max-w-md bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 rounded-[30px] p-7 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-500 flex items-center justify-center mx-auto">
            <ShieldAlert size={32} />
          </div>
          <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20">
            STAFF ACCESS REQUIRED
          </span>
          <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
            Unauthorized Staff Area
          </h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
            Your account does not have active staff credentials. Please contact the administrator to assign you a role (Finance Manager, Tournament Organizer, or Operations).
          </p>
          <button
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 transition-all active:scale-[0.97]"
          >
            Return to Profile
          </button>
        </div>
      </div>
    );
  }

  // Role permissions checks
  const canAccessFinance = activeRole === 'FINANCE_MANAGER' || activeRole === 'ALL';
  const canAccessTournaments = activeRole === 'TOURNAMENT_ORGANIZER' || activeRole === 'ALL';

  // Metrics
  const pendingDeposits = transactions.filter(t => t.type === 'deposit' && t.status === 'pending');
  const pendingWithdrawals = transactions.filter(t => (t.type === 'withdraw' || t.type === 'withdrawal') && t.status === 'pending');
  const totalDepositVolume = transactions
    .filter(t => t.type === 'deposit' && t.status === 'completed')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalWithdrawVolume = transactions
    .filter(t => (t.type === 'withdraw' || t.type === 'withdrawal') && t.status === 'completed')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const activeMatches = matches.filter(m => m.status === 'upcoming' || m.status === 'live');
  const totalJoinedPlayers = matches.reduce((sum, m) => sum + Number(m.playersCount || m.players?.length || 0), 0);

  // -------------------------------------------------------------
  // FINANCE ACTIONS: Approve & Reject Deposits
  // -------------------------------------------------------------
  const handleApproveDeposit = async (tx: any) => {
    if (!tx?.id || tx.status === 'completed' || processingTxId === tx.id) return;
    const amount = Number(tx.amount || 0);
    const candidateName = tx.userName || usersList.find(u => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'confirm',
      badge: 'FINANCE VERIFICATION',
      title: `Approve ₹${amount} Deposit?`,
      message: `Verify UTR (${tx.utr || tx.utrNumber || 'N/A'}) for ${candidateName}. Approving will credit +₹${amount} to their Deposit Wallet.`,
      instructions: [
        `+₹${amount} will be added to ${candidateName}'s Deposit Wallet.`,
        'Transaction status will become SUCCESS.',
        'User will receive an instant notification.'
      ],
      confirmText: 'APPROVE & CREDIT',
      cancelText: 'CANCEL'
    });
    if (!confirmed) return;

    setProcessingTxId(tx.id);
    try {
      // 1. Update transaction doc
      await setDoc(doc(db, 'transactions', tx.id), {
        status: 'completed',
        approvedBy: user.email || 'Staff',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Credit user wallet
      if (tx.userId && amount > 0) {
        const uSnap = await getDoc(doc(db, 'users', tx.userId));
        const dep = uSnap.exists() ? Number(uSnap.data()?.wallet?.deposit || 0) : 0;
        const win = uSnap.exists() ? Number(uSnap.data()?.wallet?.winnings || 0) : 0;
        const bon = uSnap.exists() ? Number(uSnap.data()?.wallet?.bonus || 0) : 0;

        await setDoc(doc(db, 'users', tx.userId), {
          wallet: {
            deposit: dep + amount,
            winnings: win,
            bonus: bon
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 3. Send Notification
      try {
        await addDoc(collection(db, 'notifications'), {
          title: '✅ Deposit Approved by Staff!',
          message: `Your deposit of ₹${amount} (UTR: ${tx.utr || tx.utrNumber || 'N/A'}) has been approved and credited to your Deposit Wallet.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: []
        });
      } catch {}

      showSuccess('DEPOSIT APPROVED!', `₹${amount} credited to ${candidateName}'s Deposit Wallet.`);
    } catch (err: any) {
      showError('APPROVAL FAILED', err?.message || 'Failed to approve deposit.');
    } finally {
      setProcessingTxId(null);
    }
  };

  const handleRejectDeposit = async (tx: any) => {
    if (!tx?.id || tx.status === 'failed' || processingTxId === tx.id) return;
    const amount = Number(tx.amount || 0);
    const candidateName = tx.userName || usersList.find(u => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'REJECT DEPOSIT REQUEST',
      title: `Reject ₹${amount} Deposit?`,
      message: `Are you sure you want to reject ${candidateName}'s deposit request (UTR: ${tx.utr || tx.utrNumber || 'N/A'})?`,
      instructions: [
        '₹0 will be added to the user wallet.',
        'Transaction status will be marked as REJECTED / FAILED.',
        'User will be notified.'
      ],
      confirmText: 'YES, REJECT',
      cancelText: 'CANCEL'
    });
    if (!confirmed) return;

    setProcessingTxId(tx.id);
    try {
      await setDoc(doc(db, 'transactions', tx.id), {
        status: 'failed',
        rejectedBy: user.email || 'Staff',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      try {
        await addDoc(collection(db, 'notifications'), {
          title: '❌ Deposit Request Rejected',
          message: `Your deposit request of ₹${amount} (UTR: ${tx.utr || tx.utrNumber || 'N/A'}) was rejected by Finance. Please contact support if you believe this is an error.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: []
        });
      } catch {}

      showWarning('DEPOSIT REJECTED', `Deposit request for ₹${amount} was marked as rejected.`);
    } catch (err: any) {
      showError('REJECTION FAILED', err?.message || 'Failed to reject deposit.');
    } finally {
      setProcessingTxId(null);
    }
  };

  // -------------------------------------------------------------
  // FINANCE ACTIONS: Approve & Reject Withdrawals
  // -------------------------------------------------------------
  const handleApproveWithdrawal = async (tx: any) => {
    if (!tx?.id || tx.status === 'completed' || processingTxId === tx.id) return;
    const amount = Number(tx.amount || 0);
    const candidateName = tx.userName || usersList.find(u => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'confirm',
      badge: 'MARK PAYOUT SENT',
      title: `Mark ₹${amount} Withdrawal Paid?`,
      message: `Confirm that you have processed the UPI payout of ₹${amount} to ${candidateName} (${tx.upiId || 'UPI'}).`,
      instructions: [
        'Ensure the money has been sent to the player before confirming.',
        'Transaction status will be updated to SUCCESS.'
      ],
      confirmText: 'CONFIRM PAID',
      cancelText: 'CANCEL'
    });
    if (!confirmed) return;

    setProcessingTxId(tx.id);
    try {
      await setDoc(doc(db, 'transactions', tx.id), {
        status: 'completed',
        approvedBy: user.email || 'Staff',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      try {
        await addDoc(collection(db, 'notifications'), {
          title: '💸 Payout Sent by Finance!',
          message: `Your withdrawal of ₹${amount} to ${tx.upiId || 'your UPI ID'} has been processed and marked paid.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: []
        });
      } catch {}

      showSuccess('WITHDRAWAL MARKED PAID!', `Withdrawal of ₹${amount} for ${candidateName} is completed.`);
    } catch (err: any) {
      showError('PAYOUT FAILED', err?.message || 'Failed to update withdrawal.');
    } finally {
      setProcessingTxId(null);
    }
  };

  const handleRejectWithdrawal = async (tx: any) => {
    if (!tx?.id || tx.status === 'failed' || processingTxId === tx.id) return;
    const amount = Number(tx.amount || 0);
    const candidateName = tx.userName || usersList.find(u => u.id === tx.userId)?.username || 'Player';

    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'REFUND WITHDRAWAL',
      title: `Reject & Refund ₹${amount}?`,
      message: `Rejecting this payout will automatically refund ₹${amount} back to ${candidateName}'s Winnings Wallet.`,
      confirmText: 'REJECT & REFUND',
      cancelText: 'CANCEL'
    });
    if (!confirmed) return;

    setProcessingTxId(tx.id);
    try {
      await setDoc(doc(db, 'transactions', tx.id), {
        status: 'failed',
        rejectedBy: user.email || 'Staff',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Refund winnings balance
      if (tx.userId && amount > 0) {
        const uSnap = await getDoc(doc(db, 'users', tx.userId));
        const dep = uSnap.exists() ? Number(uSnap.data()?.wallet?.deposit || 0) : 0;
        const win = uSnap.exists() ? Number(uSnap.data()?.wallet?.winnings || 0) : 0;
        const bon = uSnap.exists() ? Number(uSnap.data()?.wallet?.bonus || 0) : 0;

        await setDoc(doc(db, 'users', tx.userId), {
          wallet: {
            deposit: dep,
            winnings: win + amount,
            bonus: bon
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      try {
        await addDoc(collection(db, 'notifications'), {
          title: '🔄 Withdrawal Refunded',
          message: `Your withdrawal request of ₹${amount} could not be processed and has been refunded to your Winnings Wallet.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: tx.userId,
          actionPage: Page.WALLET,
          createdAt: serverTimestamp(),
          readBy: []
        });
      } catch {}

      showSuccess('REFUNDED', `₹${amount} has been refunded back to ${candidateName}'s wallet.`);
    } catch (err: any) {
      showError('REFUND FAILED', err?.message || 'Failed to refund withdrawal.');
    } finally {
      setProcessingTxId(null);
    }
  };

  // -------------------------------------------------------------
  // TOURNAMENT ACTIONS: Declare Room ID & Password
  // -------------------------------------------------------------
  const handleSaveRoomDetails = async () => {
    if (!selectedMatchForRoom) return;
    if (!roomIdInput.trim()) {
      showWarning('ROOM ID REQUIRED', 'Please enter the in-game Custom Room ID.');
      return;
    }

    setIsSavingRoom(true);
    try {
      await setDoc(doc(db, 'matches', selectedMatchForRoom.id), {
        roomId: roomIdInput.trim(),
        roomPassword: roomPasswordInput.trim() || '',
        roomDeclared: true,
        roomDeclaredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Broadcast Notification to Match Participants
      try {
        await addDoc(collection(db, 'notifications'), {
          title: `🔑 Room ID Ready: ${selectedMatchForRoom.title || 'Match'}`,
          message: `Room ID: ${roomIdInput.trim()} | Password: ${roomPasswordInput.trim() || 'None'}. Join within 10 minutes!`,
          type: 'tournament',
          audience: 'match',
          targetMatchId: selectedMatchForRoom.id,
          actionPage: Page.MATCH_DETAILS,
          createdAt: serverTimestamp(),
          readBy: []
        });
      } catch {}

      showSuccess(
        'ROOM DETAILS PUBLISHED!',
        `Room ID & Password saved for Match #${selectedMatchForRoom.matchNumber || selectedMatchForRoom.id}. Notifications sent to players!`
      );
      setSelectedMatchForRoom(null);
      setRoomIdInput('');
      setRoomPasswordInput('');
    } catch (err: any) {
      showError('FAILED TO SAVE ROOM', err?.message || 'Failed to update room credentials.');
    } finally {
      setIsSavingRoom(false);
    }
  };

  // -------------------------------------------------------------
  // STAFF MATCH CLAIM SYSTEM
  // -------------------------------------------------------------
  const myId = user?.id || '';
  const myName = user?.username || user?.email || 'Staff';
  const isMine = (m: Tournament) => Boolean(myId) && m.claimedBy === myId;

  // Claim Ticket: atomic transaction, only one staff can win the claim
  const handleClaimMatch = async (matchItem: Tournament) => {
    if (!myId) return;
    setBusyMatchId(matchItem.id);
    try {
      await claimMatch(matchItem.id, { id: myId, name: myName });
      showSuccess('MATCH CLAIMED', `Match #${matchItem.matchNumber || matchItem.id.slice(0, 6)} is now yours. Other staff see it as Locked.`);
    } catch (err: any) {
      showError('CLAIM FAILED', err?.message || 'Could not claim this match.');
    } finally {
      setBusyMatchId(null);
    }
  };

  // Terminate Match: cancel + auto refund + 50% staff payment (single transaction)
  const handleTerminateMatch = async (matchItem: Tournament) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'TERMINATE MATCH',
      title: `Terminate Match #${matchItem.matchNumber || matchItem.id.slice(0, 6)}?`,
      message: `The match will be marked TERMINATED and permanently locked. The entry fee (₹${matchItem.entryFee || 0}) is refunded automatically to every joined player, and you receive 50% of your configured match payment. This cannot be undone.`,
      confirmText: 'YES, TERMINATE',
      cancelText: 'BACK'
    });
    if (!confirmed) return;

    setBusyMatchId(matchItem.id);
    try {
      const res = await terminateMatch(matchItem.id, { id: myId, name: myName, email: user?.email });
      showSuccess('MATCH TERMINATED', `Entry fees refunded to ${res.refunded} player(s). Staff payment credited: ${res.staffPaid} coins.`);
    } catch (err: any) {
      showError('TERMINATION FAILED', err?.message || 'Failed to terminate match.');
    } finally {
      setBusyMatchId(null);
    }
  };

  // Success: opens the result-entry screen; payment + rewards are settled when results are submitted
  const handleSuccessMatch = (matchItem: Tournament) => {
    setSelectedMatchForResults(matchItem);
    setIsResultModalOpen(true);
  };

  // Admin emergency override: release someone else's claim
  const handleReleaseClaim = async (matchItem: Tournament) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'ADMIN OVERRIDE',
      title: 'Release this claim?',
      message: `${matchItem.claimedByName || 'The claiming staff'} will lose access to Match #${matchItem.matchNumber || matchItem.id.slice(0, 6)} and another staff member can claim it.`,
      confirmText: 'RELEASE CLAIM',
      cancelText: 'BACK'
    });
    if (!confirmed) return;
    setBusyMatchId(matchItem.id);
    try {
      await releaseClaim(matchItem.id, { id: myId, name: myName });
      showSuccess('CLAIM RELEASED', 'The match is available to claim again.');
    } catch (err: any) {
      showError('RELEASE FAILED', err?.message || 'Failed to release claim.');
    } finally {
      setBusyMatchId(null);
    }
  };

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#f8f9fc] dark:bg-transparent min-h-screen text-slate-900 dark:text-white transition-colors">
      <div className="px-5 py-6">
        {/* Top Header matching app's unified UI style */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3.5">
            <button 
              onClick={() => onPageChange(Page.PROFILE)}
              className="w-11 h-11 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl flex items-center justify-center text-slate-700 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-white shadow-sm transition-colors active:scale-[0.97]"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight uppercase italic text-slate-900 dark:text-white leading-none">
                  STAFF <span className="text-[#22C55E]">PANEL</span>
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest ${
                  activeRole === 'FINANCE_MANAGER' 
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                    : activeRole === 'TOURNAMENT_ORGANIZER'
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}>
                  {activeRole.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-neutral-500 mt-1">
                {user.username || user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span className="text-[8.5px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">STAFF DUTY</span>
            </div>
          </div>
        </div>

        {/* Super Admin Role Switcher (Visible only if Super Admin) */}
        {isSuperAdmin && (
          <div className="mb-5 p-3.5 bg-purple-950/30 border border-purple-500/30 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-purple-400">Admin Perspective Switcher</p>
              <p className="text-[10px] font-bold text-white">Previewing as: {activeRole.replace(/_/g, ' ')}</p>
            </div>
            <div className="flex gap-1.5">
              {(['FINANCE_MANAGER', 'TOURNAMENT_ORGANIZER', 'ALL'] as StaffRole[]).map(r => (
                <button
                  key={r}
                  onClick={() => {
                    setActiveRole(r);
                    if (r === 'TOURNAMENT_ORGANIZER') setActiveTab(StaffTab.MATCHES);
                    if (r === 'FINANCE_MANAGER') setActiveTab(StaffTab.DEPOSITS);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                    activeRole === r 
                      ? 'bg-purple-600 text-black shadow-sm' 
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {r === 'FINANCE_MANAGER' ? 'Finance' : r === 'TOURNAMENT_ORGANIZER' ? 'Tournaments' : 'All'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation - Filtered dynamically by active staff role */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveTab(StaffTab.OVERVIEW)}
            className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-1.5 ${
              activeTab === StaffTab.OVERVIEW
                ? 'bg-purple-600 border-purple-600 text-black shadow-md shadow-purple-600/30'
                : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
            }`}
          >
            <span>Overview</span>
          </button>

          {canAccessFinance && (
            <>
              <button
                onClick={() => setActiveTab(StaffTab.DEPOSITS)}
                className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-2 ${
                  activeTab === StaffTab.DEPOSITS
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                <span>Deposits</span>
                {pendingDeposits.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[8px] font-black bg-amber-500 text-white">
                    {pendingDeposits.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab(StaffTab.WITHDRAWALS)}
                className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-2 ${
                  activeTab === StaffTab.WITHDRAWALS
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                <span>Withdrawals</span>
                {pendingWithdrawals.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[8px] font-black bg-amber-500 text-white">
                    {pendingWithdrawals.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab(StaffTab.TRANSACTIONS)}
                className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                  activeTab === StaffTab.TRANSACTIONS
                    ? 'bg-purple-600 border-purple-600 text-black'
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                <span>Statements</span>
              </button>

              <button
                onClick={() => setActiveTab(StaffTab.USERS)}
                className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                  activeTab === StaffTab.USERS
                    ? 'bg-purple-600 border-purple-600 text-black'
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                <span>Users</span>
              </button>
            </>
          )}

          {canAccessTournaments && (
            <>
              <button
                onClick={() => setActiveTab(StaffTab.MATCHES)}
                className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                  activeTab === StaffTab.MATCHES
                    ? 'bg-purple-600 border-purple-600 text-black shadow-md shadow-purple-600/30'
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                <span>Matches</span>
              </button>

              <button
                onClick={() => setActiveTab(StaffTab.ROOMS)}
                className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                  activeTab === StaffTab.ROOMS
                    ? 'bg-purple-600 border-purple-600 text-black shadow-md shadow-purple-600/30'
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                <span>Room IDs</span>
              </button>

              <button
                onClick={() => setActiveTab(StaffTab.RESULTS)}
                className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                  activeTab === StaffTab.RESULTS
                    ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/30'
                    : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                <Trophy size={13} />
                <span>Results</span>
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab(StaffTab.MEDIA)}
            className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.14em] transition-all whitespace-nowrap border flex items-center gap-1.5 ${
              activeTab === StaffTab.MEDIA
                ? 'bg-purple-600 border-purple-600 text-black shadow-md shadow-purple-600/30'
                : 'bg-white dark:bg-neutral-900 border-slate-200/70 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
            }`}
          >
            <ImageIcon size={13} />
            <span>Media Library</span>
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: OVERVIEW DASHBOARD */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.OVERVIEW && (
          <div className="space-y-4 animate-fadeIn">
            {/* Quick Stat Cards */}
            <div className="grid grid-cols-2 gap-3.5">
              {canAccessFinance && (
                <>
                  <div 
                    onClick={() => setActiveTab(StaffTab.DEPOSITS)}
                    className="p-4.5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl shadow-sm cursor-pointer hover:border-emerald-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                        Pending Deposits
                      </span>
                      <Wallet size={18} className="text-emerald-500" />
                    </div>
                    <p className="text-2xl font-black italic tracking-tight text-slate-900 dark:text-white mt-2">
                      {pendingDeposits.length}
                    </p>
                    <span className="text-[8.5px] font-extrabold text-emerald-500 uppercase tracking-widest mt-1 block">
                      Click to Review &amp; Approve
                    </span>
                  </div>

                  <div 
                    onClick={() => setActiveTab(StaffTab.WITHDRAWALS)}
                    className="p-4.5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl shadow-sm cursor-pointer hover:border-emerald-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                        Pending Payouts
                      </span>
                      <DollarSign size={18} className="text-emerald-500" />
                    </div>
                    <p className="text-2xl font-black italic tracking-tight text-slate-900 dark:text-white mt-2">
                      {pendingWithdrawals.length}
                    </p>
                    <span className="text-[8.5px] font-extrabold text-emerald-500 uppercase tracking-widest mt-1 block">
                      Click to Process Payouts
                    </span>
                  </div>
                </>
              )}

              {canAccessTournaments && (
                <>
                  <div 
                    onClick={() => setActiveTab(StaffTab.MATCHES)}
                    className="p-4.5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl shadow-sm cursor-pointer hover:border-purple-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                        Live &amp; Upcoming
                      </span>
                      <Trophy size={18} className="text-purple-500" />
                    </div>
                    <p className="text-2xl font-black italic tracking-tight text-slate-900 dark:text-white mt-2">
                      {activeMatches.length}
                    </p>
                    <span className="text-[8.5px] font-extrabold text-purple-400 uppercase tracking-widest mt-1 block">
                      {totalJoinedPlayers} Registered Players
                    </span>
                  </div>

                  <div 
                    onClick={() => setActiveTab(StaffTab.ROOMS)}
                    className="p-4.5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl shadow-sm cursor-pointer hover:border-purple-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                        Declare Rooms
                      </span>
                      <Key size={18} className="text-purple-500" />
                    </div>
                    <p className="text-2xl font-black italic tracking-tight text-slate-900 dark:text-white mt-2">
                      {matches.filter(m => m.status === 'upcoming' && !m.roomDeclared).length}
                    </p>
                    <span className="text-[8.5px] font-extrabold text-purple-400 uppercase tracking-widest mt-1 block">
                      Matches Needing Room ID
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="p-5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl shadow-sm space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                Authorized Duties for {activeRole.replace(/_/g, ' ')}
              </h4>
              
              <div className="grid grid-cols-1 gap-2">
                {canAccessFinance && (
                  <>
                    <button
                      onClick={() => setActiveTab(StaffTab.DEPOSITS)}
                      className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/20 rounded-2xl flex items-center justify-between hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Wallet size={18} className="text-emerald-500" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Review &amp; Approve Deposits</span>
                      </div>
                      <ChevronRight size={16} className="text-emerald-500" />
                    </button>

                    <button
                      onClick={() => setActiveTab(StaffTab.WITHDRAWALS)}
                      className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/20 rounded-2xl flex items-center justify-between hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <DollarSign size={18} className="text-emerald-500" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Process Withdrawal Requests</span>
                      </div>
                      <ChevronRight size={16} className="text-emerald-500" />
                    </button>
                  </>
                )}

                {canAccessTournaments && (
                  <>
                    <button
                      onClick={() => setActiveTab(StaffTab.ROOMS)}
                      className="p-3.5 bg-purple-50 dark:bg-purple-500/10 border border-purple-200/80 dark:border-purple-500/20 rounded-2xl flex items-center justify-between hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Key size={18} className="text-purple-500" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Publish Room ID &amp; Password</span>
                      </div>
                      <ChevronRight size={16} className="text-purple-500" />
                    </button>

                    <button
                      onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                      className="p-3.5 bg-purple-50 dark:bg-purple-500/10 border border-purple-200/80 dark:border-purple-500/20 rounded-2xl flex items-center justify-between hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Plus size={18} className="text-purple-500" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Create New Match Contest</span>
                      </div>
                      <ChevronRight size={16} className="text-purple-500" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: DEPOSIT REQUESTS (Finance Manager Only) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.DEPOSITS && (
          <div className="space-y-4 animate-fadeIn">
            {/* Filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(['pending', 'completed', 'failed', 'all'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setDepositFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                    depositFilter === status
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-neutral-900 text-slate-500 dark:text-neutral-400 border border-slate-200/70 dark:border-neutral-800'
                  }`}
                >
                  {status} ({transactions.filter(t => t.type === 'deposit' && (status === 'all' || t.status === status)).length})
                </button>
              ))}
            </div>

            {/* Deposit Cards */}
            <div className="space-y-3">
              {transactions
                .filter(t => t.type === 'deposit' && (depositFilter === 'all' || t.status === depositFilter))
                .length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-neutral-900/50 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl p-6">
                  <Wallet size={36} className="mx-auto mb-2 text-slate-300 dark:text-neutral-700" />
                  <p className="text-xs font-bold uppercase text-slate-500 dark:text-neutral-400">No {depositFilter} deposits found</p>
                </div>
              ) : (
                transactions
                  .filter(t => t.type === 'deposit' && (depositFilter === 'all' || t.status === depositFilter))
                  .map((tx: any) => {
                    const u = usersList.find(usr => usr.id === tx.userId);
                    const isPending = tx.status === 'pending';
                    const isProcessing = processingTxId === tx.id;

                    return (
                      <div 
                        key={tx.id}
                        className="p-4 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl space-y-3 shadow-xs"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center font-black text-sm">
                              ₹
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-black italic uppercase text-slate-900 dark:text-white">
                                  ₹{tx.amount}
                                </h4>
                                <span className={`px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest ${
                                  tx.status === 'completed'
                                    ? 'bg-emerald-500/20 text-emerald-500'
                                    : tx.status === 'failed'
                                    ? 'bg-red-500/20 text-red-500'
                                    : 'bg-amber-500/20 text-amber-500'
                                }`}>
                                  {tx.status}
                                </span>
                              </div>
                              <p className="text-[9px] font-bold text-slate-500 dark:text-neutral-400 mt-0.5">
                                User: <span className="text-slate-900 dark:text-white">{u?.username || tx.userName || 'Player'}</span> • {u?.phone || u?.email || tx.userId}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* UTR & Transaction Reference */}
                        <div className="p-3 bg-slate-50 dark:bg-black/40 rounded-xl space-y-1 text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest text-[8.5px]">12-Digit UTR Number</span>
                            <span className="font-mono font-black text-slate-800 dark:text-purple-300">{tx.utr || tx.utrNumber || 'N/A'}</span>
                          </div>
                          {tx.paymentApp && (
                            <div className="flex justify-between">
                              <span className="text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest text-[8.5px]">App / Method</span>
                              <span className="font-bold text-slate-700 dark:text-neutral-300">{tx.paymentApp}</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons for Pending */}
                        {isPending && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleRejectDeposit(tx)}
                              disabled={isProcessing}
                              className="flex-1 py-2.5 bg-red-500/15 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                              Reject (₹0)
                            </button>
                            <button
                              onClick={() => handleApproveDeposit(tx)}
                              disabled={isProcessing}
                              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              <span>Approve &amp; Credit</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: WITHDRAWAL REQUESTS (Finance Manager Only) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.WITHDRAWALS && (
          <div className="space-y-4 animate-fadeIn">
            {/* Filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(['pending', 'completed', 'failed', 'all'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setWithdrawFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                    withdrawFilter === status
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-neutral-900 text-slate-500 dark:text-neutral-400 border border-slate-200/70 dark:border-neutral-800'
                  }`}
                >
                  {status} ({transactions.filter(t => (t.type === 'withdraw' || t.type === 'withdrawal') && (status === 'all' || t.status === status)).length})
                </button>
              ))}
            </div>

            {/* Withdrawal Cards */}
            <div className="space-y-3">
              {transactions
                .filter(t => (t.type === 'withdraw' || t.type === 'withdrawal') && (withdrawFilter === 'all' || t.status === withdrawFilter))
                .length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-neutral-900/50 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl p-6">
                  <DollarSign size={36} className="mx-auto mb-2 text-slate-300 dark:text-neutral-700" />
                  <p className="text-xs font-bold uppercase text-slate-500 dark:text-neutral-400">No {withdrawFilter} withdrawals found</p>
                </div>
              ) : (
                transactions
                  .filter(t => (t.type === 'withdraw' || t.type === 'withdrawal') && (withdrawFilter === 'all' || t.status === withdrawFilter))
                  .map((tx: any) => {
                    const u = usersList.find(usr => usr.id === tx.userId);
                    const isPending = tx.status === 'pending';
                    const isProcessing = processingTxId === tx.id;

                    return (
                      <div 
                        key={tx.id}
                        className="p-4 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl space-y-3 shadow-xs"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-500 flex items-center justify-center font-black text-sm">
                              ₹
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-black italic uppercase text-slate-900 dark:text-white">
                                  ₹{tx.amount}
                                </h4>
                                <span className={`px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest ${
                                  tx.status === 'completed'
                                    ? 'bg-emerald-500/20 text-emerald-500'
                                    : tx.status === 'failed'
                                    ? 'bg-red-500/20 text-red-500'
                                    : 'bg-amber-500/20 text-amber-500'
                                }`}>
                                  {tx.status}
                                </span>
                              </div>
                              <p className="text-[9px] font-bold text-slate-500 dark:text-neutral-400 mt-0.5">
                                Player: <span className="text-slate-900 dark:text-white">{u?.username || tx.userName || 'Player'}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* UPI ID Payout Target */}
                        <div className="p-3 bg-slate-50 dark:bg-black/40 rounded-xl space-y-1 text-[10px]">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest text-[8.5px]">Payout UPI ID</span>
                            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{tx.upiId || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest text-[8.5px]">Player Balance</span>
                            <span className="font-bold text-slate-700 dark:text-neutral-300">
                              Winnings: ₹{u?.wallet?.winnings || 0}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons for Pending */}
                        {isPending && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleRejectWithdrawal(tx)}
                              disabled={isProcessing}
                              className="flex-1 py-2.5 bg-red-500/15 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                              Reject &amp; Refund
                            </button>
                            <button
                              onClick={() => handleApproveWithdrawal(tx)}
                              disabled={isProcessing}
                              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                              <span>Confirm Paid</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: MATCHES (Tournament Organizer Only) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.MATCHES && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                Total Matches ({matches.length})
              </span>
              <button
                onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-[9.5px] font-black uppercase tracking-widest shadow-md shadow-purple-600/25 transition-all flex items-center gap-1.5 active:scale-[0.97]"
              >
                <Plus size={13} />
                <span>Create Match</span>
              </button>
            </div>

            <div className="space-y-3">
              {matches.map((m) => {
                const joinedCount = m.playersCount || m.players?.length || 0;
                const isUpcoming = m.status === 'upcoming';

                return (
                  <div
                    key={m.id}
                    className="p-4 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl space-y-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
                            #{m.matchNumber || m.id.slice(0, 6)}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                            m.status === 'live' 
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : m.status === 'completed'
                              ? 'bg-blue-500/20 text-blue-400'
                              : m.status === 'cancelled'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/20 text-amber-500'
                          }`}>
                            {m.status || 'upcoming'}
                          </span>
                        </div>
                        <h4 className="text-sm font-black italic uppercase text-slate-900 dark:text-white mt-1">
                          {m.title}
                        </h4>
                        <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-400">
                          {m.gameTitle || m.gameId} • {m.mode || m.modeId} • {formatMatchTime(m.time || m.matchTime)}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                          ₹{m.prizePool} PRIZE
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-500">
                          Fee: ₹{m.entryFee}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between text-[8.5px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1">
                        <span>Slots Filled</span>
                        <span>{joinedCount} / {m.maxPlayers || 48}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[linear-gradient(90deg,#F37A1F,#FF9A4D)] rounded-full"
                          style={{ width: `${Math.min(100, (joinedCount / (m.maxPlayers || 48)) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Staff Claim System */}
                    {(() => {
                      const closed = isMatchFinal(m);
                      const mine = isMine(m);
                      const busy = busyMatchId === m.id;

                      // Closed match: permanently locked
                      if (closed) {
                        return (
                          <div className="flex items-center gap-2 pt-1 px-3 py-2.5 bg-slate-100 dark:bg-neutral-800/60 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400">
                            <Lock size={12} />
                            <span>
                              Match closed • locked
                              {m.claimedByName ? ` • ${m.claimedByName}` : ''}
                              {typeof m.staffPaid === 'number' ? ` • ${m.staffPaid} coins paid` : ''}
                            </span>
                          </div>
                        );
                      }

                      // Unclaimed: only a Claim Ticket button
                      if (!m.claimedBy) {
                        return (
                          <button
                            onClick={() => handleClaimMatch(m)}
                            disabled={busy}
                            className="w-full py-2.5 bg-[#F37A1F] hover:bg-[#D9660F] disabled:opacity-60 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]"
                          >
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <Ticket size={13} />}
                            <span>Claim Ticket</span>
                          </button>
                        );
                      }

                      // Claimed by someone else: Locked
                      if (!mine) {
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-red-500">
                                <Lock size={12} /> Locked
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-400">
                                Claimed by {m.claimedByName || 'another staff'}
                              </span>
                            </div>
                            {isSuperAdmin && (
                              <button
                                onClick={() => handleReleaseClaim(m)}
                                disabled={busy}
                                className="w-full py-2 bg-amber-500/15 text-amber-500 hover:bg-amber-500 hover:text-white disabled:opacity-60 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                              >
                                Admin: Release Claim
                              </button>
                            )}
                          </div>
                        );
                      }

                      // Claimed by me: all existing controls + Terminate / Success
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-[8.5px] font-black uppercase tracking-widest text-emerald-500 w-fit">
                            <CheckCircle2 size={11} /> Claimed by you
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedMatchForRoom(m);
                                setRoomIdInput(m.roomId || '');
                                setRoomPasswordInput(m.roomPassword || '');
                              }}
                              className="flex-1 py-2 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-600 text-purple-600 dark:text-purple-300 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1"
                            >
                              <Key size={12} />
                              <span>{m.roomDeclared ? 'Edit Room ID' : 'Declare Room ID'}</span>
                            </button>

                            <button
                              onClick={() => onPageChange(Page.ADMIN_EDIT_MATCH, m.id)}
                              className="px-3 py-2 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all"
                            >
                              Edit
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleTerminateMatch(m)}
                              disabled={busy}
                              className="py-2.5 bg-red-500/15 text-red-500 hover:bg-red-600 hover:text-white disabled:opacity-60 rounded-xl text-[9.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                              <span>Terminate Match</span>
                            </button>
                            <button
                              onClick={() => handleSuccessMatch(m)}
                              disabled={busy}
                              className="py-2.5 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-600 hover:text-white disabled:opacity-60 rounded-xl text-[9.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]"
                            >
                              <CheckCircle2 size={12} />
                              <span>Success</span>
                            </button>
                          </div>
                          <p className="text-[8px] font-bold text-slate-400 dark:text-neutral-500">
                            Terminate refunds all entry fees (50% staff pay). Success opens result entry; rewards and 100% staff pay are credited on submit.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 5: ROOM CREDENTIALS (Tournament Organizer Only) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.ROOMS && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-2xl">
              <h4 className="text-xs font-black uppercase tracking-tight text-white flex items-center gap-2">
                <Key size={16} className="text-purple-400" />
                In-Game Room Credentials Broadcast
              </h4>
              <p className="text-[10px] text-neutral-300 mt-1">
                Enter Room ID and Password before match start. Saving triggers an instant notification broadcast to all registered participants. Only matches you have claimed appear here.
              </p>
            </div>

            <div className="space-y-3">
              {matches
                .filter(m => (m.status === 'upcoming' || m.status === 'live') && isMine(m))
                .map((m) => (
                  <div
                    key={m.id}
                    className="p-4 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-purple-400">
                          #{m.matchNumber || m.id.slice(0, 6)} • {formatMatchTime(m.time || m.matchTime)}
                        </span>
                        <h4 className="text-xs font-black uppercase text-slate-900 dark:text-white mt-0.5">
                          {m.title}
                        </h4>
                      </div>

                      {m.roomDeclared ? (
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          DECLARED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          PENDING ROOM
                        </span>
                      )}
                    </div>

                    {m.roomDeclared && (
                      <div className="p-3 bg-slate-50 dark:bg-black/50 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Room ID</p>
                          <p className="font-mono font-black text-slate-900 dark:text-purple-300">{m.roomId}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Password</p>
                          <p className="font-mono font-black text-slate-900 dark:text-purple-300">{m.roomPassword || 'None'}</p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setSelectedMatchForRoom(m);
                        setRoomIdInput(m.roomId || '');
                        setRoomPasswordInput(m.roomPassword || '');
                      }}
                      className="w-full py-2.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                    >
                      <Key size={13} />
                      <span>{m.roomDeclared ? 'Update Room ID' : 'Set & Broadcast Room ID'}</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 6: USERS DIRECTORY (Finance Manager & All) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.USERS && (
          <div className="space-y-4 animate-fadeIn">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input
                type="text"
                placeholder="Search players by username, email or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl py-3.5 pl-12 pr-4 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white transition-all"
              />
            </div>

            <div className="space-y-2.5">
              {usersList
                .filter(u => {
                  const q = searchQuery.toLowerCase();
                  return (
                    (u.username || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.phone || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 30)
                .map(u => (
                  <div
                    key={u.id}
                    className="p-3.5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl flex items-center justify-between shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400 font-black flex items-center justify-center text-sm border border-purple-500/20">
                        {u.username ? u.username.charAt(0).toUpperCase() : 'P'}
                      </div>
                      <div>
                        <h4 className="text-xs font-black italic uppercase text-slate-900 dark:text-white">
                          {u.username || 'Player'}
                        </h4>
                        <p className="text-[9px] font-medium text-slate-500 dark:text-neutral-400">
                          {u.email} {u.phone ? `• ${u.phone}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                        ₹{(u.wallet?.deposit || 0) + (u.wallet?.winnings || 0) + (u.wallet?.bonus || 0)}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 dark:text-neutral-500 uppercase">
                        Dep: ₹{u.wallet?.deposit || 0} | Win: ₹{u.wallet?.winnings || 0}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 7: TRANSACTIONS AUDIT TRAIL (Finance Manager & All) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.TRANSACTIONS && (
          <div className="space-y-3 animate-fadeIn">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 block">
              Recent Transactions ({transactions.length})
            </span>

            <div className="space-y-2">
              {transactions.slice(0, 40).map(t => (
                <div
                  key={t.id}
                  className="p-3 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl flex items-center justify-between text-xs shadow-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${
                      t.status === 'completed' ? 'bg-emerald-500' : t.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                    <div>
                      <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{t.title || t.type}</p>
                      <p className="text-[8.5px] text-slate-400 dark:text-neutral-500">ID: {t.id?.slice(0, 10)}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-xs font-black ${t.type === 'deposit' || t.type === 'win' ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
                      {t.type === 'deposit' || t.type === 'win' ? '+' : '-'}₹{t.amount}
                    </p>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 8: RESULTS (Tournament Organizer & All) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.RESULTS && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-4 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-transparent border border-amber-500/30 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <Trophy size={16} className="text-amber-500" />
                  Tournament Result Verification &amp; Declaration
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-neutral-400 mt-0.5">
                  Declare final kill counts and winner rankings. Player wallet winnings are credited automatically based on tournament rules. Only matches you have claimed appear here.
                </p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResultsMatchFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                  resultsMatchFilter === 'all'
                    ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                All Matches ({matches.length})
              </button>

              <button
                type="button"
                onClick={() => setResultsMatchFilter('pending')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                  resultsMatchFilter === 'pending'
                    ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                Pending Results ({matches.filter(m => m.status !== 'completed' && m.status !== 'cancelled').length})
              </button>

              <button
                type="button"
                onClick={() => setResultsMatchFilter('completed')}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                  resultsMatchFilter === 'completed'
                    ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                Completed &amp; Declared ({matches.filter(m => m.status === 'completed').length})
              </button>
            </div>

            {/* Matches list for results declaration */}
            <div className="space-y-3">
              {matches
                .filter(m => isMine(m))
                .filter(m => {
                  if (resultsMatchFilter === 'pending') {
                    return m.status !== 'completed' && m.status !== 'cancelled';
                  }
                  if (resultsMatchFilter === 'completed') {
                    return m.status === 'completed';
                  }
                  return true;
                })
                .map((m) => {
                  const joinedCount = m.playersCount || m.players?.length || 0;
                  const isCompleted = m.status === 'completed';

                  return (
                    <div
                      key={m.id}
                      className="p-4 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl space-y-3 shadow-xs"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
                              #{m.matchNumber || m.id.slice(0, 6)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                              isCompleted 
                                ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' 
                                : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                            }`}>
                              {isCompleted ? 'RESULTS DECLARED' : (m.status || 'UPCOMING')}
                            </span>
                          </div>

                          <h4 className="text-sm font-black italic uppercase text-slate-900 dark:text-white mt-1">
                            {m.title}
                          </h4>

                          <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500">
                            {m.gameTitle || m.gameId} • {m.mode || m.modeId} • {formatMatchTime(m.time || m.matchTime)}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                            ₹{m.prizePool} PRIZE
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-500">
                            {joinedCount} / {m.maxPlayers || 48} Joined
                          </span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-neutral-800/80">
                        <span className="text-[8.5px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                          {m.section || 'Battle Royale'} • {m.prizeType === 'perKill' ? `₹${m.perKillAmount || 0}/Kill` : 'Rank Pool'}
                        </span>

                        {isCompleted && !isSuperAdmin ? (
                          <span className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 flex items-center gap-1.5">
                            <Lock size={12} /> Locked
                          </span>
                        ) : (
                        <button
                          onClick={() => {
                            setSelectedMatchForResults(m);
                            setIsResultModalOpen(true);
                          }}
                          className={`px-4 py-2 rounded-xl text-[9.5px] font-black uppercase tracking-widest shadow-md transition-all flex items-center gap-1.5 active:scale-[0.97] ${
                            isCompleted
                              ? 'bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-neutral-200'
                              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25'
                          }`}
                        >
                          <Trophy size={13} />
                          <span>{isCompleted ? 'Update / Edit Results' : 'Declare Results & Credit'}</span>
                        </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 9: MEDIA ASSETS LIBRARY (All Staff & Admin) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === StaffTab.MEDIA && (
          <MediaLibraryTab currentUser={user} />
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* ROOM DECLARATION MODAL */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {selectedMatchForRoom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 rounded-[30px] p-6 shadow-2xl space-y-4 text-slate-900 dark:text-white transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black italic uppercase text-slate-900 dark:text-white tracking-tight">
                    Set In-Game Room Details
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest">
                    Match #{selectedMatchForRoom.matchNumber || selectedMatchForRoom.id.slice(0, 6)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedMatchForRoom(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 block mb-1">
                    Custom Room ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1928471"
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-3.5 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 block mb-1">
                    Room Password (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1234 or Leave Blank"
                    value={roomPasswordInput}
                    onChange={(e) => setRoomPasswordInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-3.5 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 transition-colors"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMatchForRoom(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRoomDetails}
                  disabled={isSavingRoom}
                  className="flex-1 py-3 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-1.5"
                >
                  {isSavingRoom ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>Save &amp; Broadcast</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DeclareResultModal
        isOpen={isResultModalOpen}
        onClose={() => {
          setIsResultModalOpen(false);
          setSelectedMatchForResults(null);
        }}
        match={selectedMatchForResults}
        currentUser={user}
        onSuccess={() => {
          // Handled inside modal
        }}
      />
    </div>
  );
}
