import React from 'react';
import { Megaphone, ChevronRight } from 'lucide-react';
import { useAppBranding } from '../hooks/useAppBranding';

interface AnnouncementBarProps {
  text?: string;
  onClick: () => void;
}

export default function AnnouncementBar({
  text,
  onClick,
}: AnnouncementBarProps) {
  const { appName } = useAppBranding();
  const displayText = text || `${appName} — MAIN RULES & TELEGRAM CHANNEL`;
  return (
    <section className="px-5 mt-4">
      <div
        onClick={onClick}
        className="w-full bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800/90 rounded-2xl p-3 shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-all select-none group"
      >
        <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/15 border border-purple-100 dark:border-purple-500/25 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
          <Megaphone size={16} className="stroke-[2.2]" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] text-slate-900 dark:text-white truncate">
            {displayText}
          </p>
        </div>

        <ChevronRight
          size={15}
          className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0"
        />
      </div>
    </section>
  );
}
