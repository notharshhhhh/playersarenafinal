import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  ShieldCheck,
  Gift,
  Trophy,
  ArrowRight,
  Key,
  Zap,
  Wallet,
  ExternalLink,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { Page, AppNotification, User } from '../types';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import SafeImage from './SafeImage';
import {
  requestMobileNotificationPermission,
  triggerMobileStatusBarNotification,
  isMobileNotificationActive,
} from '../utils/mobileNotificationHelper';
import { useAppBranding } from '../hooks/useAppBranding';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPageChange: (page: Page, id?: string) => void;
  user?: User | null;
  joinedMatchIds?: string[];
}

export default function NotificationsModal({
  isOpen,
  onClose,
  onPageChange,
  user,
  joinedMatchIds = [],
}: NotificationsModalProps) {
  const { appName } = useAppBranding();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<string>(() => {
    if (isMobileNotificationActive(user)) return 'granted';
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  });
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useModalBackHandler(isOpen, onClose);

  useEffect(() => {
    if (isMobileNotificationActive(user)) {
      setPermissionStatus('granted');
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, [isOpen, user?.notificationsEnabled, user?.fcmEnabled]);

  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(30));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
            }) as AppNotification
        );

        const filtered = list.filter((item) => {
          if (!item.audience || item.audience === 'all') return true;
          if (item.audience === 'match' && item.targetMatchId) {
            return joinedMatchIds.includes(item.targetMatchId);
          }
          if (item.audience === 'user' && item.targetUserId && user?.id) {
            return item.targetUserId === user.id;
          }
          return true;
        });

        setNotifications(filtered);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to notifications:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [isOpen, user?.id, JSON.stringify(joinedMatchIds)]);

  const handleEnableMobileNotifications = async () => {
    setIsRequestingPermission(true);
    try {
      await requestMobileNotificationPermission(user?.id);
      setPermissionStatus('granted');
    } catch (e) {
      console.error('Error enabling notifications:', e);
      setPermissionStatus('granted');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleSendTestNotification = async () => {
    await triggerMobileStatusBarNotification(
      '🔥 Free Fire Match Alert!',
      'Room ID: 893412 • Pass: 1234 | Match starts in 10 minutes!',
      { tag: 'test-mobile-bar-alert' }
    );
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleMarkAsRead = async (notifId?: string) => {
    if (!notifId || !user?.id) return;
    try {
      await updateDoc(doc(db, 'notifications', notifId), {
        readBy: arrayUnion(user.id),
      });
    } catch (e) {
      console.error('Could not mark as read:', e);
    }
  };

  const getIconAndStyle = (type?: string) => {
    switch (type) {
      case 'room_creds':
        return {
          icon: Key,
          color: 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30',
          badge: 'Room Credentials',
        };
      case 'tournament':
        return {
          icon: Trophy,
          color: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
          badge: 'Tournament Alert',
        };
      case 'offer':
        return {
          icon: Gift,
          color: 'bg-pink-50 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-500/30',
          badge: 'Exclusive Offer',
        };
      case 'wallet':
        return {
          icon: Wallet,
          color: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30',
          badge: 'Wallet / Cash',
        };
      case 'fairplay':
        return {
          icon: ShieldCheck,
          color: 'bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/30',
          badge: 'FairPlay Notice',
        };
      case 'alert':
      default:
        return {
          icon: Zap,
          color: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
          badge: 'Announcement',
        };
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const displayItems =
    notifications.length > 0
      ? notifications
      : [
          {
            id: 'default_1',
            title: 'Grand Free Fire Championship',
            message:
              'Join our daily Mega Clash Squad & Battle Royale tournaments. Instant room credentials and guaranteed prize distribution.',
            type: 'tournament' as const,
            audience: 'all' as const,
            actionPage: Page.TOURNAMENTS,
            actionText: 'View Arena',
            createdAt: null,
          },
          {
            id: 'default_2',
            title: 'FairPlay & Anti-Cheat Active',
            message:
              'All custom rooms are strictly monitored. Emulators, hacks and config files result in immediate permanent ban.',
            type: 'fairplay' as const,
            audience: 'all' as const,
            actionPage: undefined,
            actionText: undefined,
            createdAt: null,
          },
          {
            id: 'default_3',
            title: 'Refer & Earn ₹50 Bonus Cash',
            message: `Invite your Free Fire squad to ${appName} and earn instant cash rewards on every deposit.`,
            type: 'offer' as const,
            audience: 'all' as const,
            actionPage: Page.REFERRAL,
            actionText: 'Invite Friends',
            createdAt: null,
          },
        ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />

          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800 rounded-[28px] p-5 sm:p-6 shadow-2xl overflow-hidden flex flex-col max-h-[86vh] z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-neutral-800 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-50 dark:bg-purple-500/15 border border-purple-100 dark:border-purple-500/25 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Bell size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    Notifications
                    {notifications.length > 0 && (
                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                        · {notifications.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-[0.15em] mt-0.5">
                    Official Updates &amp; Alerts
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mobile Status Bar Notification Card */}
            <div className="mt-3.5 p-3.5 bg-purple-50/70 dark:bg-purple-950/25 border border-purple-100 dark:border-purple-500/25 rounded-2xl flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-purple-500/20 border border-purple-100 dark:border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                  <Smartphone size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                    Mobile Notification Bar
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 truncate">
                    {permissionStatus === 'granted' || isMobileNotificationActive(user)
                      ? 'Active · Status bar alerts enabled'
                      : 'Disabled · Tap to enable alerts'}
                  </p>
                </div>
              </div>

              {permissionStatus === 'granted' || isMobileNotificationActive(user) ? (
                <button
                  type="button"
                  onClick={handleSendTestNotification}
                  className="px-3.5 py-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-1 active:scale-[0.97]"
                >
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  <span>{testSent ? 'Sent!' : 'Test'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEnableMobileNotifications}
                  disabled={isRequestingPermission}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-black rounded-xl text-[9px] font-black uppercase tracking-wider shadow-sm transition-all shrink-0 active:scale-[0.97] flex items-center gap-1"
                >
                  <Bell size={11} />
                  <span>{isRequestingPermission ? 'Enabling...' : 'Enable'}</span>
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="mt-3.5 space-y-2.5 overflow-y-auto no-scrollbar pr-0.5 relative z-10 flex-1">
              {displayItems.map((item) => {
                const style = getIconAndStyle(item.type);
                const Icon = style.icon;
                const isRead = user?.id && item.readBy?.includes(user.id);

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-[20px] border transition-all relative overflow-hidden ${
                      isRead
                        ? 'bg-slate-50/60 dark:bg-[#141414]/60 border-slate-100 dark:border-neutral-800/60 opacity-80'
                        : 'bg-slate-50/90 dark:bg-[#1a1a1a] border-slate-200/80 dark:border-neutral-800 hover:border-purple-500/40'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${style.color}`}
                      >
                        <Icon size={17} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-purple-600 dark:text-purple-400">
                            {style.badge}
                          </span>
                          <span className="text-[9px] text-slate-300 dark:text-neutral-600">·</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                            {formatTimeAgo(item.createdAt)}
                          </span>
                        </div>

                        <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white leading-snug">
                          {item.title}
                        </h4>

                        <p className="text-[11px] text-slate-600 dark:text-neutral-300 leading-relaxed font-medium mt-1 whitespace-pre-line">
                          {item.message}
                        </p>

                        {item.imageUrl && (
                          <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 max-h-36">
                            <SafeImage
                              src={item.imageUrl}
                              alt="Notification Attachment"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {item.targetMatchTitle && (
                          <div className="mt-2 text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Match: {item.targetMatchTitle}
                          </div>
                        )}

                        {(item.actionPage || item.actionUrl || item.actionText) && (
                          <div className="mt-2.5 flex items-center justify-between pt-2.5 border-t border-slate-200/60 dark:border-neutral-800">
                            <button
                              onClick={() => {
                                handleMarkAsRead(item.id);
                                onClose();
                                if (item.actionUrl) {
                                  window.open(item.actionUrl, '_blank');
                                } else if (item.actionPage) {
                                  onPageChange(item.actionPage as Page, item.targetMatchId);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-purple-600 dark:text-purple-400 hover:underline"
                            >
                              <span>{item.actionText || 'Open Details'}</span>
                              {item.actionUrl ? <ExternalLink size={11} /> : <ArrowRight size={12} />}
                            </button>

                            {!isRead && user?.id && item.id && !item.id.startsWith('default') && (
                              <button
                                onClick={() => handleMarkAsRead(item.id)}
                                className="text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                              >
                                Mark Read
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800">
              <button
                onClick={onClose}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.16em] transition-all shadow-lg shadow-purple-600/20 active:scale-[0.97]"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
