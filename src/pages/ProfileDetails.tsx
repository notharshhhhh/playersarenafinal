import React, { useState } from 'react';
import { ArrowLeft, User as UserIcon, Mail, Phone, Lock, Edit2, Check, X, Loader2, Gamepad2 } from 'lucide-react';
import { Page, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { usePopup } from '../components/PopupProvider';

interface ProfileDetailsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function ProfileDetails({ user, onPageChange }: ProfileDetailsProps) {
  const { showSuccess, showError, showWarning } = usePopup();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [phone, setPhone] = useState(user.phone);
  const [ffIgn, setFfIgn] = useState(user.gameIGNs?.freefire || user.ign || '');
  const [bgmiIgn, setBgmiIgn] = useState(user.gameIGNs?.bgmi || '');
  const [codmIgn, setCodmIgn] = useState(user.gameIGNs?.codm || '');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleUpdateProfile = async () => {
    if (!username.trim()) {
      showWarning('MISSING USERNAME', 'Please enter a valid username.');
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser?.uid || ''), {
        username: username.trim(),
        phone: phone.trim(),
        ign: ffIgn.trim(),
        gameIGNs: {
          freefire: ffIgn.trim(),
          bgmi: bgmiIgn.trim(),
          codm: codmIgn.trim(),
        },
      });
      setIsEditing(false);
      showSuccess('PROFILE UPDATED', 'Your personal details and in-game names have been saved.');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
      showError('UPDATE FAILED', 'Could not update your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user.email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      showSuccess('RESET EMAIL SENT', `A password reset link has been sent to ${user.email}.`);
      setTimeout(() => setResetSent(false), 5000);
    } catch (e) {
      console.error(e);
      showError('RESET FAILED', 'Could not send password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
              Personal <span className="text-purple-600 dark:text-purple-500">Info</span>
            </h2>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-neutral-500 mt-1">
              Manage your identity
            </p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="space-y-4">
          <div className="p-6 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800/90 rounded-[30px] shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400">
                <UserIcon size={26} />
              </div>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-black rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-[0.97] transition-transform shadow-sm"
                >
                  <Edit2 size={13} />
                  <span>Edit</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="w-10 h-10 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-2xl flex items-center justify-center hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={loading}
                    className="w-10 h-10 bg-purple-600 text-black rounded-2xl flex items-center justify-center shadow-lg shadow-purple-600/25 active:scale-[0.97] transition-all"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500 ml-1 mb-1.5 block">
                  Username
                </label>
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all"
                  />
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-2xl">
                    <UserIcon size={14} className="text-slate-400 dark:text-neutral-500" />
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {user.username}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500 ml-1 mb-1.5 block">
                  Mobile Number
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all"
                  />
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-2xl">
                    <Phone size={14} className="text-slate-400 dark:text-neutral-500" />
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {user.phone || 'Not linked'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500 ml-1 mb-1.5 block">
                  Email Address
                </label>
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 dark:bg-[#1a1a1a]/60 border border-slate-100 dark:border-neutral-800 rounded-2xl opacity-75">
                  <div className="flex items-center gap-3">
                    <Mail size={14} className="text-slate-400 dark:text-neutral-500" />
                    <span className="text-xs font-bold text-slate-500 dark:text-neutral-400">
                      {user.email}
                    </span>
                  </div>
                  <Lock size={12} className="text-slate-400 dark:text-neutral-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Game In-Game Names (IGN) */}
          <div className="p-6 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800/90 rounded-[30px] shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Gamepad2 size={16} className="text-purple-600 dark:text-purple-400" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-900 dark:text-white">
                  Game In-Game Names (IGN)
                </h4>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 hover:underline"
                >
                  Edit IGNs
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mb-1 block">
                  Free Fire IGN
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    placeholder="Enter Free Fire IGN"
                    value={ffIgn}
                    onChange={(e) => setFfIgn(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                  />
                ) : (
                  <div className="px-4 py-3 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-2xl text-xs font-bold text-slate-800 dark:text-neutral-200">
                    {ffIgn || <span className="text-slate-400 dark:text-neutral-500 italic">Not set</span>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mb-1 block">
                  BGMI IGN
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    placeholder="Enter BGMI IGN"
                    value={bgmiIgn}
                    onChange={(e) => setBgmiIgn(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                  />
                ) : (
                  <div className="px-4 py-3 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-2xl text-xs font-bold text-slate-800 dark:text-neutral-200">
                    {bgmiIgn || (
                      <span className="text-slate-400 dark:text-neutral-500 italic">Not set</span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 mb-1 block">
                  COD Mobile IGN
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    placeholder="Enter CODM IGN"
                    value={codmIgn}
                    onChange={(e) => setCodmIgn(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                  />
                ) : (
                  <div className="px-4 py-3 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-neutral-800 rounded-2xl text-xs font-bold text-slate-800 dark:text-neutral-200">
                    {codmIgn || (
                      <span className="text-slate-400 dark:text-neutral-500 italic">Not set</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Security Action */}
          <div className="p-6 bg-white dark:bg-[#141414] border border-slate-100 dark:border-neutral-800/90 rounded-[30px] shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-none">
            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-neutral-500 mb-4 ml-1">
              Account Security
            </h4>
            <button
              onClick={handleResetPassword}
              disabled={loading || resetSent}
              className={`w-full py-3.5 text-[10px] font-black uppercase tracking-[0.16em] rounded-2xl flex items-center justify-center gap-2.5 transition-all ${
                resetSent
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                  : 'bg-slate-900 dark:bg-white text-white dark:text-black hover:opacity-90 active:scale-[0.97]'
              }`}
            >
              {resetSent ? (
                <>
                  <Check size={15} />
                  Reset Link Sent to Email
                </>
              ) : (
                <>
                  <Lock size={15} className="text-purple-500" />
                  Change Password
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
