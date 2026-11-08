import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, X, Calendar, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { Page, User } from '../types';

interface MyOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onPageChange: (page: Page, param?: string) => void;
}

interface OrderItem {
  id: string;
  matchId: string;
  title: string;
  entryFee: number;
  prizePool: string;
  mode: string;
  date: string;
  status: 'confirmed' | 'ongoing' | 'completed';
  slot?: number;
  ign?: string;
}

export default function MyOrdersModal({ isOpen, onClose, user, onPageChange }: MyOrdersModalProps) {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !user?.id) return;

    const fetchOrders = async () => {
      setLoading(true);
      try {
        const regQuery = query(
          collection(db, 'registrations'),
          where('userId', '==', user.id),
          orderBy('joinedAt', 'desc'),
          limit(15)
        );
        const regSnap = await getDocs(regQuery);

        const orderPromises = regSnap.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let matchData: any = null;
          try {
            const mDoc = await getDoc(doc(db, 'matches', data.tournamentId));
            if (mDoc.exists()) {
              matchData = mDoc.data();
            } else {
              const legacyDoc = await getDoc(doc(db, 'tournaments', data.tournamentId));
              if (legacyDoc.exists()) {
                matchData = legacyDoc.data();
              }
            }
          } catch (err) {
            console.error('Failed to fetch match for order:', err);
          }

          return {
            id: docSnap.id,
            matchId: data.tournamentId,
            title: matchData?.title || 'Tournament Slot Pass',
            entryFee: matchData?.entryFee || data.entryFee || 0,
            prizePool: matchData?.prize || 'Pool Prize',
            mode: matchData?.mode || 'Custom',
            date: data.joinedAt?.toDate ? data.joinedAt.toDate().toLocaleDateString() : 'Recent',
            status: (matchData?.status || 'confirmed') as any,
            slot: data.slot,
            ign: data.ign || data.gameIGN || user.username,
          };
        });

        const fetchedOrders = await Promise.all(orderPromises);
        setOrders(fetchedOrders);
      } catch (err) {
        console.error('Error loading orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [isOpen, user?.id]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="relative w-full max-w-md bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-t-[40px] sm:rounded-[28px] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <ShoppingCart size={19} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 dark:text-white">
                    My Orders &amp; <span className="text-purple-600 dark:text-purple-500">Passes</span>
                  </h3>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-neutral-500 mt-0.5">
                    Tournament entry passes &amp; slots
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content List */}
            <div className="p-5 overflow-y-auto no-scrollbar flex-1 space-y-3 bg-[#f8f9fc] dark:bg-[#09090d]">
              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400 dark:text-neutral-500">
                  <Loader2 size={28} className="animate-spin text-purple-600 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-[0.15em]">
                    Loading match orders...
                  </p>
                </div>
              ) : orders.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 flex items-center justify-center mx-auto mb-4 text-slate-400 dark:text-neutral-600">
                    <ShoppingCart size={26} />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1">
                    No Orders Yet
                  </h4>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-neutral-400 max-w-xs mx-auto mb-5">
                    You haven&apos;t purchased any tournament slot passes yet. Join an arena match to start competing!
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onPageChange(Page.TOURNAMENTS);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-black text-[10px] font-black uppercase tracking-[0.15em] px-5 py-3 rounded-2xl transition-all inline-flex items-center gap-2 shadow-lg shadow-purple-600/20"
                  >
                    <span>Browse Arena</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : (
                orders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[20px] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                  >
                    <div className="flex items-start justify-between mb-2.5">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-purple-600 dark:text-purple-400">
                          {order.mode}
                        </span>
                        <h4 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white mt-0.5">
                          {order.title}
                        </h4>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black italic text-slate-900 dark:text-white tabular-nums">
                          ₹{order.entryFee}
                        </span>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                          Entry Paid
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-neutral-400 pt-2.5 border-t border-slate-100 dark:border-neutral-800/80">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Calendar size={12} className="text-slate-400" />
                        <span>{order.date}</span>
                      </div>
                      {order.slot && (
                        <span className="font-black uppercase tracking-wider text-slate-700 dark:text-neutral-300">
                          Slot #{order.slot}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-emerald-500 font-black uppercase tracking-wider">
                        <CheckCircle2 size={12} />
                        <span>{order.status}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Close Action */}
            <div className="p-4 bg-white dark:bg-[#141414] border-t border-slate-100 dark:border-neutral-800">
              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-800 dark:text-white text-[10px] font-black uppercase tracking-[0.16em] rounded-2xl transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
