import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  User as UserIcon, 
  Check, 
  Loader2, 
  X, 
  AlertCircle, 
  Sparkles, 
  Trophy, 
  Wallet as WalletIcon,
  Swords,
  Edit3,
  Plus,
  Users
} from 'lucide-react';
import { Page, User as UserType, Tournament } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  doc, 
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  increment,
  updateDoc,
  runTransaction
} from 'firebase/firestore';
import { usePopup } from '../components/PopupProvider';
import AdvancedLoader from '../components/AdvancedLoader';

interface JoinMatchProps {
  user: UserType;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
  onJoinSuccess: (matchId: string) => void;
}

export default function JoinMatch({ user, onPageChange, joinedMatchIds, onJoinSuccess }: JoinMatchProps) {
  const { id: matchId } = useParams();
  const { showWarning } = usePopup();
  const isJoined = matchId ? joinedMatchIds.includes(matchId) : false;

  // Flow steps: 'select_position' | 'summary' | 'success'
  const [currentStep, setCurrentStep] = useState<'select_position' | 'summary' | 'success'>('select_position');
  
  // State for positions & IGN
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [inGameName, setInGameName] = useState('');
  const [ignModalOpen, setIgnModalOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [tempIgn, setTempIgn] = useState('');
  const [activeEditingSlotIndex, setActiveEditingSlotIndex] = useState<number>(0);
  const [teammateIGNs, setTeammateIGNs] = useState<string[]>(['', '', '']); // For multi-slot/teammates

  const [loading, setLoading] = useState(false);
  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [takenSlots, setTakenSlots] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Determine game key for IGN retrieval
  const getGameKey = (gameId?: string, section?: string) => {
    const g = (gameId || '').toLowerCase();
    const s = (section || '').toLowerCase();
    if (g.includes('freefire') || s.includes('battle royale') || s.includes('clash squad') || s.includes('lone wolf')) {
      return 'freefire';
    }
    if (g.includes('cod') || g.includes('call of duty')) {
      return 'codm';
    }
    if (g.includes('bgmi') || g.includes('pubg')) {
      return 'bgmi';
    }
    return g || 'freefire';
  };

  // Real-time listener for current match
  useEffect(() => {
    if (!matchId) return;

    const unsubscribe = onSnapshot(doc(db, 'matches', matchId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Tournament;
        setMatchData({ ...data, id: docSnap.id });
        if (data.players) {
          setTakenSlots((data.players as any[]).map((p: any) => Number(p.slot)));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `matches/${matchId}`);
    });

    return () => unsubscribe();
  }, [matchId]);

  // Autofill Game-Specific IGN from Profile
  useEffect(() => {
    if (matchData && user) {
      const gameKey = getGameKey(matchData.gameId, matchData.section);
      const savedGameIGN = user.gameIGNs?.[gameKey] || user.gameIGNs?.[matchData.gameId] || user.ign || (user as any)[`${gameKey}IGN`];
      
      if (savedGameIGN && !inGameName) {
        setInGameName(savedGameIGN);
      }
    }
  }, [matchData, user]);

  const isUserJoined = (matchData?.players as any[])?.some((p: any) => p.userId === auth.currentUser?.uid) || isJoined;

  const totalSlots = Number(matchData?.totalSlots || matchData?.maxPlayers || 48);
  const maxTeamSlots = matchData?.mode === 'Duo' ? 2 : matchData?.mode === 'Squad' ? 4 : 1;

  // Toggle position selection in Step 1
  const toggleSlot = (slotId: number) => {
    if (takenSlots.includes(slotId) || isUserJoined) return;

    if (maxTeamSlots > 1) {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots(selectedSlots.filter(id => id !== slotId));
      } else {
        if (selectedSlots.length < maxTeamSlots) {
          setSelectedSlots([...selectedSlots, slotId].sort((a, b) => a - b));
        } else {
          setSelectedSlots([slotId]);
        }
      }
    } else {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots([]);
      } else {
        setSelectedSlots([slotId]);
      }
    }
  };

  // Proceed from Step 1 to Step 2
  const handleProceedToSummary = () => {
    if (selectedSlots.length === 0) return;
    setCurrentStep('summary');
  };

  // Open IGN Modal
  const openIgnModal = (slotIndex: number = 0) => {
    setActiveEditingSlotIndex(slotIndex);
    if (slotIndex === 0) {
      setTempIgn(inGameName || '');
    } else {
      setTempIgn(teammateIGNs[slotIndex - 1] || '');
    }
    setIgnModalOpen(true);
  };

  // Save IGN from Modal
  const handleSaveIgnModal = async () => {
    const trimmed = tempIgn.trim();
    if (!trimmed) {
      showWarning('MISSING IN-GAME NAME', 'Please enter a valid in-game username (IGN) so the admin can verify your score.');
      return;
    }

    if (activeEditingSlotIndex === 0) {
      setInGameName(trimmed);
      if (auth.currentUser) {
        try {
          const gameKey = getGameKey(matchData?.gameId, matchData?.section);
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            [`gameIGNs.${gameKey}`]: trimmed,
            ign: trimmed
          });
        } catch (e) {
          console.warn('Could not auto-save IGN to profile:', e);
        }
      }
    } else {
      const updated = [...teammateIGNs];
      updated[activeEditingSlotIndex - 1] = trimmed;
      setTeammateIGNs(updated);
    }

    setIgnModalOpen(false);
  };

  // Final Join Action in Summary Step
  const handleFinalJoin = async () => {
    if (selectedSlots.length === 0 || !matchId || !auth.currentUser) return;
    
    // Check if main IGN is provided
    if (!inGameName) {
      openIgnModal(0);
      return;
    }

    // Check teammate IGNs if multiple slots
    if (selectedSlots.length > 1) {
      for (let i = 0; i < selectedSlots.length - 1; i++) {
        if (!teammateIGNs[i]) {
          openIgnModal(i + 1);
          return;
        }
      }
    }

    if (isUserJoined) {
      showWarning('ALREADY JOINED', 'You have already registered for this match!');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const matchRef = doc(db, 'matches', matchId);
      const regId = `${matchId}_${auth.currentUser.uid}`;
      const regRef = doc(db, 'registrations', regId);

      const entryFeePerSlot = matchData?.entryFee || 0;
      const totalFee = entryFeePerSlot * selectedSlots.length;

      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const matchDoc = await transaction.get(matchRef);

        if (!userDoc.exists()) throw new Error('User profile not found. Please log in again.');
        if (!matchDoc.exists()) throw new Error('Match not found.');

        const userData = userDoc.data() as UserType;
        const tournamentData = matchDoc.data() as Tournament;

        if ((tournamentData.players as any[])?.some((p: any) => p.userId === auth.currentUser?.uid)) {
          throw new Error('You have already joined this match.');
        }

        const deposit = userData.wallet?.deposit || 0;
        const winnings = userData.wallet?.winnings || 0;
        const bonus = userData.wallet?.bonus || 0;
        const totalPayable = deposit + winnings + bonus;

        if (totalPayable < totalFee) {
          throw new Error('NOT_ENOUGH_BALANCE');
        }

        const updatedPlayers = (tournamentData.players as any[]) || [];
        for (const slotId of selectedSlots) {
          if (updatedPlayers.some((p: any) => Number(p.slot) === slotId)) {
            throw new Error(`Position #${slotId} was just taken. Please choose another position.`);
          }
        }

        if (updatedPlayers.length + selectedSlots.length > (tournamentData.totalSlots || tournamentData.maxPlayers || 48)) {
          throw new Error('Match does not have enough slots left.');
        }

        // Deduction Logic: Bonus -> Deposit -> Winnings
        let remaining = totalFee;
        let newBonus = bonus;
        let newDeposit = deposit;
        let newWinnings = winnings;

        if (newBonus >= remaining) {
          newBonus -= remaining;
          remaining = 0;
        } else {
          remaining -= newBonus;
          newBonus = 0;
        }

        if (remaining > 0) {
          if (newDeposit >= remaining) {
            newDeposit -= remaining;
            remaining = 0;
          } else {
            remaining -= newDeposit;
            newDeposit = 0;
          }
        }

        if (remaining > 0) {
          newWinnings = Math.max(0, newWinnings - remaining);
          remaining = 0;
        }

        transaction.update(userRef, {
          "wallet.deposit": newDeposit,
          "wallet.winnings": newWinnings,
          "wallet.bonus": newBonus
        });

        const teamMembers = [
          { name: inGameName, isOwner: true }
        ];
        for (let i = 0; i < selectedSlots.length - 1; i++) {
          teamMembers.push({ name: teammateIGNs[i], isOwner: false } as any);
        }

        const playersToAdd = selectedSlots.map((slot, index) => ({
          userId: auth.currentUser!.uid,
          username: user.username,
          ign: index === 0 ? inGameName : teammateIGNs[index - 1],
          slot: slot
        }));

        transaction.update(matchRef, {
          players: arrayUnion(...playersToAdd),
          playersCount: increment(selectedSlots.length)
        });

        transaction.set(regRef, {
          tournamentId: matchId,
          userId: auth.currentUser!.uid,
          ign: inGameName,
          slots: selectedSlots,
          teamMembers: teamMembers,
          totalSlotsBooked: selectedSlots.length,
          joinedAt: serverTimestamp(),
          gameId: tournamentData.gameId || 'freefire',
          status: 'active'
        });

        if (totalFee > 0) {
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: auth.currentUser!.uid,
            type: 'entry',
            amount: totalFee,
            matchId: matchId,
            status: 'completed',
            title: `JOINED MATCH: ${tournamentData.title || tournamentData.displayId || '#000'} (${selectedSlots.length} Slots)`,
            createdAt: serverTimestamp()
          });
        }
      });

      onJoinSuccess(matchId);
      setShowSuccessModal(true);
      setCurrentStep('summary');
    } catch (error: any) {
      console.error('Registration failed:', error);
      const errorMsg = error.message || '';
      if (errorMsg === 'NOT_ENOUGH_BALANCE' || errorMsg.includes('Insufficient') || errorMsg.includes('balance')) {
        setErrorMessage('Insufficient wallet balance. Redirecting to Wallet...');
        setTimeout(() => {
          onPageChange(Page.WALLET);
        }, 1500);
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to join match');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!matchData) {
    return (
      <AdvancedLoader fullScreen text="Loading Contest Positions..." />
    );
  }

  // Display calculations
  const entryFeePerSlot = matchData.entryFee !== undefined && matchData.entryFee !== null ? Number(matchData.entryFee) : 5;
  const totalAmount = entryFeePerSlot * Math.max(1, selectedSlots.length);
  const userBalance = ((user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0));
  const teamLabel = matchData.mode ? `${matchData.mode.toUpperCase()} MATCH` : 'SOLO MATCH';
  const displayMatchNumber = matchData.displayId
    ? matchData.displayId.replace(/[^0-9]/g, '') || matchData.displayId
    : String((matchData as any).matchNumber || '01').padStart(2, '0');

  // ==========================================
  // STEP 3: SUCCESS SCREEN (Fallback Full Page)
  // ==========================================
  if (currentStep === 'success') {
    return (
      <div className="min-h-screen bg-transparent text-white flex flex-col justify-between p-6 max-w-lg mx-auto select-none">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 180 }}
            className="w-24 h-24 rounded-3xl bg-emerald-500 flex items-center justify-center text-white shadow-[0_12px_30px_rgba(16,185,129,0.4)] mb-6"
          >
            <Check size={48} className="stroke-[3.5]" />
          </motion.div>

          <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white px-4 max-w-xs leading-tight mb-2">
            {matchData.title || 'BR SOLO BATTLE'}
          </h2>

          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-500">
            Match Joined Successfully
          </p>
        </div>

        <div className="w-full pt-6">
          <button
            onClick={() => onPageChange(Page.HOME)}
            className="w-full h-14 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl text-xs font-black tracking-[0.18em] uppercase shadow-[0_8px_25px_rgba(243,122,32,0.4)] active:scale-[0.97] transition-all"
          >
            GO TO HOME
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // STEP 2: JOINING MATCH SUMMARY & IGN REGISTRATION PAGE
  // ==========================================
  if (currentStep === 'summary') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-transparent text-white flex flex-col justify-between max-w-lg mx-auto select-none pb-28 transition-colors duration-300"
      >
        <div>
          {/* Top App Header */}
          <div className="pt-5 pb-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep('select_position')}
                className="w-10 h-10 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-zinc-300 active:scale-[0.97] transition-all shadow-sm"
                aria-label="Back to positions"
              >
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              </button>

              <div>
                <h1 className="text-[20px] sm:text-[22px] font-black italic uppercase tracking-tight leading-none">
                  <span className="text-slate-900 dark:text-white">CONFIRM</span>{' '}
                  <span className="text-[#FF9A4D]">ENTRY</span>
                </h1>
                <p className="text-[9px] font-bold italic uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500 mt-1">
                  ADD IN-GAME NAME & VERIFY SLOTS
                </p>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-full bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 shadow-sm flex items-center gap-1.5 shrink-0">
              <Trophy className="w-3.5 h-3.5 text-[#FF9A4D] stroke-[2.2]" />
              <span className="text-[11px] font-black italic text-slate-900 dark:text-white">
                #{displayMatchNumber}
              </span>
            </div>
          </div>

          {/* Content Body */}
          <div className="px-4 pt-2 space-y-5">
            {/* 1. Wallet & Fee Summary Card matching Wallet.tsx */}
            <div className="bg-white dark:bg-[#141414] border border-slate-100 dark:border-white/5 rounded-[30px] p-5 shadow-[0_12px_35px_rgba(15,23,42,0.06)] dark:shadow-none">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-purple-50 dark:bg-purple-500/15 border border-purple-100 dark:border-purple-500/25 flex items-center justify-center text-[#F37A1F] dark:text-purple-400">
                    <WalletIcon size={20} />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500 block">
                      AVAILABLE WALLET BALANCE
                    </span>
                    <span className="text-xl font-black italic text-slate-900 dark:text-white tabular-nums">
                      ₹{userBalance.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onPageChange(Page.ADD_MONEY)}
                  className="px-3.5 py-2 rounded-xl bg-purple-50 dark:bg-purple-500/15 border border-purple-200/70 dark:border-purple-500/30 text-[#F37A1F] dark:text-purple-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 active:scale-[0.97]"
                >
                  <Plus size={12} className="stroke-[3]" />
                  <span>ADD CASH</span>
                </button>
              </div>

              {/* 3-Column Fee Breakdown */}
              <div className="grid grid-cols-3 pt-4 text-center divide-x divide-slate-100 dark:divide-white/5">
                <div className="px-2">
                  <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block mb-1">
                    ENTRY / SLOT
                  </span>
                  <span className="text-base font-black italic text-slate-900 dark:text-white tabular-nums">
                    {entryFeePerSlot === 0 ? 'FREE' : `₹${entryFeePerSlot}`}
                  </span>
                </div>

                <div className="px-2">
                  <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block mb-1">
                    SLOTS SELECTED
                  </span>
                  <span className="text-base font-black italic text-[#F37A1F] dark:text-purple-400 tabular-nums">
                    {selectedSlots.length}
                  </span>
                </div>

                <div className="px-2">
                  <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 block mb-1">
                    TOTAL PAYABLE
                  </span>
                  <span className="text-base font-black italic text-emerald-500 tabular-nums">
                    {totalAmount === 0 ? 'FREE' : `₹${totalAmount}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Error Alert if any */}
            {errorMessage && (
              <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2.5">
                <AlertCircle size={18} className="shrink-0 text-rose-500" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 2. Selected Position & In-Game Name Registration Card */}
            <div className="bg-white dark:bg-[#141414] border border-slate-100 dark:border-white/5 rounded-[30px] overflow-hidden shadow-[0_12px_35px_rgba(15,23,42,0.06)] dark:shadow-none">
              {/* Card Header */}
              <div className="p-5 pb-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-500/15 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center text-[#F37A1F] dark:text-purple-400">
                    <Users size={17} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                      Player <span className="text-[#FF9A4D]">Registration</span>
                    </h3>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
                      Assign In-Game Name to Selected Slots
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-xl bg-[rgba(243,122,32,0.15)] dark:bg-purple-500/15 text-[#F37A1F] dark:text-purple-400 text-[10px] font-black uppercase tracking-wider">
                  {teamLabel}
                </span>
              </div>

              {/* Column Headers */}
              <div className="grid grid-cols-12 px-5 py-2.5 bg-slate-50/80 dark:bg-[#1a1a1a] border-b border-slate-100 dark:border-white/5 text-[9.5px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500">
                <div className="col-span-3">SLOT</div>
                <div className="col-span-4">ROLE</div>
                <div className="col-span-5 text-right">IN-GAME NAME (IGN)</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {selectedSlots.map((slotNum, idx) => {
                  const currentSlotIgn = idx === 0 ? inGameName : teammateIGNs[idx - 1];
                  return (
                    <div key={slotNum} className="grid grid-cols-12 items-center px-5 py-4">
                      {/* Slot Badge */}
                      <div className="col-span-3">
                        <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-[rgba(243,122,32,0.15)] dark:bg-purple-500/15 text-[#F37A1F] dark:text-purple-400 text-xs font-black italic">
                          #{slotNum}
                        </span>
                      </div>

                      {/* Role / Team */}
                      <div className="col-span-4">
                        <span className="text-xs font-black uppercase tracking-tight text-slate-700 dark:text-zinc-200 block">
                          {idx === 0 ? 'LEADER' : `MEMBER ${idx + 1}`}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                          {teamLabel}
                        </span>
                      </div>

                      {/* IGN Button / Display */}
                      <div className="col-span-5 flex justify-end">
                        {currentSlotIgn ? (
                          <button
                            type="button"
                            onClick={() => openIgnModal(idx)}
                            className="px-3.5 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-black flex items-center gap-1.5 max-w-full hover:bg-emerald-500/20 active:scale-[0.97] transition-all"
                            title="Tap to edit In-Game Name"
                          >
                            <span className="truncate max-w-[100px]">{currentSlotIgn}</span>
                            <Edit3 size={12} className="shrink-0" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openIgnModal(idx)}
                            className="px-4 py-2.5 rounded-2xl bg-[#F37A1F] hover:bg-[#D9660F] text-black text-[10px] font-black uppercase tracking-[0.14em] shadow-[0_6px_15px_rgba(243,122,32,0.35)] flex items-center gap-1.5 active:scale-[0.97] transition-all"
                          >
                            <Plus size={13} className="stroke-[3]" />
                            <span>ADD IGN</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Tip */}
              <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-[#1a1a1a]/60 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                <AlertCircle size={14} className="text-[#F37A1F] dark:text-purple-400 shrink-0" />
                <span>Enter your exact case-sensitive In-Game Name for score & prize verification.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto p-4 bg-white/90 dark:bg-[#050505]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/10 z-40">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep('select_position')}
              disabled={loading}
              className="px-6 h-14 bg-slate-100 dark:bg-[#1a1a1a] hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/80 dark:border-white/10 rounded-2xl font-black text-xs uppercase tracking-[0.15em] active:scale-[0.97] transition-all"
            >
              BACK
            </button>

            <button
              type="button"
              onClick={handleFinalJoin}
              disabled={loading}
              className="flex-1 h-14 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl font-black text-xs sm:text-sm uppercase tracking-[0.16em] shadow-[0_8px_25px_rgba(243,122,32,0.4)] active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>JOINING CONTEST...</span>
                </>
              ) : (
                <>
                  <Swords size={17} className="stroke-[2.4]" />
                  <span>CONFIRM & JOIN ({totalAmount === 0 ? 'FREE' : `₹${totalAmount}`})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MODAL: ADD / EDIT IN-GAME NAME (IGN)                                      */}
        {/* ========================================================================= */}
        <AnimatePresence>
          {ignModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/65 backdrop-blur-sm"
              onClick={() => setIgnModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 15 }}
                className="w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[28px] p-6 shadow-2xl relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                      Add <span className="text-[#FF9A4D]">In-Game Name</span>
                    </h3>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-zinc-500 mt-0.5">
                      {activeEditingSlotIndex > 0
                        ? `Slot #${selectedSlots[activeEditingSlotIndex]} • Teammate ${activeEditingSlotIndex + 1}`
                        : `Slot #${selectedSlots[0]} • Primary Player`}
                    </p>
                  </div>

                  <button
                    onClick={() => setIgnModalOpen(false)}
                    className="w-9 h-9 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-2xl flex items-center justify-center"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400 mb-2">
                      ENTER EXACT GAME USERNAME (IGN)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#F37A1F] dark:text-purple-400">
                        <UserIcon size={17} />
                      </div>
                      <input
                        type="text"
                        value={tempIgn}
                        onChange={(e) => setTempIgn(e.target.value)}
                        placeholder="e.g. IND_WARRIOR"
                        autoFocus
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-neutral-800 focus:border-[#F37A1F] rounded-2xl text-xs sm:text-sm font-black text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveIgnModal();
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 text-[10px] font-semibold text-purple-900 dark:text-purple-300 leading-relaxed">
                    Please verify your exact character tag inside the game. Prizes are credited only to matching IGNs.
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setIgnModalOpen(false)}
                      className="flex-1 py-3.5 bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-zinc-300 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] active:scale-[0.97] transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveIgnModal}
                      className="flex-1 py-3.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] shadow-[0_8px_20px_rgba(243,122,32,0.35)] active:scale-[0.97] transition-all"
                    >
                      Save IGN
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================================= */}
        {/* MODAL: REGISTRATION CONFIRMED SUCCESS                                     */}
        {/* ========================================================================= */}
        <AnimatePresence>
          {showSuccessModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75 backdrop-blur-sm"
              onClick={() => onPageChange(Page.HOME)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[28px] p-6 text-slate-900 dark:text-white shadow-2xl text-center relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => onPageChange(Page.HOME)}
                  className="absolute top-5 right-5 w-9 h-9 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-2xl flex items-center justify-center"
                >
                  <X size={18} />
                </button>

                <div className="relative mb-5 flex items-center justify-center mt-2">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-500 flex items-center justify-center text-white shadow-[0_10px_25px_rgba(16,185,129,0.4)]">
                    <Check size={34} className="stroke-[3.5]" />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/25 rounded-full text-[9.5px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.18em] mb-2">
                  <Sparkles size={11} />
                  <span>REGISTRATION CONFIRMED</span>
                </div>

                <h2 className="text-lg font-black italic uppercase tracking-tight text-slate-900 dark:text-white mb-1">
                  Match <span className="text-[#FF9A4D]">Joined!</span>
                </h2>
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-5 px-2">
                  Your slot in <span className="text-slate-900 dark:text-white font-bold">{matchData.title || 'BR SOLO BATTLE'}</span> is locked.
                </p>

                <div className="bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-2xl p-4 text-left space-y-2.5 mb-6 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/5 pb-2">
                    <span className="text-slate-400 dark:text-zinc-500 font-black text-[10px] uppercase tracking-wider">CONTEST</span>
                    <span className="font-black italic text-slate-900 dark:text-white truncate max-w-[170px]">{matchData.title || 'BR BATTLE'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/5 pb-2">
                    <span className="text-slate-400 dark:text-zinc-500 font-black text-[10px] uppercase tracking-wider">BOOKED SLOT</span>
                    <span className="font-black italic text-[#F37A1F] dark:text-purple-400">#{selectedSlots.join(', #')}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/5 pb-2">
                    <span className="text-slate-400 dark:text-zinc-500 font-black text-[10px] uppercase tracking-wider">IN-GAME NAME</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 truncate max-w-[150px]">{inGameName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 dark:text-zinc-500 font-black text-[10px] uppercase tracking-wider">ENTRY PAID</span>
                    <span className="font-black italic text-slate-900 dark:text-white">{totalAmount === 0 ? 'FREE' : `₹${totalAmount}`}</span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    onClick={() => onPageChange(Page.HOME)}
                    className="w-full py-3.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-2xl font-black text-xs uppercase tracking-[0.16em] shadow-[0_8px_20px_rgba(243,122,32,0.35)] active:scale-[0.97] transition-all"
                  >
                    GO TO HOME
                  </button>

                  <button
                    onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
                    className="w-full py-3.5 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-zinc-300 rounded-2xl font-black text-xs uppercase tracking-[0.16em] active:scale-[0.97] transition-all"
                  >
                    VIEW CONTESTS
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ==========================================
  // STEP 1: SELECT MATCH POSITION (SLOT SELECTION PAGE)
  // ==========================================
  const positions = Array.from({ length: totalSlots }, (_, i) => i + 1);
  const availableCount = Math.max(0, totalSlots - takenSlots.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-transparent text-white flex flex-col justify-between max-w-lg mx-auto select-none pb-28 transition-colors duration-300"
    >
      <div>
        {/* 1. Top App Header */}
        <div className="pt-5 pb-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => onPageChange(Page.MATCH_DETAILS, matchId)}
              className="w-10 h-10 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-zinc-300 active:scale-[0.97] transition-all shadow-sm shrink-0"
              aria-label="Back to match details"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            <div className="min-w-0">
              <h1 className="text-[20px] sm:text-[22px] font-black italic uppercase tracking-tight leading-none truncate">
                <span className="text-slate-900 dark:text-white">SELECT</span>{' '}
                <span className="text-[#FF9A4D]">SLOT</span>
              </h1>
              <p className="text-[9px] font-bold italic uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500 mt-1 truncate">
                {matchData.title || 'BR SOLO BATTLE'}
              </p>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-full bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 shadow-sm flex items-center gap-1.5 shrink-0">
            <Trophy className="w-3.5 h-3.5 text-[#FF9A4D] stroke-[2.2]" />
            <span className="text-[11px] font-black italic text-slate-900 dark:text-white tabular-nums">
              {selectedSlots.length}/{maxTeamSlots}
            </span>
          </div>
        </div>

        {/* 2. Slot Summary & Legend Bar */}
        <div className="px-4 pt-2 space-y-4">
          <div className="bg-[#141414] rounded-[28px] p-4 border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Available Legend */}
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-slate-100 dark:bg-[#1a1a1a] border border-slate-300 dark:border-white/15" />
                <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                  OPEN ({availableCount})
                </span>
              </div>

              {/* Selected Legend */}
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-[#F37A1F] shadow-[0_0_8px_rgba(243,122,32,0.5)]" />
                <span className="text-[9.5px] font-black uppercase tracking-wider text-[#F37A1F] dark:text-purple-400">
                  SELECTED ({selectedSlots.length})
                </span>
              </div>

              {/* Occupied Legend */}
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-slate-200 dark:bg-zinc-800 opacity-60" />
                <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  BOOKED ({takenSlots.length})
                </span>
              </div>
            </div>

            <span className="text-[10px] font-black italic uppercase text-emerald-500">
              {entryFeePerSlot === 0 ? 'FREE' : `₹${entryFeePerSlot}/SLOT`}
            </span>
          </div>

          {/* 3. Positions Grid Card */}
          <div className="bg-white dark:bg-[#141414] rounded-[30px] p-5 border border-slate-100 dark:border-white/5 shadow-[0_12px_35px_rgba(15,23,42,0.06)] dark:shadow-none">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/5">
              <div>
                <h2 className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                  Choose Your <span className="text-[#FF9A4D]">Position</span>
                </h2>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-500 mt-0.5">
                  {maxTeamSlots > 1 ? `Select up to ${maxTeamSlots} slots for ${matchData.mode}` : 'Select 1 slot for Solo entry'}
                </p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-[rgba(243,122,32,0.15)] dark:bg-purple-500/15 text-[#F37A1F] dark:text-purple-400 text-[10px] font-black italic uppercase">
                {totalSlots} SLOTS
              </span>
            </div>

            {/* 4-Column Slot Grid */}
            <div className="grid grid-cols-4 gap-2.5 max-h-[56vh] overflow-y-auto no-scrollbar pr-0.5">
              {positions.map((pos) => {
                const isOccupied = takenSlots.includes(pos);
                const isSelected = selectedSlots.includes(pos);

                return (
                  <button
                    type="button"
                    key={pos}
                    disabled={isOccupied || isUserJoined}
                    onClick={() => toggleSlot(pos)}
                    className={`flex items-center justify-between px-3 py-3 rounded-2xl border text-left transition-all ${
                      isOccupied
                        ? 'bg-slate-100/80 dark:bg-zinc-900/60 border-slate-200/60 dark:border-white/5 opacity-45 cursor-not-allowed'
                        : isSelected
                        ? 'bg-[#F37A1F] border-[#F37A1F] text-black shadow-[0_6px_18px_rgba(243,122,32,0.38)] scale-[1.02]'
                        : 'bg-slate-50/90 dark:bg-[#1a1a1a] border-slate-200/80 dark:border-white/10 hover:border-purple-500/40 text-slate-800 dark:text-zinc-200 active:scale-[0.97]'
                    }`}
                  >
                    <span
                      className={`text-xs font-black italic tabular-nums ${
                        isOccupied
                          ? 'text-slate-400 dark:text-zinc-600'
                          : isSelected
                          ? 'text-white'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      #{pos}
                    </span>

                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                        isOccupied
                          ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400'
                          : isSelected
                          ? 'bg-white text-[#F37A1F]'
                          : 'bg-white dark:bg-zinc-900 border border-slate-300 dark:border-white/15'
                      }`}
                    >
                      {isSelected && <Check size={12} className="stroke-[3.5]" />}
                      {isOccupied && <X size={11} className="stroke-[2.5]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Fixed Bottom Proceed Bar */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto p-4 bg-white/90 dark:bg-[#050505]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/10 z-40">
        <button
          type="button"
          onClick={handleProceedToSummary}
          disabled={selectedSlots.length === 0 || isUserJoined}
          className={`w-full h-14 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-[0.16em] transition-all flex items-center justify-center gap-2 ${
            selectedSlots.length > 0 && !isUserJoined
              ? 'bg-[#F37A1F] hover:bg-[#D9660F] text-black shadow-[0_8px_25px_rgba(243,122,32,0.4)] active:scale-[0.97] cursor-pointer'
              : 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed'
          }`}
        >
          {isUserJoined ? (
            <span>ALREADY REGISTERED IN THIS CONTEST</span>
          ) : selectedSlots.length > 0 ? (
            <>
              <Swords size={17} className="stroke-[2.4]" />
              <span>
                CONTINUE WITH SLOT #{selectedSlots.join(', #')} •{' '}
                {totalAmount === 0 ? 'FREE' : `₹${totalAmount}`}
              </span>
            </>
          ) : (
            <span>SELECT A SLOT TO CONTINUE</span>
          )}
        </button>
      </div>
    </motion.div>
  );
}
