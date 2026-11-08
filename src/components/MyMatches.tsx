import React from 'react';
import { RefreshCw, Calendar, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { Page, Tournament } from '../types';

interface MyMatchesProps {
  matches?: Tournament[];
  joinedMatchIds?: string[];
  onPageChange: (page: Page, param?: string) => void;
}

export default function MyMatches({ onPageChange }: MyMatchesProps) {
  const cards = [
    {
      id: 'ongoing',
      title: 'Ongoing',
      subtitle: 'Live Rooms',
      type: 'ongoing',
      actionParam: 'freefire?status=ongoing',
    },
    {
      id: 'upcoming',
      title: 'Upcoming',
      subtitle: 'Scheduled',
      type: 'upcoming',
      actionParam: 'freefire?status=upcoming',
    },
    {
      id: 'completed',
      title: 'Completed',
      subtitle: 'Results',
      type: 'completed',
      actionParam: 'freefire?status=completed',
    },
  ];

  return (
    <section className="px-5 mt-6">
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
          My Matches
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {cards.map((card) => {
          return (
            <motion.div
              key={card.id}
              whileHover={{ scale: 1.02, y: -2, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onPageChange(Page.TOURNAMENTS, card.actionParam)}
              className="bg-white dark:bg-[#141414] rounded-[20px] py-4 px-2.5 text-center cursor-pointer shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none hover:border-purple-500/30 transition-all flex flex-col items-center justify-center gap-2 border border-slate-100 dark:border-neutral-800/90 group select-none"
            >
              {card.type === 'ongoing' && (
                <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:rotate-180 transition-transform duration-500">
                  <RefreshCw size={20} className="stroke-[2.4]" />
                </div>
              )}

              {card.type === 'upcoming' && (
                <div className="w-11 h-11 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Calendar size={20} className="stroke-[2.2]" />
                </div>
              )}

              {card.type === 'completed' && (
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Check size={22} className="stroke-[2.8]" />
                </div>
              )}

              <div>
                <span className="block text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">
                  {card.title}
                </span>
                <span className="block text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-neutral-500 mt-1">
                  {card.subtitle}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
