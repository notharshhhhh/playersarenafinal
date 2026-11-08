import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import { Page, User } from './types';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, onSnapshot, increment, updateDoc, addDoc } from 'firebase/firestore';
import { GAMES, ADMIN_EMAILS } from './constants';

// Pages
import Auth from './pages/Auth';
import Home from './pages/Home';
import Tournaments from './pages/Tournaments';
import JoinMatch from './pages/JoinMatch';
import WalletPage from './pages/Wallet';
import AddMoney from './pages/AddMoney';
import Withdraw from './pages/Withdraw';
import ProfilePage from './pages/Profile';
import AdminPage from './pages/Admin';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminEditMatch from './pages/AdminEditMatch';
import AdminCreateMatch from './pages/AdminCreateMatch';
import ReferralPage from './pages/Referral';
import ProfileDetails from './pages/ProfileDetails';
import GameStats from './pages/GameStats';
import GameModes from './pages/GameModes';
import AdminModes from './pages/AdminModes';
import Leaderboard from './pages/Leaderboard';
import MatchDetails from './pages/MatchDetails';
import StaffPanel from './pages/StaffPanel';
import GlobalNotificationListener from './components/GlobalNotificationListener';
import { PopupProvider } from './components/PopupProvider';
import AdvancedLoader from './components/AdvancedLoader';

const DEFAULT_USER_DATA = {
  wallet: {
    deposit: 0,
    winnings: 0,
    bonus: 0,
  },
  isKycVerified: false,
  isAdmin: false,
  stats: {
    matchesPlayed: 0,
    totalWins: 0,
    totalKills: 0,
    totalWinnings: 0,
  }
};

const pageToPath = {
  [Page.LOGIN]: '/login',
  [Page.SIGNUP]: '/signup',
  [Page.HOME]: '/home',
  [Page.TOURNAMENTS]: '/tournaments',
  [Page.JOIN_MATCH]: '/match',
  [Page.WALLET]: '/wallet',
  [Page.ADD_MONEY]: '/wallet/add',
  [Page.WITHDRAW]: '/wallet/withdraw',
  [Page.PROFILE]: '/profile',
  [Page.ADMIN]: '/admin',
  [Page.ADMIN_USER_PROFILE]: '/admin/user',
  [Page.ADMIN_EDIT_MATCH]: '/admin/match/edit',
  [Page.ADMIN_CREATE_MATCH]: '/admin/match/create',
  [Page.REFERRAL]: '/referral',
  [Page.PROFILE_DETAILS]: '/profile/details',
  [Page.GAME_STATS]: '/profile/stats',
  [Page.GAME_MODES]: '/game-modes',
  [Page.ADMIN_MODES]: '/admin/modes',
  [Page.LEADERBOARD]: '/leaderboard',
  [Page.MATCH_DETAILS]: '/match-details',
  [Page.STAFF_PANEL]: '/staff'
};

const pathToPage: Record<string, Page> = {
  '/login': Page.LOGIN,
  '/signup': Page.SIGNUP,
  '/home': Page.HOME,
  '/tournaments': Page.TOURNAMENTS,
  '/match': Page.JOIN_MATCH,
  '/match-details': Page.MATCH_DETAILS,
  '/wallet': Page.WALLET,
  '/wallet/add': Page.ADD_MONEY,
  '/wallet/withdraw': Page.WITHDRAW,
  '/profile': Page.PROFILE,
  '/admin': Page.ADMIN,
  '/admin/user': Page.ADMIN_USER_PROFILE,
  '/admin/match/edit': Page.ADMIN_EDIT_MATCH,
  '/admin/match/create': Page.ADMIN_CREATE_MATCH,
  '/referral': Page.REFERRAL,
  '/profile/details': Page.PROFILE_DETAILS,
  '/profile/stats': Page.GAME_STATS,
  '/game-modes': Page.GAME_MODES,
  '/admin/modes': Page.ADMIN_MODES,
  '/leaderboard': Page.LEADERBOARD,
  '/staff': Page.STAFF_PANEL,
  '/staff-panel': Page.STAFF_PANEL
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);
  return null;
}

interface ProtectedRouteProps {
  isLoggedIn: boolean;
  loading: boolean;
  user: User | null;
  children: React.ReactNode;
}

function ProtectedRoute({ isLoggedIn, loading, user, children }: ProtectedRouteProps) {
  if (!isLoggedIn && !loading) {
    return <Navigate to="/login" replace />;
  }
  if (!user && isLoggedIn) {
    return (
      <AdvancedLoader
        text="LOADING PLAYER PROFILE"
        subtext="FETCHING WALLET & STATS..."
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinedMatchIds, setJoinedMatchIds] = useState<string[]>([]);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    const seedDatabase = async (email: string, uid: string) => {
      const admins = ["playersarena.site@gmail.com", "tournament909@gmail.com", "harsha.cpr001@gmail.com", "admin@khelgalli.com", "qupagaming@gmail.com", "mahendrathakur9009@gmail.com", "mahendrar9009@gmail.com", "chouhanadarsh99@gmail.com"];
      if (!admins.includes(email.toLowerCase()) && uid !== "XoXyXcnrlzOaMIKKolXnU3mT9xn1") return;
      try {
        // Independence seeding for games
        const gamesSnap = await getDocs(collection(db, 'games'));
        if (gamesSnap.empty) {
          const batch = writeBatch(db);
          GAMES.forEach(game => {
            batch.set(doc(db, 'games', game.id), game);
          });
          await batch.commit();
          console.log('Games seeded');
        }

        // Seeding game rules
        const rulesSnap = await getDocs(collection(db, 'gameRules'));
        if (rulesSnap.empty) {
          const batch = writeBatch(db);
          const defaultRules = [
            {
              id: 'battle_royale',
              type: 'Battle Royale',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Using banned apps will lead to ban.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'clash_squad',
              type: 'Clash Squad',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Teaming with enemies is banned.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'lone_wolf',
              type: 'Lone Wolf',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Rank pushing is not allowed.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            }
          ];
          defaultRules.forEach(rule => {
            batch.set(doc(db, 'gameRules', rule.id), rule);
          });
          await batch.commit();
          console.log('Game rules seeded');
        }

        // Seeding app settings
        const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
        if (!settingsSnap.exists()) {
          await setDoc(doc(db, 'appSettings', 'referral_support'), {
            referral: {
              baseUrl: window.location.origin,
              perReferralReward: 50,
              rewardType: 'bonus',
              depositPercentage: 50,
              bonusPercentage: 50,
              newUserReward: 10
            },
            support: {
              whatsapp: 'https://wa.me/910000000000',
              telegram: 'https://t.me/khelgalli',
              email: 'support@khelgalli.com'
            }
          });
          console.log('App settings seeded');
        }

        // Seeding initial Game Modes from constants
        const modesSnap = await getDocs(collection(db, 'gameModes'));
        if (modesSnap.empty) {
          const { GAME_MODES_DATA } = await import('./constants');
          const batch = writeBatch(db);
          Object.entries(GAME_MODES_DATA).forEach(([gameId, modes]) => {
            modes.forEach((mode, index) => {
              const modeId = `${gameId}_${mode.id}`;
              batch.set(doc(db, 'gameModes', modeId), {
                ...mode,
                gameId,
                order: index
              });
            });
          });
          await batch.commit();
          console.log('Game modes seeded from constants');
        }
      } catch (error) {
        console.error('Error seeding database:', error);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }

      if (firebaseUser) {
        // Seed if admin
        seedDatabase(firebaseUser.email || '', firebaseUser.uid);

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for user changes (balance, etc.)
        unsubscribeUser = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            const data = userDoc.data() as any;
            const emailLower = (firebaseUser.email || data.email || '').toLowerCase();
            const isEmailAdmin = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower) || firebaseUser.uid === 'XoXyXcnrlzOaMIKKolXnU3mT9xn1';
            
            // Migration check: if user doesn't have the new wallet structure
            if (!data.wallet) {
              console.log("Migrating user wallet structure...");
              const migratedWallet = {
                deposit: data.walletBalance || 0,
                winnings: data.winnings || 0,
                bonus: data.bonus || 0
              };
              
              // Only migrate if we have some old data, otherwise use defaults
              if (data.walletBalance === undefined && data.winnings === undefined && data.bonus === undefined) {
                Object.assign(migratedWallet, DEFAULT_USER_DATA.wallet);
              }

              const batch = writeBatch(db);
              batch.update(userDocRef, {
                wallet: migratedWallet
              });
              await batch.commit();
              // The next snapshot will have the right data
              return;
            }

            const nextUser = { id: userDoc.id, ...data, isAdmin: Boolean(data.isAdmin || isEmailAdmin), role: (data.isAdmin || isEmailAdmin) ? 'admin' : data.role } as User;
            setUser((prev) => {
              if (prev && JSON.stringify(prev) === JSON.stringify(nextUser)) return prev;
              return nextUser;
            });
            setIsLoggedIn(true);
            setLoading(false);

            // Process referral rewards if eligible
            if (data.referredBy && !data.referralClaimed) {
              processReferralReward(data, firebaseUser.uid);
            }
            
            // Immediate redirect to home ONLY if currently on login/signup/root pages
            const currentBrowserPath = window.location.pathname;
            if (currentBrowserPath === '/login' || currentBrowserPath === '/signup' || currentBrowserPath === '/') {
              console.log("Redirecting to home...");
              navigate('/home', { replace: true });
            }
          } else {
            // Email signup in progress: Auth.tsx is writing the profile (with referral data). Don't race it.
            try {
              if (sessionStorage.getItem('kg_signup_in_progress')) return;
            } catch {}
            // For Google Auth or unexpected cases, create default profile
            const emailLower = (firebaseUser.email || '').toLowerCase();
            const isAdmin = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower) ||
                           firebaseUser.uid === 'XoXyXcnrlzOaMIKKolXnU3mT9xn1';
            
            let signupBonus = 0;
            try {
              const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
              if (settingsSnap.exists()) {
                const sData = settingsSnap.data();
                if (typeof sData?.signupBonus === 'number') {
                  signupBonus = Math.max(0, sData.signupBonus);
                } else if (typeof sData?.bonusSettings?.signupBonus === 'number') {
                  signupBonus = Math.max(0, sData.bonusSettings.signupBonus);
                }
              }
            } catch (err) {
              console.warn('Could not read signup bonus:', err);
            }

            const newUser: User = {
              username: firebaseUser.displayName || `Gamer_${firebaseUser.uid.slice(0, 5)}`,
              email: firebaseUser.email || '',
              phone: firebaseUser.phoneNumber || '',
              ...DEFAULT_USER_DATA,
              wallet: {
                deposit: 0,
                winnings: 0,
                bonus: signupBonus,
              },
              isAdmin: isAdmin
            };
            await setDoc(userDocRef, {
              ...newUser,
              createdAt: serverTimestamp(),
            });

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
            // Snapshot will pick this up
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          setLoading(false);
        });

        // Also fetch registrations
        try {
          const q = query(collection(db, 'registrations'), where('userId', '==', firebaseUser.uid));
          const regSnap = await getDocs(q);
          const matchIds = regSnap.docs.map(doc => doc.data().tournamentId);
          setJoinedMatchIds(matchIds);
        } catch (error) {
          console.error("Error fetching registrations:", error);
        }
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setJoinedMatchIds([]);
        const currentBrowserPath = window.location.pathname;
        if (!['/login', '/signup'].includes(currentBrowserPath)) {
          navigate('/login', { replace: true });
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  const handleLogin = () => {
    console.log("Redirecting to home...");
    navigate('/home');
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const handlePageChange = (page: Page, id?: string) => {
    let path = pageToPath[page];
    if (id) {
      if (page === Page.TOURNAMENTS) path = `${path}/${id}`;
      else if (page === Page.JOIN_MATCH) path = `${path}/${id}`;
      else if (page === Page.MATCH_DETAILS) path = `${path}/${id}`;
      else if (page === Page.ADMIN_USER_PROFILE) path = `${path}/${id}`;
      else if (page === Page.ADMIN_EDIT_MATCH) path = `${path}/${id}`;
      else if (page === Page.ADMIN_CREATE_MATCH) path = `${path}/${id}`;
      else if (page === Page.GAME_MODES) path = `${path}/${id}`;
    }
    navigate(path);
  };

  const handleJoinSuccess = (matchId: string) => {
    setJoinedMatchIds(prev => [...prev, matchId]);
  };

  const processReferralReward = async (currentUser: any, uid: string) => {
    if (!currentUser.referredBy || currentUser.referralClaimed) return;

    console.log("Checking referral reward for user:", currentUser.username);
    try {
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
      if (!settingsSnap.exists()) return;
      const settings = settingsSnap.data();
      const refSettings = settings.referral;
      if (!refSettings) return;

      // Find referrer by username
      const q = query(collection(db, 'users'), where('username', '==', currentUser.referredBy));
      const referrerSnap = await getDocs(q);
      if (referrerSnap.empty) {
        console.log("Referrer not found:", currentUser.referredBy);
        // Mark as claimed to stop checking
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true });
        return;
      }

      // Device check: Are there other users with this deviceId who already claimed?
      const qDevice = query(collection(db, 'users'), where('deviceId', '==', currentUser.deviceId || 'unknown'), where('referralClaimed', '==', true));
      const deviceSnap = await getDocs(qDevice);
      if (!deviceSnap.empty) {
        console.warn("Fraud alert: Device already used for referral reward");
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true });
        return;
      }
      
      const referrerDoc = referrerSnap.docs[0];
      const referrerId = referrerDoc.id;

      // Reward Referrer
      const refReward = refSettings.perReferralReward || 0;
      if (refReward > 0) {
        const referrerUpdate: any = {};
        if (refSettings.rewardType === 'deposit') {
          referrerUpdate['wallet.deposit'] = increment(refReward);
        } else if (refSettings.rewardType === 'bonus') {
          referrerUpdate['wallet.bonus'] = increment(refReward);
        } else if (refSettings.rewardType === 'both') {
          const depPercentage = refSettings.depositPercentage || 50;
          const depAmount = (refReward * depPercentage) / 100;
          const bonusAmount = refReward - depAmount;
          referrerUpdate['wallet.deposit'] = increment(depAmount);
          referrerUpdate['wallet.bonus'] = increment(bonusAmount);
        }
        
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', referrerId), referrerUpdate);
        
        // Referrer Transaction
        batch.set(doc(collection(db, 'transactions')), {
          userId: referrerId,
          type: 'bonus',
          amount: refReward,
          status: 'completed',
          title: `Referral Reward: ${currentUser.username}`,
          createdAt: serverTimestamp()
        });

        // New user's own bonus is credited at signup (Auth.tsx) - only mark this referral as processed
        batch.update(doc(db, 'users', uid), { referralClaimed: true });

        await batch.commit();
        console.log("Referral rewards processed successfully");
      } else {
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true });
      }
    } catch (err) {
      console.error("Error processing referral reward:", err);
    }
  };

  if (loading) {
    return (
      <AdvancedLoader
        fullScreen
        text="INITIALIZING ARENA"
        subtext="CONNECTING SECURE TOURNAMENT SERVERS..."
      />
    );
  }

  // Derive currentPage accurately using longest prefix match so '/admin/user' doesn't get shadowed
  const currentPath = location.pathname;
  let currentPage = Page.HOME;
  const sortedRoutes = Object.entries(pathToPage).sort((a, b) => b[0].length - a[0].length);
  for (const [path, page] of sortedRoutes) {
    if (currentPath === path || currentPath.startsWith(path + '/')) {
      currentPage = page;
      break;
    }
  }

  // Pages that display header/nav
  const showChrome = isLoggedIn && !['/login', '/signup'].includes(location.pathname);
  const showHeader = showChrome && !['/home', '/tournaments', '/match/', '/match-details/', '/wallet/add', '/wallet/withdraw', '/admin', '/staff', '/referral', '/profile/details', '/profile/stats', '/game-modes', '/profile'].some(p => location.pathname.startsWith(p));
  const showNav = showChrome && !['/match/', '/match-details/', '/admin/match/'].some(p => location.pathname.startsWith(p));

  return (
    <PopupProvider>
      <div className="min-h-screen bg-background relative selection:bg-primary/20">
        <ScrollToTop />
      <GlobalNotificationListener 
        user={user} 
        joinedMatchIds={joinedMatchIds} 
        onPageChange={handlePageChange} 
      />
      {showHeader && <Header user={user!} onPageChange={handlePageChange} />}
      
      <main className="mx-auto max-w-lg min-h-screen bg-background overflow-x-hidden">
        <div className="w-full">
          <Routes location={location}>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/login" element={<Auth onLogin={handleLogin} />} />
              <Route path="/signup" element={<Auth onLogin={handleLogin} />} />
              
              <Route path="/home" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <Home user={user!} onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
                </ProtectedRoute>
              } />

              <Route path="/game-modes/:gameId" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <GameModes onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />
              
              <Route path="/tournaments" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <Tournaments user={user!} onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
                </ProtectedRoute>
              } />
              
              <Route path="/tournaments/:gameId" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <Tournaments user={user!} onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
                </ProtectedRoute>
              } />

              <Route path="/match-details/:id" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <MatchDetails 
                    user={user!}
                    onPageChange={handlePageChange} 
                    joinedMatchIds={joinedMatchIds}
                  />
                </ProtectedRoute>
              } />

              <Route path="/match/:id" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <JoinMatch 
                    user={user!}
                    onPageChange={handlePageChange} 
                    joinedMatchIds={joinedMatchIds}
                    onJoinSuccess={handleJoinSuccess}
                  />
                </ProtectedRoute>
              } />

              <Route path="/wallet" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <WalletPage user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/wallet/add" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <AddMoney user={user} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/wallet/withdraw" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <Withdraw user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/profile" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <ProfilePage user={user!} onPageChange={handlePageChange} onLogout={handleLogout} />
                </ProtectedRoute>
              } />

              <Route path="/profile/details" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <ProfileDetails user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/profile/stats" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <GameStats user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/referral" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <ReferralPage user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/staff" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <StaffPanel user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/staff-panel" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <StaffPanel user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <AdminPage user={user} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/user/:id" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <AdminUserDetail onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/match/edit/:id" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <AdminEditMatch onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/match/create" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <AdminCreateMatch onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/match/create/:duplicateId" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <AdminCreateMatch onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/modes" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <AdminModes onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/leaderboard" element={
                <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                  <Leaderboard user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
        </div>
      </main>

      {showNav && (
        <BottomNav 
          currentPage={currentPage} 
          onPageChange={handlePageChange} 
          user={user}
        />
      )}
      
      {/* Global Background Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[80%] h-[40%] bg-secondary/10 blur-[120px] rounded-full" />
      </div>
      </div>
    </PopupProvider>
  );
}
