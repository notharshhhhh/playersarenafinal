import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Users, Gift, Share2, Copy, CheckCircle2, Award, Trophy } from 'lucide-react';
import { Page, User } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAppBranding } from '../hooks/useAppBranding';

interface ReferralPageProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function ReferralPage({ user, onPageChange }: ReferralPageProps) {
  const { appName } = useAppBranding();
  const [copied, setCopied] = useState(false);
  const [appSettings, setAppSettings] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists()) {
        setAppSettings(snap.data());
      }
    });
    return () => unsub();
  }, []);

  const referralCode = user.username;
  const baseUrl = appSettings?.referral?.baseUrl?.replace(/\/$/, '') || window.location.origin;
  const referralLink = `${baseUrl}/signup?ref=${referralCode}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${appName} Referral`,
          text: `Join ${appName} using my referral code ${referralCode} and get ₹${appSettings?.referral?.newUserReward || 10} bonus!`,
          url: referralLink,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopy(referralLink);
        }
      }
    } else {
      handleCopy(referralLink);
    }
  };

  const refReward = appSettings?.referral?.perReferralReward || 0;
  const rewardType = appSettings?.referral?.rewardType || 'bonus';
  const newUserReward = appSettings?.referral?.newUserReward || 0;

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#f8f9fc] dark:bg-transparent min-h-screen text-slate-900 dark:text-white transition-colors duration-300">
      <div className="px-5 py-7">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-10 h-10 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-2xl text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center shadow-xs transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight uppercase text-slate-900 dark:text-white leading-none">
              Refer &amp; <span className="text-purple-600 dark:text-purple-500">Earn</span>
            </h2>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-neutral-500 mt-1">
              Unlimited Rewards Program
            </p>
          </div>
        </div>

        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden p-7 rounded-[30px] bg-gradient-to-br from-purple-600 to-indigo-700 shadow-xl shadow-purple-600/20 mb-7"
        >
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Gift size={110} />
          </div>
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-5 backdrop-blur-md">
              <Gift className="text-white" size={24} />
            </div>
            <h3 className="text-2xl font-black italic text-white uppercase leading-tight mb-3">
              Invite Friends,
              <br />
              Get ₹{refReward} Rewards
            </h3>
            <p className="text-[10px] font-bold text-purple-100 uppercase tracking-[0.12em] opacity-90 leading-relaxed mb-5">
              Spread the word and build your gaming squad. You get ₹{refReward}{' '}
              {rewardType === 'both' ? 'split' : rewardType} for every friend who joins.
            </p>
            <div className="flex items-center gap-2.5">
              <div className="px-4 py-2.5 bg-black/30 rounded-xl backdrop-blur-md border border-white/15">
                <span className="text-xs font-black text-white tracking-wider">{referralCode}</span>
              </div>
              <button
                onClick={() => handleCopy(referralCode)}
                className="p-2.5 bg-white rounded-xl text-purple-600 active:scale-90 transition-transform shadow-sm"
              >
                {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </motion.div>

        {/* How it works */}
        <section className="space-y-3 mb-7">
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400 ml-1">
            How It Works
          </h4>
          <div className="grid grid-cols-1 gap-3">
            <Step
              num="01"
              title="Share your link"
              desc="Send your unique referral link to your friends or squad members."
              icon={Share2}
            />
            <Step
              num="02"
              title="Friend Registers"
              desc={`They get ₹${newUserReward} instant bonus when they sign up using your link.`}
              icon={Users}
            />
            <Step
              num="03"
              title="Earn Together"
              desc={`You receive ₹${refReward} reward instantly in your wallet.`}
              icon={Award}
            />
          </div>
        </section>

        {/* Share Button */}
        <button
          onClick={handleShare}
          className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-black rounded-[20px] text-xs font-black uppercase tracking-[0.16em] flex items-center justify-center gap-3 shadow-lg shadow-purple-600/20 active:scale-[0.97] transition-all mb-7"
        >
          <Share2 size={18} />
          Share Referral Link
        </button>

        {/* Info Card */}
        <div className="p-6 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[20px]">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={18} className="text-amber-500" />
            <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white">
              Program Guidelines
            </h4>
          </div>
          <ul className="space-y-2.5">
            {[
              'One device allowed per referral',
              'Referee must be a new user',
              'Rewards are credited instantly',
              'No limit on number of referrals',
            ].map((rule, idx) => (
              <li
                key={idx}
                className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-[0.12em]"
              >
                <span className="text-purple-600 dark:text-purple-400 font-black">·</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Step({ num, title, desc, icon: Icon }: any) {
  return (
    <div className="p-4 bg-[#141414] border border-white/[0.06] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-none flex items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 font-black italic text-xs">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h5 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white">
            {title}
          </h5>
          <Icon size={14} className="text-slate-400 dark:text-neutral-500" />
        </div>
        <p className="text-[10px] font-medium text-slate-500 dark:text-neutral-400 leading-relaxed">
          {desc}
        </p>
      </div>
    </div>
  );
}
