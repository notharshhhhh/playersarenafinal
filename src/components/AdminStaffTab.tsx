import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserCheck, Plus, Search, Shield, ShieldCheck, ShieldAlert, 
  Trash2, Edit2, Ban, CheckCircle2, AlertTriangle, Users, 
  DollarSign, Trophy, Sparkles, Loader2, X, ChevronRight, Lock
} from 'lucide-react';
import { User, StaffMember, StaffRole, Page, StaffPayment, Tournament } from '../types';
import { db } from '../lib/firebase';
import { 
  collection, doc, setDoc, deleteDoc, onSnapshot, 
  serverTimestamp, addDoc 
} from 'firebase/firestore';
import { usePopup } from './PopupProvider';

interface AdminStaffTabProps {
  users: User[];
  onPageChange: (page: Page, id?: string) => void;
}

export const PREDEFINED_ROLES: {
  id: StaffRole;
  title: string;
  badge: string;
  color: string;
  borderColor: string;
  bgColor: string;
  description: string;
  permissions: string[];
}[] = [
  {
    id: 'FINANCE_MANAGER',
    title: 'Finance Manager',
    badge: 'FINANCE',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/40',
    bgColor: 'bg-emerald-500/10',
    description: 'Specialized in wallet transactions, deposit approvals, and withdrawal payouts.',
    permissions: [
      'Approve & Reject Deposit Requests (UTR validation)',
      'Approve & Reject Withdrawal Requests (Payout verification)',
      'View User Balances (Deposits, Winnings, Bonus)',
      'Inspect Financial Audit Trail & Transaction Statements',
      'View Active Payment Gateways & Manual UPI settings'
    ]
  },
  {
    id: 'TOURNAMENT_ORGANIZER',
    title: 'Tournament Organizer',
    badge: 'TOURNAMENTS',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/40',
    bgColor: 'bg-purple-500/10',
    description: 'Specialized in organizing matches, declaring rooms, scoring, and player notifications.',
    permissions: [
      'Create New Tournaments & Contests',
      'Edit Match Details (Entry fee, Prize pool, Schedule, Rules)',
      'Declare Room ID & Password with 1-Click Broadcast',
      'Declare Match Results & Award Prize Pool Winnings',
      'Cancel Matches with Automatic Player Entry Refunds',
      'Send Match & Player Push Notifications'
    ]
  },
  {
    id: 'ALL',
    title: 'All-Access Staff',
    badge: 'FULL OPERATIONS',
    color: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-500/10',
    description: 'Comprehensive staff access covering both Finance and Tournament operations.',
    permissions: [
      'Full Finance Access: Manage all Deposits & Withdrawals',
      'Full Tournament Access: Manage Matches, Rooms, and Results',
      'Inspect User Profiles and Transaction Logs',
      'Broadcast Announcements and Tournament Updates'
    ]
  }
];

export default function AdminStaffTab({ users, onPageChange }: AdminStaffTabProps) {
  const { showConfirm, showSuccess, showError, showWarning } = usePopup();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Add Staff Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<StaffRole>('FINANCE_MANAGER');
  const [isSaving, setIsSaving] = useState(false);

  // Edit Role Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState<StaffRole>('FINANCE_MANAGER');

  // Staff payment settings (per-match coins) + earnings history
  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [claimedMatches, setClaimedMatches] = useState<Tournament[]>([]);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payingStaff, setPayingStaff] = useState<StaffMember | null>(null);
  const [payInput, setPayInput] = useState('');

  useEffect(() => {
    const unsubPay = onSnapshot(collection(db, 'staffPayments'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffPayment));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPayments(list);
    }, (err) => console.warn('staffPayments listener error:', err));

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      setClaimedMatches(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)).filter(m => m.claimedBy)
      );
    }, (err) => console.warn('claimed matches listener error:', err));

    return () => { unsubPay(); unsubMatches(); };
  }, []);

  const statsFor = (staffId: string) => {
    const mine = claimedMatches.filter(m => m.claimedBy === staffId);
    const paid = payments.filter(p => p.staffId === staffId);
    return {
      claimed: mine.length,
      completed: mine.filter(m => m.status === 'completed').length,
      terminated: mine.filter(m => m.status === 'cancelled').length,
      earned: paid.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    };
  };

  const handleOpenPayModal = (staff: StaffMember) => {
    setPayingStaff(staff);
    setPayInput(String(staff.matchPayment ?? 0));
    setIsPayModalOpen(true);
  };

  const handleSavePayment = async () => {
    if (!payingStaff?.userId) return;
    const value = Math.floor(Number(payInput));
    if (!Number.isFinite(value) || value < 0) {
      showWarning('INVALID AMOUNT', 'Enter a valid payment (0 or more coins).');
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'staff', payingStaff.userId), {
        matchPayment: value,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showSuccess('PAYMENT UPDATED', `${payingStaff.username} now earns ${value} coins per successful match (${Math.floor(value / 2)} if terminated).`);
      setIsPayModalOpen(false);
      setPayingStaff(null);
    } catch (err: any) {
      showError('UPDATE FAILED', err?.message || 'Failed to update staff payment.');
    } finally {
      setIsSaving(false);
    }
  };

  // Realtime subscription to staff collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'staff'), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as StaffMember));
      setStaffList(list);
      setLoading(false);
    }, (err) => {
      console.error('Failed to listen to staff:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleOpenAddModal = () => {
    setSelectedUser(null);
    setUserQuery('');
    setSelectedRole('FINANCE_MANAGER');
    setIsAddModalOpen(true);
  };

  const handleCreateStaff = async () => {
    if (!selectedUser || !selectedUser.id) {
      showWarning('SELECT USER', 'Please search and select a registered user to appoint as staff.');
      return;
    }

    const roleConfig = PREDEFINED_ROLES.find(r => r.id === selectedRole);
    if (!roleConfig) return;

    const confirmed = await showConfirm({
      variant: 'instruction',
      badge: 'APPOINT STAFF MEMBER',
      title: `Assign ${roleConfig.title}?`,
      message: `Grant staff permissions to ${selectedUser.username || selectedUser.email} with role ${roleConfig.title}. The Staff Panel button will immediately appear in their Profile.`,
      instructions: roleConfig.permissions,
      confirmText: 'CONFIRM APPOINTMENT',
      cancelText: 'CANCEL'
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      const staffDocId = selectedUser.id;
      const staffData: StaffMember = {
        userId: selectedUser.id,
        username: selectedUser.username || 'Staff User',
        email: selectedUser.email,
        phone: selectedUser.phone || '',
        role: selectedRole,
        permissions: roleConfig.permissions,
        status: 'active',
        assignedBy: 'Admin',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // 1. Write to /staff collection
      await setDoc(doc(db, 'staff', staffDocId), staffData, { merge: true });

      // 2. Update user doc with staff metadata for instant client access
      await setDoc(doc(db, 'users', selectedUser.id), {
        isStaff: true,
        staffRole: selectedRole,
        staffStatus: 'active',
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 3. Send appointment notification to user
      try {
        await addDoc(collection(db, 'notifications'), {
          title: `🛡️ You're Now a Staff Member!`,
          message: `Congratulations! You have been appointed as ${roleConfig.title}. Access the Staff Control Panel from your Profile to manage assigned duties.`,
          type: 'alert',
          audience: 'user',
          targetUserId: selectedUser.id,
          actionPage: Page.STAFF_PANEL,
          createdAt: serverTimestamp(),
          readBy: []
        });
      } catch {}

      showSuccess(
        'STAFF APPOINTED!',
        `${selectedUser.username || selectedUser.email} has been appointed as ${roleConfig.title}.`
      );
      setIsAddModalOpen(false);
      setSelectedUser(null);
      setUserQuery('');
    } catch (err: any) {
      console.error('Failed to create staff:', err);
      showError('APPOINTMENT FAILED', err?.message || 'Could not save staff record.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditRole = (staff: StaffMember) => {
    setEditingStaff(staff);
    setEditRole(staff.role);
    setIsEditModalOpen(true);
  };

  const handleUpdateRole = async () => {
    if (!editingStaff || !editingStaff.userId) return;

    const roleConfig = PREDEFINED_ROLES.find(r => r.id === editRole);
    if (!roleConfig) return;

    setIsSaving(true);
    try {
      // 1. Update /staff
      await setDoc(doc(db, 'staff', editingStaff.userId), {
        role: editRole,
        permissions: roleConfig.permissions,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Update /users
      await setDoc(doc(db, 'users', editingStaff.userId), {
        staffRole: editRole,
        updatedAt: serverTimestamp()
      }, { merge: true });

      showSuccess('ROLE UPDATED', `Updated ${editingStaff.username}'s role to ${roleConfig.title}.`);
      setIsEditModalOpen(false);
      setEditingStaff(null);
    } catch (err: any) {
      showError('UPDATE FAILED', err?.message || 'Failed to update staff role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (staff: StaffMember) => {
    const isCurrentlyActive = staff.status === 'active';
    const nextStatus = isCurrentlyActive ? 'suspended' : 'active';

    const confirmed = await showConfirm({
      variant: isCurrentlyActive ? 'warning' : 'instruction',
      badge: isCurrentlyActive ? 'SUSPEND STAFF ACCESS' : 'REACTIVATE STAFF ACCESS',
      title: isCurrentlyActive ? `Suspend ${staff.username}?` : `Reactivate ${staff.username}?`,
      message: isCurrentlyActive 
        ? `This will temporarily revoke ${staff.username}'s access to the Staff Panel without deleting their record.`
        : `This will restore ${staff.username}'s access to the Staff Panel with their assigned role.`,
      confirmText: isCurrentlyActive ? 'SUSPEND ACCESS' : 'REACTIVATE',
      cancelText: 'CANCEL'
    });

    if (!confirmed) return;

    try {
      await setDoc(doc(db, 'staff', staff.userId), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(doc(db, 'users', staff.userId), {
        staffStatus: nextStatus,
        updatedAt: serverTimestamp()
      }, { merge: true });

      showSuccess(
        isCurrentlyActive ? 'STAFF SUSPENDED' : 'STAFF ACTIVATED',
        `${staff.username}'s staff status is now ${nextStatus.toUpperCase()}.`
      );
    } catch (err: any) {
      showError('STATUS UPDATE FAILED', err?.message || 'Failed to toggle status.');
    }
  };

  const handleRemoveStaff = async (staff: StaffMember) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      badge: 'REMOVE STAFF PRIVILEGES',
      title: `Remove ${staff.username} from Staff?`,
      message: `This will permanently remove ${staff.username}'s staff permissions. The Staff Panel button will disappear from their account.`,
      confirmText: 'YES, REMOVE STAFF',
      cancelText: 'CANCEL'
    });

    if (!confirmed) return;

    try {
      // 1. Delete from /staff
      await deleteDoc(doc(db, 'staff', staff.userId));

      // 2. Revoke in /users
      await setDoc(doc(db, 'users', staff.userId), {
        isStaff: false,
        staffRole: null,
        staffStatus: null,
        updatedAt: serverTimestamp()
      }, { merge: true });

      showSuccess('STAFF REMOVED', `${staff.username} has been removed from staff.`);
    } catch (err: any) {
      showError('REMOVAL FAILED', err?.message || 'Failed to remove staff.');
    }
  };

  // Filter staff list
  const filteredStaff = staffList.filter(s => {
    const q = searchTerm.toLowerCase();
    return (
      (s.username || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.role || '').toLowerCase().includes(q)
    );
  });

  // Filter candidates for Add Staff
  const staffUserIds = new Set(staffList.map(s => s.userId));
  const candidateUsers = users.filter(u => {
    if (!u.id || staffUserIds.has(u.id)) return false;
    if (!userQuery.trim()) return false;
    const q = userQuery.toLowerCase();
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner with Summary and Action */}
      <div className="p-5 bg-gradient-to-br from-neutral-900 via-neutral-900 to-black border border-neutral-800 rounded-3xl shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <UserCheck size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Access Control
                </span>
                <span className="text-[9px] font-black uppercase text-neutral-400">
                  {staffList.length} Appointed Staff
                </span>
              </div>
              <h3 className="text-base font-black italic uppercase tracking-tight text-white mt-1">
                Staff &amp; Role Management
              </h3>
              <p className="text-[10px] text-neutral-400 mt-0.5 font-medium leading-relaxed">
                Appoint staff with predefined roles. Staff only see their authorized tools, and the Staff Panel button appears only on their account.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-2.5">
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 transition-all active:scale-[0.97] flex items-center gap-2"
          >
            <Plus size={14} />
            <span>Appoint New Staff Member</span>
          </button>

          <button
            onClick={() => onPageChange(Page.STAFF_PANEL)}
            className="px-4 py-2.5 bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.97] flex items-center gap-1.5"
          >
            <span>Preview Staff Panel</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Role Definitions Reference Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PREDEFINED_ROLES.map(role => (
          <div 
            key={role.id}
            className={`p-4 rounded-2xl border ${role.borderColor} ${role.bgColor} relative overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[8.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/40 border border-white/10 ${role.color}`}>
                {role.badge}
              </span>
              {role.id === 'FINANCE_MANAGER' ? (
                <DollarSign size={16} className={role.color} />
              ) : role.id === 'TOURNAMENT_ORGANIZER' ? (
                <Trophy size={16} className={role.color} />
              ) : (
                <Sparkles size={16} className={role.color} />
              )}
            </div>
            <h4 className="text-xs font-black italic uppercase text-white tracking-tight">
              {role.title}
            </h4>
            <p className="text-[9.5px] text-neutral-300 mt-1 leading-relaxed">
              {role.description}
            </p>
          </div>
        ))}
      </div>

      {/* Staff Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
        <input 
          type="text"
          placeholder="Search staff by username, email or role..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl py-3.5 pl-12 pr-4 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder-neutral-500 transition-all shadow-xs"
        />
      </div>

      {/* Staff Members List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 opacity-50">
            <Loader2 size={24} className="animate-spin mx-auto mb-2 text-purple-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-400">Loading Staff...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-neutral-900/50 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xs">
            <UserCheck size={36} className="mx-auto mb-3 text-slate-400 dark:text-neutral-700" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-neutral-300">
              {staffList.length === 0 ? 'No Staff Appointed Yet' : 'No Staff Matching Search'}
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-neutral-500 mt-1 mb-4">
              {staffList.length === 0 
                ? 'Appoint finance managers or tournament organizers to delegate app management.' 
                : 'Try searching with a different name, email, or role keyword.'}
            </p>
            {staffList.length === 0 && (
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-purple-600 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-500 transition-all shadow-md shadow-purple-600/20"
              >
                + Appoint First Staff Member
              </button>
            )}
          </div>
        ) : (
          filteredStaff.map((staff) => {
            const roleConfig = PREDEFINED_ROLES.find(r => r.id === staff.role) || PREDEFINED_ROLES[0];
            const isSuspended = staff.status === 'suspended';

            return (
              <div
                key={staff.userId}
                className={`p-4 bg-white dark:bg-neutral-900 border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all shadow-xs ${
                  isSuspended 
                    ? 'border-red-500/30 opacity-70 bg-white/70 dark:bg-neutral-900/70' 
                    : 'border-slate-200 dark:border-neutral-800 hover:border-purple-300 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm border ${roleConfig.borderColor} ${roleConfig.bgColor} ${roleConfig.color}`}>
                    {staff.username ? staff.username.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-black italic text-slate-900 dark:text-white uppercase tracking-tight">
                        {staff.username || 'Staff Member'}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest border ${roleConfig.borderColor} ${roleConfig.bgColor} ${roleConfig.color}`}>
                        {roleConfig.badge}
                      </span>
                      {isSuspended ? (
                        <span className="px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/30">
                          SUSPENDED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-medium text-slate-500 dark:text-neutral-400 mt-0.5">
                      {staff.email} {staff.phone ? `• ${staff.phone}` : ''}
                    </p>
                    {(() => {
                      const st = statsFor(staff.userId);
                      return (
                        <p className="text-[8.5px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 mt-1">
                          {staff.matchPayment ?? 0} coins/match • {st.claimed} claimed • {st.completed} done • {st.terminated} terminated • {st.earned} earned
                        </p>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  <button
                    onClick={() => handleOpenPayModal(staff)}
                    className="p-2.5 bg-emerald-500/15 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white rounded-xl text-[9px] font-black transition-all active:scale-[0.97]"
                    title="Match Payment & History"
                  >
                    <DollarSign size={13} />
                  </button>

                  <button
                    onClick={() => handleOpenEditRole(staff)}
                    className="p-2.5 bg-slate-100 hover:bg-purple-600 dark:bg-neutral-800 text-slate-600 hover:text-white dark:text-neutral-300 dark:hover:text-white rounded-xl text-[9px] font-black transition-all active:scale-[0.97]"
                    title="Change Role"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    onClick={() => handleToggleStatus(staff)}
                    className={`p-2.5 rounded-xl text-[9px] font-black transition-all active:scale-[0.97] ${
                      isSuspended
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white'
                    }`}
                    title={isSuspended ? 'Reactivate Staff' : 'Suspend Staff'}
                  >
                    {isSuspended ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                  </button>

                  <button
                    onClick={() => handleRemoveStaff(staff)}
                    className="p-2.5 bg-red-500/15 hover:bg-red-600 text-red-500 dark:text-red-400 hover:text-white rounded-xl text-[9px] font-black transition-all active:scale-[0.97]"
                    title="Remove Staff"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Staff Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 rounded-[30px] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar text-slate-900 dark:text-white transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <UserCheck size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black italic uppercase text-slate-900 dark:text-white tracking-tight">
                      Appoint New Staff Member
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest">
                      Select Registered User &amp; Choose Role
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Step 1: Select User */}
              <div className="space-y-2">
                <label className="text-[9.5px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 block">
                  1. Search Registered User
                </label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={14} />
                  <input
                    type="text"
                    placeholder="Search by username, email or phone..."
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value);
                      if (selectedUser) setSelectedUser(null);
                    }}
                    className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600 transition-all"
                  />
                </div>

                {/* Selected User Display */}
                {selectedUser && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/40 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-600 text-black font-black flex items-center justify-center text-xs">
                        {selectedUser.username ? selectedUser.username.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white italic uppercase">{selectedUser.username}</p>
                        <p className="text-[9px] text-purple-600 dark:text-purple-300 font-medium">{selectedUser.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="text-[9px] font-black text-purple-600 dark:text-purple-400 hover:underline uppercase tracking-wider"
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Candidate Dropdown Results */}
                {!selectedUser && userQuery.trim().length > 0 && (
                  <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 shadow-lg">
                    {candidateUsers.length === 0 ? (
                      <p className="text-[10px] text-slate-400 dark:text-neutral-500 p-3 text-center">No matching unassigned users found.</p>
                    ) : (
                      candidateUsers.slice(0, 5).map(u => (
                        <div
                          key={u.id}
                          onClick={() => {
                            setSelectedUser(u);
                            setUserQuery(u.username || u.email);
                          }}
                          className="p-2.5 hover:bg-slate-50 dark:hover:bg-neutral-800 cursor-pointer flex items-center justify-between transition-colors"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{u.username || 'Player'}</p>
                            <p className="text-[9px] text-slate-400 dark:text-neutral-400">{u.email}</p>
                          </div>
                          <span className="text-[8px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                            Select
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Select Predefined Role */}
              <div className="space-y-2">
                <label className="text-[9.5px] font-black uppercase tracking-widest text-purple-400 block">
                  2. Select Predefined Role
                </label>

                <div className="grid grid-cols-1 gap-2.5">
                  {PREDEFINED_ROLES.map(role => {
                    const isSelected = selectedRole === role.id;
                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelectedRole(role.id)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? `${role.borderColor} ${role.bgColor} ring-1 ring-purple-500/50 shadow-md`
                            : 'border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/60 hover:border-purple-300 dark:hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              isSelected ? 'border-purple-600 bg-purple-600' : 'border-slate-300 dark:border-neutral-600'
                            }`}>
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            <h4 className="text-xs font-black italic uppercase text-slate-900 dark:text-white tracking-tight">
                              {role.title}
                            </h4>
                          </div>
                          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${role.color} bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5`}>
                            {role.badge}
                          </span>
                        </div>

                        <p className="text-[9.5px] text-slate-600 dark:text-neutral-300 mt-1 pl-5">
                          {role.description}
                        </p>

                        <div className="mt-2 pl-5 pt-2 border-t border-slate-200/60 dark:border-white/5 space-y-1">
                          {role.permissions.map((perm, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[8.5px] text-slate-500 dark:text-neutral-400">
                              <span className="w-1 h-1 rounded-full bg-purple-500" />
                              <span>{perm}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateStaff}
                  disabled={!selectedUser || isSaving}
                  className="flex-1 py-3 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                  <span>Grant Staff Role</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Role Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 rounded-[30px] p-6 shadow-2xl space-y-4 text-slate-900 dark:text-white transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black italic uppercase text-slate-900 dark:text-white tracking-tight">
                    Change Staff Role
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest">
                    For {editingStaff.username} ({editingStaff.email})
                  </p>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2">
                {PREDEFINED_ROLES.map(role => {
                  const isSelected = editRole === role.id;
                  return (
                    <div
                      key={role.id}
                      onClick={() => setEditRole(role.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected 
                          ? `${role.borderColor} ${role.bgColor} ring-1 ring-purple-500` 
                          : 'border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">{role.title}</span>
                        <span className={`text-[8px] font-black ${role.color}`}>{role.badge}</span>
                      </div>
                      <p className="text-[9px] text-slate-600 dark:text-neutral-400 mt-1">{role.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdateRole}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  <span>Save Role</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Staff Payment Settings Modal */}
      <AnimatePresence>
        {isPayModalOpen && payingStaff && (() => {
          const full = Math.max(0, Math.floor(Number(payInput) || 0));
          const st = statsFor(payingStaff.userId);
          const history = payments.filter(p => p.staffId === payingStaff.userId).slice(0, 20);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 rounded-[30px] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar text-slate-900 dark:text-white transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black italic uppercase tracking-tight">Staff Payment Management</h3>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest">
                      Staff: {payingStaff.username} • {payingStaff.status === 'suspended' ? 'Suspended' : 'Active'}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsPayModalOpen(false)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                    Full payment per match (Coins)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={payInput}
                    onChange={(e) => setPayInput(e.target.value)}
                    className="mt-1 w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl py-3 px-4 text-lg font-black text-emerald-500 outline-none focus:border-[#F37A1F]"
                  />
                </div>

                <div className="text-xs border border-slate-100 dark:border-neutral-800 rounded-xl divide-y divide-slate-100 dark:divide-neutral-800">
                  <div className="flex justify-between px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                    <span>Match outcome</span><span>Staff payment</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 font-bold"><span>Successful</span><span>{full} Coins</span></div>
                  <div className="flex justify-between px-3 py-2 font-bold"><span>Terminated</span><span>{Math.floor(full / 2)} Coins</span></div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  {[['Claimed', st.claimed], ['Completed', st.completed], ['Terminated', st.terminated], ['Earned', st.earned]].map(([label, val]) => (
                    <div key={label as string} className="p-2 bg-slate-50 dark:bg-neutral-900 rounded-xl">
                      <p className="text-sm font-black">{val}</p>
                      <p className="text-[7.5px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">{label}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1.5">Payment history</p>
                  {history.length === 0 ? (
                    <p className="text-[10px] text-slate-500 dark:text-neutral-500">No payments yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                      {history.map(h => (
                        <div key={h.id} className="flex justify-between items-center px-3 py-2 bg-slate-50 dark:bg-neutral-900 rounded-xl text-[10px] font-bold">
                          <span>#{h.matchNumber || (h.matchId || '').slice(0, 6)} • {h.outcome === 'success' ? 'Success' : 'Terminated'}</span>
                          <span className="text-emerald-500">+{h.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePayment}
                    disabled={isSaving}
                    className="flex-1 py-3 bg-[#F37A1F] hover:bg-[#D9660F] text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    <span>Update Payment</span>
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
