import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export interface AppBranding {
  appName: string;
  appLogoUrl: string;
}

const DEFAULT_BRANDING: AppBranding = {
  appName: 'KIDS ADDA',
  appLogoUrl: 'https://i.ibb.co/n8jPYbMP/image.png',
};

export function getCachedAppBranding(): AppBranding {
  try {
    const cached = localStorage.getItem('kg_app_branding');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.appName === 'string' && parsed.appName.trim()) {
        return {
          appName: parsed.appName.trim(),
          appLogoUrl: parsed.appLogoUrl?.trim() || DEFAULT_BRANDING.appLogoUrl,
        };
      }
    }
  } catch {}
  return DEFAULT_BRANDING;
}

export function saveCachedAppBranding(branding: AppBranding) {
  try {
    localStorage.setItem('kg_app_branding', JSON.stringify(branding));
    window.dispatchEvent(new CustomEvent('app-branding-updated', { detail: branding }));
  } catch {}
}

export function useAppBranding() {
  const [branding, setBranding] = useState<AppBranding>(getCachedAppBranding);

  useEffect(() => {
    const handleCustomUpdate = (e: any) => {
      if (e?.detail?.appName) {
        setBranding(e.detail);
        if (typeof document !== 'undefined') {
          document.title = `${e.detail.appName} - Free Fire Esports`;
        }
      }
    };
    window.addEventListener('app-branding-updated', handleCustomUpdate);

    const applyDocData = (data: any) => {
      if (!data) return;
      const rawName = (data.appName || data.manualPayment?.merchantName || '').trim();
      const rawLogo = (data.appLogoUrl || '').trim();
      if (rawName || rawLogo) {
        const current = getCachedAppBranding();
        const next: AppBranding = {
          appName: rawName || current.appName || DEFAULT_BRANDING.appName,
          appLogoUrl: rawLogo || current.appLogoUrl || DEFAULT_BRANDING.appLogoUrl,
        };
        setBranding(next);
        try {
          localStorage.setItem('kg_app_branding', JSON.stringify(next));
        } catch {}
        if (typeof document !== 'undefined') {
          document.title = `${next.appName} - Free Fire Esports`;
        }
      }
    };

    const unsub1 = onSnapshot(
      doc(db, 'appSettings', 'referral_support'),
      (snap) => {
        if (snap.exists()) {
          applyDocData(snap.data());
        }
      },
      () => {}
    );

    const unsub2 = onSnapshot(
      doc(db, 'appSettings', 'general'),
      (snap) => {
        if (snap.exists()) {
          applyDocData(snap.data());
        }
      },
      () => {}
    );

    return () => {
      window.removeEventListener('app-branding-updated', handleCustomUpdate);
      unsub1();
      unsub2();
    };
  }, []);

  const renderSplitAppName = (accentClassName = 'text-purple-600 dark:text-purple-500') => {
    const raw = (branding.appName || DEFAULT_BRANDING.appName).trim().toUpperCase();
    const parts = raw.split(/\s+/);
    if (parts.length >= 2) {
      const firstPart = parts.slice(0, -1).join(' ');
      const lastPart = parts[parts.length - 1];
      return (
        <>
          {firstPart} <span className={accentClassName}>{lastPart}</span>
        </>
      );
    }
    if (raw.length > 5) {
      const mid = Math.ceil(raw.length / 2);
      return (
        <>
          {raw.slice(0, mid)}
          <span className={accentClassName}>{raw.slice(mid)}</span>
        </>
      );
    }
    return <span className={accentClassName}>{raw}</span>;
  };

  return {
    appName: branding.appName,
    appLogoUrl: branding.appLogoUrl,
    renderSplitAppName,
  };
}
