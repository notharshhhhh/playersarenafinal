import React from 'react';
import { motion } from 'motion/react';
import { Gamepad2, Sparkles } from 'lucide-react';
import SafeImage from './SafeImage';
import { useAppBranding } from '../hooks/useAppBranding';

interface AdvancedLoaderProps {
  text?: string;
  subtext?: string;
  fullScreen?: boolean;
}

export default function AdvancedLoader({
  text = 'SYNCING ARENA DATA',
  subtext = 'PLEASE WAIT A MOMENT...',
  fullScreen = false,
}: AdvancedLoaderProps) {
  const { appName, appLogoUrl } = useAppBranding();

  return (
    <div
      className={`${
        fullScreen
          ? 'min-h-screen bg-[#f8f9fc] dark:bg-transparent'
          : 'py-16 w-full'
      } flex flex-col items-center justify-center p-6 select-none relative overflow-hidden`}
    >
      {/* Ambient Background Glow */}
      <div className="absolute w-56 h-56 rounded-full bg-purple-600/15 dark:bg-purple-600/20 blur-3xl pointer-events-none animate-pulse" />

      {/* Multi-Ring Orbital Spinner */}
      <div className="relative w-24 h-24 flex items-center justify-center mb-5">
        {/* Outer Rotating Dashed Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-[28px] border-2 border-dashed border-purple-500/40 dark:border-purple-400/40"
        />

        {/* Middle Counter-Rotating Gradient Ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-2 rounded-[22px] border-2 border-transparent border-t-[#F37A1F] border-r-indigo-500 shadow-[0_0_20px_rgba(243,122,32,0.35)]"
        />

        {/* Inner Pulsing Core with App Logo */}
        <motion.div
          animate={{ scale: [0.94, 1.05, 0.94] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="relative w-14 h-14 rounded-2xl bg-[rgba(243,122,32,0.15)] dark:bg-[#111111] border border-purple-300/80 dark:border-purple-500/30 shadow-lg flex items-center justify-center overflow-hidden p-1.5"
        >
          {appLogoUrl ? (
            <SafeImage
              src={appLogoUrl}
              alt={appName}
              className="w-full h-full object-cover rounded-xl"
            />
          ) : (
            <Gamepad2 className="w-6 h-6 text-[#F37A1F]" />
          )}
        </motion.div>
      </div>

      {/* Animated Progress Bar */}
      <div className="w-44 h-1.5 bg-purple-200/60 dark:bg-purple-950/60 rounded-full overflow-hidden mb-3 border border-purple-300/30 dark:border-purple-500/20">
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-full h-full bg-gradient-to-r from-transparent via-[#F37A1F] to-transparent"
        />
      </div>

      {/* Text & Subtext */}
      <div className="text-center space-y-1 relative z-10">
        <div className="flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#F37A1F] animate-spin" />
          <h4 className="text-xs font-black italic uppercase tracking-[0.16em] text-slate-900 dark:text-white">
            {text}
          </h4>
        </div>
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-purple-300/60">
          {subtext}
        </p>
      </div>
    </div>
  );
}
