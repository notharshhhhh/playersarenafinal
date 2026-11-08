import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRightFromLine,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Page, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';

interface WithdrawProps {
  user: User | null;
  onPageChange: (page: Page) => void;
}

export default function Withdraw({ user, onPageChange }: WithdrawProps) {
  const [amount, setAmount] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawLimits, setWithdrawLimits] = useState<{ minWithdraw: number; maxWithdraw: number }>({
    minWithdraw: 50,
    maxWithdraw: 25000,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'appSettings', 'referral_support'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const limits = data?.limits || {};
          setWithdrawLimits({
            minWithdraw: Number(limits.minWithdraw ?? data?.minWithdraw ?? 50),
            maxWithdraw: Number(limits.maxWithdraw ?? data?.maxWithdraw ?? 25000),
          });
        }
      },
      () => {}
    );
    return () => unsub();
  }, []);

  const withdrawableBalance =
    user?.wallet?.winnings ?? (user as any)?.winningsBalance ?? (user as any)?.walletBalance ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numAmount = Number(amount);

    if (!numAmount || numAmount < withdrawLimits.minWithdraw) {
      setError(`Minimum withdrawal amount is ₹${withdrawLimits.minWithdraw}`);
      return;
    }
    if (numAmount > withdrawLimits.maxWithdraw) {
      setError(`Maximum withdrawal amount is ₹${withdrawLimits.maxWithdraw}`);
      return;
    }
    if (numAmount > withdrawableBalance) {
      setError('Insufficient winning balance for this withdrawal');
      return;
    }
    if (!upiId.trim() || !upiId.includes('@')) {
      setError('Please enter a valid UPI ID (e.g. name@oksbi)');
      return;
    }

    const uid = user?.id || auth.currentUser?.uid;
    if (!uid) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: uid,
        userName: user?.username || (user as any)?.name || 'Player',
        userEmail: user?.email || auth.currentUser?.email || '',
        type: 'withdrawal',
        title: 'Winnings Withdrawal',
        amount: numAmount,
        upiId: upiId.trim(),
        status: 'pending',
        date: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        createdAt: serverTimestamp(),
      });

      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        'wallet.winnings': increment(-numAmount),
      });

      setSubmitted(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
      setError('Failed to process withdrawal request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-transparent text-white pb-28 transition-colors duration-300 select-none"
    >
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl px-4 py-3.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-zinc-300 active:scale-[0.97] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
              Withdraw Winnings
            </h1>
            <p className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
              Direct UPI Transfer
            </p>
          </div>
        </div>

        <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          ₹{withdrawLimits.minWithdraw} - ₹{withdrawLimits.maxWithdraw}
        </span>
      </div>

      <div className="px-4 pt-5 space-y-5">
        {/* Available Winnings Card */}
        <div className="bg-[#141414] rounded-[28px] p-6 border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] block">
              WITHDRAWABLE WINNINGS
            </span>
            <span className="text-3xl font-black italic text-emerald-500 mt-1 block">
              ₹{withdrawableBalance}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-100 dark:border-emerald-500/20">
            <ArrowRightFromLine className="w-6 h-6" />
          </div>
        </div>

        {submitted ? (
          <div className="bg-white dark:bg-[#141414] rounded-[30px] p-8 text-center border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
              Withdrawal Requested!
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Your withdrawal request of{' '}
              <span className="text-slate-900 dark:text-white font-black">₹{amount}</span> to{' '}
              <span className="text-purple-500 font-black">{upiId}</span> is now{' '}
              <span className="text-amber-500 font-black">PENDING</span> admin approval.
            </p>
            <button
              onClick={() => onPageChange(Page.WALLET)}
              className="w-full py-4 rounded-2xl bg-[#F37A1F] text-black text-xs font-black uppercase tracking-widest shadow-md active:scale-[0.97] transition-all"
            >
              Back to Wallet
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-[#141414] rounded-[28px] p-5 border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.03)] space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] block">
                    WITHDRAWAL AMOUNT
                  </label>
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                    Min ₹{withdrawLimits.minWithdraw} • Max ₹{withdrawLimits.maxWithdraw}
                  </span>
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Enter amount (₹${withdrawLimits.minWithdraw} - ₹${withdrawLimits.maxWithdraw})`}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 rounded-2xl py-3.5 px-4 text-lg font-black italic text-slate-900 dark:text-white focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] block mb-2">
                  YOUR UPI ID
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="example@okaxis"
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 rounded-2xl py-3.5 px-4 text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                />
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center gap-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 rounded-2xl bg-[#F37A1F] hover:bg-[#D9660F] text-black text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              {submitting ? 'PROCESSING...' : 'CONFIRM WITHDRAWAL'}
            </button>
          </form>
        )}
      </div>
    </motion.div>
  );
}
