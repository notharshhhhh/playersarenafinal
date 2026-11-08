import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  ShieldCheck,
  Play,
  Gamepad2,
  Wallet,
  Crown,
  Headphones,
  ChevronRight,
  Megaphone,
  AlertTriangle,
} from 'lucide-react';
import { Page, User, Tournament, Banner, Game } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import { GAMES } from '../constants';

import HomeHeader from '../components/HomeHeader';
import HeroBannerCarousel from '../components/HeroBannerCarousel';
import RulesModal from '../components/RulesModal';
import NotificationsModal from '../components/NotificationsModal';
import SupportModal from '../components/SupportModal';
import SafeImage from '../components/SafeImage';
import { useAppBranding } from '../hooks/useAppBranding';

interface HomeProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
}

export interface AnnouncementItem {
  id: string;
  text: string;
  link?: string;
  isActive: boolean;
  createdAt?: any;
}

const DEFAULT_ANNOUNCEMENTS: AnnouncementItem[] = [
  {
    id: 'default_fairplay',
    text: 'FOLLOW THE RULES - ENJOY FAIR GAMEPLAY',
    link: 'rules',
    isActive: true,
  },
];

export default function Home({ user, onPageChange, joinedMatchIds }: HomeProps) {
  const { renderSplitAppName } = useAppBranding();
  const [selectedPrizeMatch, setSelectedPrizeMatch] = useState<Tournament | null>(null);
  const [selectedResultsMatch, setSelectedResultsMatch] = useState<Tournament | null>(null);
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);

  const [isGeneralRulesOpen, setIsGeneralRulesOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  useModalBackHandler(!!selectedPrizeMatch, () => setSelectedPrizeMatch(null));
  useModalBackHandler(!!selectedResultsMatch, () => setSelectedResultsMatch(null));
  useModalBackHandler(!!selectedRulesMatch || isGeneralRulesOpen, () => {
    setSelectedRulesMatch(null);
    setIsGeneralRulesOpen(false);
  });
  useModalBackHandler(isNotificationsOpen, () => setIsNotificationsOpen(false));
  useModalBackHandler(isSupportOpen, () => setIsSupportOpen(false));

  const [matches, setMatches] = useState<Tournament[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [singleBottomBanner, setSingleBottomBanner] = useState<Banner | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [activeAnnouncementIdx, setActiveAnnouncementIdx] = useState(0);

  useEffect(() => {
    const applyAnnouncementItems = (rawList: any[]) => {
      if (!Array.isArray(rawList)) return;
      const valid = rawList.filter(
        (item: any) => item && item.isActive !== false && item.text?.trim()
      ) as AnnouncementItem[];
      setAnnouncements(valid);
      setActiveAnnouncementIdx(0);
    };

    const unsubMatches = onSnapshot(
      collection(db, 'matches'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Tournament));
        list.sort((a: any, b: any) => Number(b.matchNumber || 0) - Number(a.matchNumber || 0));
        setMatches(list);
      },
      (err) => {
        console.error('Error fetching matches for home:', err);
        handleFirestoreError(err, OperationType.LIST, 'matches');
      }
    );

    const unsubGames = onSnapshot(
      collection(db, 'games'),
      (snapshot) => {
        const list = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Game))
          .filter((g) => g.isActive !== false);
        list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setGames(list);
      },
      (err) => {
        console.warn('Error fetching games:', err);
      }
    );

    const unsubBanners = onSnapshot(
      collection(db, 'banners'),
      (snapshot) => {
        const fetchedBanners = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Banner))
          .filter((b) => b.isActive !== false && Boolean(b.imageUrl));

        fetchedBanners.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

        const topList = fetchedBanners.filter((b) => b.type !== 'bottom' && b.type !== 'freefire');
        setHeroBanners((prev) => {
          const prevKey = JSON.stringify(prev.map(b => ({ id: b.id, imageUrl: b.imageUrl, order: b.order })));
          const nextKey = JSON.stringify(topList.map(b => ({ id: b.id, imageUrl: b.imageUrl, order: b.order })));
          return prevKey === nextKey ? prev : topList;
        });

        const bottomList = fetchedBanners.filter((b) => b.type === 'bottom' || b.type === 'freefire');
        setSingleBottomBanner(bottomList.length > 0 ? bottomList[0] : null);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    // 1. Listen to appSettings/referral_support (primary global settings doc)
    const unsubRefSupport = onSnapshot(
      doc(db, 'appSettings', 'referral_support'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data?.announcements)) {
            applyAnnouncementItems(data.announcements);
          }
        }
      },
      () => {}
    );

    // 2. Listen to appSettings/announcements
    const unsubAnnouncements = onSnapshot(
      doc(db, 'appSettings', 'announcements'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data?.items)) {
            applyAnnouncementItems(data.items);
          }
        }
      },
      () => {}
    );

    return () => {
      unsubMatches();
      unsubGames();
      unsubBanners();
      unsubRefSupport();
      unsubAnnouncements();
    };
  }, []);

  // Auto-cycle announcements if admin added more than one active announcement
  useEffect(() => {
    if (announcements.length <= 1) {
      setActiveAnnouncementIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setActiveAnnouncementIdx((prev) => (prev + 1) % announcements.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [announcements]);

  const currentAnnouncement =
    announcements[activeAnnouncementIdx] || announcements[0] || DEFAULT_ANNOUNCEMENTS[0];

  const handleAnnouncementClick = () => {
    const link = currentAnnouncement?.link?.trim();
    if (!link || link === 'rules') {
      setIsGeneralRulesOpen(true);
    } else if (link === 'tournaments') {
      onPageChange(Page.TOURNAMENTS);
    } else if (link === 'leaderboard') {
      onPageChange(Page.LEADERBOARD);
    } else if (link === 'wallet') {
      onPageChange(Page.WALLET);
    } else if (link.startsWith('http')) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      setIsGeneralRulesOpen(true);
    }
  };

  // Count live/upcoming matches per game
  const getLiveCountForGame = (gameId: string) => {
    const gLower = gameId.toLowerCase();
    return matches.filter(
      (m) =>
        (m.gameId || 'freefire').toLowerCase() === gLower &&
        (m.status === 'upcoming' || m.status === 'ongoing' || m.status === 'active')
    ).length;
  };

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#f4f6f9] dark:bg-transparent min-h-screen text-slate-900 dark:text-white select-none transition-colors duration-300">
      {/* 1. Top Header */}
      <HomeHeader
        user={user}
        onPageChange={onPageChange}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      {/* 2. Announcement Section Above Slider */}
      {announcements.length > 0 && currentAnnouncement && (
        <section className="px-4 pt-3.5 pb-0.5">
          <motion.div
            whileTap={{ scale: 0.99 }}
            onClick={handleAnnouncementClick}
            className="bg-white dark:bg-[#141414] rounded-[24px] p-3 border border-slate-100 dark:border-white/5 shadow-[0_8px_28px_rgba(15,23,42,0.05)] dark:shadow-none flex items-center justify-between gap-3 cursor-pointer transition-all"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Soft Purple Rounded Icon Box with Megaphone */}
              <div className="w-11 h-11 rounded-2xl bg-[rgba(243,122,32,0.15)] dark:bg-purple-500/15 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-[#FF9A4D] stroke-[2]" />
              </div>

              {/* Warning Icon + Announcement Text */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 stroke-[2.3]" />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentAnnouncement.id + activeAnnouncementIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="text-[11px] font-black uppercase tracking-tight text-slate-900 dark:text-white truncate"
                  >
                    {currentAnnouncement.text}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
          </motion.div>
        </section>
      )}

      {/* 3. Hero Slider Card (Rounded on all 4 corners) */}
      <HeroBannerCarousel banners={heroBanners} onPageChange={onPageChange} />

      {/* 4. SELECT ARENA — Dynamic Games Section added by Admin */}
      <section className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3.5 px-1">
          <h2 className="text-[15px] font-black italic uppercase tracking-[0.14em] text-slate-900 dark:text-white">
            SELECT ARENA
          </h2>
          <button
            onClick={() => onPageChange(Page.TOURNAMENTS)}
            className="flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#FF9A4D] hover:text-purple-400 active:scale-[0.97] transition-all"
          >
            <span>VIEW ALL</span>
            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>

        {games.length === 0 ? (
          <div className="p-8 bg-[#141414] rounded-[28px] border border-slate-200/80 dark:border-white/10 text-center space-y-3">
            <Gamepad2 className="w-12 h-12 mx-auto text-[#FF9A4D]/60 stroke-[1.8]" />
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                No Game Arenas Added Yet
              </h3>
              <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 mt-1">
                Admin can add game arenas (Free Fire, BGMI, etc.) from the Admin Panel.
              </p>
            </div>
            {user?.isAdmin && (
              <button
                onClick={() => onPageChange(Page.ADMIN)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black text-[10px] font-black uppercase tracking-wider rounded-2xl shadow-md shadow-purple-600/25 active:scale-[0.97]"
              >
                Go to Admin Panel
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
          {games.map((game) => {
            return (
              <motion.div
                key={game.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => onPageChange(Page.GAME_MODES, game.id)}
                className="relative aspect-[1.22/1] rounded-[18px] overflow-hidden cursor-pointer border border-slate-200/80 dark:border-white/10 shadow-[0_3px_14px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)] group bg-slate-100 dark:bg-slate-900"
              >
                {/* Background Game Artwork - Vivid & Clear */}
                <SafeImage
                  src={game.image}
                  alt={game.title}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                />

                {/* Subtle Bottom-Only Vignette so 80%+ of artwork is completely clear */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 via-45% to-transparent pointer-events-none" />

                {/* Clean Bottom Aligned Information - Game Title & Translucent Play Now Button */}
                <div className="absolute bottom-0 inset-x-0 p-2 pt-2.5 flex flex-col justify-end gap-1">
                  <h3 className="text-[11px] font-black italic uppercase tracking-tight text-white leading-tight drop-shadow truncate">
                    {game.title}
                  </h3>

                  {/* Translucent Glass Play Now Button */}
                  <div className="w-full py-1.5 rounded-lg bg-white/20 hover:bg-white/30 dark:bg-white/15 dark:hover:bg-white/25 backdrop-blur-md border border-white/30 hover:border-white/50 text-white text-[8px] font-black italic uppercase tracking-[0.14em] flex items-center justify-center gap-1.5 shadow-xs group-hover:border-purple-300/60 active:scale-[0.97] transition-all">
                    <span>PLAY NOW</span>
                    <Play className="w-2.5 h-2.5 fill-white text-white ml-0.5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        )}
      </section>

      {/* 5. TOP QUICK ACTIONS — 4 Circular Indigo/Purple Buttons */}
      <section className="px-4 pt-7">
        <h2 className="text-[14px] font-black italic uppercase tracking-[0.15em] text-slate-900 dark:text-white mb-4 px-1">
          TOP QUICK ACTIONS
        </h2>

        <div className="grid grid-cols-4 gap-3">
          {/* Live Arena */}
          <button
            onClick={() => onPageChange(Page.TOURNAMENTS)}
            className="flex flex-col items-center gap-2.5 group active:scale-[0.97] transition-transform"
          >
            <div className="w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-gradient-to-b from-[#FF9A4D] to-[#F37A1F] flex items-center justify-center text-black shadow-[0_8px_22px_rgba(243,122,32,0.35)] border border-orange-300/30">
              <Gamepad2 className="w-7 h-7 stroke-[2.2] text-black" />
            </div>
            <span className="text-[11px] font-extrabold tracking-tight text-slate-800 dark:text-white text-center">
              Live Arena
            </span>
          </button>

          {/* My Wallet */}
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="flex flex-col items-center gap-2.5 group active:scale-[0.97] transition-transform"
          >
            <div className="w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-gradient-to-b from-[#FF9A4D] to-[#F37A1F] flex items-center justify-center text-black shadow-[0_8px_22px_rgba(243,122,32,0.35)] border border-orange-300/30">
              <Wallet className="w-7 h-7 stroke-[2.2] text-black" />
            </div>
            <span className="text-[11px] font-extrabold tracking-tight text-slate-800 dark:text-white text-center">
              My Wallet
            </span>
          </button>

          {/* Top Players */}
          <button
            onClick={() => onPageChange(Page.LEADERBOARD)}
            className="flex flex-col items-center gap-2.5 group active:scale-[0.97] transition-transform"
          >
            <div className="w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-gradient-to-b from-[#FF9A4D] to-[#F37A1F] flex items-center justify-center text-black shadow-[0_8px_22px_rgba(243,122,32,0.35)] border border-orange-300/30">
              <Crown className="w-7 h-7 stroke-[2.2] text-black" />
            </div>
            <span className="text-[11px] font-extrabold tracking-tight text-slate-800 dark:text-white text-center">
              Top Players
            </span>
          </button>

          {/* Contact Us */}
          <button
            onClick={() => setIsSupportOpen(true)}
            className="flex flex-col items-center gap-2.5 group active:scale-[0.97] transition-transform"
          >
            <div className="w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-gradient-to-b from-[#FF9A4D] to-[#F37A1F] flex items-center justify-center text-black shadow-[0_8px_22px_rgba(243,122,32,0.35)] border border-orange-300/30">
              <Headphones className="w-7 h-7 stroke-[2.2] text-black" />
            </div>
            <span className="text-[11px] font-extrabold tracking-tight text-slate-800 dark:text-white text-center">
              Contact Us
            </span>
          </button>
        </div>
      </section>

      {/* 6. JOIN TOURNAMENTS WIN BIG CTA Card */}
      <section className="px-4 pt-7">
        <div
          onClick={() => onPageChange(Page.TOURNAMENTS)}
          className="relative rounded-[30px] p-6 bg-gradient-to-r from-[#2a1608] via-[#2a1608] to-[#130826] border border-purple-500/25 shadow-[0_12px_32px_rgba(88,28,135,0.22)] flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all overflow-hidden"
        >
          {/* Ambient glow */}
          <div className="absolute -left-10 -bottom-10 w-36 h-36 bg-purple-600/20 blur-2xl rounded-full pointer-events-none" />

          <div className="flex items-center gap-4 relative z-10">
            {/* Trophy Icon with Reflection */}
            <div className="w-14 h-14 flex flex-col items-center justify-center text-[#FF9A4D] shrink-0">
              <Trophy className="w-10 h-10 stroke-[2] drop-shadow-[0_4px_12px_rgba(255,154,77,0.5)] animate-bounce" />
              <Trophy className="w-10 h-5 stroke-[1.5] scale-y-[-0.4] opacity-25 -mt-1 blur-[0.5px]" />
            </div>

            <div>
              <span className="text-[9.5px] font-black italic uppercase tracking-[0.22em] text-purple-300/90 block mb-0.5">
                JOIN TOURNAMENTS
              </span>
              <div className="leading-[0.95]">
                <span className="text-2xl sm:text-[26px] font-black italic uppercase tracking-tight text-white block">
                  WIN
                </span>
                <span className="text-2xl sm:text-[26px] font-black italic uppercase tracking-tight text-amber-400 block">
                  BIG
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onPageChange(Page.TOURNAMENTS);
            }}
            className="relative z-10 px-5 py-3.5 rounded-2xl bg-purple-950/60 hover:bg-purple-900/70 border border-purple-500/40 flex items-center gap-3 text-white shadow-inner active:scale-[0.97] transition-all"
          >
            <div className="text-left leading-tight">
              <span className="text-[10px] font-black uppercase tracking-widest block">JOIN</span>
              <span className="text-[10px] font-black uppercase tracking-widest block">NOW</span>
            </div>
            <ChevronRight className="w-4 h-4 text-purple-300" />
          </button>
        </div>
      </section>

      {/* 7. Single Bottom Feature Banner (Admin attaches only 1 banner here) */}
      <section className="px-4 pt-5 pb-4">
        <div
          onClick={() => {
            if (singleBottomBanner?.redirectUrl) {
              if (singleBottomBanner.redirectUrl.startsWith('http')) {
                window.open(singleBottomBanner.redirectUrl, '_blank', 'noopener,noreferrer');
              } else {
                onPageChange(Page.TOURNAMENTS);
              }
            } else {
              onPageChange(Page.TOURNAMENTS);
            }
          }}
          className="relative w-full aspect-[16/8.2] rounded-[28px] overflow-hidden border border-slate-200/70 dark:border-purple-500/25 shadow-[0_12px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_32px_rgba(88,28,135,0.2)] cursor-pointer active:scale-[0.99] transition-all bg-slate-100 dark:bg-[#0e071b]"
        >
          <SafeImage
            src={
              singleBottomBanner?.imageUrl ||
              'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop'
            }
            alt="Arena Feature Banner"
            className="w-full h-full object-cover"
          />
          {!singleBottomBanner?.imageUrl && (
            <div className="absolute inset-0 bg-gradient-to-t from-[#090414]/90 via-[#2a1608]/50 to-transparent flex flex-col items-center justify-center p-4 text-center">
              <span className="text-2xl sm:text-3xl font-black italic uppercase tracking-wider text-white drop-shadow-[0_4px_20px_rgba(255,154,77,0.8)]">
                {renderSplitAppName('text-[#FF9A4D]')}
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.28em] text-purple-300 mt-1">
                OFFICIAL ESPORTS ARENA
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Modals */}
      <RulesModal
        isOpen={!!selectedRulesMatch || isGeneralRulesOpen}
        onClose={() => {
          setSelectedRulesMatch(null);
          setIsGeneralRulesOpen(false);
        }}
        section={selectedRulesMatch?.section || 'Battle Royale'}
        isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
        onJoin={() => onPageChange(Page.JOIN_MATCH, selectedRulesMatch?.id || '')}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onPageChange={onPageChange}
        user={user}
        joinedMatchIds={joinedMatchIds}
      />

      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
}
