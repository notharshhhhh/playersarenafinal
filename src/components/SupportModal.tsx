import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, Mail, X, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const fetchSettings = async () => {
        try {
          const snap = await getDoc(doc(db, 'appSettings', 'referral_support'));
          if (snap.exists()) {
            setSettings(snap.data().support);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchSettings();
    }
  }, [isOpen]);

  const supportOptions = [
    {
      label: 'WhatsApp Support',
      icon: MessageSquare,
      color: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20',
      link: settings?.whatsapp || 'https://wa.me/',
      desc: 'Instant replies • 9 AM - 9 PM',
    },
    {
      label: 'Telegram Community',
      icon: Send,
      color: 'bg-[#0088cc]/10 text-[#0088cc] border-[#0088cc]/20',
      link: settings?.telegram || 'https://t.me/',
      desc: 'Official updates & room alerts',
    },
    {
      label: 'Email Helpdesk',
      icon: Mail,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      link: `mailto:${settings?.email || 'support@khelgalli.com'}`,
      desc: 'Business & technical inquiries',
    },
  ];

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
            transition={{ type: 'spring', damping: 26, stiffness: 240 }}
            className="relative w-full max-w-md bg-[#111] rounded-t-[40px] sm:rounded-[28px] p-6 pb-10 sm:pb-6 border border-slate-100 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[82vh] overflow-hidden z-10"
          >
            {/* Grab Handle on Mobile */}
            <div className="w-10 h-1 bg-slate-200 dark:bg-neutral-800 rounded-full mx-auto mb-5 sm:hidden" />

            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight uppercase text-slate-900 dark:text-white leading-none">
                  Customer <span className="text-purple-600 dark:text-purple-500">Support</span>
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500 mt-1">
                  24/7 Official Help Desk
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto no-scrollbar space-y-4">
              {/* Status Card */}
              <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-400">
                    System Status: Operational
                  </span>
                </div>
                <ShieldCheck size={15} className="text-emerald-500" />
              </div>

              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <Loader2 className="text-purple-600 animate-spin mb-3" size={28} />
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500">
                    Syncing support channels...
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {supportOptions.map((opt) => (
                    <a
                      key={opt.label}
                      href={opt.link}
                      target="_blank"
                      rel="noreferrer"
                      className="p-4 bg-slate-50/70 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-[20px] flex items-center justify-between group active:scale-[0.99] transition-all hover:border-purple-500/30"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${opt.color}`}
                        >
                          <opt.icon size={20} className="stroke-[2]" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white">
                            {opt.label}
                          </h4>
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mt-0.5">
                            {opt.desc}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-slate-300 dark:text-neutral-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all"
                      />
                    </a>
                  ))}
                </div>
              )}

              <div className="p-4 bg-slate-50 dark:bg-neutral-900/60 rounded-2xl border border-slate-100 dark:border-neutral-800/80">
                <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-[0.12em] leading-relaxed text-center">
                  Our support team typically responds within 30–60 minutes during active hours. Please keep your Transaction ID ready for wallet queries.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
