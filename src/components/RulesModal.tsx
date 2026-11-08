import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Star, Sword, Target, Loader2, Check } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: string;
  onJoin: () => void;
  isJoined: boolean;
}

export default function RulesModal({ isOpen, onClose, section, onJoin, isJoined }: RulesModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeSectionKey = (secName: string) => {
    return (secName || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  };

  const getIcon = (sec: string) => {
    const s = (sec || '').toLowerCase();
    if (s.includes('clash') || s.includes('4v4')) return <Shield className="text-blue-500" size={18} />;
    if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2'))
      return <Target className="text-pink-500" size={18} />;
    if (s.includes('sniper')) return <Target className="text-amber-500" size={18} />;
    if (s.includes('custom')) return <Star className="text-purple-500" size={18} />;
    return <Sword className="text-purple-600 dark:text-purple-400" size={18} />;
  };

  useEffect(() => {
    if (isOpen) {
      setAgreed(false);
      setLoading(true);
      const fetchRules = async () => {
        try {
          const s = (section || 'Battle Royale').toLowerCase().trim();
          const normKey = normalizeSectionKey(s);

          let docSnap = await getDoc(doc(db, 'gameRules', normKey));

          if (!docSnap.exists()) {
            if (s.includes('clash') || s.includes('cs') || s.includes('4v4')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
            } else if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
            } else if (s.includes('sniper')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
            } else if (s.includes('custom')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'custom_room'));
            } else {
              docSnap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
            }
          }

          if (docSnap.exists() && docSnap.data().rules && docSnap.data().rules.length > 0) {
            setRules(docSnap.data().rules);
          } else {
            setRules([
              'Fair Play: No hacking, scripts or third-party tools allowed.',
              'Device Requirements: Mobile and Tablet players only. Strictly no emulators.',
              'Verification: Screenshot of victory/final scorecard is mandatory in case of disputes.',
              'Late Entry: Room closes right before match starts. Late entry is not entertained.',
              'Admin Decision: Admin decision will be final and binding for all participants.',
            ]);
          }
        } catch (error) {
          console.error('Error fetching rules:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchRules();
    }
  }, [isOpen, section]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 15 }}
            className="w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[28px] p-6 shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5 relative">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  Match <span className="text-purple-600 dark:text-purple-500">Rules</span>
                </h3>
                <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-[0.15em] mt-0.5">
                  Read carefully before deployment
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-2xl hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-5 p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 flex items-center gap-3">
              <div className="w-9 h-9 bg-white dark:bg-neutral-900 rounded-xl flex items-center justify-center shadow-xs">
                {getIcon(section)}
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-purple-900 dark:text-purple-300">
                {section === 'Battle Royale' ? 'Battle Royale' : section}
              </span>
            </div>

            <div className="max-h-[38vh] overflow-y-auto no-scrollbar mb-6 space-y-3 pr-1">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 dark:text-neutral-500">
                  <Loader2 className="animate-spin mb-2 text-purple-600" size={24} />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em]">
                    Loading Regulations...
                  </span>
                </div>
              ) : rules.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                    No rules set by admin
                  </p>
                </div>
              ) : (
                rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex gap-3 p-3 rounded-2xl bg-slate-50/80 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800/80"
                  >
                    <span className="text-purple-600 dark:text-purple-400 font-black text-xs mt-0.5 shrink-0">
                      0{idx + 1}
                    </span>
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-neutral-300 leading-relaxed">
                      {rule}
                    </p>
                  </div>
                ))
              )}
            </div>

            {!isJoined && (
              <div className="mb-5">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="peer appearance-none w-5 h-5 border border-slate-300 dark:border-neutral-700 rounded-lg checked:bg-purple-600 checked:border-purple-600 transition-all cursor-pointer"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <div className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none">
                      <Check size={12} className="stroke-[3]" />
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-neutral-400">
                    I agree to all the rules
                  </span>
                </label>
              </div>
            )}

            <button
              disabled={!isJoined && !agreed}
              onClick={() => {
                if (isJoined || agreed) {
                  onJoin();
                  onClose();
                }
              }}
              className={`w-full py-3.5 text-[11px] font-black uppercase tracking-[0.16em] rounded-2xl active:scale-[0.97] transition-all ${
                isJoined || agreed
                  ? 'bg-purple-600 hover:bg-purple-700 text-black shadow-lg shadow-purple-600/25'
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-600 cursor-not-allowed'
              }`}
            >
              {isJoined ? 'Got It' : 'Join Match'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
