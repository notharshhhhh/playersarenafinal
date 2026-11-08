import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Sword, TrendingUp, History, Gamepad2, Loader2, IndianRupee } from 'lucide-react';
import { Page, User, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';

interface GameStatsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function GameStats({ user, onPageChange }: GameStatsProps) {
  const [history, setHistory] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user.id) {
        setLoading(false);
        return;
      }
      try {
        const q = query(
          collection(db, 'registrations'),
          where('userId', '==', user.id),
          orderBy('joinedAt', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);

        const tournamentPromises = snap.docs.map(async (pDoc) => {
          const tData = pDoc.data();
          const tDoc = await getDoc(doc(db, 'matches', tData.tournamentId));
          if (tDoc.exists()) {
            return { id: tDoc.id, ...tDoc.data() } as Tournament;
          }
          const legacyTDoc = await getDoc(doc(db, 'tournaments', tData.tournamentId));
          return { id: legacyTDoc.id, ...legacyTDoc.data() } as Tournament;
        });

        const tournaments = await Promise.all(tournamentPromises);
        setHistory(tournaments.filter((t) => t.title));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'registrations');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user.id]);

  const stats = user.stats || { matchesPlayed: 0, totalWins: 0, totalKills: 0, totalWinnings: 0 };
  const matchesPlayed = stats.matchesPlayed || 0;
  const totalWins = stats.totalWins || 0;
  const totalKills = stats.totalKills || 0;
  const totalWinnings = stats.totalWinnings || 0;

  const winRate = matchesPlayed > 0 ? ((totalWins / matchesPlayed) * 100).toFixed(1) : '0.0';

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#f8f9fc] dark:bg-transparent min-h-screen text-slate-900 dark:text-white transition-colors duration-300">
      <div className="px-5 py-7">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-10 h-10 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-2xl text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center shadow-xs transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight uppercase text-slate-900 dark:text-white leading-none">
              Game <span className="text-purple-600 dark:text-purple-500">Statistics</span>
            </h2>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-neutral-500 mt-1">
              Lifetime Performance Data
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard
            icon={Gamepad2}
            label="Played"
            value={matchesPlayed.toString()}
            color="text-purple-600 dark:text-purple-400"
            bgColor="bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20"
          />
          <StatCard
            icon={Trophy}
            label="Wins"
            value={totalWins.toString()}
            color="text-amber-500"
            bgColor="bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20"
          />
          <StatCard
            icon={Sword}
            label="Kills"
            value={totalKills.toString()}
            color="text-rose-500"
            bgColor="bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20"
          />
          <StatCard
            icon={TrendingUp}
            label="Win Rate"
            value={`${winRate}%`}
            color="text-emerald-500"
            bgColor="bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20"
          />
        </div>

        {/* Lifetime Earnings Card */}
        <div className="p-6 bg-[#141414] border border-white/[0.06] rounded-[20px] shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none mb-7">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-neutral-500">
              Lifetime Winnings
            </span>
            <IndianRupee size={16} className="text-emerald-500" />
          </div>
          <div className="text-3xl font-black italic text-slate-900 dark:text-white leading-none tabular-nums">
            ₹{(totalWinnings || 0).toLocaleString()}
          </div>
        </div>

        {/* Match History */}
        <div className="space-y-3.5">
          <div className="flex items-center gap-2.5 px-1">
            <History size={15} className="text-purple-600 dark:text-purple-400" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
              Match History
            </h3>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <Loader2 className="text-purple-600 animate-spin mb-3" size={28} />
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500">
                Retrieving battle logs...
              </p>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 border-dashed rounded-[20px] flex flex-col items-center justify-center text-center px-8">
              <History size={28} className="text-slate-300 dark:text-neutral-700 mb-3" />
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500">
                No match history found
              </p>
            </div>
          ) : (
            history.map((t, idx) => (
              <div
                key={t.id + idx}
                className="p-4 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800/90 rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-none flex items-center gap-4"
              >
                <div className="w-12 h-12 bg-slate-50 dark:bg-neutral-800/70 rounded-2xl border border-slate-100 dark:border-neutral-800 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Gamepad2 size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
                    {t.title}
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-[0.12em] mt-0.5">
                    {t.section} · {t.displayId || '#MATCH'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">
                    Entry
                  </span>
                  <p className="text-sm font-black italic text-slate-900 dark:text-white tabular-nums">
                    ₹{t.entryFee}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bgColor }: any) {
  return (
    <div className="p-5 bg-[#141414] border border-white/[0.06] rounded-[20px] shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none">
      <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${bgColor} ${color} mb-3.5`}>
        <Icon size={18} />
      </div>
      <div className="text-xl font-black italic text-slate-900 dark:text-white leading-none tabular-nums">
        {value}
      </div>
      <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500 mt-1.5 leading-none">
        {label}
      </div>
    </div>
  );
}
