import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useParams } from 'react-router-dom';
import { Page, User, Transaction, Wallet } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { ChevronLeft, Shield, ShieldAlert, Wallet as WalletIcon, Trophy, History, Plus, Minus, User as UserIcon, Mail, Phone } from 'lucide-react';

interface AdminUserDetailProps {
  onPageChange: (page: Page, id?: string) => void;
}

export default function AdminUserDetail({ onPageChange }: AdminUserDetailProps) {
  const { id: userId } = useParams();
  const [userData, setUserData] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [joinedMatches, setJoinedMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceModal, setBalanceModal] = useState<{ open: boolean; type: 'add' | 'deduct'; walletType: keyof Wallet } | null>(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!userId) return;

    // Real-time user data
    const unsubscribeUser = onSnapshot(doc(db, 'users', userId), (doc) => {
      if (doc.exists()) {
        setUserData({ id: doc.id, ...doc.data() } as User);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
      setLoading(false);
    });

    // Transactions (sorted client-side to avoid requiring composite Firestore index)
    const qTransactions = query(
      collection(db, 'transactions'),
      where('userId', '==', userId)
    );

    const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      txs.sort((a: any, b: any) => {
        const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt?.toDate === 'function' ? a.createdAt.toDate().getTime() : 0);
        const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt?.toDate === 'function' ? b.createdAt.toDate().getTime() : 0);
        return tB - tA;
      });
      setTransactions(txs.slice(0, 20));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    // Joined Matches
    const fetchMatches = async () => {
      try {
        const qReg = query(collection(db, 'registrations'), where('userId', '==', userId));
        const regSnap = await getDocs(qReg);
        const matchIds = regSnap.docs.map(d => d.data().tournamentId).filter(Boolean);
        
        if (matchIds.length > 0) {
          // Use documentId() 'in' for better performance (limit 30)
          const qMatches = query(
            collection(db, 'matches'), 
            where('__name__', 'in', matchIds.slice(0, 30))
          );
          const matchSnap = await getDocs(qMatches);
          const matches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setJoinedMatches(matches);
        }
      } catch (error) {
        console.error("Error fetching matches:", error);
      }
    };

    fetchMatches();

    return () => {
      unsubscribeUser();
      unsubscribeTransactions();
    };
  }, [userId]);

  const handleToggleBan = async () => {
    if (!userData || !userId) return;
    const newBanStatus = !userData.isBanned;
    try {
      await updateDoc(doc(db, 'users', userId), {
        isBanned: newBanStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleUpdateBalance = async () => {
    if (!userData || !userId || !balanceModal || !amount) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', userId);
      const currentVal = Number(userData.wallet?.[balanceModal.walletType] || 0);
      const newBalance = balanceModal.type === 'add' 
        ? currentVal + numAmount 
        : Math.max(0, currentVal - numAmount);

      batch.update(userRef, {
        [`wallet.${balanceModal.walletType}`]: newBalance
      });

      // Add transaction record
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        userId,
        type: balanceModal.type === 'add' ? 'deposit' : 'withdraw',
        amount: numAmount,
        status: 'completed',
        title: reason || `Admin ${balanceModal.type} balance (${balanceModal.walletType})`,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setBalanceModal(null);
      setAmount('');
      setReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="pt-24 px-4 text-center">
        <p className="text-neutral-500">User not found</p>
        <button onClick={() => onPageChange(Page.ADMIN)} className="mt-4 text-primary text-xs font-black uppercase">Go Back</button>
      </div>
    );
  }

  return (
    <div className="pt-6 pb-24 px-4 text-slate-900 dark:text-white transition-colors">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => onPageChange(Page.ADMIN)}
          className="p-2 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white transition-colors shadow-xs"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white italic">User Profile</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Management Panel</p>
        </div>
      </div>

      {/* User Info Card */}
      <div className="bg-white dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800/50 rounded-3xl p-6 mb-6 shadow-xs">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-purple-50 dark:bg-white/5 rounded-2xl flex items-center justify-center border border-purple-100 dark:border-white/5 text-purple-600 dark:text-white/50">
              <UserIcon size={32} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white italic">{userData.username}</h2>
              <p className="text-xs text-slate-500 dark:text-neutral-500 font-medium">ID: {userId}</p>
              {userData.isBanned && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest rounded-full border border-red-500/20">
                  Banned
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={handleToggleBan}
            className={`p-3 rounded-2xl border transition-all ${
              userData.isBanned 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20' 
                : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20'
            }`}
          >
            {userData.isBanned ? <Shield size={20} /> : <ShieldAlert size={20} />}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200/80 dark:border-white/5">
            <Mail size={16} className="text-slate-400 dark:text-neutral-500" />
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase text-slate-400 dark:text-neutral-500 tracking-widest">Email Address</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{userData.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200/80 dark:border-white/5">
            <Phone size={16} className="text-slate-400 dark:text-neutral-500" />
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400 dark:text-neutral-500 tracking-widest">Phone Number</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{userData.phone || 'Not provided'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Breakdown */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 mb-4 ml-2">Wallet Breakdown</h3>
      <div className="grid grid-cols-1 gap-3 mb-8">
        {(['deposit', 'winnings', 'bonus'] as (keyof Wallet)[]).map((type) => (
          <div key={type} className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-600 dark:text-neutral-400">
                <WalletIcon size={18} />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase text-slate-400 dark:text-neutral-500 tracking-widest">{type}</p>
                <p className="text-base font-black text-slate-900 dark:text-white italic">₹{(userData.wallet?.[type] || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setBalanceModal({ open: true, type: 'deduct', walletType: type })}
                className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors"
                title={`Deduct from ${type}`}
              >
                <Minus size={18} />
              </button>
              <button 
                onClick={() => setBalanceModal({ open: true, type: 'add', walletType: type })}
                className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-colors"
                title={`Add to ${type}`}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Stats & Matches */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-5 shadow-xs">
           <Trophy size={20} className="text-amber-500 mb-3" />
           <p className="text-[8px] font-black uppercase text-slate-400 dark:text-neutral-500 tracking-widest mb-1">Matches Played</p>
           <p className="text-2xl font-black text-slate-900 dark:text-white italic">{userData.stats.matchesPlayed}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-5 shadow-xs">
           <History size={20} className="text-purple-600 dark:text-primary mb-3" />
           <p className="text-[8px] font-black uppercase text-slate-400 dark:text-neutral-500 tracking-widest mb-1">Recent Matches</p>
           <p className="text-2xl font-black text-slate-900 dark:text-white italic">{joinedMatches.length}</p>
        </div>
      </div>

      {/* Joined Matches List */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 mb-4 ml-2">Recent Joined Matches</h3>
      <div className="space-y-3 mb-8">
        {joinedMatches.length > 0 ? (
          joinedMatches.map((match) => (
            <div key={match.id} className="bg-white dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800/50 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[10px] font-black text-purple-600 dark:text-primary uppercase italic mb-1">{match.section}</p>
                <h4 className="text-sm font-black text-slate-900 dark:text-white italic">{match.title}</h4>
                <p className="text-[10px] text-slate-400 dark:text-neutral-500">{match.time}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-slate-900 dark:text-white italic">₹{match.entryFee}</p>
                <span className={`text-[8px] font-black uppercase tracking-widest ${match.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {match.status || 'Active'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white dark:bg-neutral-900/50 border border-dashed border-slate-200 dark:border-neutral-800 rounded-2xl p-8 text-center shadow-xs">
            <p className="text-xs text-slate-400 dark:text-neutral-500">No matches joined yet</p>
          </div>
        )}
      </div>

      {/* Transactions History */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 mb-4 ml-2">Transaction History</h3>
      <div className="space-y-3">
        {transactions.map((tx) => (
          <div key={tx.id} className="bg-white dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800/50 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                tx.type === 'deposit' || tx.type === 'win' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
              }`}>
                {tx.type === 'deposit' || tx.type === 'win' ? <Plus size={14} /> : <Minus size={14} />}
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white italic">{tx.title || tx.type.toUpperCase()}</h4>
                <p className="text-[8px] font-black uppercase text-slate-400 dark:text-neutral-500 tracking-widest">
                  {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Recent'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-black italic ${
                tx.type === 'deposit' || tx.type === 'win' ? 'text-emerald-500' : 'text-red-500'
              }`}>
                {tx.type === 'deposit' || tx.type === 'win' ? '+' : '-'}₹{tx.amount}
              </p>
              <p className={`text-[8px] font-black uppercase tracking-widest ${
                tx.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'
              }`}>
                {tx.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Balance Modal */}
      {balanceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setBalanceModal(null)}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-sm bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-[30px] p-8 shadow-2xl text-slate-900 dark:text-white"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border ${
              balanceModal.type === 'add' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              {balanceModal.type === 'add' ? <Plus size={32} /> : <Minus size={32} />}
            </div>
            
            <h2 className="text-2xl font-black text-slate-900 dark:text-white italic mb-2">
              {balanceModal.type === 'add' ? 'Add' : 'Deduct'} Balance
            </h2>
            <p className="text-xs text-slate-500 dark:text-neutral-500 font-medium mb-8">
              Adjusting <span className="text-slate-900 dark:text-white font-black uppercase italic">{balanceModal.walletType}</span> for {userData.username}
            </p>

            <div className="space-y-4 mb-8">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Amount (₹)</label>
                <input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-2xl px-5 py-3.5 text-slate-900 dark:text-white font-medium placeholder:text-slate-400 dark:placeholder:text-neutral-700 focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-colors shadow-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500 ml-1">Reason (Optional)</label>
                <input 
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Winning Prize"
                  className="w-full bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-2xl px-5 py-3.5 text-slate-900 dark:text-white font-medium placeholder:text-slate-400 dark:placeholder:text-neutral-700 focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-colors shadow-xs"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setBalanceModal(null)}
                className="flex-1 px-4 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateBalance}
                disabled={!amount}
                className={`flex-1 px-4 py-4 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 ${
                  balanceModal.type === 'add' ? 'bg-emerald-600 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)]' : 'bg-red-600 shadow-[0_8px_20px_-6px_rgba(220,38,38,0.4)]'
                }`}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
