import React, { useState, useEffect } from 'react';
import { Bell, Wallet } from 'lucide-react';
import { Page, User } from '../types';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import SafeImage from './SafeImage';
import { useAppBranding } from '../hooks/useAppBranding';

interface HomeHeaderProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
  onOpenNotifications?: () => void;
}

export default function HomeHeader({ user, onPageChange, onOpenNotifications }: HomeHeaderProps) {
  const totalBalance =
    (user?.wallet?.deposit || 0) + (user?.wallet?.winnings || 0) + (user?.wallet?.bonus || 0);
  const [unreadCount, setUnreadCount] = useState(0);
  const { appName, appLogoUrl, renderSplitAppName } = useAppBranding();

  useEffect(() => {
    const q = query(collection(db, 'notifications'), limit(15));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!user?.id) {
          setUnreadCount(snapshot.size);
          return;
        }
        let unread = 0;
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.readBy || !data.readBy.includes(user.id)) {
            unread++;
          }
        });
        setUnreadCount(unread);
      },
      () => {}
    );

    return () => {
      unsub();
    };
  }, [user?.id]);

  return (
    <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-md px-3 sm:px-5 py-3 sm:py-3.5 transition-colors">
      <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
        {/* Left: App Logo + Server Online + Brand Title */}
        <div
          onClick={() => onPageChange(Page.PROFILE)}
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

        {/* Right: Notifications Bell + Wallet Pill */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-transparent text-[#9a9a9a] hover:text-white flex items-center justify-center active:scale-[0.97] transition-all shrink-0"
              title="Notifications"
            >
              <Bell size={17} className="stroke-[2] bbg-bell-wave" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[10px] h-[10px] px-1 rounded-full bg-[#FF3B3B] text-white text-[8px] font-black flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Wallet Pill Card */}
          <button
            type="button"
            onClick={() => onPageChange(Page.WALLET)}
            className="bg-[#0a0a0a] border-[1.5px] border-[rgba(243,122,32,0.45)] pl-3 sm:pl-4 pr-1.5 py-1.5 rounded-full flex items-center gap-2 sm:gap-2.5 active:scale-[0.97] transition-all shrink-0"
          >
            <span className="text-xs sm:text-sm font-extrabold text-white tracking-tight tabular-nums">
              ₹{totalBalance.toLocaleString()}
            </span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[rgba(243,122,32,0.18)] flex items-center justify-center text-[#F37A1F] shrink-0">
              <Wallet size={14} className="stroke-[2.2]" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
