import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Zap,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Page, User, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  addDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import SafeImage from '../components/SafeImage';
import { useAppBranding } from '../hooks/useAppBranding';
import { usePopup } from '../components/PopupProvider';

interface AddMoneyProps {
  user?: User | null;
  onPageChange: (page: Page) => void;
}

export interface PaymentAppItem {
  id: string;
  name: string;
  iconUrl: string;
  scheme?: string;
}

export const DEFAULT_PAYMENT_APPS: PaymentAppItem[] = [
  {
    id: 'phonepe',
    name: 'Phone Pay',
    iconUrl: 'https://img.icons8.com/color/96/phone-pe.png',
    scheme: 'phonepe://pay',
  },
  {
    id: 'paytm',
    name: 'Paytm',
    iconUrl: 'https://img.icons8.com/color/96/paytm.png',
    scheme: 'paytmmp://pay',
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    iconUrl: 'https://img.icons8.com/color/96/google-pay-india.png',
    scheme: 'tez://upi/pay',
  },
  {
    id: 'bhim',
    name: 'BHIM UPI',
    iconUrl: 'https://img.icons8.com/color/96/bhim.png',
    scheme: 'upi://pay',
  },
];

export default function AddMoney({ user, onPageChange }: AddMoneyProps) {
  const [amount, setAmount] = useState<string>('100');
  const [utr, setUtr] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<'manual' | 'auto'>('manual');
  const [error, setError] = useState<string | null>(null);

  // Real Gateway Order & Verification state (Money is ONLY credited after verified payment!)
  const [pendingGatewayOrder, setPendingGatewayOrder] = useState<{
    orderId: string;
    paymentUrl: string;
    amount: number;
    gatewayName: string;
  } | null>(null);
  const [checkingOrderStatus, setCheckingOrderStatus] = useState(false);

  const { appName } = useAppBranding();
  const { showWarning, showSuccess, showError, showInstructions } = usePopup();
  const [autoGatewayEnabledInSettings, setAutoGatewayEnabledInSettings] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('kg_payment_mode');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.mode === 'manual') return false;
      }
    } catch {}
    return true;
  });
  const [rawActiveGateway, setRawActiveGateway] = useState<PaymentGateway | null>(null);
  const activeGateway = autoGatewayEnabledInSettings ? rawActiveGateway : null;

  const [paymentSettings, setPaymentSettings] = useState<{
    upiId: string;
    qrCodeUrl: string;
    merchantName: string;
    minDeposit: number;
    maxDeposit: number;
    paymentApps: PaymentAppItem[];
  }>({
    upiId: '8707088647@fam',
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=8707088647@fam&pn=KidsAdda',
    merchantName: appName || 'KIDS ADDA',
    minDeposit: 10,
    maxDeposit: 50000,
    paymentApps: DEFAULT_PAYMENT_APPS,
  });

  useEffect(() => {
    // 1. Listen to paymentSettings to check if an auto gateway (ZapUPI, Cashfree, Razorpay, etc.) is enabled
    const unsubGateways = onSnapshot(
      collection(db, 'paymentSettings'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentGateway));
        const active = list.find((g) => g.isActive === true) || null;
        setRawActiveGateway(active);
      },
      () => {}
    );

    // 2. Listen to appSettings/referral_support for manual payment settings, QR code, UPI ID, and deposit limits
    const unsubSettings = onSnapshot(
      doc(db, 'appSettings', 'referral_support'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data?.autoGatewayActive === false || data?.manualPaymentActive === true) {
            setAutoGatewayEnabledInSettings(false);
          } else if (data?.autoGatewayActive === true) {
            setAutoGatewayEnabledInSettings(true);
          }

          const manual = data?.manualPayment || {};
          const limits = data?.limits || {};
          const upi = manual.upiId || data?.upiId || '8707088647@fam';
          const qr =
            manual.qrCodeUrl ||
            data?.qrCodeUrl ||
            `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=${encodeURIComponent(upi)}`;
          const apps =
            Array.isArray(manual.paymentApps) && manual.paymentApps.length > 0
              ? manual.paymentApps
              : DEFAULT_PAYMENT_APPS;

          setPaymentSettings({
            upiId: upi,
            qrCodeUrl: qr,
            merchantName: data?.appName || manual.merchantName || appName || 'KIDS ADDA',
            minDeposit: Number(limits.minDeposit ?? data?.minDeposit ?? 10),
            maxDeposit: Number(limits.maxDeposit ?? data?.maxDeposit ?? 50000),
            paymentApps: apps,
          });
        }
      },
      () => {}
    );

    return () => {
      unsubGateways();
      unsubSettings();
    };
  }, [appName]);

  // Real-time polling & Firestore listener when a ZapUPI/Cashfree order is pending verification
  useEffect(() => {
    if (!pendingGatewayOrder) return;

    const uid = user?.id || auth.currentUser?.uid;
    let isMounted = true;

    // 1. Listen directly to the transaction document in case webhook already marked it 'completed'
    const unsubTx = onSnapshot(
      doc(db, 'transactions', pendingGatewayOrder.orderId),
      (snap) => {
        if (snap.exists() && snap.data()?.status === 'completed' && isMounted) {
          setPendingGatewayOrder(null);
          setSubmittedMode('auto');
          setSubmitted(true);
          showSuccess(
            'PAYMENT VERIFIED & CREDITED!',
            `₹${pendingGatewayOrder.amount} has been verified and credited to your Deposit Wallet.`
          );
        }
      },
      () => {}
    );

    // 2. Poll the backend /api/zapupi/check-status every 4 seconds
    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const res = await fetch('/api/zapupi/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: pendingGatewayOrder.orderId,
          }),
        });
        const data = await res.json();
        if (data?.status === 'success' && isMounted) {
          // Ensure client-side wallet credit if server Admin SDK was restricted
          if (uid && !data.alreadyProcessed) {
            try {
              await runTransaction(db, async (tx) => {
                const txRef = doc(db, 'transactions', pendingGatewayOrder.orderId);
                const txSnap = await tx.get(txRef);
                if (txSnap.exists() && txSnap.data()?.status === 'completed') return;

                const userRef = doc(db, 'users', uid);
                const userSnap = await tx.get(userRef);
                if (userSnap.exists()) {
                  const currentDep = Number(userSnap.data()?.wallet?.deposit || 0);
                  tx.update(userRef, {
                    'wallet.deposit': currentDep + pendingGatewayOrder.amount,
                  });
                }
                tx.set(
                  txRef,
                  {
                    status: 'completed',
                    utr: data.utr || '',
                    paymentId: data.txId || pendingGatewayOrder.orderId,
                    approvedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
              });
            } catch {}
          }

          setPendingGatewayOrder(null);
          setSubmittedMode('auto');
          setSubmitted(true);
          showSuccess(
            'PAYMENT VERIFIED & CREDITED!',
            `₹${pendingGatewayOrder.amount} has been verified by ${pendingGatewayOrder.gatewayName} and added to your Deposit Wallet.`
          );
        } else if (data?.status === 'failed' && isMounted) {
          clearInterval(pollInterval);
          setError('Payment failed or was cancelled in your UPI app. No money was deducted.');
          setPendingGatewayOrder(null);
        }
      } catch {}
    }, 4500);

    return () => {
      isMounted = false;
      unsubTx();
      clearInterval(pollInterval);
    };
  }, [pendingGatewayOrder, activeGateway, user?.id]);

  const handleManualVerifyOrder = async () => {
    if (!pendingGatewayOrder) return;
    setCheckingOrderStatus(true);
    setError(null);
    const uid = user?.id || auth.currentUser?.uid;
    try {
      const res = await fetch('/api/zapupi/check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: pendingGatewayOrder.orderId,
        }),
      });
      const data = await res.json();
      if (data?.status === 'success') {
        if (uid && !data.alreadyProcessed) {
          await runTransaction(db, async (tx) => {
            const txRef = doc(db, 'transactions', pendingGatewayOrder.orderId);
            const txSnap = await tx.get(txRef);
            if (txSnap.exists() && txSnap.data()?.status === 'completed') return;

            const userRef = doc(db, 'users', uid);
            const userSnap = await tx.get(userRef);
            if (userSnap.exists()) {
              const currentDep = Number(userSnap.data()?.wallet?.deposit || 0);
              tx.update(userRef, {
                'wallet.deposit': currentDep + pendingGatewayOrder.amount,
              });
            }
            tx.set(
              txRef,
              {
                status: 'completed',
                utr: data.utr || '',
                paymentId: data.txId || pendingGatewayOrder.orderId,
                approvedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          });
        }
        setPendingGatewayOrder(null);
        setSubmittedMode('auto');
        setSubmitted(true);
        showSuccess(
          'PAYMENT VERIFIED!',
          `₹${pendingGatewayOrder.amount} has been verified and added to your Deposit Wallet.`
        );
      } else if (data?.status === 'failed') {
        showError('PAYMENT FAILED', 'The gateway reported this payment as failed or cancelled.');
        setPendingGatewayOrder(null);
      } else {
        showWarning(
          'PAYMENT STILL PENDING',
          'We have not received confirmation from the bank yet. Please complete the payment on the payment page first, then tap Verify Status.'
        );
      }
    } catch (err: any) {
      showError('VERIFICATION ERROR', 'Could not verify payment status right now. Please try again.');
    } finally {
      setCheckingOrderStatus(false);
    }
  };

  const quickAmounts = ['50', '100', '200', '500', '1000'];

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(paymentSettings.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenUpiApp = (app: PaymentAppItem) => {
    const numAmount = Number(amount) || paymentSettings.minDeposit;
    const upiUri = `upi://pay?pa=${encodeURIComponent(paymentSettings.upiId)}&pn=${encodeURIComponent(
      paymentSettings.merchantName
    )}&am=${numAmount}&cu=INR`;
    window.location.href = upiUri;
  };

  const handleOpenDepositInstructions = () => {
    showInstructions(
      'DEPOSIT INSTRUCTIONS & RULES',
      `Follow these steps carefully to add money to your ${appName} Deposit Wallet:`,
      [
        `Enter deposit amount between ₹${paymentSettings.minDeposit} and ₹${paymentSettings.maxDeposit}.`,
        activeGateway
          ? `Tap PAY WITH ${activeGateway.name || activeGateway.id.toUpperCase()} to generate your secure payment order.`
          : `Scan the QR Code or copy the UPI ID (${paymentSettings.upiId}) and complete payment via PhonePe, Google Pay, Paytm, or BHIM.`,
        activeGateway
          ? 'Complete the payment in your UPI app. Your wallet will be credited ONLY after the system verifies your payment.'
          : 'Copy the 12-digit UTR / Reference Number from your UPI payment receipt and submit it in Step 3.',
        'WARNING: Money is never added without real payment verification.',
      ]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numAmount = Number(amount);

    if (!numAmount || numAmount < paymentSettings.minDeposit) {
      const msg = `Minimum deposit amount is ₹${paymentSettings.minDeposit}`;
      setError(msg);
      showWarning('MINIMUM DEPOSIT LIMIT', msg, [
        `Please enter at least ₹${paymentSettings.minDeposit} to proceed.`,
      ]);
      return;
    }
    if (numAmount > paymentSettings.maxDeposit) {
      const msg = `Maximum deposit amount is ₹${paymentSettings.maxDeposit}`;
      setError(msg);
      showWarning('MAXIMUM DEPOSIT LIMIT', msg, [
        `Single deposit cannot exceed ₹${paymentSettings.maxDeposit}.`,
      ]);
      return;
    }

    const uid = user?.id || auth.currentUser?.uid;
    if (!uid) {
      setError('You must be signed in to add money.');
      showError('SIGN IN REQUIRED', 'You must be signed in to add money to your wallet.');
      return;
    }

    // ============================================================================
    // AUTO PAYMENT GATEWAY FLOW (ZapUPI / Cashfree)
    // NEVER credit wallet automatically before payment! Create order & verify first!
    // ============================================================================
    if (activeGateway) {
      setSubmitting(true);
      try {
        const gwId = (activeGateway.id || '').toLowerCase();
        const gwName = (activeGateway.name || activeGateway.id || 'Gateway').toUpperCase();

        if (gwId === 'cashfree' || gwName.includes('CASHFREE')) {
          const response = await fetch('/api/cashfree/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: numAmount,
              userId: uid,
              customerName: user?.username || auth.currentUser?.displayName || 'Player',
              customerEmail: user?.email || auth.currentUser?.email || 'player@game.com',
              customerPhone: (user as any)?.phone || (user as any)?.mobile || '9999999999',
            }),
          });
          const data = await response.json();
          if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to create Cashfree payment order.');
          }

          const orderId = data.order_id || `order_${Date.now()}_${uid}`;
          // Save pending transaction record (Status: pending — wallet NOT credited yet)
          await setDoc(
            doc(db, 'transactions', orderId),
            {
              userId: uid,
              userName: user?.username || auth.currentUser?.displayName || 'Player',
              userEmail: user?.email || auth.currentUser?.email || '',
              type: 'deposit',
              title: 'Cashfree Gateway Deposit',
              gateway: 'cashfree',
              orderId,
              amount: numAmount,
              status: 'pending',
              date: new Date().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );

          const payLink = data.payment_link || data.payment_url;
          if (payLink) {
            setPendingGatewayOrder({
              orderId,
              paymentUrl: payLink,
              amount: numAmount,
              gatewayName: 'Cashfree',
            });
            window.location.href = payLink;
            return;
          }
          throw new Error('Cashfree payment session created, please check credentials.');
        }

        // Default Auto Gateway: ZapUPI Order Creation
        const response = await fetch('/api/zapupi/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: numAmount,
            userId: uid,
            customerName: user?.username || auth.currentUser?.displayName || 'Player',
            customerEmail: user?.email || auth.currentUser?.email || 'player@game.com',
            customerPhone: (user as any)?.phone || (user as any)?.mobile || '9999999999',
          }),
        });

        const data = await response.json();
        if (!response.ok || data.error || !data.payment_url) {
          throw new Error(
            data.error ||
              'Could not create ZapUPI payment order. Please check your ZapUPI Token Key & Secret Key in Admin -> Payment.'
          );
        }

        const orderId = data.order_id || `zap_${Date.now()}_${uid}`;

        // Save PENDING transaction in Firestore (Wallet is NOT credited until payment is verified!)
        try {
          await setDoc(
            doc(db, 'transactions', orderId),
            {
              userId: uid,
              userName: user?.username || auth.currentUser?.displayName || 'Player',
              userEmail: user?.email || auth.currentUser?.email || '',
              type: 'deposit',
              title: `ZapUPI Deposit`,
              gateway: 'zapupi',
              orderId,
              amount: numAmount,
              status: 'pending',
              paymentUrl: data.payment_url,
              date: new Date().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {}

        // Save order ID in localStorage so Wallet.tsx can also verify if redirected back
        try {
          localStorage.setItem(
            'kg_pending_zapupi_order',
            JSON.stringify({
              orderId,
              amount: numAmount,
              userId: uid,
              createdAt: Date.now(),
            })
          );
        } catch {}

        setPendingGatewayOrder({
          orderId,
          paymentUrl: data.payment_url,
          amount: numAmount,
          gatewayName: activeGateway.name || 'ZapUPI',
        });

        // Redirect user to the ZapUPI payment page
        window.location.href = data.payment_url;
      } catch (err: any) {
        const errMsg = err?.message || 'Failed to create payment order with gateway.';
        setError(errMsg);
        showError('ORDER CREATION FAILED', errMsg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Manual Deposit Flow (Requires 12-digit UTR)
    if (!utr.trim() || utr.trim().length < 6) {
      const msg = 'Please enter a valid 12-digit UTR / Reference number after payment';
      setError(msg);
      showWarning(
        'UTR / REF NO. REQUIRED',
        'You must enter the 12-digit UPI Reference / UTR ID from your payment app so Admin can verify and credit your Deposit Wallet.',
        [
          'Complete payment to the QR code or UPI ID first.',
          'Copy the 12-digit UTR number from your payment history.',
          'Paste it in Step 3 and submit.',
        ]
      );
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: uid,
        userName: user?.username || auth.currentUser?.displayName || 'Player',
        userEmail: user?.email || auth.currentUser?.email || '',
        type: 'deposit',
        title: 'Manual UPI Deposit',
        amount: numAmount,
        utr: utr.trim(),
        upiId: paymentSettings.upiId,
        status: 'pending',
        date: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        createdAt: serverTimestamp(),
      });
      setSubmittedMode('manual');
      setSubmitted(true);
      showSuccess(
        'DEPOSIT REQUEST SUBMITTED!',
        `Your deposit request of ₹${numAmount} (UTR: ${utr.trim()}) is now PENDING. Once Admin approves it, ₹${numAmount} will be added to your Deposit Wallet.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
      setError('Failed to submit deposit request. Please try again.');
      showError('SUBMISSION FAILED', 'Failed to submit deposit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-transparent text-white pb-32 transition-colors duration-300 select-none"
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
              Add Money
            </h1>
            <p className="text-[10px] font-bold text-[#7a7a7a] uppercase tracking-[0.2em]">
              {activeGateway
                ? `Instant ${activeGateway.name || activeGateway.id.toUpperCase()} Gateway`
                : 'Manual QR & UPI Deposit'}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">
        {submitted ? (
          <div className="bg-white dark:bg-[#141414] rounded-[30px] p-8 text-center border border-slate-100 dark:border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
              {submittedMode === 'auto' ? 'Payment Verified & Credited!' : 'Deposit Request Sent!'}
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
              {submittedMode === 'auto' ? (
                <>
                  Your payment of{' '}
                  <span className="text-emerald-500 font-black">₹{amount}</span> via{' '}
                  <span className="text-slate-900 dark:text-white font-black">
                    {activeGateway?.name || activeGateway?.id?.toUpperCase()}
                  </span>{' '}
                  has been verified and added to your Deposit Wallet.
                </>
              ) : (
                <>
                  Your manual deposit request for{' '}
                  <span className="text-slate-900 dark:text-white font-black">₹{amount}</span> (UTR:{' '}
                  <span className="text-purple-500 font-black">{utr}</span>) is now{' '}
                  <span className="text-amber-500 font-black">PENDING</span> and will be credited once
                  approved by Admin.
                </>
              )}
            </p>
            <button
              onClick={() => onPageChange(Page.WALLET)}
              className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 text-black text-xs font-black uppercase tracking-widest shadow-md active:scale-[0.97] transition-all"
            >
              Back to Wallet
            </button>
          </div>
        ) : pendingGatewayOrder ? (
          /* Pending Gateway Order Screen — Waits for real payment & verification */
          <div className="bg-white dark:bg-[#141414] rounded-[30px] p-6 text-center border border-purple-500/30 shadow-[0_12px_35px_rgba(243,122,32,0.12)] space-y-5">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-500 flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <div className="space-y-1.5">
              <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[9px] font-black uppercase tracking-widest">
                WAITING FOR PAYMENT VERIFICATION
              </span>
              <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white pt-1">
                Complete ₹{pendingGatewayOrder.amount} Payment
              </h2>
              <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Order ID: <span className="font-mono text-purple-400">{pendingGatewayOrder.orderId}</span>
                <br />
                Your wallet will be credited automatically as soon as your payment is completed and verified by{' '}
                {pendingGatewayOrder.gatewayName}.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <a
                href={pendingGatewayOrder.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 rounded-[22px] bg-[linear-gradient(135deg,#F37A1F,#FF9A4D)] text-black text-xs font-extrabold uppercase tracking-[0.12em] shadow-[0_8px_24px_rgba(243,122,32,0.35)] flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                OPEN PAYMENT PAGE (₹{pendingGatewayOrder.amount})
              </a>

              <button
                type="button"
                onClick={handleManualVerifyOrder}
                disabled={checkingOrderStatus}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {checkingOrderStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {checkingOrderStatus ? 'VERIFYING WITH BANK...' : 'I HAVE PAID — VERIFY NOW'}
              </button>

              <button
                type="button"
                onClick={() => setPendingGatewayOrder(null)}
                className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 text-[10px] font-black uppercase tracking-widest"
              >
                Cancel & Change Amount
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Step 1: Enter Amount */}
            <div className="bg-[#141414] rounded-[30px] p-5 border-[1.5px] border-[rgba(243,122,32,0.45)] space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-[#7a7a7a] uppercase tracking-[0.2em] block">
                  1. SELECT DEPOSIT AMOUNT
                </label>
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#F37A1F]">
                  Min ₹{paymentSettings.minDeposit} • Max ₹{paymentSettings.maxDeposit}
                </span>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black italic text-[#7a7a7a]">
                  ₹
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#111] border-[1.5px] border-[#2a2a2a] rounded-[16px] py-4 pl-10 pr-4 text-2xl font-black italic text-white focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                  placeholder={String(paymentSettings.minDeposit)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((amt) => (
                  <button
                    type="button"
                    key={amt}
                    onClick={() => setAmount(amt)}
                    className={`px-4 py-3 rounded-[24px] text-xs font-extrabold transition-all active:scale-[0.97] ${
                      amount === amt
                        ? 'bg-[#141414] text-white border-[1.5px] border-[#F37A1F] shadow-[0_0_0_1px_rgba(243,122,32,0.6),0_0_22px_rgba(243,122,32,0.22)]'
                        : 'bg-[#141414] text-white border-[1.5px] border-[#2a2a2a]'
                    }`}
                  >
                    +₹{amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional Payment Flow: If Auto Gateway is Active, hide manual QR/UTR system */}
            {activeGateway ? (
              <div className="bg-gradient-to-br from-purple-600/10 via-indigo-600/5 to-transparent dark:from-purple-950/40 dark:to-[#141414] rounded-[30px] p-6 border-[1.5px] border-[rgba(243,122,32,0.45)] space-y-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#F37A1F] text-black flex items-center justify-center shadow-[0_8px_24px_rgba(243,122,32,0.35)] shrink-0">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 block">
                      SECURE ORDER VERIFICATION
                    </span>
                    <h3 className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
                      {activeGateway.name || activeGateway.id.toUpperCase()} UPI Gateway
                    </h3>
                  </div>
                </div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Tap below to create a live payment order on{' '}
                  <span className="text-slate-900 dark:text-white font-black">
                    {activeGateway.name || activeGateway.id.toUpperCase()}
                  </span>
                  . Money will be added to your Deposit Wallet only after your UPI payment is completed and verified.
                </p>
              </div>
            ) : (
              <>
                {/* Step 2: Manual QR & UPI ID */}
                <div className="bg-[#141414] rounded-[30px] p-5 border-[1.5px] border-[rgba(243,122,32,0.45)] space-y-4 text-center">
                  <span className="text-[10px] font-bold text-[#7a7a7a] uppercase tracking-[0.2em] block">
                    2. SCAN QR OR PAY TO UPI ID
                  </span>
                  <div className="w-48 h-48 mx-auto bg-white p-3 rounded-3xl border border-slate-200 shadow-sm">
                    <SafeImage
                      src={paymentSettings.qrCodeUrl}
                      alt="UPI QR"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    {paymentSettings.merchantName}
                  </p>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200/70 dark:border-white/10">
                    <span className="text-xs font-black text-slate-800 dark:text-zinc-200 truncate pl-2">
                      {paymentSettings.upiId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="px-3.5 py-2 rounded-xl bg-[#F37A1F] text-black text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 active:scale-[0.97] transition-all"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copied ? 'COPIED' : 'COPY UPI'}
                    </button>
                  </div>

                  {/* Payment Apps Shown to Users */}
                  {paymentSettings.paymentApps.length > 0 && (
                    <div className="pt-2 text-left space-y-2.5">
                      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500 block pl-1">
                        PAY DIRECTLY WITH UPI APP
                      </span>
                      <div className="grid grid-cols-2 gap-2.5">
                        {paymentSettings.paymentApps.map((app) => (
                          <button
                            key={app.id}
                            type="button"
                            onClick={() => handleOpenUpiApp(app)}
                            className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/70 dark:border-white/10 flex items-center justify-between hover:border-purple-500/40 active:scale-[0.97] transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-white p-1 border border-slate-100 flex items-center justify-center shrink-0">
                                <SafeImage
                                  src={app.iconUrl}
                                  alt={app.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              <span className="text-xs font-black text-slate-800 dark:text-white truncate">
                                {app.name}
                              </span>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 3: Enter UTR */}
                <div className="bg-[#141414] rounded-[30px] p-5 border-[1.5px] border-[rgba(243,122,32,0.45)] space-y-3">
                  <label className="text-[10px] font-bold text-[#7a7a7a] uppercase tracking-[0.2em] block">
                    3. ENTER 12-DIGIT UTR / REF NO.
                  </label>
                  <input
                    type="text"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder="Enter 12-digit UPI Reference ID"
                    className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-white/10 rounded-2xl py-3.5 px-4 text-xs font-black tracking-wider text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                  />
                </div>
              </>
            )}

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
              {submitting
                ? 'CREATING ORDER...'
                : activeGateway
                ? `PROCEED TO PAY (₹${amount || 0})`
                : `SUBMIT DEPOSIT REQUEST (₹${amount || 0})`}
            </button>
          </form>
        )}
      </div>
    </motion.div>
  );
}
