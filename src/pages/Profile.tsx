import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  User as UserIcon,
  Wallet,
  Gamepad2,
  ShoppingCart,
  BarChart2,
  Gift,
  Headphones,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { Page, User } from '../types';
import { ADMIN_EMAILS } from '../constants';
import SupportModal from '../components/SupportModal';
import RulesModal from '../components/RulesModal';
import MyOrdersModal from '../components/MyOrdersModal';
import SafeImage from '../components/SafeImage';
import { useAppBranding } from '../hooks/useAppBranding';

interface ProfilePageProps {
  user: User;
  onPageChange: (page: Page, param?: string) => void;
  onLogout: () => void;
}

export default function ProfilePage({ user, onPageChange, onLogout }: ProfilePageProps) {
  const { appName, appLogoUrl, renderSplitAppName } = useAppBranding();
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => {
    return localStorage.getItem('khelgalli_push_notifications') !== 'false';
  });

  const handleTogglePush = () => {
    setPushEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('khelgalli_push_notifications', String(next));
      return next;
    });
  };

  const isAdminUser =
    user?.isAdmin ||
    ADMIN_EMAILS.map(e => e.toLowerCase()).includes((user?.email || '').toLowerCase());

  const isStaffUser =
    Boolean(user?.isStaff && user?.staffStatus !== 'suspended') ||
    isAdminUser;

  const totalBalance =
    (user?.wallet?.deposit || 0) + (user?.wallet?.winnings || 0) + (user?.wallet?.bonus || 0);

  const displayName = user?.username || 'COACH';
  const displayEmail = user?.email || 'GAMER@KHELGALLI.COM';
  const matchesPlayed = user?.stats?.matchesPlayed || 0;
  const totalKills = user?.stats?.totalKills || 0;
  const amountWon = user?.stats?.totalWinnings || 0;

  return (
    <div className="min-h-screen bg-transparent text-white pb-28 select-none transition-colors duration-300">
      {/* 1. Top Header matching Reference Image */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-md px-3 sm:px-5 py-3 sm:py-3.5 transition-colors">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          {/* Left: Rounded Square App Logo + SERVER ONLINE + Brand Name */}
          <div
            onClick={() => onPageChange(Page.HOME)}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer active:scale-[0.97] transition-transform min-w-0 flex-1 pr-1"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl overflow-hidden bg-transparent shrink-0 shadow-[0_0_18px_rgba(243,122,32,0.45)]">
              <SafeImage
                src={appLogoUrl}
                alt={appName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-[0.16em] sm:tracking-[0.2em] text-[#7a7a7a] leading-none whitespace-nowrap">
                  Server Online
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
              </div>
              <h1 className="text-base sm:text-lg md:text-[22px] font-extrabold uppercase tracking-[0.03em] sm:tracking-[0.05em] leading-tight text-[#FFF3E0] [text-shadow:0_0_12px_rgba(255,160,60,0.5)] truncate">
                {renderSplitAppName()}
              </h1>
            </div>
          </div>

          {/* Right: Elevated Balance Pill Card with Purple Wallet Icon */}
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="bg-[#0a0a0a] border-[1.5px] border-[rgba(243,122,32,0.45)] pl-3 sm:pl-4 pr-1.5 py-1.5 rounded-full flex items-center gap-2 sm:gap-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-none active:scale-[0.97] transition-all shrink-0"
          >
            <span className="text-xs sm:text-sm font-extrabold text-white tracking-tight tabular-nums">
              ₹{totalBalance.toLocaleString()}
            </span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] shrink-0">
              <Wallet size={14} className="stroke-[2.2]" />
            </div>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="px-5 pt-6 pb-4">
        {/* 2. Section Kicker Row: SECURITY & ACCOUNT + LOGOUT */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a]">
            Security &amp; Account
          </span>
          <button
            onClick={() => setIsLogoutDialogOpen(true)}
            className="text-[10px] font-black uppercase tracking-[0.15em] text-rose-500 hover:text-rose-600 active:scale-[0.97] transition-all"
          >
            Logout
          </button>
        </div>

        {/* 3. Large Circular Profile Avatar with Purple Ring & Verified Badge */}
        <div className="flex flex-col items-center justify-center my-2">
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="relative"
          >
            {/* Soft Purple Halo Glow */}
            <div className="absolute -inset-3 rounded-full bg-[#F37A1F]/20 blur-xl pointer-events-none" />

            <div className="relative w-28 h-28 rounded-full bg-[#141414] border-[3px] border-[#F37A1F] shadow-[0_0_30px_rgba(243,122,32,0.30)] flex items-center justify-center">
              <UserIcon size={40} className="text-[#F37A1F] stroke-[2]" />

              {/* Bottom-Right Green Shield Badge */}
              <div className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full bg-[#22C55E] border-2 border-[#050505] flex items-center justify-center text-black">
                <ShieldCheck size={14} className="stroke-[2.5]" />
              </div>
            </div>
          </motion.div>

          {/* Username & Email */}
          <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-[0.05em] text-white mt-4 leading-tight">
            {displayName}
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a7a7a] mt-1">
            {displayEmail}
          </p>
        </div>

        {/* 4. Three Individual Stat Cards: PLAYED | WON | KILLS */}
        <div className="grid grid-cols-3 gap-3 my-7">
          {/* Card 1: PLAYED */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="bg-[#151515] border border-white/[0.06] rounded-[18px] py-4 px-2 text-center"
          >
            <p className="text-lg sm:text-xl font-black tracking-tight text-white leading-none tabular-nums">
              {matchesPlayed}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] mt-2">
              Played
            </p>
          </motion.div>

          {/* Card 2: WON */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="bg-[#151515] border border-white/[0.06] rounded-[18px] py-4 px-2 text-center"
          >
            <p className="text-lg sm:text-xl font-black tracking-tight text-white leading-none tabular-nums">
              ₹{amountWon}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#22C55E] mt-2">
              Won
            </p>
          </motion.div>

          {/* Card 3: KILLS */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            className="bg-[#151515] border border-white/[0.06] rounded-[18px] py-4 px-2 text-center"
          >
            <p className="text-lg sm:text-xl font-black tracking-tight text-white leading-none tabular-nums">
              {totalKills}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#F37A1F] mt-2">
              Kills
            </p>
          </motion.div>
        </div>

        {/* 5. Profile Cards List matching Reference Image */}
        <div className="space-y-3.5">
          {/* ADMIN PANEL (Top of list for instant access when Admin) */}
          {isAdminUser && (
            <button
              onClick={() => onPageChange(Page.ADMIN)}
              className="w-full bg-[linear-gradient(135deg,#F37A1F,#FF9A4D)] text-black rounded-[20px] p-4 flex items-center justify-between shadow-[0_8px_24px_rgba(243,122,32,0.35)] group active:scale-[0.97] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-black/15 border border-black/10 flex items-center justify-center text-black">
                  <ShieldAlert size={20} className="stroke-[2.2]" />
                </div>
                <div className="text-left">
                  <h3 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-[0.06em] text-black">
                    Admin Control Panel
                  </h3>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/70 mt-0.5">
                    Manage Games, Modes, Matches &amp; Banners
                  </p>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="text-black group-hover:translate-x-0.5 transition-transform"
              />
            </button>
          )}

          {/* STAFF PANEL - Visible only to assigned staff (or Admin) */}
          {isStaffUser && (
            <button
              onClick={() => onPageChange(Page.STAFF_PANEL)}
              className="w-full bg-[linear-gradient(135deg,#F37A1F,#FF9A4D)] text-black rounded-[20px] p-4 flex items-center justify-between shadow-[0_8px_24px_rgba(243,122,32,0.35)] group active:scale-[0.97] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-black/15 border border-black/10 flex items-center justify-center text-black shrink-0">
                  <UserCheck size={20} className="stroke-[2.2]" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-[0.06em] text-black">
                      Staff Control Panel
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest bg-black/15 border border-black/20 text-black">
                      {user?.staffRole ? user.staffRole.replace(/_/g, ' ') : isAdminUser ? 'ADMIN PRIVILEGES' : 'STAFF'}
                    </span>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/75 mt-0.5">
                    {user?.staffRole === 'FINANCE_MANAGER' 
                      ? 'Finance: Approve / Reject Deposits & Withdrawals'
                      : user?.staffRole === 'TOURNAMENT_ORGANIZER'
                      ? 'Tournaments: Manage Matches, Rooms & Results'
                      : 'Full Staff Access: Finance & Tournaments'}
                  </p>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="text-black group-hover:translate-x-0.5 transition-transform shrink-0"
              />
            </button>
          )}

          {/* Card 2: PERSONAL INFO (EDIT PROFILE) */}
          <button
            onClick={() => onPageChange(Page.PROFILE_DETAILS)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <UserIcon size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  Personal Info
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Edit Profile
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>

          {/* Card 3: GAME STATISTICS (LIFETIME DATA) */}
          <button
            onClick={() => onPageChange(Page.GAME_STATS)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <BarChart2 size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  Game Statistics
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Lifetime Data
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>

          {/* Card 4: MY WALLET */}
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <Wallet size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  My Wallet
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Balance &amp; Transactions
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>

          {/* Card 5: MY MATCHES */}
          <button
            onClick={() => onPageChange(Page.TOURNAMENTS)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <Gamepad2 size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  My Matches
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Joined Contests
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>

          {/* Card 6: MY ORDERS */}
          <button
            onClick={() => setIsOrdersOpen(true)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <ShoppingCart size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  My Orders
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Passes &amp; Slots
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>

          {/* Card 7: REFER & EARN */}
          <button
            onClick={() => onPageChange(Page.REFERRAL)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <Gift size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  My Rewards
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Refer &amp; Earn
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>

          {/* Card 8: PUSH NOTIFICATIONS */}
          <div className="bg-[#141414] border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F]">
                <Bell size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  Push Notifications
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  {pushEnabled ? 'Alerts Enabled' : 'Alerts Muted'}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pushEnabled}
              onClick={handleTogglePush}
              className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer ${
                pushEnabled ? 'bg-purple-600' : 'bg-slate-200 dark:bg-neutral-800'
              }`}
            >
              <div
                className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${
                  pushEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Card 9: CUSTOMER SUPPORT */}
          <button
            onClick={() => setIsSupportOpen(true)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <Headphones size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  Customer Support
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  24/7 Help Desk
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>

          {/* Card 10: RULES & FAIR PLAY */}
          <button
            onClick={() => setIsRulesOpen(true)}
            className="w-full bg-[#141414] hover:border-[#F37A1F]/40 border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                <ShieldCheck size={20} className="stroke-[2]" />
              </div>
              <div className="text-left">
                <h3 className="text-xs sm:text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  Rules &amp; Fair Play
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Official Regulations
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
            />
          </button>
        </div>

        {/* Footer Info */}
        <p className="mt-8 text-center text-[9px] font-black text-slate-400 dark:text-neutral-600 uppercase tracking-[0.2em]">
          {appName} Esports • v3.2.0
        </p>
      </div>

      {/* Modals */}
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <RulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
        section="Battle Royale & Esports Fair Play"
        onJoin={() => setIsRulesOpen(false)}
        isJoined={true}
      />
      <MyOrdersModal
        isOpen={isOrdersOpen}
        onClose={() => setIsOrdersOpen(false)}
        user={user}
        onPageChange={onPageChange}
      />

      {/* Logout Confirmation Dialog */}
      <AnimatePresence>
        {isLogoutDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogoutDialogOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[30px] p-6 shadow-2xl z-10 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-4">
                <LogOut size={24} className="stroke-[2.2]" />
              </div>
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1">
                Log Out of Account?
              </h3>
              <p className="text-[11px] font-medium text-slate-500 dark:text-neutral-400 mb-6">
                Are you sure you want to sign out of your {appName} gaming profile?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsLogoutDialogOpen(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsLogoutDialogOpen(false);
                    onLogout();
                  }}
                  className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-colors shadow-lg shadow-rose-500/25"
                >
                  Log Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
