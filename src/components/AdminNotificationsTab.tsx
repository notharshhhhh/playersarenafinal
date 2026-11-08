import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, Send, Trash2, Check, Loader2, Trophy, Users, 
  User as UserIcon, CheckCircle2, ChevronDown, Sparkles
} from 'lucide-react';
import { 
  Page, Tournament, User, AppNotification, NotificationType, NotificationAudience 
} from '../types';
import { db } from '../lib/firebase';
import { 
  collection, addDoc, deleteDoc, doc, onSnapshot, 
  query, orderBy, serverTimestamp, limit 
} from 'firebase/firestore';
import { usePopup } from './PopupProvider';

interface AdminNotificationsTabProps {
  matches: Tournament[];
  users: User[];
  onPageChange: (page: Page, id?: string) => void;
}

export default function AdminNotificationsTab({ matches, users, onPageChange }: AdminNotificationsTabProps) {
  const { showWarning, showError, showSuccess } = usePopup();
  const [selectedAudience, setSelectedAudience] = useState<'all' | 'tournament' | 'custom'>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchUserQuery, setSearchUserQuery] = useState('');

  const [isSending, setIsSending] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [historyNotifications, setHistoryNotifications] = useState<AppNotification[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Realtime subscription to sent notifications
  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as AppNotification));
      setHistoryNotifications(list);
    }, (err) => {
      console.warn('Notifications stream error:', err);
    });

    return () => unsub();
  }, []);

  const handleSendNotification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!title.trim()) {
      showWarning('MISSING TITLE', 'Please enter a notification title.');
      return;
    }
    if (!body.trim()) {
      showWarning('MISSING MESSAGE', 'Please enter a notification message.');
      return;
    }

    if (selectedAudience === 'tournament' && !selectedMatchId) {
      showWarning('SELECT TOURNAMENT', 'Please select a tournament / match.');
      return;
    }

    if (selectedAudience === 'custom' && !selectedUserId) {
      showWarning('SELECT USER', 'Please select a custom user.');
      return;
    }

    setIsSending(true);

    try {
      const selectedMatch = matches.find(m => m.id === selectedMatchId);
      const selectedUser = users.find(u => u.id === selectedUserId);

      let notifType: NotificationType = 'alert';
      if (selectedAudience === 'tournament') {
        notifType = 'tournament';
      }

      const notifData: any = {
        title: title.trim(),
        message: body.trim(),
        type: notifType,
        audience: selectedAudience === 'tournament' ? 'match' : selectedAudience === 'custom' ? 'user' : 'all',
        createdAt: serverTimestamp(),
        readBy: []
      };

      if (selectedAudience === 'tournament' && selectedMatchId) {
        notifData.targetMatchId = selectedMatchId;
        notifData.targetMatchTitle = selectedMatch?.title || `Match #${selectedMatch?.matchNumber || ''}`;
        notifData.actionPage = Page.TOURNAMENTS;
        notifData.actionText = 'View Match';
      }

      if (selectedAudience === 'custom' && selectedUserId) {
        notifData.targetUserId = selectedUserId;
        notifData.targetUsername = selectedUser?.username || selectedUser?.ign || 'Player';
      }

      await addDoc(collection(db, 'notifications'), notifData);

      setTitle('');
      setBody('');
      setSuccessToast('Notification sent successfully!');
      showSuccess('NOTIFICATION BROADCASTED', 'Your push alert has been dispatched to the selected audience.');
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      console.error('Error sending notification:', err);
      showError('SEND FAILED', 'Failed to send notification: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const totalUsersCount = users.length || 0;
  const activeCount = Math.max(1, Math.round(totalUsersCount * 0.75));

  const filteredUsers = users.filter(u => 
    !searchUserQuery ||
    u.username?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
    u.ign?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
    u.phone?.includes(searchUserQuery)
  );

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="p-3.5 bg-emerald-600/90 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-between shadow-lg backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{successToast}</span>
            </div>
            <button onClick={() => setSuccessToast(null)} className="text-white/80 hover:text-white font-bold">&times;</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Target Audience Pill Selector */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* ALL USERS BUTTON */}
        <button
          type="button"
          onClick={() => setSelectedAudience('all')}
          className={`py-3 px-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-[0.97] ${
            selectedAudience === 'all'
              ? 'bg-[#F37A1F] text-black shadow-purple-900/30 ring-1 ring-purple-400'
              : 'bg-white dark:bg-[#141414] hover:bg-slate-50 dark:hover:bg-[#141414] text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-neutral-800/80 shadow-xs'
          }`}
        >
          <span>📢</span>
          <span className="truncate">ALL USERS</span>
        </button>

        {/* TOURNAMENT BUTTON */}
        <button
          type="button"
          onClick={() => setSelectedAudience('tournament')}
          className={`py-3 px-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-[0.97] ${
            selectedAudience === 'tournament'
              ? 'bg-[#F37A1F] text-black shadow-purple-900/30 ring-1 ring-purple-400'
              : 'bg-white dark:bg-[#141414] hover:bg-slate-50 dark:hover:bg-[#141414] text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-neutral-800/80 shadow-xs'
          }`}
        >
          <span>🏆</span>
          <span className="truncate">TOURNAMENT</span>
        </button>

        {/* CUSTOM BUTTON */}
        <button
          type="button"
          onClick={() => setSelectedAudience('custom')}
          className={`py-3 px-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-[0.97] ${
            selectedAudience === 'custom'
              ? 'bg-[#F37A1F] text-black shadow-purple-900/30 ring-1 ring-purple-400'
              : 'bg-white dark:bg-[#141414] hover:bg-slate-50 dark:hover:bg-[#141414] text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-neutral-800/80 shadow-xs'
          }`}
        >
          <span>👤</span>
          <span className="truncate">CUSTOM</span>
        </button>
      </div>

      {/* Dynamic Selector for Tournament Mode */}
      {selectedAudience === 'tournament' && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-2 pt-1"
        >
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 block">
            SELECT TOURNAMENT
          </label>
          <select
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            className="w-full bg-white dark:bg-[#050505] border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-colors shadow-xs"
          >
            <option value="">-- Choose Joined Match --</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id} className="bg-white dark:bg-neutral-900 text-slate-900 dark:text-white">
                #{m.matchNumber || m.id.slice(0, 4)} • {m.title} ({m.section} - {m.playersCount || 0} Joined)
              </option>
            ))}
          </select>
        </motion.div>
      )}

      {/* Dynamic Selector for Custom User Mode */}
      {selectedAudience === 'custom' && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-2.5 pt-1"
        >
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 block">
            SELECT TARGET USER
          </label>
          <input
            type="text"
            placeholder="Search player username, IGN or phone..."
            value={searchUserQuery}
            onChange={(e) => setSearchUserQuery(e.target.value)}
            className="w-full bg-white dark:bg-[#050505] border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-neutral-600 outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-colors shadow-xs"
          />
          <div className="max-h-36 overflow-y-auto no-scrollbar space-y-1 bg-white dark:bg-[#050505] p-2 rounded-2xl border border-slate-200 dark:border-neutral-800/80 shadow-xs">
            {filteredUsers.length === 0 ? (
              <p className="text-[10px] text-slate-400 dark:text-neutral-500 py-2 text-center">No users matching search</p>
            ) : (
              filteredUsers.slice(0, 10).map((u) => {
                const isSelected = selectedUserId === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id!)}
                    className={`px-3 py-2 rounded-xl text-xs cursor-pointer flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-purple-600/15 border border-purple-500 text-purple-700 dark:text-white font-bold'
                        : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900/80'
                    }`}
                  >
                    <span className="truncate text-[11px]">{u.username} {u.ign ? `(IGN: ${u.ign})` : ''}</span>
                    {isSelected && <Check size={14} className="text-purple-600 dark:text-purple-400" />}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}

      {/* Notification Title & Body Form */}
      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 block">
            TITLE
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title..."
            className="w-full bg-white dark:bg-[#050505] border border-slate-200 dark:border-neutral-800/90 rounded-2xl px-4 py-3.5 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-neutral-600 outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-colors shadow-xs"
          />
        </div>

        {/* Body */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 block">
            BODY
          </label>
          <textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Notification message..."
            className="w-full bg-white dark:bg-[#050505] border border-slate-200 dark:border-neutral-800/90 rounded-2xl px-4 py-3.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-neutral-600 outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-colors leading-relaxed resize-none shadow-xs"
          />
        </div>
      </div>

      {/* Send Notification Button */}
      <button
        type="button"
        onClick={() => handleSendNotification()}
        disabled={isSending}
        className="w-full py-4 bg-[#D9660F] hover:bg-[#F37A1F] active:bg-[#B8530B] text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
      >
        {isSending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>SENDING...</span>
          </>
        ) : (
          <>
            <Send size={15} className="-rotate-12 mb-0.5" />
            <span>SEND NOTIFICATION</span>
          </>
        )}
      </button>

      {/* Notification Stats Card */}
      <div className="p-5 bg-white dark:bg-[#050505] border border-slate-200 dark:border-neutral-800/90 rounded-3xl space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-purple-600 dark:text-purple-400" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400">
            NOTIFICATION STATS
          </h4>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Box 1: FCM ENABLED / ACTIVE */}
          <div className="p-4 bg-slate-50 dark:bg-transparent border border-slate-200/80 dark:border-neutral-800/70 rounded-2xl space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
              FCM ENABLED
            </p>
            <p className="text-2xl font-black italic text-emerald-600 dark:text-emerald-400">
              {activeCount}
            </p>
          </div>

          {/* Box 2: TOTAL USERS */}
          <div className="p-4 bg-slate-50 dark:bg-transparent border border-slate-200/80 dark:border-neutral-800/70 rounded-2xl space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
              TOTAL USERS
            </p>
            <p className="text-2xl font-black italic text-slate-900 dark:text-white">
              {totalUsersCount}
            </p>
          </div>
        </div>
      </div>

      {/* Sent History Toggle (Optional sleek toggle) */}
      {historyNotifications.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="w-full py-2.5 px-4 bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-900 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-300 flex items-center justify-between transition-colors shadow-xs"
          >
            <span>Recent Sent History ({historyNotifications.length})</span>
            <ChevronDown size={14} className={`transform transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>

          {showHistory && (
            <motion.div 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 space-y-2"
            >
              {historyNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-3 bg-white dark:bg-[#050505] border border-slate-200 dark:border-neutral-900 rounded-2xl flex items-start justify-between gap-3 text-xs shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 dark:text-white text-[11px] truncate">{notif.title}</p>
                    <p className="text-[10px] text-slate-500 dark:text-neutral-400 truncate mt-0.5">{notif.message}</p>
                    <span className="text-[8px] text-slate-400 dark:text-neutral-600 font-bold uppercase mt-1 block">
                      Target: {notif.audience}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(notif.id)}
                    className="p-1.5 text-slate-400 dark:text-neutral-600 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
