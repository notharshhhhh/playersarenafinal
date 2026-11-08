export enum Page {
  LOGIN = 'login',
  SIGNUP = 'signup',
  HOME = 'home',
  TOURNAMENTS = 'tournaments',
  JOIN_MATCH = 'join_match',
  WALLET = 'wallet',
  ADD_MONEY = 'add_money',
  WITHDRAW = 'withdraw',
  PROFILE = 'profile',
  ADMIN = 'admin',
  ADMIN_USER_PROFILE = 'admin_user_profile',
  ADMIN_EDIT_MATCH = 'admin_edit_match',
  ADMIN_CREATE_MATCH = 'admin_create_match',
  REFERRAL = 'referral',
  PROFILE_DETAILS = 'profile_details',
  GAME_STATS = 'game_stats',
  GAME_MODES = 'game_modes',
  ADMIN_MODES = 'admin_modes',
  LEADERBOARD = 'leaderboard',
  MATCH_DETAILS = 'match_details',
  STAFF_PANEL = 'staff_panel'
}

export interface Game {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  players?: number;
  order?: number;
  isActive?: boolean;
  fairplay?: boolean;
  createdAt?: any;
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  name: string;
  ign?: string;
  kills: number;
  wins?: number;
  matches?: number;
  winnings: number;
  avatar?: string;
}

export interface Tournament {
  id: string;
  displayId?: string;
  matchNumber?: number | string;
  gameId: string;
  title: string;
  image?: string;
  entryFee: number;
  prize: string;
  maxPlayers: number;
  totalSlots: number;
  playersCount: number;
  players: { userId: string; username: string; ign?: string; slot?: number }[]; // array of player objects
  modeId?: string;
  mode: string; // solo / duo / squad / custom
  section: string; // battle royale / clash squad / lone wolf / custom
  map: string;
  time: string;
  roomId?: string;
  roomPassword?: string;
  prizeType?: 'perKill' | 'survival';
  perKillAmount?: number;
  winnersCount?: number;
  prizePool?: number;
  prizeDistribution?: Record<number, number>;
  positionWinnersCount?: number;
  positionPrizeDistribution?: Record<number, number>;
  status?: 'upcoming' | 'ongoing' | 'completed' | 'active' | 'live' | 'cancelled'; // Included active and live for backward compatibility
  gameTitle?: string;
  matchTime?: string;
  roomDeclared?: boolean;
  roomDeclaredAt?: any;
  cancelledBy?: string;
  cancelledAt?: any;
  // Staff match-claim system
  claimedBy?: string;
  claimedByName?: string;
  claimedAt?: any;
  settlement?: 'success' | 'terminated';
  settledAt?: any;
  staffPaid?: number;
  resultsDeclared?: boolean;
  description?: string;
  rules?: string[] | string;
  createdAt?: any;
}

export interface UserStats {
  matchesPlayed: number;
  totalWins: number;
  totalKills: number;
  totalWinnings: number;
}

export interface Wallet {
  deposit: number;
  winnings: number;
  bonus: number;
}

export interface Transaction {
  id?: string;
  userId: string;
  type: 'deposit' | 'withdraw' | 'withdrawal' | 'win' | 'entry' | 'refund' | 'bonus' | 'staff_payment';
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  matchId?: string;
  title?: string;
  rejectionReason?: string;
  transactionId?: string;
  upiId?: string;
  utrNumber?: string;
  paymentMethod?: string;
  createdAt: any;
}

export interface User {
  id?: string;
  username: string;
  email: string;
  phone: string;
  wallet: Wallet;
  isKycVerified: boolean;
  isBanned?: boolean;
  isAdmin?: boolean;
  isStaff?: boolean;
  staffRole?: StaffRole;
  staffStatus?: 'active' | 'suspended';
  stats: UserStats;
  gameIGNs?: Record<string, string>;
  ign?: string;
  referredBy?: string;
  referralClaimed?: boolean;
  deviceId?: string;
  fcmEnabled?: boolean;
  notificationsEnabled?: boolean;
  createdAt?: any;
}

export type StaffRole = 'FINANCE_MANAGER' | 'TOURNAMENT_ORGANIZER' | 'ALL';

export interface StaffMember {
  id?: string;
  userId: string;
  username: string;
  email: string;
  phone?: string;
  role: StaffRole;
  permissions?: string[];
  status: 'active' | 'suspended';
  matchPayment?: number; // full coins paid per match (Success = 100%, Terminated = 50%)
  assignedBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Banner {
  id?: string;
  imageUrl: string;
  redirectUrl?: string;
  type: 'main' | 'offer' | 'freefire' | 'bottom';
  order: number;
  isActive: boolean;
  createdAt?: any;
}

export interface PaymentGateway {
  id: string;
  name: string;
  apiKey?: string;
  secretKey?: string;
  merchantId?: string;
  webhookSecret?: string;
  upiId?: string;
  isActive: boolean;
  updatedAt?: any;
}

export type NotificationType = 'tournament' | 'room_creds' | 'offer' | 'alert' | 'fairplay' | 'wallet';
export type NotificationAudience = 'all' | 'match' | 'user';

export interface AppNotification {
  id?: string;
  title: string;
  message: string;
  type: NotificationType;
  audience: NotificationAudience;
  targetMatchId?: string;
  targetMatchTitle?: string;
  targetUserId?: string;
  targetUsername?: string;
  actionPage?: Page | string;
  actionUrl?: string;
  actionText?: string;
  imageUrl?: string;
  readBy?: string[];
  createdAt?: any;
  createdBy?: string;
}

export interface BonusSettings {
  signupBonus: number;
  maxBonusPerMatchPercent?: number;
  enableSignupBonus?: boolean;
}

export interface AppSettings {
  appName?: string;
  appLogoUrl?: string;
  upiId?: string;
  qrCodeUrl?: string;
  signupBonus?: number;
  bonusSettings?: BonusSettings;
  referral?: {
    baseUrl?: string;
    perReferralReward?: number;
    rewardType?: 'deposit' | 'bonus' | 'both';
    depositPercentage?: number;
    bonusPercentage?: number;
    newUserReward?: number;
  };
  support?: {
    whatsapp?: string;
    telegram?: string;
    email?: string;
  };
  limits?: {
    minDeposit?: number;
    maxDeposit?: number;
    minWithdraw?: number;
    maxWithdraw?: number;
  };
}

export type MediaCategory = 'banner' | 'game' | 'mode' | 'general';

export interface MediaAsset {
  id?: string;
  title: string;
  url: string;
  category: MediaCategory;
  tags?: string[];
  uploadedBy?: string;
  uploadedByName?: string;
  createdAt?: any;
}

export interface StaffPayment {
  id?: string;
  matchId: string;
  matchNumber?: number | string | null;
  matchTitle?: string;
  staffId: string;
  staffName?: string;
  outcome: 'success' | 'terminated';
  fullPayment: number;
  amount: number;
  createdAt?: any;
}
