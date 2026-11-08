import React from 'react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { Home, Trophy, Crown, Wallet, User as UserIcon } from 'lucide-react';
import { Page, User } from '../types';
import { ADMIN_EMAILS } from '../constants';

interface BottomNavProps {
  currentPage?: Page;
  onPageChange: (page: Page, param?: string) => void;
  user?: User | null;
  onOpenRules?: () => void;
  onOpenSupport?: () => void;
}

export default function BottomNav({ onPageChange, user }: BottomNavProps) {
  const location = useLocation();

  const isAdminUser =
    user?.isAdmin ||
    ADMIN_EMAILS.map(e => e.toLowerCase()).includes((user?.email || '').toLowerCase());

  const tabs = [
    {
      id: 'home',
      label: 'HOME',
      icon: Home,
      path: '/home',
      page: Page.HOME,
    },
    {
      id: 'arena',
      label: 'ARENA',
      icon: Trophy,
      path: '/tournaments',
      page: Page.TOURNAMENTS,
    },
    {
      id: 'leaderboard',
      label: 'RANKS',
      icon: Crown,
      path: '/leaderboard',
      page: Page.LEADERBOARD,
    },
    {
      id: 'wallet',
      label: 'WALLET',
      icon: Wallet,
      path: '/wallet',
      page: Page.WALLET,
    },
    {
      id: 'profile',
      label: 'PROFILE',
      icon: UserIcon,
      path: '/profile',
      page: Page.PROFILE,
    },
  ];

  return (
    <nav className="fixed left-[18px] right-[18px] bottom-[calc(18px+env(safe-area-inset-bottom,0px))] max-w-lg mx-auto bg-[#1c1c1c] rounded-full z-40 shadow-[0_10px_30px_rgba(0,0,0,0.65)] transition-colors duration-300">
      <div className="grid grid-cols-5 items-center h-[68px] px-2">
        {tabs.map((tab) => {
          const isHome = tab.id === 'home';
          const isArena = tab.id === 'arena';
          const isActive = isHome
            ? location.pathname === '/' || location.pathname.startsWith('/home')
            : isArena
            ? location.pathname.startsWith('/tournaments') || location.pathname.startsWith('/game-modes')
            : location.pathname.startsWith(tab.path);

          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onPageChange(tab.page)}
              className={`relative flex flex-col items-center justify-center w-full h-full transition-all group ${
                isActive
                  ? 'text-[#F37A1F]'
                  : 'text-[#6f6f6f] hover:text-[#b5b5b5]'
              }`}
            >
              <div className="flex flex-col items-center justify-center">
                <div className="mb-1 transition-transform group-active:scale-[0.97]">
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.4 : 1.9}
                    className={
                      isActive
                        ? 'text-[#F37A1F] drop-shadow-[0_0_8px_rgba(243,122,32,0.55)]'
                        : 'text-[#6f6f6f] group-hover:text-[#b5b5b5]'
                    }
                  />
                </div>
                <span
                  className={`text-[8px] font-bold uppercase tracking-[0.14em] ${
                    isActive
                      ? 'text-[#F37A1F]'
                      : 'text-[#6f6f6f]'
                  }`}
                >
                  {tab.label}
                </span>

                {/* Active Purple Bottom Indicator Line matching Reference */}
                {isActive && (
                  <div
                    className="absolute -bottom-2 w-6 h-[4px] bg-[#F37A1F] rounded-full shadow-[0_0_8px_rgba(243,122,32,0.6)]"
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
