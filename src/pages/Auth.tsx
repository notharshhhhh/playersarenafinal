import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Chrome, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink, 
  Copy, 
  Check, 
  Globe, 
  X, 
  Smartphone, 
  Info,
  RefreshCw
} from 'lucide-react';
import SafeImage from '../components/SafeImage';
import { auth, db, resolvedFirebaseConfig } from '../lib/firebase';
import { ADMIN_EMAILS, DEFAULT_ADMIN_CREDENTIALS } from '../constants';
import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, getDocs, query, where, collection, addDoc } from 'firebase/firestore';
import { useAppBranding } from '../hooks/useAppBranding';

interface AuthProps {
  onLogin: () => void;
}

const DEFAULT_USER_DATA = {
  wallet: {
    deposit: 0,
    winnings: 0,
    bonus: 0,
  },
  isKycVerified: false,
  stats: {
    matchesPlayed: 0,
    totalWins: 0,
    totalKills: 0,
    totalWinnings: 0,
  }
};

export default function Auth({ onLogin }: AuthProps) {
  const { appName, appLogoUrl, renderSplitAppName } = useAppBranding();
  const [isLogin, setIsLogin] = useState(() => {
    if (typeof window === 'undefined') return true;
    const hasRef = !!new URLSearchParams(window.location.search).get('ref');
    return !(hasRef || window.location.pathname === '/signup');
  });
  const [loading, setLoading] = useState(false);
  const [isRedirectLoading, setIsRedirectLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showVercelModal, setShowVercelModal] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [domainAuthDiagnostic, setDomainAuthDiagnostic] = useState<{
    domain: string;
    projectId: string;
    code?: string;
  } | null>(null);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState(() =>
    typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('ref') || '').trim()
  );
  const [newUserRewardHint, setNewUserRewardHint] = useState(0);

  // Show the admin-configured referral bonus next to the field
  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'referral_support'))
      .then((snap) => {
        const reward = Number(snap.data()?.referral?.newUserReward || 0);
        if (reward > 0) setNewUserRewardHint(reward);
      })
      .catch(() => {});
  }, []);
  
  // Error State
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validatePhone = (p: string) => {
    return p.length === 10 && /^\d+$/.test(p);
  };

  const currentHostname = typeof window !== 'undefined' ? (window.location.hostname || window.location.host) : '';

  const handleCopyDomain = (text?: string) => {
    const toCopy = text || currentHostname;
    navigator.clipboard.writeText(toCopy);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2500);
  };

  // Listen for Google Redirect Results (critical for mobile web and Vercel environments)
  useEffect(() => {
    let isMounted = true;
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return;
        if (result && result.user) {
          setSuccessMsg('Google sign-in successful! Redirecting...');
          onLogin();
        }
      })
      .catch((error: any) => {
        if (!isMounted) return;
        console.error('Redirect sign-in error:', error);
        handleGoogleAuthError(error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Helper for performance timeout
  const withTimeout = async <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeout]);
  };

  const mapAuthError = (code: string) => {
    switch (code) {
      case 'auth/email-already-in-use': return 'Email already registered';
      case 'auth/weak-password': return 'Password must be at least 6 characters';
      case 'auth/network-request-failed': return 'Check your internet connection';
      case 'auth/invalid-email': return 'Enter valid email';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'Invalid email or password';
      case 'auth/unauthorized-domain': 
        return `Domain '${currentHostname}' is not authorized in Firebase Console. Tap below for setup guide.`;
      case 'auth/popup-blocked': 
        return 'Browser popup blocked. Tap "Use Redirect Login" to continue.';
      case 'auth/popup-closed-by-user': 
        return 'Sign-in cancelled: popup was closed before completion.';
      case 'auth/cancelled-popup-request': 
        return 'Sign-in cancelled. Please try again.';
      case 'auth/operation-not-allowed': 
        return 'Google Sign-In is disabled in Firebase Console. Enable Google under Authentication > Sign-in method.';
      default: return 'An unexpected error occurred. Try again.';
    }
  };

  const handleGoogleAuthError = (error: any) => {
    console.error('Google Auth Error:', error);
    const code = error?.code || '';
    const projectId = resolvedFirebaseConfig.projectId;

    if (
      code === 'auth/unauthorized-domain' || 
      error?.message?.includes('authorized domain') || 
      error?.message?.includes('unauthorized domain')
    ) {
      setDomainAuthDiagnostic({
        domain: currentHostname,
        projectId: projectId,
        code: code,
      });
      setShowVercelModal(true);
      setErrors({
        general: `Firebase Authorized Domain Error: '${currentHostname}' must be authorized in Firebase Console.`
      });
      return;
    }

    if (code === 'auth/popup-blocked') {
      setErrors({
        general: 'Popup was blocked by your browser. Tap "Use Redirect Login" below to sign in.'
      });
      return;
    }

    if (code === 'auth/popup-closed-by-user') {
      setErrors({ general: 'Google sign-in was cancelled before completion.' });
      return;
    }

    if (code === 'auth/cancelled-popup-request') {
      setErrors({ general: 'Previous sign-in request cancelled. Please try again.' });
      return;
    }

    if (code === 'auth/operation-not-allowed') {
      setErrors({
        general: 'Google Sign-in is not enabled in Firebase Console. Go to Authentication > Sign-in method to enable Google.'
      });
      return;
    }

    setErrors({ general: mapAuthError(code || error?.message) });
  };

  const handleForgotPassword = async () => {
    setErrors({});
    setSuccessMsg('');

    if (!email) {
      setErrors({ email: 'Enter your email' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrors({ email: 'Invalid email format' });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await withTimeout(sendPasswordResetEmail(auth, email), 5000, 'Request timed out. Please try again.');
      setSuccessMsg('Password reset link sent to your email');
    } catch (error: any) {
      console.error(error);
      setErrors({ email: mapAuthError(error.code) });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    setErrors({});
    setSuccessMsg('');
    
    const normalizedEmail = email.trim().toLowerCase();
    const newErrors: { [key: string]: string } = {};
    if (!normalizedEmail) newErrors.email = 'Email required';
    if (!password) newErrors.password = 'Password required';
    if (password && password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    
    if (!isLogin) {
      if (!username) newErrors.username = 'Username required';
      if (!phone) {
        newErrors.phone = '10 digit phone required';
      } else if (!validatePhone(phone)) {
        newErrors.phone = 'Enter valid 10 digit number';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        try {
          await withTimeout(signInWithEmailAndPassword(auth, normalizedEmail, password), 6000, 'Login taking too long. Check connection.');
          onLogin();
        } catch (error: any) {
          // Auto-provision the default Admin account on first login if not yet created in Firebase Auth
          const isDefaultAdminAttempt =
            normalizedEmail === DEFAULT_ADMIN_CREDENTIALS.email.toLowerCase() &&
            password === DEFAULT_ADMIN_CREDENTIALS.password;

          if (
            isDefaultAdminAttempt &&
            (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')
          ) {
            try {
              const adminCred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
              await setDoc(doc(db, 'users', adminCred.user.uid), {
                username: 'SUPER ADMIN',
                email: normalizedEmail,
                phone: '9999999999',
                ...DEFAULT_USER_DATA,
                isAdmin: true,
                referralClaimed: false,
                createdAt: serverTimestamp(),
              });
              onLogin();
              return;
            } catch (createErr: any) {
              if (createErr.code === 'auth/email-already-in-use') {
                try {
                  await sendPasswordResetEmail(auth, normalizedEmail);
                } catch {}
                setErrors({ 
                  general: "Admin account exists. Tap 'Continue with Google' to sign in with playersarena.site@gmail.com, or check email for a password setup link." 
                });
                return;
              }
              setErrors({ general: mapAuthError(createErr.code || createErr.message) });
              return;
            }
          }

          setErrors({ general: mapAuthError(error.code || error.message) });
        }
      } else {
        try {
          // Tell App.tsx not to auto-create a default profile while we build this one
          try { sessionStorage.setItem('kg_signup_in_progress', '1'); } catch {}
          const userCredential = await withTimeout(
            createUserWithEmailAndPassword(auth, normalizedEmail, password),
            6000,
            'Signup taking too long. Check connection.'
          );
          const firebaseUser = userCredential.user;

          let deviceId = localStorage.getItem('khel_galli_device_id');
          if (!deviceId) {
            deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
            localStorage.setItem('khel_galli_device_id', deviceId);
          }

          const isAdminAccount = ADMIN_EMAILS.includes(normalizedEmail);
          const enteredCode = referralCode.trim();

          // --- Resolve referral code (needs a signed-in user to query 'users') ---
          let referrerUsername: string | null = null;
          if (enteredCode) {
            let lookupOk = false;
            try {
              const refSnap = await getDocs(query(collection(db, 'users'), where('username', '==', enteredCode)));
              lookupOk = true;
              const match = refSnap.docs.find((d) => d.id !== firebaseUser.uid);
              if (match) referrerUsername = (match.data() as any).username || enteredCode;
            } catch (lookupErr) {
              // Could not verify the code - don't block signup, just skip the referral
              console.warn('Referral lookup failed:', lookupErr);
            }
            if (lookupOk && !referrerUsername) {
              // Code does not exist: roll back the just-created account so the user can fix the code
              try { await firebaseUser.delete(); } catch (delErr) { console.warn('Could not roll back signup:', delErr); }
              setErrors({ referralCode: 'Invalid referral code' });
              return;
            }
          }

          let signupBonus = 0;
          let referralBonus = 0;
          try {
            const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
            if (settingsSnap.exists()) {
              const sData = settingsSnap.data();
              if (typeof sData?.signupBonus === 'number') {
                signupBonus = Math.max(0, sData.signupBonus);
              } else if (typeof sData?.bonusSettings?.signupBonus === 'number') {
                signupBonus = Math.max(0, sData.bonusSettings.signupBonus);
              }
              if (referrerUsername) {
                referralBonus = Math.max(0, Number(sData?.referral?.newUserReward || 0));
              }
            }
          } catch (e) {
            console.warn('Could not read bonus settings:', e);
          }

          // Same-device fraud check: one referral bonus per device
          if (referrerUsername && referralBonus > 0) {
            try {
              const dup = await getDocs(query(
                collection(db, 'users'),
                where('deviceId', '==', deviceId),
                where('referralClaimed', '==', true)
              ));
              if (!dup.empty) {
                console.warn('Referral bonus skipped: device already used for a referral');
                referralBonus = 0;
              }
            } catch (e) {
              console.warn('Device check failed:', e);
            }
          }

          try {
            await withTimeout(
              setDoc(doc(db, 'users', firebaseUser.uid), {
                username,
                email: normalizedEmail,
                phone,
                ...DEFAULT_USER_DATA,
                wallet: {
                  deposit: 0,
                  winnings: 0,
                  bonus: signupBonus + referralBonus,
                },
                isAdmin: isAdminAccount,
                referredBy: referrerUsername,
                referralBonusPaid: referralBonus > 0,
                deviceId,
                referralClaimed: false,
                createdAt: serverTimestamp(),
              }),
              4000,
              'Profile creation delayed.'
            );

            if (signupBonus > 0) {
              await addDoc(collection(db, 'transactions'), {
                userId: firebaseUser.uid,
                type: 'bonus',
                amount: signupBonus,
                status: 'completed',
                title: 'Signup Welcome Bonus',
                createdAt: serverTimestamp(),
              });
            }

            if (referralBonus > 0) {
              await addDoc(collection(db, 'transactions'), {
                userId: firebaseUser.uid,
                type: 'bonus',
                amount: referralBonus,
                status: 'completed',
                title: `Referral Bonus (from ${referrerUsername})`,
                createdAt: serverTimestamp(),
              });
            }
          } catch (fsError) {
            console.warn('Firestore profile creation failed or timed out:', fsError);
          }

          setSuccessMsg('Registration successful! Redirecting...');
          onLogin();
        } catch (error: any) {
          setErrors({ general: mapAuthError(error.code || error.message) });
        } finally {
          try { sessionStorage.removeItem('kg_signup_in_progress'); } catch {}
        }
      }
    } catch (err: any) {
      setErrors({ general: err.message || 'Something went wrong' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrors({});
    setDomainAuthDiagnostic(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
      });
      try {
        await signInWithPopup(auth, provider);
        onLogin();
      } catch (popupErr: any) {
        if (popupErr?.code === 'auth/popup-blocked') {
          console.warn('Popup was blocked by browser. Attempting signInWithRedirect fallback...');
          setIsRedirectLoading(true);
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }
    } catch (error: any) {
      handleGoogleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRedirectLogin = async () => {
    setIsRedirectLoading(true);
    setLoading(true);
    setErrors({});
    setDomainAuthDiagnostic(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
      });
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      handleGoogleAuthError(error);
      setIsRedirectLoading(false);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col px-4 pt-12 pb-8 max-w-lg mx-auto transition-colors duration-300">
      <div className="flex-1 flex flex-col pt-6">
        <div className="mb-8 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-3 w-20 h-20 rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-xl bg-white dark:bg-black"
          >
            <SafeImage 
              src={appLogoUrl} 
              alt={appName} 
              className="w-full h-full object-cover"
            />
          </motion.div>
          <h1 className="text-2xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
            {renderSplitAppName()}
          </h1>
          <p className="text-[10px] font-extrabold text-slate-400 dark:text-neutral-500 uppercase tracking-[0.2em] mt-1">
            Start winning real rewards
          </p>
        </div>

        <div className="bg-[#141414] rounded-[28px] border border-slate-100 dark:border-neutral-800/80 p-7 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-2xl relative overflow-hidden mb-6">
          <div className="flex gap-3 mb-6 bg-slate-100 dark:bg-black/40 p-1.5 rounded-2xl border border-slate-200/60 dark:border-white/5">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setErrors({}); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                isLogin ? 'bg-purple-600 text-black shadow-lg shadow-purple-600/30' : 'text-slate-500 dark:text-neutral-500'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setErrors({}); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                !isLogin ? 'bg-purple-600 text-black shadow-lg shadow-purple-600/30' : 'text-slate-500 dark:text-neutral-500'
              }`}
            >
              Register
            </button>
          </div>

          {errors.general && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-500 text-[10px] font-bold uppercase tracking-wider"
            >
              <AlertCircle size={14} />
              {errors.general}
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider"
            >
              <CheckCircle2 size={14} />
              {successMsg}
            </motion.div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <AnimatePresence mode="wait">
              {isLogin ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] ml-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className={`w-full h-12 bg-[#111] rounded-[16px] px-4 text-xs font-bold text-white border-[1.5px] transition-all focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] ${
                        errors.email ? 'border-[#FF3B3B]' : 'border-[#2a2a2a] focus:border-[#F37A1F]'
                      }`}
                    />
                    {errors.email && <span className="text-[8px] text-rose-500 font-bold uppercase tracking-widest ml-1">{errors.email}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] ml-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full h-12 bg-[#111] rounded-[16px] px-4 text-xs font-bold text-white border-[1.5px] transition-all focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] ${
                        errors.password ? 'border-[#FF3B3B]' : 'border-[#2a2a2a] focus:border-[#F37A1F]'
                      }`}
                    />
                    {errors.password && <span className="text-[8px] text-rose-500 font-bold uppercase tracking-widest ml-1">{errors.password}</span>}
                  </div>
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotPasswordLoading || loading}
                      className="text-[9px] font-black uppercase tracking-widest text-[#FF9A4D] hover:text-[#F37A1F] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {forgotPasswordLoading && <div className="w-2.5 h-2.5 border border-[#F37A1F]/30 border-t-[#F37A1F] rounded-full animate-spin" />}
                      Forgot Password?
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] ml-1">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      className={`w-full h-12 bg-[#111] rounded-[16px] px-4 text-xs font-bold text-white border-[1.5px] transition-all focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] ${
                        errors.username ? 'border-[#FF3B3B]' : 'border-[#2a2a2a] focus:border-[#F37A1F]'
                      }`}
                    />
                    {errors.username && <span className="text-[8px] text-rose-500 font-bold uppercase tracking-widest ml-1">{errors.username}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] ml-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className={`w-full h-12 bg-[#111] rounded-[16px] px-4 text-xs font-bold text-white border-[1.5px] transition-all focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] ${
                        errors.email ? 'border-[#FF3B3B]' : 'border-[#2a2a2a] focus:border-[#F37A1F]'
                      }`}
                    />
                    {errors.email && <span className="text-[8px] text-rose-500 font-bold uppercase tracking-widest ml-1">{errors.email}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] ml-1">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10 digit number"
                      className={`w-full h-12 bg-[#111] rounded-[16px] px-4 text-xs font-bold text-white border-[1.5px] transition-all focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] ${
                        errors.phone ? 'border-[#FF3B3B]' : 'border-[#2a2a2a] focus:border-[#F37A1F]'
                      }`}
                    />
                    {errors.phone && <span className="text-[8px] text-rose-500 font-bold uppercase tracking-widest ml-1">{errors.phone}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] ml-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={`w-full h-12 bg-[#111] rounded-[16px] px-4 text-xs font-bold text-white border-[1.5px] transition-all focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] ${
                        errors.password ? 'border-[#FF3B3B]' : 'border-[#2a2a2a] focus:border-[#F37A1F]'
                      }`}
                    />
                    {errors.password && <span className="text-[8px] text-rose-500 font-bold uppercase tracking-widest ml-1">{errors.password}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a] ml-1">Referral Code (Optional)</label>
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.replace(/\s/g, ''))}
                      placeholder="Enter friend's referral code"
                      autoCapitalize="none"
                      autoCorrect="off"
                      className={`w-full h-12 bg-[#111] rounded-[16px] px-4 text-xs font-bold text-white border-[1.5px] transition-all focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] ${
                        errors.referralCode ? 'border-[#FF3B3B]' : 'border-[#2a2a2a] focus:border-[#F37A1F]'
                      }`}
                    />
                    {errors.referralCode ? (
                      <span className="text-[8px] text-rose-500 font-bold uppercase tracking-widest ml-1">{errors.referralCode}</span>
                    ) : newUserRewardHint > 0 ? (
                      <span className="text-[8px] text-[#FF9A4D] font-bold uppercase tracking-widest ml-1">Get ₹{newUserRewardHint} bonus with a valid code</span>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#F37A1F] text-black font-extrabold h-12 rounded-full mt-4 shadow-[0_6px_20px_rgba(243,122,32,0.40)] flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-xs uppercase tracking-[0.08em] disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                isLogin ? 'Login' : 'Register'
              )}
            </button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="h-px flex-1 bg-[#2a2a2a]" />
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#7a7a7a]">OR</span>
            <div className="h-px flex-1 bg-[#2a2a2a]" />
          </div>

          <div className="space-y-3">
            {domainAuthDiagnostic && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 space-y-2"
              >
                <div className="flex items-start gap-2.5">
                  <Globe size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] font-black uppercase tracking-tight">
                      Vercel Domain Not Authorized in Firebase
                    </p>
                    <p className="text-[10px] font-bold opacity-80 mt-0.5 normal-case">
                      Google login failed because <span className="underline font-mono">{domainAuthDiagnostic.domain}</span> is not in Firebase's Authorized Domains list.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopyDomain(domainAuthDiagnostic.domain)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all"
                  >
                    {copiedDomain ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedDomain ? 'Copied Domain!' : 'Copy Domain'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVercelModal(true)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 hover:bg-amber-400 transition-all shadow-xs"
                  >
                    <span>Fix In 30 Seconds</span>
                    <ExternalLink size={11} />
                  </button>
                </div>
              </motion.div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white text-black font-bold h-14 rounded-[20px] flex items-center justify-center gap-3 active:scale-[0.97] transition-all text-sm tracking-normal disabled:opacity-60"
            >
              <Chrome size={18} />
              {loading && !isRedirectLoading ? 'Connecting Google...' : 'Continue with Google'}
            </button>

            {/* Mobile / Fallback Options */}
            <div className="flex items-center justify-center px-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a]">
              <button
                type="button"
                onClick={handleGoogleRedirectLogin}
                disabled={loading}
                className="hover:text-[#F37A1F] transition-colors flex items-center gap-1"
                title="Use if popup is blocked on mobile browsers"
              >
                <Smartphone size={11} />
                <span>Redirect Sign-In</span>
              </button>
            </div>
          </div>
          
          <div className="text-[10px] text-center mt-6 text-slate-500 dark:text-neutral-500 font-bold">
            {isLogin ? 'New player?' : 'Existing player?'}{' '}
            <button 
              type="button"
              disabled={loading}
              onClick={() => { setIsLogin(!isLogin); setErrors({}); setSuccessMsg(''); setDomainAuthDiagnostic(null); }} 
              className="text-purple-600 dark:text-purple-400 font-black hover:underline disabled:no-underline"
            >
              {isLogin ? 'Register here' : 'Login here'}
            </button>
          </div>
        </div>
      </div>

      {/* VERCEL / FIREBASE AUTHORIZED DOMAIN MODAL */}
      <AnimatePresence>
        {showVercelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white dark:bg-[#121117] rounded-3xl border border-slate-200 dark:border-neutral-800 shadow-2xl p-6 text-slate-900 dark:text-white space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black italic uppercase tracking-tight">
                      Fix Google Login on Vercel
                    </h3>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7a7a7a]">
                      Firebase Authorized Domain Setup
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVercelModal(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 space-y-2">
                <p className="text-xs text-slate-600 dark:text-neutral-300 leading-relaxed font-medium">
                  Firebase strictly blocks Google OAuth from any website that isn't added to your Firebase project's <strong>Authorized domains</strong>.
                </p>
              </div>

              {/* Step 1: Copy Domain */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-400 block ml-1">
                  1. Your Current Vercel Domain:
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 font-mono text-xs font-bold">
                  <span className="flex-1 truncate text-purple-600 dark:text-purple-400 select-all">
                    {currentHostname || 'your-app.vercel.app'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyDomain(currentHostname)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1 active:scale-[0.97] transition-all shadow-xs"
                  >
                    {copiedDomain ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedDomain ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/60 dark:border-neutral-800">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-black font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 dark:text-neutral-200 text-xs">Open Firebase Console</p>
                    <a
                      href={`https://console.firebase.google.com/project/${resolvedFirebaseConfig.projectId}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#F37A1F] hover:underline font-bold text-[11px]"
                    >
                      <span>Go to Auth Settings in Firebase</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/60 dark:border-neutral-800">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-black font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <p className="text-slate-700 dark:text-neutral-300 font-medium text-xs">
                    Under the <strong>Settings</strong> tab, scroll down to the <strong>Authorized domains</strong> section.
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/60 dark:border-neutral-800">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-black font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <p className="text-slate-700 dark:text-neutral-300 font-medium text-xs">
                    Click <strong>Add domain</strong>, paste <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{currentHostname}</span>, and click <strong>Save</strong>.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowVercelModal(false);
                    handleGoogleLogin();
                  }}
                  className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-[0.97] transition-all"
                >
                  <Chrome size={16} />
                  <span>I Added It - Try Google Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowVercelModal(false)}
                  className="w-full py-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 font-bold text-xs uppercase tracking-wider transition-colors"
                >
                  Close Guide
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <p className="text-center text-slate-400 dark:text-zinc-600 text-[10px] uppercase font-bold tracking-widest px-8">
        By continuing, you agree to our <span className="text-slate-600 dark:text-zinc-400">Terms of Service</span> and <span className="text-slate-600 dark:text-zinc-400">Privacy Policy</span>
      </p>
    </div>
  );
}
