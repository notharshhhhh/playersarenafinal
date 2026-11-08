import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Clock,
  PlayCircle,
  CheckCircle2,
  Trophy,
  Gamepad2,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { Page, Tournament, User } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { formatMatchTime } from '../utils/dateUtils';
import SafeImage from '../components/SafeImage';
import RulesModal from '../components/RulesModal';
import HomeHeader from '../components/HomeHeader';
import NotificationsModal from '../components/NotificationsModal';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface TournamentsProps {
  user?: User;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds?: string[];
}

export default function Tournaments({ user, onPageChange, joinedMatchIds = [] }: TournamentsProps) {
  const { gameId: routeParam } = useParams<{ gameId?: string }>();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'ongoing' | 'completed'>('upcoming');
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useModalBackHandler(!!selectedRulesMatch, () => setSelectedRulesMatch(null));
  useModalBackHandler(isNotificationsOpen, () => setIsNotificationsOpen(false));

  // Parse combined "gameId__modeId" or single param
  let parsedGameId: string | null = null;
  let parsedModeId: string | null = null;
  if (routeParam) {
    if (routeParam.includes('__')) {
      const [g, m] = routeParam.split('__');
      parsedGameId = g;
      parsedModeId = m;
    } else {
      parsedModeId = routeParam;
    }
  }

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'matches'),
      (snapshot) => {
        const list: Tournament[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Tournament);
        });
        list.sort((a: any, b: any) => Number(b.matchNumber || 0) - Number(a.matchNumber || 0));
        setTournaments(list);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'matches');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter matches by current game/mode context first so we can compute exact counts per status tab
  const contextMatches = tournaments.filter((t: any) => {
    if (parsedGameId && parsedModeId) {
      const gLower = parsedGameId.toLowerCase();
      const mLower = parsedModeId.toLowerCase();
      const gameMatches = (t.gameId || 'freefire').toLowerCase() === gLower;
      const modeMatches =
        t.modeId?.toLowerCase() === mLower ||
        t.modeId?.toLowerCase() === `${gLower}_${mLower}` ||
        t.section?.toLowerCase().replace(/[^a-z0-9]+/g, '_') === mLower ||
        t.mode?.toLowerCase().replace(/[^a-z0-9]+/g, '_') === mLower;
      return gameMatches && modeMatches;
    }

    if (parsedModeId) {
      const mLower = parsedModeId.toLowerCase();
      return (
        t.gameId?.toLowerCase() === mLower ||
        t.modeId?.toLowerCase() === mLower ||
        t.mode?.toLowerCase().includes(mLower) ||
        t.section?.toLowerCase().includes(mLower)
      );
    }

    return true;
  });

  const getNormalizedStatus = (t: any): 'upcoming' | 'ongoing' | 'completed' => {
    if (t.status === 'completed') return 'completed';
    if (t.status === 'ongoing') return 'ongoing';
    return 'upcoming';
  };

  const upcomingCount = contextMatches.filter((t) => getNormalizedStatus(t) === 'upcoming').length;
  const ongoingCount = contextMatches.filter((t) => getNormalizedStatus(t) === 'ongoing').length;
  const completedCount = contextMatches.filter((t) => getNormalizedStatus(t) === 'completed').length;

  const filteredTournaments = contextMatches.filter((t) => getNormalizedStatus(t) === activeTab);

  const activeTabCount =
    activeTab === 'upcoming'
      ? upcomingCount
      : activeTab === 'ongoing'
      ? ongoingCount
      : completedCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-transparent text-white pb-32 transition-colors duration-300 select-none"
    >
      {/* 1. Top Header Bar matching Reference Images */}
      {user ? (
        <HomeHeader
          user={user}
          onPageChange={onPageChange}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
        />
      ) : null}

      <div className="px-4 pt-5 space-y-6">
        {/* 2. MATCH ARENA Header + Total Count Trophy Pill */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            {routeParam && (
              <button
                onClick={() =>
                  parsedGameId
                    ? onPageChange(Page.GAME_MODES, parsedGameId)
                    : onPageChange(Page.HOME)
                }
                className="w-10 h-10 rounded-full bg-[#141414] border-[1.5px] border-[#2a2a2a] flex items-center justify-center text-white active:scale-[0.97] transition-all"
              >
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
            <div>
              <h1 className="text-[22px] font-extrabold uppercase tracking-[0.05em] leading-none text-[#FFF3E0] [text-shadow:0_0_12px_rgba(255,160,60,0.5)]">
                <span className="text-[#FFF3E0]">MATCH</span>{' '}
                <span className="text-[#F37A1F]">ARENA</span>
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] mt-1.5">
                {parsedModeId
                  ? `${parsedModeId.replace(/_/g, ' ')} • COMPETE WITH THE BEST`
                  : 'COMPETE WITH THE BEST'}
              </p>
            </div>
          </div>

          {/* Right Trophy Count Pill matching Reference Image */}
          <div className="px-4 py-2 rounded-full bg-[#0a0a0a] border-[1.5px] border-[rgba(243,122,32,0.45)] flex items-center gap-2.5 shrink-0">
            <Trophy className="w-4 h-4 text-[#F37A1F] stroke-[2.2]" />
            <span className="text-xs font-extrabold text-white tabular-nums">
              {activeTabCount}
            </span>
          </div>
        </div>

        {/* 3. Status Tab Selector Bar (UPCOMING | ONGOING | COMPLETED) matching the 3 Reference Images */}
        <div className="p-1.5 rounded-full bg-[#151515] border border-white/[0.06] grid grid-cols-3 gap-1.5">
          {/* UPCOMING TAB */}
          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`py-3 px-2 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${
              activeTab === 'upcoming'
                ? 'bg-[#F37A1F] text-black shadow-[0_6px_20px_rgba(243,122,32,0.35)]'
                : 'bg-transparent text-[#7a7a7a] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Clock
                className={`w-3.5 h-3.5 stroke-[2.2] ${
                  activeTab === 'upcoming' ? 'text-black' : 'text-[#7a7a7a]'
                }`}
              />
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em]">
                UPCOMING
              </span>
            </div>
            <span
              className={`min-w-[26px] h-[20px] px-2 rounded-full text-[10px] font-black flex items-center justify-center transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-black/20 text-black border border-black/20'
                  : 'bg-[#F37A1F]/15 text-[#F37A1F] border border-[#F37A1F]/30'
              }`}
            >
              {upcomingCount}
            </span>
          </button>

          {/* ONGOING TAB */}
          <button
            type="button"
            onClick={() => setActiveTab('ongoing')}
            className={`py-3 px-2 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${
              activeTab === 'ongoing'
                ? 'bg-[#F37A1F] text-black shadow-[0_6px_20px_rgba(243,122,32,0.35)]'
                : 'bg-transparent text-[#7a7a7a] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <PlayCircle
                className={`w-3.5 h-3.5 stroke-[2.2] ${
                  activeTab === 'ongoing' ? 'text-black' : 'text-[#7a7a7a]'
                }`}
              />
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em]">
                ONGOING
              </span>
            </div>
            <span
              className={`min-w-[26px] h-[20px] px-2 rounded-full text-[10px] font-black flex items-center justify-center transition-all ${
                activeTab === 'ongoing'
                  ? 'bg-black/20 text-black border border-black/20'
                  : 'bg-[#FFD21F]/15 text-[#FFD21F] border border-[#FFD21F]/30'
              }`}
            >
              {ongoingCount}
            </span>
          </button>

          {/* COMPLETED TAB */}
          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`py-3 px-2 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${
              activeTab === 'completed'
                ? 'bg-[#F37A1F] text-black shadow-[0_6px_20px_rgba(243,122,32,0.35)]'
                : 'bg-transparent text-[#7a7a7a] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 stroke-[2.2] ${
                  activeTab === 'completed' ? 'text-black' : 'text-[#7a7a7a]'
                }`}
              />
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.08em]">
                COMPLETED
              </span>
            </div>
            <span
              className={`min-w-[26px] h-[20px] px-2 rounded-full text-[10px] font-black flex items-center justify-center transition-all ${
                activeTab === 'completed'
                  ? 'bg-black/20 text-black border border-black/20'
                  : 'bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30'
              }`}
            >
              {completedCount}
            </span>
          </button>
        </div>

        {/* 4. Tournament Cards or Empty State Card matching Reference Images */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-[#F37A1F] animate-spin" />
            <p className="text-[10px] font-bold text-[#7a7a7a] uppercase tracking-[0.2em]">
              Loading Tournaments...
            </p>
          </div>
        ) : filteredTournaments.length === 0 ? (
          <div className="bg-[#141414] rounded-[30px] py-20 px-6 text-center border border-white/[0.06] flex flex-col items-center justify-center min-h-[250px]">
            <Gamepad2 className="w-11 h-11 text-[#3a3a3a] mb-4 stroke-[1.8]" />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a]">
              NO {activeTab.toUpperCase()} TOURNAMENTS AVAILABLE
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTournaments.map((match: any) => {
              const isJoined = joinedMatchIds.includes(match.id);
              const slotsFilled = Number(match.playersCount ?? match.players?.length ?? 0);
              const totalSlots = Number(match.totalSlots ?? match.maxPlayers ?? 48);
              const isFull = slotsFilled >= totalSlots;
              const progress = Math.min(100, Math.round((slotsFilled / Math.max(1, totalSlots)) * 100));
              const perKillVal = Number(match.perKillAmount ?? match.perKill ?? 0);
              const formattedTime = formatMatchTime(match.time) || match.time || 'UPCOMING';

              return (
                <div
                  key={match.id}
                  onClick={() => onPageChange(Page.MATCH_DETAILS, match.id)}
                  className="bg-[#141414] bg-[linear-gradient(160deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_55%)] rounded-[30px] overflow-hidden border-[1.5px] border-[rgba(243,122,32,0.45)] p-4 cursor-pointer transition-all active:scale-[0.99]"
                >
                  {/* 1. Full-Bleed Top Banner Image */}
                  <div className="relative w-full aspect-[16/10] rounded-[26px] bg-[#0c0c0c] bg-[linear-gradient(180deg,#1c1c1c_0%,#0c0c0c_55%,#000_100%)] overflow-hidden">
                    <SafeImage
                      src={match.image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80'}
                      alt={match.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* 2. Card Body */}
                  <div className="pt-5 px-1 pb-1">
                    {/* Row 1: #ID Badge + Bold Italic Title + Time Pill */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-2.5">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 w-full sm:w-auto flex-1">
                        {/* Soft Purple Match ID Pill */}
                        <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-2xl bg-[#1a1a1a] border-[1.5px] border-[rgba(243,122,32,0.45)] text-[#F37A1F] text-[10px] sm:text-[11px] font-bold tracking-wide shrink-0">
                          {match.displayId || `#${String(match.matchNumber || '01').padStart(3, '0')}`}
                        </span>

                        {/* Bold Italic Uppercase Match Title */}
                        <h3 className="text-[14px] sm:text-base font-extrabold uppercase tracking-[0.03em] sm:tracking-[0.04em] leading-[1.25] text-white break-words min-w-0 flex-1">
                          {match.title}
                        </h3>
                      </div>

                      {/* Elevated White/Dark Time Pill */}
                      <div className="self-start sm:self-auto px-2.5 py-1 sm:px-3.5 sm:py-2 rounded-xl sm:rounded-2xl bg-[#1a1a1a] border-[1.5px] border-[rgba(243,122,32,0.45)] flex items-center gap-1.5 shrink-0">
                        <Clock className="w-3 h-3 text-[#F37A1F] shrink-0" />
                        <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-[0.03em] sm:tracking-[0.04em] text-[#F37A1F] whitespace-nowrap">
                          {formattedTime}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Map / Mode Sub-label + Purple Italic Section Name */}
                    <div className="mt-3 pb-4 flex items-center gap-4">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a]">
                        {match.map || match.mode || 'CUSTOM'}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F37A1F]">
                        {match.section || match.mode || 'TOURNAMENT'}
                      </span>
                    </div>

                    {/* Row 3: 3-Column Metrics Grid (PRIZE | KILL | ENTRY) with Vertical Dividers */}
                    <div className="grid grid-cols-3 py-4 items-center text-center bg-[#151515] border-[1.5px] border-[rgba(243,122,32,0.45)] rounded-[30px]">
                      {/* PRIZE */}
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] block mb-1.5">
                          PRIZE
                        </span>
                        <span className="text-[17px] font-black text-[#FFD21F] leading-none block">
                          {match.prizePool?.toString().startsWith('₹')
                            ? match.prizePool
                            : `₹${match.prizePool ?? match.prize ?? 0}`}
                        </span>
                      </div>

                      {/* KILL */}
                      <div className="border-x border-white/[0.06]">
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] block mb-1.5">
                          KILL
                        </span>
                        <span className="text-[17px] font-black text-white leading-none block">
                          {perKillVal > 0 ? `₹${perKillVal}` : '-'}
                        </span>
                      </div>

                      {/* ENTRY */}
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] block mb-1.5">
                          ENTRY
                        </span>
                        <span className="text-[17px] font-black text-[#F37A1F] leading-none block">
                          {match.entryFee === 0
                            ? 'FREE'
                            : match.entryFee?.toString().startsWith('₹')
                            ? match.entryFee
                            : `₹${match.entryFee}`}
                        </span>
                      </div>
                    </div>

                    {/* Row 4: Slots Progress Bar + VIEW RULES Button + JOIN Button */}
                    <div className="flex items-center justify-between gap-3 pt-2 flex-wrap sm:flex-nowrap">
                      {/* Left: Slot Ratio + Thin Progress Bar */}
                      <div className="flex-1 flex items-center gap-2.5 pr-1">
                        <span className="text-[11px] font-extrabold text-white shrink-0 tabular-nums">
                          {slotsFilled}/{totalSlots}
                        </span>
                        <div className="h-1.5 flex-1 bg-[#1e1e1e] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[linear-gradient(90deg,#F37A1F,#FF9A4D)] rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Right: VIEW RULES + JOIN Buttons */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRulesMatch(match);
                          }}
                          className="px-4 py-3 rounded-full bg-[#111] border border-[#3a3a3a] text-[10px] font-bold uppercase tracking-[0.08em] text-white hover:border-[#F37A1F]/60 active:scale-[0.97] transition-all"
                        >
                          VIEW RULES
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isJoined || match.status === 'completed') {
                              onPageChange(Page.MATCH_DETAILS, match.id);
                            } else {
                              onPageChange(Page.JOIN_MATCH, match.id);
                            }
                          }}
                          className={`px-6 py-3 rounded-full text-[11px] font-extrabold uppercase tracking-[0.08em] transition-all active:scale-[0.97] ${
                            isJoined
                              ? 'bg-[#22C55E] text-black shadow-[0_6px_20px_rgba(34,197,94,0.3)]'
                              : isFull && match.status !== 'completed'
                              ? 'bg-[#1c1c1c] text-[#7a7a7a]'
                              : 'bg-[#F37A1F] hover:bg-[#FF9A4D] text-black shadow-[0_6px_20px_rgba(243,122,32,0.40)]'
                          }`}
                        >
                          {isJoined
                            ? 'JOINED'
                            : match.status === 'completed'
                            ? 'RESULTS'
                            : isFull
                            ? 'FULL'
                            : 'JOIN'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Match Rules Modal */}
      <RulesModal
        isOpen={!!selectedRulesMatch}
        onClose={() => setSelectedRulesMatch(null)}
        section={selectedRulesMatch?.section || selectedRulesMatch?.mode || 'Battle Royale'}
        isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
        onJoin={() => {
          const targetId = selectedRulesMatch?.id || '';
          setSelectedRulesMatch(null);
          if (targetId) {
            onPageChange(Page.JOIN_MATCH, targetId);
          }
        }}
      />

      {user && (
        <NotificationsModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          onPageChange={onPageChange}
          user={user}
          joinedMatchIds={joinedMatchIds}
        />
      )}
    </motion.div>
  );
}
