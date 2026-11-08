import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet as WalletIcon,
  Plus,
  ArrowRightFromLine,
  ChevronRight,
  ArrowDown,
  Loader2,
  History,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Info,
  HelpCircle,
} from 'lucide-react';
import { Page, User, Transaction } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';
import { usePopup } from '../components/PopupProvider';
import AdvancedLoader from '../components/AdvancedLoader';

interface WalletPageProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function WalletPage({ user, onPageChange }: WalletPageProps) {
  const { showInstructions, showInfo } = usePopup();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingOrder, setVerifyingOrder] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'timeout' | null>(null);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementFilter, setStatementFilter] = useState<'all' | 'deposit' | 'withdraw' | 'match'>(
    'all'
  );

  const handleOpenWalletRules = () => {
    showInstructions(
      'WALLET SYSTEM GUIDE',
      'Understand how your 3 wallet balances work for matches and withdrawals:',
      [
        'DEPOSIT WALLET: Money added by you (approved by Admin or instant gateway) goes into your Deposit Wallet. Used 100% for joining paid contests.',
        'WINNINGS WALLET: Prize money won from tournaments goes directly into your Winnings Wallet. Can be withdrawn anytime via UPI or Bank.',
        'BONUS WALLET: Referral & signup rewards go into your Bonus Wallet for joining eligible matches.',
        'REJECTED DEPOSITS: If a manual deposit request is rejected due to invalid UTR, ₹0 is added to your wallet.'
      ]
    );
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment') as any;
    let orderId = params.get('order_id');

    // Also check if there is a recently created ZapUPI order in localStorage
    let cachedOrder: any = null;
    try {
      const raw = localStorage.getItem('kg_pending_zapupi_order');
      if (raw) {
        cachedOrder = JSON.parse(raw);
        if (!orderId && cachedOrder?.orderId && Date.now() - (cachedOrder.createdAt || 0) < 15 * 60 * 1000) {
          orderId = cachedOrder.orderId;
        }
      }
    } catch {}

    if (status) {
      setPaymentStatus(status);
      setTimeout(() => setPaymentStatus(null), 10000);
    }

    if (orderId) {
      setVerifyingOrder(orderId);
      setTimeout(() => setVerifyingOrder(null), 20000);
    }

    if (status || params.get('order_id')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!auth.currentUser) return;

    // Actively verify order status with ZapUPI backend if an orderId is present
    let verifyTimer: any = null;
    if (orderId && orderId.startsWith('zap_')) {
      const verifyZapOrder = async () => {
        try {
          const res = await fetch('/api/zapupi/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: orderId,
            }),
          });
          const data = await res.json();
          if (data?.status === 'success') {
            setPaymentStatus('success');
            setVerifyingOrder(null);
            try {
              localStorage.removeItem('kg_pending_zapupi_order');
            } catch {}
          } else if (data?.status === 'failed') {
            setPaymentStatus('failed');
            setVerifyingOrder(null);
            try {
              localStorage.removeItem('kg_pending_zapupi_order');
            } catch {}
          }
        } catch {}
      };
      verifyZapOrder();
      verifyTimer = setInterval(verifyZapOrder, 4500);
    }

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const txs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(txs);
        setLoading(false);

        if (orderId) {
          const found = txs.find((t) => (t.id === orderId || (t as any).orderId === orderId) && t.status === 'completed');
          if (found) {
            setVerifyingOrder(null);
            setPaymentStatus('success');
            try {
              localStorage.removeItem('kg_pending_zapupi_order');
            } catch {}
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      if (verifyTimer) clearInterval(verifyTimer);
    };
  }, []);

  const totalBalance =
    (user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0);

  const formatTransactionDate = (createdAt: any) => {
    if (!createdAt) return 'RECENT';
    try {
      let date: Date;
      if (typeof createdAt?.toDate === 'function') {
        date = createdAt.toDate();
      } else if (createdAt?.seconds) {
        date = new Date(createdAt.seconds * 1000);
      } else {
        date = new Date(createdAt);
      }
      if (!date || isNaN(date.getTime())) return 'RECENT';

      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const day = date.getDate();
      const time = date.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      return `${month} ${day} · ${time}`;
    } catch {
      return 'RECENT';
    }
  };

  const isCredit = (tx: Transaction) => {
    return (
      tx.type === 'deposit' ||
      tx.type === 'win' ||
      tx.type === 'refund' ||
      tx.type === 'staff_payment' ||
      (tx.type as any) === 'bonus' ||
      (tx.type as any) === 'referral'
    );
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (statementFilter === 'all') return true;
    if (statementFilter === 'deposit') return tx.type === 'deposit';
    if (statementFilter === 'withdraw') return tx.type === 'withdraw';
    if (statementFilter === 'match') return tx.type === 'entry' || tx.type === 'win';
    return true;
  });

  return (
    <div className="min-h-screen bg-transparent text-white pb-32 max-w-lg mx-auto select-none transition-colors duration-300">
      <div className="px-5 pt-6 space-y-5">
        {/* Payment Status Alerts */}
        <AnimatePresence>
          {paymentStatus && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`p-4 rounded-2xl border flex items-center gap-3.5 ${
                paymentStatus === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  paymentStatus === 'success'
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'
                }`}
              >
                {paymentStatus === 'success' ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <AlertCircle size={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider mb-0.5">
                  {paymentStatus === 'success'
                    ? 'Payment Successful'
                    : paymentStatus === 'failed'
                    ? 'Payment Failed'
                    : 'Payment Timeout'}
                </p>
                <p className="text-[10px] opacity-80 font-medium leading-tight">
                  {paymentStatus === 'success'
                    ? 'Your wallet balance has been updated.'
                    : 'There was an issue processing your payment. Please try again.'}
                </p>
              </div>
              <button
                onClick={() => setPaymentStatus(null)}
                className="opacity-70 hover:opacity-100 text-[10px] font-black uppercase px-2.5 py-1 bg-white/60 dark:bg-black/40 rounded-lg"
              >
                Dismiss
              </button>
            </motion.div>
          )}

          {verifyingOrder && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-2xl flex items-center gap-3"
            >
              <Loader2 size={16} className="text-purple-600 animate-spin shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-purple-600 dark:text-purple-400">
                Verifying Payment Status...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Section Heading */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a]">
            Wallet Management
          </span>
          <button
            type="button"
            onClick={handleOpenWalletRules}
            className="px-3 py-1.5 rounded-full bg-[rgba(243,122,32,0.15)] border border-[rgba(243,122,32,0.45)] text-[#F37A1F] text-[9px] font-bold uppercase tracking-[0.15em] flex items-center gap-1.5"
          >
            <HelpCircle size={12} />
            <span>Wallet Rules</span>
          </button>
        </div>

        {/* Total Account Balance Card */}
        <div className="bg-[#141414] bg-[linear-gradient(160deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_55%)] border-[1.5px] border-[rgba(243,122,32,0.45)] rounded-[30px] p-6 text-left">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] mb-1">
            Total Account Balance
          </p>
          <h3 className="text-[42px] font-black italic tracking-tight text-white my-2 tabular-nums leading-none">
            ₹{totalBalance.toLocaleString()}
          </h3>

          <div className="border-b border-transparent my-4" />

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-[#151515] border border-white/[0.06] rounded-[18px] py-3 px-2">
              <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-[#7a7a7a] mb-1">
                Deposit
              </span>
              <span className="text-sm sm:text-base font-extrabold text-white tabular-nums">
                ₹{(user.wallet?.deposit || 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-[#151515] border border-white/[0.06] rounded-[18px] py-3 px-2 border-b-2 border-b-[#F37A1F]">
              <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-[#7a7a7a] mb-1">
                Winnings
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[#F37A1F] tabular-nums">
                ₹{(user.wallet?.winnings || 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-[#151515] border border-white/[0.06] rounded-[18px] py-3 px-2">
              <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-[#7a7a7a] mb-1">
                Bonus
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[#22C55E] tabular-nums">
                ₹{(user.wallet?.bonus || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Primary Actions: ADD CASH + WITHDRAW MONEY */}
        <div className="space-y-3">
          <button
            onClick={() => onPageChange(Page.ADD_MONEY)}
            className="w-full h-14 bg-[linear-gradient(135deg,#F37A1F,#FF9A4D)] text-black rounded-[14px] font-extrabold text-xs flex items-center justify-center gap-2.5 uppercase tracking-[0.16em] shadow-[0_8px_24px_rgba(243,122,32,0.35)] active:scale-[0.97] transition-all"
          >
            <Plus size={18} className="stroke-[2.8]" />
            <span>Add Cash</span>
          </button>

          <button
            onClick={() => onPageChange(Page.WITHDRAW)}
            className="w-full h-14 bg-[#111] border border-[#3a3a3a] text-white rounded-[14px] font-extrabold text-xs flex items-center justify-center gap-2.5 uppercase tracking-[0.16em] hover:border-[#F37A1F]/60 active:scale-[0.97] transition-all"
          >
            <ArrowRightFromLine size={17} className="stroke-[2.4]" />
            <span>Withdraw Money</span>
          </button>
        </div>

        {/* Recent History & Statement Link */}
        <section className="pt-2">
          <div className="flex items-center justify-between mb-3.5 px-1">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a]">
              Recent History
            </h4>
            <button
              onClick={() => setShowStatementModal(true)}
              className="text-[10px] font-bold text-[#F37A1F] hover:underline flex items-center gap-1 uppercase tracking-[0.14em] active:scale-[0.97] transition-all"
            >
              <span>Statement</span>
              <ChevronRight size={13} className="stroke-[2.5]" />
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="py-6 bg-[#141414] border border-white/[0.06] rounded-[20px] flex flex-col items-center justify-center">
                <AdvancedLoader text="Fetching History..." />
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-12 bg-[#141414] border border-white/[0.06] rounded-[20px] text-center p-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3 text-slate-400 dark:text-neutral-500">
                  <History size={22} />
                </div>
                <p className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  No Transactions Found
                </p>
                <p className="text-[10px] font-medium text-slate-400 dark:text-neutral-500 mt-1">
                  Your recent deposits, withdrawals and match entries will appear here.
                </p>
              </div>
            ) : (
              transactions.map((tx) => {
                const credit = isCredit(tx);
                const isPending = tx.status === 'pending';
                const isCompleted = tx.status === 'completed';

                return (
                  <div
                    key={tx.id}
                    onClick={() => {
                      const statusNote =
                        tx.status === 'pending'
                          ? 'Status: PENDING — Waiting for Admin verification.'
                          : tx.status === 'completed'
                          ? 'Status: COMPLETED — Amount credited/processed in wallet.'
                          : `Status: REJECTED — ${tx.rejectionReason || 'No amount added to wallet.'}`;
                      showInfo(
                        (tx.title || tx.type).toUpperCase(),
                        `Amount: ₹${tx.amount}\nDate: ${formatTransactionDate(tx.createdAt)}`,
                        [
                          statusNote,
                          ...(tx.transactionId ? [`UTR / Ref ID: ${tx.transactionId}`] : []),
                          ...(tx.upiId ? [`UPI ID: ${tx.upiId}`] : []),
                        ]
                      );
                    }}
                    className="bg-[#141414] border border-white/[0.06] rounded-[20px] p-4 flex items-center justify-between transition-all cursor-pointer hover:border-[#F37A1F]/40 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-2">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm ${
                          credit
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500'
                            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-500'
                        }`}
                      >
                        {credit ? '₹' : <ArrowDown size={17} className="stroke-[2.5]" />}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
                          {tx.title || tx.type.replace('_', ' ')}
                        </p>
                        <p className="text-[9px] text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-[0.12em] mt-0.5">
                          {formatTransactionDate(tx.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-black italic tabular-nums ${
                          credit ? 'text-emerald-500' : 'text-rose-500'
                        }`}
                      >
                        {credit ? '+' : '-'}₹{tx.amount}
                      </p>
                      <span
                        className={`text-[8px] font-black uppercase tracking-[0.14em] ${
                          isPending
                            ? 'text-amber-500'
                            : isCompleted
                            ? 'text-emerald-500'
                            : 'text-rose-500'
                        }`}
                      >
                        {tx.status || 'COMPLETED'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Statement Modal */}
      <AnimatePresence>
        {showStatementModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowStatementModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#111] rounded-t-[40px] sm:rounded-[28px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 dark:border-neutral-800"
            >
              <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                      Account Statement
                    </h3>
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-neutral-500">
                      Total {transactions.length} recorded events
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStatementModal(false)}
                  className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="px-5 py-3 border-b border-slate-100 dark:border-neutral-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'deposit', label: 'Deposits' },
                  { id: 'withdraw', label: 'Withdrawals' },
                  { id: 'match', label: 'Matches' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatementFilter(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                      statementFilter === tab.id
                        ? 'bg-purple-600 text-black shadow-xs'
                        : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-5 overflow-y-auto space-y-2.5 flex-1 max-h-[50vh]">
                {filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                    No transactions matching this filter.
                  </div>
                ) : (
                  filteredTransactions.map((tx) => {
                    const credit = isCredit(tx);
                    return (
                      <div
                        key={tx.id}
                        className="bg-slate-50/80 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-2xl p-3.5 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-black text-slate-900 dark:text-white uppercase text-[11px] truncate">
                            {tx.title || tx.type}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 mt-0.5">
                            {formatTransactionDate(tx.createdAt)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`font-black italic text-xs tabular-nums ${
                              credit ? 'text-emerald-500' : 'text-rose-500'
                            }`}
                          >
                            {credit ? '+' : '-'}₹{tx.amount}
                          </p>
                          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                            {tx.status}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-neutral-800">
                <button
                  onClick={() => setShowStatementModal(false)}
                  className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-black rounded-2xl font-black text-[10px] uppercase tracking-[0.16em] transition-colors"
                >
                  Close Statement
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
