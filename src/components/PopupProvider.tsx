import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  Loader2,
  Sparkles,
  ShieldAlert,
  Bell,
} from 'lucide-react';

export type PopupVariant = 'warning' | 'success' | 'error' | 'instruction' | 'confirm';

export interface PopupOptions {
  variant?: PopupVariant;
  badge?: string;
  title: string;
  message: string;
  instructions?: string[];
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface PopupContextValue {
  showPopup: (options: PopupOptions) => void;
  showConfirm: (options: Omit<PopupOptions, 'showCancel'>) => Promise<boolean>;
  showWarning: (title: string, message: string, instructions?: string[]) => void;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showInstructions: (title: string, message: string, instructions: string[]) => void;
  showInfo: (title: string, message: string, instructions?: string[]) => void;
  closePopup: () => void;
}

const PopupContext = createContext<PopupContextValue | null>(null);

export function usePopup() {
  const ctx = useContext(PopupContext);
  if (!ctx) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return ctx;
}

export function PopupProvider({ children }: { children: React.ReactNode }) {
  const [popup, setPopup] = useState<PopupOptions | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resolver, setResolver] = useState<((val: boolean) => void) | null>(null);

  const closePopup = useCallback(() => {
    if (resolver) {
      resolver(false);
      setResolver(null);
    }
    setPopup(null);
    setIsProcessing(false);
  }, [resolver]);

  const showPopup = useCallback((options: PopupOptions) => {
    setResolver(null);
    setPopup(options);
  }, []);

  const showConfirm = useCallback((options: Omit<PopupOptions, 'showCancel'>): Promise<boolean> => {
    return new Promise((resolve) => {
      setResolver(() => resolve);
      setPopup({
        ...options,
        variant: options.variant || 'confirm',
        showCancel: true,
        confirmText: options.confirmText || 'CONFIRM',
        cancelText: options.cancelText || 'CANCEL',
      });
    });
  }, []);

  const showWarning = useCallback((title: string, message: string, instructions?: string[]) => {
    setResolver(null);
    setPopup({
      variant: 'warning',
      badge: 'IMPORTANT WARNING',
      title,
      message,
      instructions,
      confirmText: 'UNDERSTOOD',
    });
  }, []);

  const showSuccess = useCallback((title: string, message: string) => {
    setResolver(null);
    setPopup({
      variant: 'success',
      badge: 'ACTION COMPLETED',
      title,
      message,
      confirmText: 'AWESOME',
    });
  }, []);

  const showError = useCallback((title: string, message: string) => {
    setResolver(null);
    setPopup({
      variant: 'error',
      badge: 'ACTION FAILED',
      title,
      message,
      confirmText: 'GOT IT',
    });
  }, []);

  const showInstructions = useCallback(
    (title: string, message: string, instructions: string[]) => {
      setResolver(null);
      setPopup({
        variant: 'instruction',
        badge: 'INSTRUCTIONS & GUIDE',
        title,
        message,
        instructions,
        confirmText: 'GOT IT, PROCEED',
      });
    },
    []
  );

  const showInfo = useCallback(
    (title: string, message: string, instructions?: string[]) => {
      setResolver(null);
      setPopup({
        variant: 'instruction',
        badge: 'DETAILS & INFO',
        title,
        message,
        instructions,
        confirmText: 'CLOSE',
      });
    },
    []
  );

  const handleConfirmClick = async () => {
    if (!popup) return;
    if (popup.onConfirm) {
      setIsProcessing(true);
      try {
        await popup.onConfirm();
      } finally {
        setIsProcessing(false);
      }
    }
    if (resolver) {
      resolver(true);
      setResolver(null);
    }
    setPopup(null);
  };

  const handleCancelClick = () => {
    if (popup?.onCancel) {
      popup.onCancel();
    }
    if (resolver) {
      resolver(false);
      setResolver(null);
    }
    setPopup(null);
  };

  const getVariantConfig = (variant: PopupVariant = 'instruction') => {
    switch (variant) {
      case 'success':
        return {
          icon: CheckCircle2,
          badgeText: popup?.badge || 'SUCCESSFUL',
          iconBg: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-500',
          badgeBg: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
          primaryBtn:
            'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)]',
          glowColor: 'from-emerald-500/20 via-purple-500/10 to-transparent',
        };
      case 'error':
        return {
          icon: XCircle,
          badgeText: popup?.badge || 'ALERT / ERROR',
          iconBg: 'bg-rose-500/15 border-rose-500/35 text-rose-500',
          badgeBg: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
          primaryBtn:
            'bg-transparent border-[1.5px] border-[#FF3B3B] text-[#FF3B3B] hover:bg-[#FF3B3B]/10',
          glowColor: 'from-rose-500/20 via-purple-500/10 to-transparent',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          badgeText: popup?.badge || 'WARNING NOTICE',
          iconBg: 'bg-amber-500/15 border-amber-500/35 text-amber-500',
          badgeBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
          primaryBtn:
            'bg-[#F37A1F] hover:bg-[#D9660F] text-black shadow-[0_8px_24px_rgba(243,122,32,0.38)]',
          glowColor: 'from-amber-500/20 via-purple-500/10 to-transparent',
        };
      case 'confirm':
        return {
          icon: ShieldAlert,
          badgeText: popup?.badge || 'CONFIRMATION REQUIRED',
          iconBg: 'bg-purple-500/15 border-purple-500/35 text-[#F37A1F] dark:text-purple-400',
          badgeBg: 'bg-purple-500/15 text-[#F37A1F] dark:text-purple-300 border-purple-500/30',
          primaryBtn:
            'bg-[#F37A1F] hover:bg-[#D9660F] text-black shadow-[0_8px_24px_rgba(243,122,32,0.38)]',
          glowColor: 'from-purple-500/25 via-indigo-500/10 to-transparent',
        };
      default:
        return {
          icon: Info,
          badgeText: popup?.badge || 'INSTRUCTIONS',
          iconBg: 'bg-purple-500/15 border-purple-500/35 text-[#F37A1F] dark:text-purple-400',
          badgeBg: 'bg-purple-500/15 text-[#F37A1F] dark:text-purple-300 border-purple-500/30',
          primaryBtn:
            'bg-[#F37A1F] hover:bg-[#D9660F] text-black shadow-[0_8px_24px_rgba(243,122,32,0.38)]',
          glowColor: 'from-purple-500/25 via-indigo-500/10 to-transparent',
        };
    }
  };

  const config = getVariantConfig(popup?.variant);
  const IconComponent = config.icon;

  return (
    <PopupContext.Provider
      value={{
        showPopup,
        showConfirm,
        showWarning,
        showSuccess,
        showError,
        showInstructions,
        showInfo,
        closePopup,
      }}
    >
      {children}

      <AnimatePresence>
        {popup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none"
            onClick={popup.showCancel ? handleCancelClick : closePopup}
          >
            <motion.div
              initial={{ scale: 0.86, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 18 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-[30px] p-6 bg-[rgba(243,122,32,0.15)] dark:bg-[#111111] border border-purple-300/80 dark:border-purple-500/30 shadow-[0_24px_60px_rgba(243,122,32,0.28)] overflow-hidden"
            >
              {/* Subtle Ambient Top Glow */}
              <div
                className={`absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full bg-gradient-to-b ${config.glowColor} blur-2xl pointer-events-none`}
              />

              <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                {/* Animated Floating Icon Ring */}
                <motion.div
                  initial={{ scale: 0.6, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.05 }}
                  className={`w-16 h-16 rounded-[22px] border flex items-center justify-center shadow-inner ${config.iconBg}`}
                >
                  <IconComponent className="w-8 h-8 stroke-[2.2]" />
                </motion.div>

                {/* Kicker Pill Badge */}
                <span
                  className={`px-3.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.18em] border ${config.badgeBg}`}
                >
                  {config.badgeText}
                </span>

                {/* Bold Italic Uppercase Title */}
                <h3 className="text-lg font-black italic uppercase tracking-tight text-slate-900 dark:text-white leading-snug px-2">
                  {popup.title}
                </h3>

                {/* White / Dark Inner Card for Message & Instructions (Matches Reference Card Style) */}
                <div className="w-full bg-white/95 dark:bg-[#111111] rounded-3xl p-4 border border-purple-100 dark:border-purple-500/20 shadow-xs text-left space-y-3">
                  <p className="text-xs font-bold text-slate-700 dark:text-purple-100/90 leading-relaxed text-center">
                    {popup.message}
                  </p>

                  {popup.instructions && popup.instructions.length > 0 && (
                    <div className="pt-2 border-t border-purple-100/80 dark:border-purple-500/15 space-y-2">
                      <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-[#F37A1F] dark:text-purple-400 block">
                        KEY INSTRUCTIONS:
                      </span>
                      {popup.instructions.map((inst, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          <span className="w-4 h-4 rounded-full bg-purple-500/15 text-[#F37A1F] dark:text-purple-400 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span className="leading-snug">{inst}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className={`w-full grid ${popup.showCancel ? 'grid-cols-2' : 'grid-cols-1'} gap-3 pt-1`}>
                  {popup.showCancel && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleCancelClick}
                      className="py-3.5 px-4 rounded-2xl bg-white dark:bg-[#111111] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-600 dark:text-slate-300 hover:text-rose-500 border border-purple-200/70 dark:border-purple-500/20 text-[10px] font-black uppercase tracking-widest active:scale-[0.97] transition-all btn-press"
                    >
                      {popup.cancelText || 'CANCEL'}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleConfirmClick}
                    className={`py-3.5 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.97] transition-all btn-press ${config.primaryBtn}`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>PROCESSING...</span>
                      </>
                    ) : (
                      <span>{popup.confirmText || 'OK, GOT IT'}</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PopupContext.Provider>
  );
}
