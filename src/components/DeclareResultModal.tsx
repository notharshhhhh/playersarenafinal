import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, X, Users, Loader2, CheckCircle2, AlertTriangle, 
  DollarSign, Swords, RefreshCw, UserCheck
} from 'lucide-react';
import { Tournament, User } from '../types';
import { db } from '../lib/firebase';
import { 
  doc, getDoc, runTransaction, serverTimestamp, 
  collection, increment, setDoc, updateDoc 
} from 'firebase/firestore';
import { usePopup } from './PopupProvider';
import { readStaffSettlement, writeStaffSettlement } from '../services/staffMatchService';

interface DeclareResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Tournament | null;
  currentUser?: User | null;
  onSuccess?: () => void;
}

export default function DeclareResultModal({
  isOpen,
  onClose,
  match,
  currentUser,
  onSuccess
}: DeclareResultModalProps) {
  const { showSuccess, showError, showConfirm } = usePopup();

  const [playerResults, setPlayerResults] = useState<Record<string, number>>({});
  const [playerPositionResults, setPlayerPositionResults] = useState<Record<string, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [isUpdateMode, setIsUpdateMode] = useState(false);

  // Load existing results if the match was already completed or has declared results
  useEffect(() => {
    if (!isOpen || !match?.id) return;

    setPlayerResults({});
    setPlayerPositionResults({});
    setIsUpdateMode(false);

    const checkExistingResults = async () => {
      setLoadingExisting(true);
      try {
        const resultSnap = await getDoc(doc(db, 'matchResults', match.id));
        if (resultSnap.exists()) {
          setIsUpdateMode(true);
          const data = resultSnap.data();
          const existingList: any[] = data.results || [];
          
          const scoresMap: Record<string, number> = {};
          const posMap: Record<string, number> = {};

          existingList.forEach((item) => {
            const key = `${item.userId}_${item.slot}`;
            scoresMap[key] = Number(item.rankOrKills || 0);
            if (item.positionRank) {
              posMap[key] = Number(item.positionRank);
            }
          });

          setPlayerResults(scoresMap);
          setPlayerPositionResults(posMap);
        }
      } catch (err) {
        console.warn('Could not load existing match results:', err);
      } finally {
        setLoadingExisting(false);
      }
    };

    checkExistingResults();
  }, [isOpen, match?.id]);

  if (!isOpen || !match) return null;

  const players = match.players || [];
  const isBattleRoyale = match.section === 'Battle Royale';
  const isPerKill = match.prizeType === 'perKill';

  // Calculate live prize for a given player
  const calculatePlayerWinnings = (userId: string, slot?: number) => {
    const playerKey = `${userId}_${slot}`;
    const score = playerResults[playerKey] || 0;
    const rank = playerPositionResults[playerKey] || 0;

    let killsWinning = 0;
    let posWinning = 0;
    let total = 0;

    if (isBattleRoyale) {
      if (isPerKill) {
        killsWinning = score * (match.perKillAmount || 0);
        posWinning = match.positionPrizeDistribution?.[rank] || 0;
        total = killsWinning + posWinning;
      } else {
        // Survival mode
        total = match.prizeDistribution?.[score] || 0;
      }
    } else {
      // Clash Squad or Lone Wolf
      if (score === 1) {
        total = match.prizePool || 0;
      }
    }

    return { killsWinning, posWinning, total };
  };

  const handleSubmit = async () => {
    if (!match?.id) return;

    if (players.length === 0) {
      showError('NO PLAYERS', 'Cannot declare results for a match with no registered players.');
      return;
    }

    const confirmed = await showConfirm({
      variant: 'warning',
      title: isUpdateMode ? 'UPDATE MATCH RESULTS?' : 'DECLARE MATCH RESULTS?',
      message: isUpdateMode
        ? 'This will update the published leaderboard and scores for this tournament.'
        : `This will finalize Match #${match.matchNumber || match.id.slice(0, 6)}, credit player wallet winnings, and publish the official tournament results.`,
      confirmText: isUpdateMode ? 'UPDATE RESULTS' : 'FINALIZE & CREDIT',
      cancelText: 'CANCEL'
    });

    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await runTransaction(db, async (tx) => {
            const matchId = match.id;

            // 0. READ: live match state + staff settlement context (claim lock, one-time payment)
            const liveSnap = await tx.get(doc(db, 'matches', matchId));
            const live: any = liveSnap.exists() ? liveSnap.data() : {};
            const isAdminUser = Boolean(currentUser?.isAdmin);
            const staffId = currentUser?.id || '';
            if (live.status === 'cancelled') {
              throw new Error('This match was terminated and is permanently locked.');
            }
            const alreadyDeclared = Boolean(live.resultsDeclared) || live.status === 'completed';
            if (!isAdminUser) {
              if (alreadyDeclared) throw new Error('Results are already submitted. Only an admin can edit them now.');
              if (live.claimedBy !== staffId) throw new Error('Only the staff who claimed this match can submit results.');
            }
            const staffSettlement = alreadyDeclared ? null : await readStaffSettlement(tx, matchId, live.claimedBy);

            // 1. READ: Fetch all user documents
            const userDocs: { ref: any; snap: any; userId: string; player: any }[] = [];
            for (const p of players) {
              if (!p.userId) continue;
              const uRef = doc(db, 'users', p.userId);
              const uSnap = await tx.get(uRef);
              userDocs.push({ ref: uRef, snap: uSnap, userId: p.userId, player: p });
            }

            // 2. WRITE: Apply wallet credits and statistics (only if newly declaring or crediting)
            for (const { ref: uRef, snap: uSnap, userId, player } of userDocs) {
              // Never credit twice: wallet/stat updates only happen on the first declaration
              if (uSnap.exists() && !alreadyDeclared) {
                const { total, killsWinning } = calculatePlayerWinnings(userId, player.slot);
                const playerKey = `${userId}_${player.slot}`;
                const kills = playerResults[playerKey] || 0;
                const posRank = playerPositionResults[playerKey] || 0;

                const updates: any = {
                  'stats.matchesPlayed': increment(1)
                };

                if (total > 0) {
                  updates['wallet.winnings'] = increment(total);
                  updates['stats.totalWinnings'] = increment(total);

                  // Create transaction record
                  const transCol = collection(db, 'transactions');
                  const transRef = doc(transCol);
                  tx.set(transRef, {
                    userId,
                    type: 'win',
                    amount: total,
                    matchId,
                    status: 'completed',
                    title: `WON IN MATCH: ${match.displayId || `#${match.matchNumber || '000'}`}`,
                    createdAt: serverTimestamp(),
                    processedBy: currentUser?.username || 'Staff'
                  });
                }

                if (isPerKill) {
                  updates['stats.totalKills'] = increment(kills);
                  if (Number(posRank) === 1) {
                    updates['stats.totalWins'] = increment(1);
                  }
                } else {
                  if (Number(kills) === 1) {
                    updates['stats.totalWins'] = increment(1);
                  }
                }

                tx.update(uRef, updates);
              }
            }

            // 3. Build Results Array
            const resultsArray = players.map(player => {
              const playerKey = `${player.userId}_${player.slot}`;
              const score = playerResults[playerKey] || 0;
              const { killsWinning, posWinning, total } = calculatePlayerWinnings(player.userId, player.slot);

              return {
                userId: player.userId,
                slot: player.slot,
                username: player.username,
                ign: player.ign || player.username,
                rankOrKills: score,
                positionRank: playerPositionResults[playerKey] || null,
                winningAmount: total,
                killsWinning,
                positionWinning: posWinning
              };
            });

            // 4. Save results to /matchResults/{matchId}
            const resultsRef = doc(db, 'matchResults', matchId);
            tx.set(resultsRef, {
              matchId,
              matchTitle: match.title,
              matchNumber: match.matchNumber || null,
              section: match.section,
              prizeType: match.prizeType || null,
              results: resultsArray,
              declaredBy: currentUser?.id || 'staff',
              declaredByName: currentUser?.username || 'Staff Member',
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp()
            }, { merge: true });

            // 5. Update match status to 'completed'
            const matchRef = doc(db, 'matches', matchId);
            const matchUpdate: any = {
              status: 'completed',
              resultsDeclared: true,
              resultsDeclaredAt: serverTimestamp()
            };
            if (!alreadyDeclared) {
              // Claimer gets 100% of configured payment (one time only)
              const staffPaid = writeStaffSettlement(
                tx, staffSettlement, matchId, live, 'success',
                { id: staffId, name: currentUser?.username || 'Staff' }
              );
              matchUpdate.settlement = 'success';
              matchUpdate.settledAt = serverTimestamp();
              matchUpdate.staffPaid = staffPaid;
            }
            tx.update(matchRef, matchUpdate);
          });

          showSuccess('RESULTS PUBLISHED!', 'Tournament results have been successfully declared and verified.');
          if (onSuccess) onSuccess();
          onClose();
        } catch (err: any) {
          console.error('Failed to submit results:', err);
          showError('SUBMISSION FAILED', err.message || 'An error occurred while saving match results.');
        } finally {
          setIsProcessing(false);
        }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-6 shadow-2xl max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <Trophy size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black italic uppercase text-slate-900 dark:text-white">
                  {isUpdateMode ? 'Update Tournament Results' : 'Declare Tournament Results'}
                </h3>
                {isUpdateMode && (
                  <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    Already Declared
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-wider mt-0.5">
                #{match.matchNumber || match.id.slice(0, 6)} • {match.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
          {/* Match Info Summary Card */}
          <div className="p-3.5 bg-slate-50 dark:bg-black/40 rounded-2xl border border-slate-200/80 dark:border-neutral-800 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Mode</p>
              <p className="text-xs font-black text-slate-900 dark:text-white italic mt-0.5">{match.mode || match.modeId}</p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Prize Rule</p>
              <p className="text-xs font-black text-purple-600 dark:text-purple-400 italic mt-0.5">
                {isBattleRoyale ? (isPerKill ? `₹${match.perKillAmount || 0}/Kill` : 'Rank Split') : 'Winner Takes All'}
              </p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Prize Pool</p>
              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 italic mt-0.5">₹{match.prizePool}</p>
            </div>
          </div>

          {/* Player Result Inputs */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400">
                Registered Players ({players.length})
              </span>
              <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-500">
                {isBattleRoyale ? (isPerKill ? 'Enter Kills & Rank' : 'Enter Survival Rank') : 'Select Winner (Rank 1)'}
              </span>
            </div>

            {loadingExisting ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Loader2 size={20} className="animate-spin text-purple-600" />
                <span className="text-[10px] font-black uppercase tracking-wider">Loading saved scores...</span>
              </div>
            ) : players.length === 0 ? (
              <div className="py-12 text-center bg-slate-50 dark:bg-black/30 rounded-2xl border border-slate-200 dark:border-neutral-800 space-y-2">
                <Users size={28} className="mx-auto text-slate-300 dark:text-neutral-600" />
                <p className="text-xs font-black uppercase text-slate-500 dark:text-neutral-400">
                  No participants registered
                </p>
                <p className="text-[10px] text-slate-400">Cannot declare scores on empty tournament.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {players.map((p) => {
                  const playerKey = `${p.userId}_${p.slot}`;
                  const score = playerResults[playerKey] ?? '';
                  const rank = playerPositionResults[playerKey] || 0;
                  const { total, killsWinning, posWinning } = calculatePlayerWinnings(p.userId, p.slot);

                  return (
                    <div
                      key={playerKey}
                      className="p-3.5 bg-slate-50 dark:bg-neutral-800/60 rounded-2xl border border-slate-200/80 dark:border-neutral-700/60 space-y-2.5 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-mono font-black shrink-0">
                            #{p.slot || 1}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-black italic uppercase text-slate-900 dark:text-white truncate">
                              {p.ign || p.username}
                            </h4>
                            <p className="text-[8px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest truncate">
                              {p.username}
                            </p>
                          </div>
                        </div>

                        {total > 0 && (
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 italic">
                              +₹{total}
                            </span>
                            <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 block">
                              Total Prize
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Inputs */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 dark:border-neutral-700/40">
                        {/* Score / Kills Input */}
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 block mb-1">
                            {isBattleRoyale ? (isPerKill ? 'Kills' : 'Rank Position') : 'Rank (1 = Winner)'}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={score}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                setPlayerResults(prev => ({ ...prev, [playerKey]: val }));
                              }}
                              className="w-full px-3 py-1.5 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                            />
                            {isPerKill && killsWinning > 0 && (
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-500">
                                ₹{killsWinning}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rank Selector for perKill tournaments with position distribution */}
                        {isPerKill ? (
                          <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 block mb-1">
                              Placement Rank
                            </label>
                            <div className="relative">
                              <select
                                value={rank}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setPlayerPositionResults(prev => ({ ...prev, [playerKey]: val }));
                                }}
                                className="w-full px-3 py-1.5 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                              >
                                <option value={0}>No Placement Prize</option>
                                {Array.from({ length: match.positionWinnersCount || 3 }).map((_, idx) => (
                                  <option key={idx + 1} value={idx + 1}>
                                    Rank #{idx + 1} {match.positionPrizeDistribution?.[idx + 1] ? `(+₹${match.positionPrizeDistribution[idx + 1]})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-end">
                            {score === 1 && (
                              <div className="w-full py-1.5 px-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-center">
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                                  <CheckCircle2 size={12} />
                                  <span>Winner (₹{match.prizePool})</span>
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing || players.length === 0}
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-purple-600/30 transition-all flex items-center justify-center gap-2 active:scale-[0.97]"
          >
            {isProcessing ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Processing Credits...</span>
              </>
            ) : (
              <>
                <Trophy size={15} />
                <span>{isUpdateMode ? 'Update & Save Results' : 'Finalize & Declare Results'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
