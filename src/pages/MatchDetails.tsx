import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Trophy, 
  Users, 
  X, 
  ShieldCheck, 
  Calendar, 
  AlertCircle, 
  Search, 
  CheckCircle2, 
  Swords,
  Key,
  Clock,
  Gamepad2,
  MapPin,
  Copy,
  Check
} from 'lucide-react';
import { Page, Tournament, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';
import { usePopup } from '../components/PopupProvider';
import AdvancedLoader from '../components/AdvancedLoader';

interface MatchDetailsProps {
  user: User | null;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
}

// Format tournament date/time string to "DD/MM/YYYY • hh:mm A"
function formatMatchSchedule(timeStr?: string) {
  if (!timeStr) return '21/08/2026 • 08:40 AM';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) {
      return timeStr;
    }
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = hours.toString().padStart(2, '0');
    return `${day}/${month}/${year} • ${strHours}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

// Default Fallback Esports artwork based on Section/Mode
function getDefaultEsportsImage(section?: string, mode?: string) {
  const s = (section || '').toLowerCase();
  const m = (mode || '').toLowerCase();

  if (s.includes('clash') || m.includes('cs')) {
    return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop';
  }
  if (s.includes('lone') || m.includes('wolf')) {
    return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop';
  }
  return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop';
}

export default function MatchDetails({ user, onPageChange, joinedMatchIds }: MatchDetailsProps) {
  const { id } = useParams<{ id: string }>();
  const matchId = id || '';
  const { showWarning } = usePopup();

  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllJoiningsModal, setShowAllJoiningsModal] = useState(false);
  const [joiningsSearch, setJoiningsSearch] = useState('');
  const [showRoomDetailsModal, setShowRoomDetailsModal] = useState(false);
  const [sectionRules, setSectionRules] = useState<string[]>([]);
  const [copiedField, setCopiedField] = useState<'id' | 'pass' | null>(null);

  useEffect(() => {
    if (!matchData) return;
    if (matchData.rules && Array.isArray(matchData.rules) && matchData.rules.length > 0) {
      setSectionRules(matchData.rules);
      return;
    }
    if (matchData.rules && typeof matchData.rules === 'string' && matchData.rules.trim().length > 0) {
      setSectionRules(matchData.rules.split('\n').filter(r => r.trim().length > 0));
      return;
    }

    const fetchRules = async () => {
      try {
        const sec = (matchData.section || matchData.mode || 'Battle Royale').toLowerCase().trim();
        const normKey = sec.replace(/[^a-z0-9]+/g, '_');
        let snap = await getDoc(doc(db, 'gameRules', normKey));
        if (!snap.exists() && matchData.modeId) {
          snap = await getDoc(doc(db, 'gameRules', matchData.modeId));
        }
        if (!snap.exists()) {
          if (sec.includes('clash') || sec.includes('4v4')) snap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
          else if (sec.includes('lone') || sec.includes('wolf') || sec.includes('1v1')) snap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
          else if (sec.includes('sniper')) snap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
          else if (sec.includes('custom')) snap = await getDoc(doc(db, 'gameRules', 'custom_room'));
          else snap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
        }

        if (snap.exists() && snap.data().rules && snap.data().rules.length > 0) {
          setSectionRules(snap.data().rules);
        }
      } catch (err) {
        console.warn('Failed to load dynamic rules:', err);
      }
    };
    fetchRules();
  }, [matchData?.id, matchData?.section, matchData?.mode, matchData?.modeId, matchData?.rules]);

  useEffect(() => {
    if (!matchId) {
      setError('Match ID not found');
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'matches', matchId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Tournament;
          setMatchData(data);
          setError(null);
        } else {
          setError('Match does not exist or has been removed');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching match details:', err);
        handleFirestoreError(err, OperationType.GET, `matches/${matchId}`);
        setError('Failed to load match details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  const handleCopy = (text: string, field: 'id' | 'pass') => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) {
    return <AdvancedLoader fullScreen text="Loading Contest Details..." />;
  }

  if (error || !matchData) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] dark:bg-transparent flex flex-col items-center justify-center p-6 text-slate-900 dark:text-white text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-500 mb-4">
          <AlertCircle size={30} />
        </div>
        <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white mb-2">
          Contest <span className="text-[#F37A1F]">Not Found</span>
        </h2>
        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-6 max-w-xs">
          {error || 'This tournament is not available.'}
        </p>
        <button
          onClick={() => onPageChange(Page.TOURNAMENTS)}
          className="px-6 py-3.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl font-black text-xs uppercase tracking-[0.14em] shadow-[0_8px_20px_rgba(243,122,32,0.35)] active:scale-[0.97] transition-all"
        >
          Back to Tournaments
        </button>
      </div>
    );
  }

  // Calculate Match Info Values
  const isJoined = joinedMatchIds.includes(matchId) || (matchData.players && user && matchData.players.some(p => p.userId === user.id || p.userId === auth.currentUser?.uid));
  const isOngoing = matchData.status === 'ongoing';
  const isCompleted = matchData.status === 'completed';

  const totalSlots = Number(matchData.totalSlots || matchData.maxPlayers || 48);
  const players = matchData.players || [];
  const playersCount = Number(matchData.playersCount || players.length || 0);
  const spotsLeft = Math.max(0, totalSlots - playersCount);
  const isFull = spotsLeft <= 0;
  const slotProgress = Math.min(100, Math.round((playersCount / Math.max(1, totalSlots)) * 100));

  // Match Display ID
  const displayMatchNumber = matchData.displayId 
    ? matchData.displayId.replace(/[^0-9]/g, '') || matchData.displayId
    : (matchData as any).matchNumber 
      ? String((matchData as any).matchNumber).padStart(2, '0')
      : matchId.slice(-4).toUpperCase();

  // Banner image
  const bannerImage = matchData.image || getDefaultEsportsImage(matchData.section, matchData.mode);

  // Title formatting
  const matchTitle = matchData.title || `${(matchData.section || 'BR').toUpperCase()} ${(matchData.mode || 'SOLO').toUpperCase()} BATTLE`;

  // Basic Info Values
  const teamType = matchData.mode ? matchData.mode.toUpperCase() : 'SOLO';
  const modeName = (matchData.section || 'BATTLE ROYALE').toUpperCase();
  const mapName = (matchData.map || 'BERMUDA').toUpperCase();
  const isPaid = (matchData.entryFee || 0) > 0;
  const entryFeeVal = isPaid ? `₹${matchData.entryFee}` : 'FREE';
  const perKillVal = Number(matchData.perKillAmount ?? (matchData as any).perKill ?? 0);
  const scheduleFormatted = formatMatchSchedule(matchData.time);

  // Prize Pool calculations
  const calculateTotalPrizePool = (): number => {
    if (matchData.prizePool && Number(matchData.prizePool) > 0) return Number(matchData.prizePool);
    if (matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0) {
      const total = Object.values(matchData.prizeDistribution).reduce<number>((sum, val) => sum + (Number(val) || 0), 0);
      if (total > 0) return total;
    }
    if (matchData.prize) {
      const parsed = parseInt(String(matchData.prize).replace(/[^0-9]/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 300;
  };

  const totalPrizePool = calculateTotalPrizePool();

  // Prize breakdown items
  const getPrizeList = () => {
    const items: { label: string; amount: string; isTop?: boolean }[] = [];
    const isSurvival = matchData.prizeType === 'survival';

    // 1. PER KILL row
    if (isSurvival) {
      items.push({ label: 'PER KILL REWARD', amount: '₹0' });
    } else {
      items.push({ label: 'PER KILL REWARD', amount: `₹${perKillVal}` });
    }

    // 2. Rank Distribution
    if (matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0) {
      const sortedRanks = Object.keys(matchData.prizeDistribution)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedRanks.forEach((rank) => {
        let label = `${rank}TH PLACE`;
        if (rank === 1) label = '1ST PLACE (BOOYAH)';
        else if (rank === 2) label = '2ND PLACE (RUNNER UP)';
        else if (rank === 3) label = '3RD PLACE';
        items.push({
          label,
          amount: `₹${matchData.prizeDistribution![rank]}`,
          isTop: rank === 1
        });
      });
    } else if (matchData.positionPrizeDistribution && Object.keys(matchData.positionPrizeDistribution).length > 0) {
      const sortedRanks = Object.keys(matchData.positionPrizeDistribution)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedRanks.forEach((rank) => {
        let label = `${rank}TH PLACE`;
        if (rank === 1) label = '1ST PLACE (BOOYAH)';
        else if (rank === 2) label = '2ND PLACE (RUNNER UP)';
        else if (rank === 3) label = '3RD PLACE';
        items.push({
          label,
          amount: `₹${matchData.positionPrizeDistribution![rank]}`,
          isTop: rank === 1
        });
      });
    } else if (isSurvival) {
      items.push({ label: '1ST PLACE (BOOYAH)', amount: `₹${totalPrizePool}`, isTop: true });
    }

    return items;
  };

  const prizeItems = getPrizeList();

  // About description
  const aboutDescription = matchData.description || 
    `This is a ${teamType} ${matchData.section || 'Battle Royale'} match on ${mapName} where only skilled players can survive till the end. Show your skills and be the last one standing!`;

  // Custom or Default Rules
  const getRulesList = () => {
    if (sectionRules && sectionRules.length > 0) {
      return sectionRules;
    }
    if (matchData.rules) {
      if (Array.isArray(matchData.rules)) return matchData.rules;
      if (typeof matchData.rules === 'string') {
        return matchData.rules.split('\n').filter(r => r.trim().length > 0);
      }
    }
    return [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: The match must be played exclusively on a smartphone or tablet. Emulators are strictly prohibited.',
      'Registration: Enter exact in-game IGN without unsupported special characters.',
      'Fairplay: No teaming, aimbots, or game modifying software.',
      'Match Result Policy: Scores will be verified by the admin team post-match before prize distribution.',
      'Cancellation & Refund Policy: If a match is cancelled by the admin, 100% of the entry fee will be refunded back to your wallet instantly.'
    ];
  };

  const rulesList = getRulesList();

  // Filtered joinings for the modal
  const filteredPlayers = players.filter((p) => {
    if (!joiningsSearch) return true;
    const term = joiningsSearch.toLowerCase();
    return (
      (p.username && p.username.toLowerCase().includes(term)) ||
      (p.ign && p.ign.toLowerCase().includes(term)) ||
      (p.slot && String(p.slot).includes(term))
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-transparent text-white pb-32 max-w-lg mx-auto select-none relative transition-colors duration-300"
    >
      {/* ========================================================================= */}
      {/* 1. TOP HEADER BAR                                                         */}
      {/* ========================================================================= */}
      <div className="pt-5 pb-3 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-zinc-300 active:scale-[0.97] transition-all shadow-sm"
            aria-label="Back to Tournaments"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
          </button>

          <div>
            <h1 className="text-[20px] sm:text-[22px] font-black italic uppercase tracking-tight leading-none">
              <span className="text-slate-900 dark:text-white">CONTEST</span>{' '}
              <span className="text-[#FF9A4D]">DETAILS</span>
            </h1>
            <p className="text-[9px] font-bold italic uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500 mt-1">
              MATCH #{displayMatchNumber} • {modeName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isJoined && (matchData.roomId || matchData.roomPassword) && (
            <button
              onClick={() => setShowRoomDetailsModal(true)}
              className="px-3.5 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-[0.97] transition-all"
            >
              <Key size={13} />
              <span>ROOM ID</span>
            </button>
          )}

          <div className="px-3.5 py-2 rounded-full bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 shadow-sm flex items-center gap-1.5 shrink-0">
            <Trophy className="w-3.5 h-3.5 text-[#FF9A4D] stroke-[2.2]" />
            <span className="text-[11px] font-black italic text-slate-900 dark:text-white">
              #{displayMatchNumber}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 space-y-5">
        {/* ========================================================================= */}
        {/* 2. HERO TOURNAMENT CARD (Banner + Title + Metrics + Progress)             */}
        {/* ========================================================================= */}
        <div className="bg-white dark:bg-[#141414] rounded-[30px] overflow-hidden border border-slate-100 dark:border-white/5 shadow-[0_12px_35px_rgba(15,23,42,0.06)] dark:shadow-none">
          {/* Full-Bleed Top Banner */}
          <div className="relative w-full aspect-[16/9.5] bg-slate-100 dark:bg-slate-900 overflow-hidden">
            <SafeImage
              src={bannerImage}
              alt={matchTitle}
              className="w-full h-full object-cover"
              imgClassName="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Top Left Status Pill */}
            <div className="absolute top-3.5 left-3.5 z-10">
              {isCompleted ? (
                <span className="bg-zinc-900/90 backdrop-blur-md text-zinc-300 text-[10px] font-black italic px-3 py-1.5 rounded-xl uppercase tracking-wider border border-white/10">
                  COMPLETED
                </span>
              ) : isOngoing ? (
                <span className="bg-amber-500 text-white text-[10px] font-black italic px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  LIVE NOW
                </span>
              ) : isFull ? (
                <span className="bg-rose-500/95 text-white text-[10px] font-black italic px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-lg">
                  SLOTS FULL
                </span>
              ) : (
                <span className="bg-[#F37A1F] text-black text-[10px] font-black italic px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-[0_4px_15px_rgba(243,122,32,0.5)]">
                  {spotsLeft} SPOTS LEFT
                </span>
              )}
            </div>

            {/* Top Right Joined Status */}
            {isJoined && (
              <div className="absolute top-3.5 right-3.5 z-10 bg-emerald-500 text-white text-[10px] font-black italic px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                <CheckCircle2 size={13} className="stroke-[2.5]" />
                <span>JOINED</span>
              </div>
            )}

            {/* Bottom Banner Schedule */}
            <div className="absolute bottom-3 left-3.5 right-3.5 z-10 flex items-center justify-between gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-black/65 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#FF9A4D]" />
                <span className="text-[10px] font-black uppercase tracking-wider text-white">
                  {scheduleFormatted}
                </span>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-purple-600/30 backdrop-blur-md border border-purple-400/30 text-[10px] font-black italic uppercase tracking-wider text-purple-200">
                {isPaid ? 'PAID CONTEST' : 'FREE CONTEST'}
              </span>
            </div>
          </div>

          {/* Card Content */}
          <div className="p-5">
            {/* Match ID Badge + Title */}
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1.5 rounded-xl bg-[rgba(243,122,32,0.15)] dark:bg-purple-500/15 text-[#F37A1F] dark:text-purple-400 text-xs font-black tracking-wide shrink-0">
                #{displayMatchNumber}
              </span>
              <h2 className="text-base sm:text-lg font-black italic uppercase tracking-tight leading-snug text-slate-900 dark:text-white">
                {matchTitle}
              </h2>
            </div>

            {/* 3-Column Metrics Grid (PRIZE POOL | PER KILL | ENTRY FEE) matching Tournaments card */}
            <div className="grid grid-cols-3 py-4 border-y border-slate-100 dark:border-white/5 items-center text-center">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500 block mb-1.5">
                  PRIZE POOL
                </span>
                <span className="text-[19px] font-black italic text-[#22C55E] leading-none block">
                  ₹{totalPrizePool}
                </span>
              </div>

              <div className="border-x border-slate-100 dark:border-white/5">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500 block mb-1.5">
                  PER KILL
                </span>
                <span className="text-[19px] font-black italic text-slate-800 dark:text-white leading-none block">
                  {perKillVal > 0 ? `₹${perKillVal}` : '₹0'}
                </span>
              </div>

              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500 block mb-1.5">
                  ENTRY FEE
                </span>
                <span className="text-[19px] font-black italic text-[#FF9A4D] leading-none block">
                  {entryFeeVal}
                </span>
              </div>
            </div>

            {/* 3-Column Specs Pills (TEAM | MODE | MAP) */}
            <div className="grid grid-cols-3 gap-2.5 pt-4">
              <div className="bg-slate-50/90 dark:bg-[#1a1a1a] border border-slate-100 dark:border-white/5 rounded-2xl p-3 text-center">
                <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block mb-1">
                  TEAM
                </span>
                <span className="text-xs font-black italic uppercase text-slate-900 dark:text-white truncate block">
                  {teamType}
                </span>
              </div>

              <div className="bg-slate-50/90 dark:bg-[#1a1a1a] border border-slate-100 dark:border-white/5 rounded-2xl p-3 text-center">
                <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block mb-1">
                  MODE
                </span>
                <span className="text-xs font-black italic uppercase text-[#F37A1F] dark:text-purple-400 truncate block">
                  {modeName}
                </span>
              </div>

              <div className="bg-slate-50/90 dark:bg-[#1a1a1a] border border-slate-100 dark:border-white/5 rounded-2xl p-3 text-center">
                <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block mb-1">
                  MAP
                </span>
                <span className="text-xs font-black italic uppercase text-slate-900 dark:text-white truncate block">
                  {mapName}
                </span>
              </div>
            </div>

            {/* Slot Progress & View Participants Button */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
                <span className="text-slate-500 dark:text-zinc-400">
                  SLOTS FILLED:{' '}
                  <span className="text-[#F37A1F] dark:text-purple-400 tabular-nums">
                    {playersCount}/{totalSlots}
                  </span>
                </span>
                <span className="text-emerald-500 italic">{spotsLeft} REMAINING</span>
              </div>

              <div className="h-1.5 w-full bg-[#1e1e1e] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[linear-gradient(90deg,#F37A1F,#FF9A4D)] rounded-full transition-all duration-300"
                  style={{ width: `${slotProgress}%` }}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAllJoiningsModal(true)}
                className="w-full py-3 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] hover:bg-purple-50 dark:hover:bg-purple-500/10 border border-slate-200/80 dark:border-white/10 text-slate-800 dark:text-zinc-200 text-[11px] font-black uppercase tracking-[0.14em] flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              >
                <Users size={15} className="text-[#F37A1F] dark:text-purple-400" />
                <span>VIEW PARTICIPANTS ({playersCount}/{totalSlots})</span>
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. PRIZE POOL BREAKDOWN CARD                                              */}
        {/* ========================================================================= */}
        <div className="bg-[#141414] rounded-[28px] p-5 border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-500/15 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center text-[#F37A1F] dark:text-purple-400">
                <Trophy size={17} />
              </div>
              <div>
                <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                  Prize <span className="text-[#FF9A4D]">Breakdown</span>
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
                  Guaranteed Winnings Pool
                </p>
              </div>
            </div>

            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-black italic">
              POOL: ₹{totalPrizePool}
            </span>
          </div>

          <div className="space-y-2">
            {prizeItems.map((item, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                  item.isTop
                    ? 'bg-purple-50/70 dark:bg-purple-500/10 border-purple-200/70 dark:border-purple-500/25'
                    : 'bg-slate-50/80 dark:bg-[#1a1a1a] border-slate-100 dark:border-white/5'
                }`}
              >
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-700 dark:text-zinc-200">
                  {item.label}
                </span>
                <span
                  className={`text-sm font-black italic ${
                    item.isTop
                      ? 'text-[#F37A1F] dark:text-purple-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {item.amount}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[9.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
            <span>PRIZE POLICY</span>
            <span className="text-[#FF9A4D]">FULL PRIZE ON FULL SLOTS</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. ABOUT THIS MATCH CARD                                                  */}
        {/* ========================================================================= */}
        <div className="bg-[#141414] rounded-[28px] p-5 border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-500/15 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center text-[#F37A1F] dark:text-purple-400">
              <Gamepad2 size={17} />
            </div>
            <div>
              <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                About <span className="text-[#FF9A4D]">Match</span>
              </h3>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
                Tournament Briefing
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-[#1a1a1a] border border-slate-100 dark:border-white/5 text-xs font-semibold text-slate-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
            {aboutDescription}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. RULES AND REGULATIONS CARD                                             */}
        {/* ========================================================================= */}
        <div className="bg-[#141414] rounded-[28px] p-5 border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-500/15 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center text-[#F37A1F] dark:text-purple-400">
                <ShieldCheck size={17} />
              </div>
              <div>
                <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                  Match <span className="text-[#FF9A4D]">Rules</span>
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
                  Read Carefully Before Joining
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                showWarning(
                  'FAIR PLAY WARNING',
                  'Strict anti-cheat & fair play rules apply to this contest:',
                  rulesList
                )
              }
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1"
            >
              <AlertCircle size={12} />
              <span>FAIR PLAY</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {rulesList.map((rule, idx) => (
              <div
                key={idx}
                className="flex gap-3 p-3.5 rounded-2xl bg-slate-50/80 dark:bg-[#1a1a1a] border border-slate-100 dark:border-white/5"
              >
                <span className="text-[#F37A1F] dark:text-purple-400 font-black text-xs mt-0.5 shrink-0 tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <p className="text-[11.5px] font-semibold text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {rule}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. FIXED BOTTOM ACTION BAR                                                */}
      {/* ========================================================================= */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto p-4 bg-white/90 dark:bg-[#050505]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/10 z-40">
        {isCompleted ? (
          <button
            disabled
            className="w-full h-14 bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 rounded-2xl font-black text-xs uppercase tracking-[0.18em] cursor-not-allowed"
          >
            CONTEST COMPLETED
          </button>
        ) : isOngoing ? (
          <div className="flex gap-2.5">
            {isJoined && (matchData.roomId || matchData.roomPassword) ? (
              <button
                onClick={() => setShowRoomDetailsModal(true)}
                className="flex-1 h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-[0_8px_20px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              >
                <Key size={16} />
                <span>VIEW ROOM ID & PASSWORD</span>
              </button>
            ) : (
              <button
                disabled
                className="w-full h-14 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.18em] cursor-not-allowed animate-pulse"
              >
                MATCH IN PROGRESS
              </button>
            )}
          </div>
        ) : isJoined ? (
          <div className="flex gap-2.5">
            <button
              onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
              className="flex-1 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-[0_8px_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
            >
              <CheckCircle2 size={17} className="stroke-[2.5]" />
              <span>JOINED • VIEW SLOTS</span>
            </button>
            {(matchData.roomId || matchData.roomPassword) && (
              <button
                onClick={() => setShowRoomDetailsModal(true)}
                className="px-5 h-14 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl font-black text-xs uppercase tracking-wider shadow-[0_8px_20px_rgba(243,122,32,0.35)] flex items-center justify-center gap-1.5"
              >
                <Key size={17} />
                <span>ROOM</span>
              </button>
            )}
          </div>
        ) : isFull ? (
          <button
            disabled
            className="w-full h-14 bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 rounded-2xl font-black text-xs uppercase tracking-[0.18em] cursor-not-allowed"
          >
            ALL SLOTS FULL
          </button>
        ) : (
          <button
            onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
            className="w-full h-14 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl font-black text-xs sm:text-sm uppercase tracking-[0.16em] shadow-[0_8px_25px_rgba(243,122,32,0.4)] active:scale-[0.97] transition-all flex items-center justify-center gap-2.5"
          >
            <Swords size={18} className="stroke-[2.4]" />
            <span>JOIN TOURNAMENT • {entryFeeVal}</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: VIEW ALL JOININGS                                                  */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showAllJoiningsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/65 backdrop-blur-sm"
            onClick={() => setShowAllJoiningsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 15 }}
              className="w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[28px] p-6 text-slate-900 dark:text-white shadow-2xl relative overflow-hidden flex flex-col max-h-[82vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                    Registered <span className="text-[#FF9A4D]">Players</span>
                  </h3>
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-zinc-500 mt-0.5">
                    {playersCount} of {totalSlots} Slots Occupied
                  </p>
                </div>

                <button
                  onClick={() => setShowAllJoiningsModal(false)}
                  className="w-9 h-9 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-2xl hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search Box */}
              <div className="mb-4 relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search player, IGN, or slot #..."
                  value={joiningsSearch}
                  onChange={(e) => setJoiningsSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/80 dark:border-neutral-800 rounded-2xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-[#F37A1F]"
                />
              </div>

              {/* Players List */}
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-1">
                {players.length === 0 ? (
                  <div className="py-12 text-center">
                    <Users size={32} className="mx-auto mb-2.5 text-slate-300 dark:text-zinc-700" />
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-zinc-500">
                      No Players Joined Yet
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 dark:text-zinc-600 mt-1">
                      Be the first warrior to claim a slot!
                    </p>
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-xs font-bold text-slate-400 dark:text-zinc-500">
                      No players matching "{joiningsSearch}"
                    </p>
                  </div>
                ) : (
                  filteredPlayers.map((player, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-50/90 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-[rgba(243,122,32,0.15)] dark:bg-purple-500/15 text-[#F37A1F] dark:text-purple-400 flex items-center justify-center font-black text-[11px] shrink-0">
                          #{player.slot || idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
                            {player.ign || player.username || 'Gamer'}
                          </p>
                          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 truncate">
                            {player.username ? `@${player.username}` : `Slot #${player.slot || idx + 1}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20 shrink-0">
                        LOCKED
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500">
                  TOTAL JOINED: {playersCount}/{totalSlots}
                </span>
                <button
                  onClick={() => setShowAllJoiningsModal(false)}
                  className="px-5 py-2.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-xl font-black text-[10px] uppercase tracking-[0.14em]"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: ROOM ID & PASSWORD (FOR JOINED PLAYERS)                            */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showRoomDetailsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/65 backdrop-blur-sm"
            onClick={() => setShowRoomDetailsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 15 }}
              className="w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[28px] p-6 text-slate-900 dark:text-white shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowRoomDetailsModal(false)}
                className="absolute top-5 right-5 w-9 h-9 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-2xl flex items-center justify-center"
              >
                <X size={18} />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 text-[#F37A1F] dark:text-purple-400 flex items-center justify-center mx-auto mb-4">
                <Key size={26} />
              </div>

              <h3 className="text-lg font-black italic uppercase tracking-tight text-slate-900 dark:text-white mb-1">
                Room <span className="text-[#FF9A4D]">Credentials</span>
              </h3>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-5">
                Enter custom room before match start time
              </p>

              <div className="space-y-3 text-left mb-6">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block">
                      ROOM ID
                    </span>
                    <span className="font-mono font-black text-sm text-slate-900 dark:text-white select-all">
                      {matchData.roomId || 'Available 15m before'}
                    </span>
                  </div>
                  {matchData.roomId && (
                    <button
                      onClick={() => handleCopy(matchData.roomId!, 'id')}
                      className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200/80 dark:border-white/10 text-[#F37A1F] dark:text-purple-400"
                    >
                      {copiedField === 'id' ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block">
                      PASSWORD
                    </span>
                    <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 select-all">
                      {matchData.roomPassword || 'Available 15m before'}
                    </span>
                  </div>
                  {matchData.roomPassword && (
                    <button
                      onClick={() => handleCopy(matchData.roomPassword!, 'pass')}
                      className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200/80 dark:border-white/10 text-emerald-600 dark:text-emerald-400"
                    >
                      {copiedField === 'pass' ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowRoomDetailsModal(false)}
                className="w-full py-3.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl font-black text-xs uppercase tracking-[0.16em] shadow-[0_8px_20px_rgba(243,122,32,0.35)]"
              >
                GOT IT
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
