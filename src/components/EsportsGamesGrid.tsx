import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Page, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Gamepad2, Sparkles, Loader2 } from 'lucide-react';
import SafeImage from './SafeImage';

export interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface EsportsGamesGridProps {
  matches: Tournament[];
  onPageChange: (page: Page, param?: string) => void;
}

export default function EsportsGamesGrid({ matches, onPageChange }: EsportsGamesGridProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'tournament' | 'solo'>('all');
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedModes = snapshot.docs.map((docSnap) => ({ ...docSnap.data() } as GameMode));
        setModes(fetchedModes);
        setLoading(false);
      },
      (error) => {
        console.warn('Error listening to game modes on Home:', error);
        handleFirestoreError(error, OperationType.LIST, 'gameModes');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredModes = modes.filter((mode) => {
    if (activeTab === 'all') return true;

    const titleUpper = (mode.title || '').toUpperCase();
    const subUpper = (mode.subtitle || '').toUpperCase();
    const isSolo =
      titleUpper.includes('SOLO') ||
      titleUpper.includes('1V1') ||
      subUpper.includes('SOLO') ||
      subUpper.includes('1V1');

    if (activeTab === 'solo') {
      return isSolo;
    }
    if (activeTab === 'tournament') {
      return !isSolo;
    }
    return true;
  });

  return (
    <section className="px-5 mt-7 mb-6">
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
          Esports Arenas &amp; Modes
        </span>
        <button
          onClick={() => onPageChange(Page.GAME_MODES, 'freefire')}
          className="text-[9px] font-black uppercase text-purple-600 dark:text-purple-400 hover:underline tracking-[0.15em] transition-colors"
        >
          View All
        </button>
      </div>

      {/* Segmented Filter Tabs */}
      {modes.length > 0 && (
        <div className="w-full bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800/90 p-1.5 rounded-2xl flex items-center mb-4 shadow-[0_2px_12px_rgba(15,23,42,0.03)] dark:shadow-none select-none">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
              activeTab === 'all'
                ? 'bg-purple-600 text-black shadow-sm'
                : 'text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Modes
          </button>
          <button
            onClick={() => setActiveTab('tournament')}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
              activeTab === 'tournament'
                ? 'bg-purple-600 text-black shadow-sm'
                : 'text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Squad / Duo
          </button>
          <button
            onClick={() => setActiveTab('solo')}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
              activeTab === 'solo'
                ? 'bg-purple-600 text-black shadow-sm'
                : 'text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Solo
          </button>
        </div>
      )}

      {/* Dynamic 3-Column Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[1/1.2] rounded-[20px] bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 animate-pulse flex items-center justify-center"
            >
              <Loader2 size={16} className="animate-spin text-purple-500/40" />
            </div>
          ))}
        </div>
      ) : modes.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-[#141414] border border-dashed border-slate-200 dark:border-neutral-800 rounded-[20px] p-5">
          <Gamepad2 size={32} className="mx-auto mb-2 text-slate-400 dark:text-neutral-600" />
          <p className="text-xs font-black text-slate-700 dark:text-neutral-300 uppercase tracking-tight">
            No Game Modes Added Yet
          </p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mt-1 mb-4">
            Modes added in Admin Panel will appear here
          </p>
          <button
            onClick={() => onPageChange(Page.TOURNAMENTS, 'freefire')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-md shadow-purple-600/20"
          >
            <Sparkles size={12} /> Explore Tournaments
          </button>
        </div>
      ) : filteredModes.length === 0 ? (
        <div className="text-center py-8 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[20px] p-4">
          <p className="text-xs font-black text-slate-500 dark:text-neutral-400 uppercase tracking-wider">
            No modes found in this category
          </p>
          <button
            onClick={() => setActiveTab('all')}
            className="mt-2 text-[10px] text-purple-600 dark:text-purple-400 font-black uppercase underline"
          >
            Show All Modes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filteredModes.map((mode, idx) => {
            const activeMatchesCount = matches.filter(
              (m) =>
                m.status === 'upcoming' &&
                (m.modeId === mode.id ||
                  m.mode?.toLowerCase() === mode.title.toLowerCase() ||
                  m.section?.toLowerCase() === (mode.category || mode.subtitle || '').toLowerCase())
            ).length;

            return (
              <motion.div
                key={mode.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.2 }}
                whileHover={{ scale: 1.02, transition: { duration: 0.15 } }}
                whileTap={{ scale: 0.96 }}
                onClick={() =>
                  onPageChange(Page.TOURNAMENTS, `${mode.gameId || 'freefire'}?mode=${mode.id}`)
                }
                className="group relative rounded-[20px] overflow-hidden border border-slate-100 dark:border-neutral-800 bg-white dark:bg-[#141414] shadow-[0_4px_20px_rgba(15,23,42,0.05)] dark:shadow-none flex flex-col justify-end aspect-[1/1.22] cursor-pointer select-none"
              >
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                  <SafeImage
                    src={
                      mode.image ||
                      'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop'
                    }
                    alt={mode.title}
                    className="w-full h-full"
                    imgClassName="group-hover:scale-110 transition-transform duration-500 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                </div>

                {activeMatchesCount > 0 && (
                  <div className="absolute top-2 left-2 z-20 px-2 py-0.5 bg-emerald-500/95 backdrop-blur-xs rounded-lg text-[8px] font-black uppercase tracking-wider text-white shadow-sm">
                    {activeMatchesCount} Live
                  </div>
                )}

                <div className="relative z-10 mt-auto w-full bg-white/95 dark:bg-[#141414]/95 backdrop-blur-xs border-t border-slate-100 dark:border-neutral-800 py-2 px-1.5 text-center">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-tight text-slate-900 dark:text-white truncate block">
                    {mode.title}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
