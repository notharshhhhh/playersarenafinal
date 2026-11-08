import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronLeft, Loader2, Gamepad2 } from 'lucide-react';
import { Page, Game } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { GAME_MODES_DATA, GAMES } from '../constants';
import { GameMode } from './AdminModes';
import SafeImage from '../components/SafeImage';

interface GameModesProps {
  onPageChange: (page: Page, id?: string) => void;
}

export default function GameModes({ onPageChange }: GameModesProps) {
  const { gameId } = useParams<{ gameId?: string }>();
  const activeGameId = gameId || 'freefire';

  const [modes, setModes] = useState<GameMode[]>([]);
  const [gameInfo, setGameInfo] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch game info
    const fetchGame = async () => {
      try {
        const snap = await getDoc(doc(db, 'games', activeGameId));
        if (snap.exists()) {
          setGameInfo({ id: snap.id, ...snap.data() } as Game);
        } else {
          const fallbackGame = GAMES.find((g) => g.id === activeGameId);
          setGameInfo(
            fallbackGame || {
              id: activeGameId,
              title: activeGameId.replace(/_/g, ' ').toUpperCase(),
              image: '',
            }
          );
        }
      } catch (e) {
        console.warn('Error fetching game details:', e);
      }
    };
    fetchGame();

    // Listen to gameModes added by Admin for this game (sorted client-side so docs without order are never dropped)
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'gameModes'),
      (snapshot) => {
        const allModes = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as GameMode));
        const filtered = allModes
          .filter((m) => (m.gameId || 'freefire').toLowerCase() === activeGameId.toLowerCase())
          .sort((a, b) => Number(a.order ?? 99) - Number(b.order ?? 99));

        setModes(filtered);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'gameModes');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeGameId]);

  const arenaTitle = gameInfo?.title
    ? `${gameInfo.title.toUpperCase()} ARENA`
    : `${activeGameId.replace(/_/g, ' ').toUpperCase()} ARENA`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#f4f4f9] dark:bg-transparent text-slate-900 dark:text-white pb-28 select-none transition-colors duration-300"
    >
      {/* Top Header matching 3rd reference image */}
      <div className="pt-6 pb-2 px-5 flex items-center justify-between relative">
        <button
          onClick={() => onPageChange(Page.HOME)}
          className="w-11 h-11 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/10 shadow-sm flex items-center justify-center text-slate-800 dark:text-white active:scale-[0.97] transition-all z-10"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
        </button>

        <div className="absolute inset-x-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] font-black uppercase tracking-[0.28em] text-[#FF9A4D]">
            {arenaTitle}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-500">
              SERVERS OPTIMAL
            </span>
          </div>
        </div>

        <div className="w-11" />
      </div>

      {/* Hero Title Block: CHOOSE YOUR MODE */}
      <div className="text-center px-5 pt-4 pb-6">
        <h1 className="text-3xl sm:text-[33px] font-black italic uppercase tracking-tight leading-none">
          <span className="text-slate-900 dark:text-white">CHOOSE YOUR </span>
          <span className="text-[#FF9A4D]">MODE</span>
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-zinc-400 mt-2.5 max-w-[260px] mx-auto leading-relaxed">
          SELECT A CATEGORY TO VIEW AVAILABLE TOURNAMENTS
        </p>
      </div>

      {/* 3-Column Mode Grid matching 3rd reference image */}
      <div className="px-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-[#F37A1F] animate-spin" />
            <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
              Loading Tournaments...
            </p>
          </div>
        ) : modes.length === 0 ? (
          <div className="bg-[#141414] rounded-[28px] p-10 text-center border border-slate-200/70 dark:border-white/5 shadow-sm">
            <Gamepad2 className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white mb-1">
              No Tournament Modes Added
            </h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
              Admin can add modes for this game from the Admin Panel.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {modes.map((mode) => (
              <motion.button
                key={`${mode.gameId}_${mode.id}`}
                whileTap={{ scale: 0.95 }}
                onClick={() => onPageChange(Page.TOURNAMENTS, `${activeGameId}__${mode.id}`)}
                className="relative aspect-[1/1.08] rounded-[22px] overflow-hidden bg-slate-100 dark:bg-[#050505] border border-slate-200/80 dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.4)] group text-center flex flex-col justify-end"
              >
                <SafeImage
                  src={
                    mode.image ||
                    'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop'
                  }
                  alt={mode.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                {/* Dark bottom vignette for crisp text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />

                <div className="relative z-10 p-2.5 pb-3 w-full flex flex-col items-center justify-end">
                  <span className="text-[11px] font-black italic uppercase tracking-tight text-white leading-tight line-clamp-1 drop-shadow">
                    {mode.title}
                  </span>
                  <span className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-zinc-300/90 mt-0.5 line-clamp-1">
                    {mode.subtitle || mode.category || 'TOURNAMENT'}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
