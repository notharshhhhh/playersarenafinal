import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Loader2, Gamepad2, 
  Layers, ChevronDown,
  Image as ImageIcon, Upload, Trash2, CheckCircle2
} from 'lucide-react';
import { Page, Tournament, Game } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, getDoc, getDocs, serverTimestamp, runTransaction, query, orderBy } from 'firebase/firestore';
import { GameMode } from './AdminModes';
import { GAMES, GAME_MODES_DATA } from '../constants';
import { uploadOriginalImage } from '../utils/imageCompressor';
import MediaPickerModal from '../components/MediaPickerModal';

interface AdminCreateMatchProps {
  onPageChange: (page: Page) => void;
}

const PRESET_MATCH_THUMBNAILS = [
  {
    name: 'Battle Royale Esports',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Clash Squad 4v4',
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Lone Wolf 1v1',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Headshot / Sniper',
    url: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Survival Arena',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Neon Tournament Stage',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop'
  }
];

const GAME_MAPS: Record<string, string[]> = {
  freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NeXTerra', 'Bermuda Remastered'],
  bgmi: ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Livik', 'TDM Warehouse']
};

export default function AdminCreateMatch({ onPageChange }: AdminCreateMatchProps) {
  const { duplicateId } = useParams();
  const [loading, setLoading] = useState(duplicateId ? true : false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gamesList, setGamesList] = useState<Game[]>(GAMES);
  const [availableModes, setAvailableModes] = useState<GameMode[]>([]);
  const [loadingModes, setLoadingModes] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matchForm, setMatchForm] = useState({
    title: '',
    gameId: 'freefire',
    selectedModeDocId: 'br_solo',
    modeId: 'br_solo',
    mode: 'Solo',
    section: 'Battle Royale',
    image: '',
    map: 'Bermuda',
    entryFee: 10,
    prize: '₹300',
    prizePool: 300,
    maxPlayers: 48,
    totalSlots: 48,
    time: '',
    prizeType: 'perKill' as 'perKill' | 'survival',
    perKillAmount: 5,
    winnersCount: 1,
    prizeDistribution: {} as Record<number, number>,
    positionWinnersCount: 0,
    positionPrizeDistribution: {} as Record<number, number>
  });

  // Load dynamic games added by Admin
  useEffect(() => {
    const fetchGames = async () => {
      try {
        const snap = await getDocs(collection(db, 'games'));
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Game));
          list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
          setGamesList(list);
        }
      } catch (e) {
        console.warn('Error loading games:', e);
      }
    };
    fetchGames();
  }, []);

  // Fetch Dynamic Game Modes for the selected Game
  useEffect(() => {
    const fetchGameModes = async () => {
      setLoadingModes(true);
      try {
        const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ ...d.data() }) as GameMode);
        const filtered = list.filter(m => (m.gameId || 'freefire').toLowerCase() === matchForm.gameId.toLowerCase());
        
        if (filtered.length > 0) {
          setAvailableModes(filtered);
          if (!filtered.some(m => m.id === matchForm.selectedModeDocId)) {
            handleSelectGameModeFromList(filtered[0].id, filtered);
          }
        } else {
          const fallbackPresets = (GAME_MODES_DATA[matchForm.gameId.toLowerCase()] || GAME_MODES_DATA.freefire).map((m, i) => ({
            ...m,
            gameId: matchForm.gameId,
            order: i + 1
          }));
          setAvailableModes(fallbackPresets);
          if (fallbackPresets.length > 0 && !fallbackPresets.some(m => m.id === matchForm.selectedModeDocId)) {
            handleSelectGameModeFromList(fallbackPresets[0].id, fallbackPresets);
          }
        }
      } catch (err) {
        console.warn('Could not fetch custom game modes:', err);
      } finally {
        setLoadingModes(false);
      }
    };

    fetchGameModes();
  }, [matchForm.gameId]);

  // Handle Duplication
  useEffect(() => {
    if (duplicateId) {
      const fetchMatch = async () => {
        try {
          const matchDoc = await getDoc(doc(db, 'matches', duplicateId));
          if (matchDoc.exists()) {
            const data = matchDoc.data() as Tournament;
            setMatchForm({
              title: `${data.title} (Copy)`,
              gameId: data.gameId || 'freefire',
              selectedModeDocId: data.modeId || 'br_solo',
              modeId: data.modeId || 'br_solo',
              image: data.image || '',
              entryFee: data.entryFee || 0,
              prize: data.prize || '',
              prizePool: data.prizePool || 0,
              maxPlayers: data.maxPlayers || 48,
              totalSlots: data.totalSlots || 48,
              time: data.time || '',
              map: data.map || 'Bermuda',
              mode: data.mode || 'Solo',
              section: data.section || 'Battle Royale',
              prizeType: data.prizeType || 'perKill',
              perKillAmount: data.perKillAmount || 0,
              winnersCount: data.winnersCount || 1,
              prizeDistribution: data.prizeDistribution || {},
              positionWinnersCount: data.positionWinnersCount || 0,
              positionPrizeDistribution: data.positionPrizeDistribution || {}
            });
          } else {
            alert('Original match not found for duplication');
          }
        } catch (e) {
          console.error('Error fetching match for duplication:', e);
          handleFirestoreError(e, OperationType.GET, `matches/${duplicateId}`);
        } finally {
          setLoading(false);
        }
      };
      fetchMatch();
    }
  }, [duplicateId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadProgress(10);

    try {
      const uploadedUrl = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setMatchForm(prev => ({ ...prev, image: uploadedUrl }));
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSelectGameModeFromList = (modeSlugOrId: string, modesSource: GameMode[] = availableModes) => {
    const found = modesSource.find(m => m.id === modeSlugOrId || `${m.gameId}_${m.id}` === modeSlugOrId);
    
    if (found) {
      const titleUpper = found.title.toUpperCase();
      let derivedSection = found.category || found.subtitle || 'Battle Royale';
      let derivedMode = 'Solo';
      let derivedSlots = 48;

      if (titleUpper.includes('SOLO') || titleUpper.includes('1V1')) {
        derivedMode = 'Solo';
      } else if (titleUpper.includes('DUO') || titleUpper.includes('2V2')) {
        derivedMode = 'Duo';
      } else if (titleUpper.includes('SQUAD') || titleUpper.includes('4V4')) {
        derivedMode = 'Squad';
      } else {
        derivedMode = found.title;
      }

      if (titleUpper.includes('HEADSHOT')) {
        derivedSection = 'Headshot';
      } else if (titleUpper.includes('CS 1V1') || titleUpper.includes('1V1')) {
        derivedSection = 'CS 1v1';
        derivedSlots = 2;
      } else if (titleUpper.includes('CS 2V2')) {
        derivedSection = 'CS 2v2';
        derivedSlots = 4;
      } else if (titleUpper.includes('CS') || titleUpper.includes('CLASH') || titleUpper.includes('4V4') || titleUpper.includes('TDM')) {
        derivedSection = 'Clash Squad';
        derivedSlots = 8;
      } else if (titleUpper.includes('LONE') || titleUpper.includes('WOLF')) {
        derivedSection = 'Lone Wolf';
        derivedSlots = derivedMode === 'Duo' ? 4 : 2;
      } else if (titleUpper.includes('CUSTOM')) {
        derivedSection = 'Custom Room';
        derivedSlots = 48;
      } else if (titleUpper.includes('FULL MAP') || titleUpper.includes('BR') || titleUpper.includes('ERANGEL')) {
        derivedSection = 'Battle Royale';
        derivedSlots = 48;
      }

      setMatchForm(prev => ({
        ...prev,
        selectedModeDocId: found.id,
        modeId: found.id,
        section: derivedSection,
        mode: derivedMode,
        totalSlots: derivedSlots,
        title: prev.title || `${found.title} MATCH`,
        image: prev.image || found.image || ''
      }));
    } else {
      setMatchForm(prev => ({
        ...prev,
        selectedModeDocId: modeSlugOrId,
        modeId: modeSlugOrId
      }));
    }
  };

  const handleGameChange = (newGameId: string) => {
    const defaultMaps = GAME_MAPS[newGameId.toLowerCase()] || GAME_MAPS.freefire;
    setMatchForm(prev => ({
      ...prev,
      gameId: newGameId,
      map: defaultMaps[0] || 'Bermuda'
    }));
  };

  const handlePrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm(prev => ({
      ...prev,
      prizeDistribution: {
        ...prev.prizeDistribution,
        [rank]: amount
      }
    }));
  };

  const handleWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.prizeDistribution };
    Object.keys(newDist).forEach(rank => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm(prev => ({
      ...prev,
      winnersCount: count,
      prizeDistribution: newDist
    }));
  };

  const handlePositionPrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm(prev => ({
      ...prev,
      positionPrizeDistribution: {
        ...prev.positionPrizeDistribution,
        [rank]: amount
      }
    }));
  };

  const handlePositionWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.positionPrizeDistribution };
    Object.keys(newDist).forEach(rank => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm(prev => ({
      ...prev,
      positionWinnersCount: count,
      positionPrizeDistribution: newDist
    }));
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!matchForm.gameId || !matchForm.map) {
      alert('Please select game and map');
      return;
    }

    setIsProcessing(true);
    try {
      let finalImage = matchForm.image ? matchForm.image.trim() : '';
      if (finalImage && finalImage.startsWith('data:')) {
        try {
          finalImage = await uploadOriginalImage(finalImage);
        } catch (imgErr) {
          console.warn('Image upload warning:', imgErr);
        }
      }

      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'meta', 'counters');
        const counterSnap = await transaction.get(counterRef);
        
        let newMatchNumber = 1;
        if (counterSnap.exists()) {
          newMatchNumber = (counterSnap.data().matchCount || 0) + 1;
        }

        const displayId = `#${newMatchNumber.toString().padStart(3, '0')}`;

        const baseData = {
          title: matchForm.title,
          gameId: matchForm.gameId,
          modeId: matchForm.modeId || matchForm.selectedModeDocId || 'br_solo',
          image: finalImage,
          entryFee: Number(matchForm.entryFee),
          maxPlayers: Number(matchForm.totalSlots || 0),
          totalSlots: Number(matchForm.totalSlots || 0),
          time: matchForm.time,
          map: matchForm.map,
          mode: matchForm.mode,
          section: matchForm.section,
          matchNumber: newMatchNumber,
          displayId,
          playersCount: 0,
          players: [],
          status: 'upcoming',
          createdAt: serverTimestamp()
        };

        let matchData: any = { ...baseData };
        matchData.prizeType = matchForm.prizeType;

        if (matchForm.prizeType === 'survival') {
          const sumOfDistribution = (Object.values(matchForm.prizeDistribution || {}) as number[]).reduce((sum: number, v: number) => sum + (Number(v) || 0), 0);
          const finalPrizePool = sumOfDistribution > 0 ? sumOfDistribution : (Number(matchForm.prizePool) || 0);
          
          matchData.perKillAmount = 0;
          matchData.winnersCount = Number(matchForm.winnersCount) || 1;
          matchData.prizeDistribution = matchForm.prizeDistribution || {};
          matchData.prizePool = finalPrizePool;
          matchData.prize = matchForm.prize 
            ? (String(matchForm.prize).startsWith('₹') ? String(matchForm.prize) : `₹${matchForm.prize}`)
            : `₹${finalPrizePool}`;
          matchData.positionWinnersCount = 0;
          matchData.positionPrizeDistribution = {};
        } else {
          matchData.perKillAmount = Number(matchForm.perKillAmount) || 0;
          matchData.prizePool = Number(matchForm.prizePool) || 0;
          matchData.prize = `₹${matchForm.prizePool || 0}`;
          matchData.positionWinnersCount = Number(matchForm.positionWinnersCount) || 0;
          matchData.positionPrizeDistribution = matchForm.positionPrizeDistribution || {};
          matchData.winnersCount = 0;
          matchData.prizeDistribution = {};
        }

        const newMatchRef = doc(collection(db, 'matches'));
        transaction.set(newMatchRef, matchData);
        transaction.set(counterRef, { matchCount: newMatchNumber }, { merge: true });
      });

      alert('Match created successfully!');
      onPageChange(Page.ADMIN);
    } catch (e) {
      console.error("Error creating match:", e);
      handleFirestoreError(e, OperationType.CREATE, 'matches');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black flex flex-col items-center justify-center">
        <Loader2 className="text-purple-500 animate-spin mb-4" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Fetching Data...</p>
      </div>
    );
  }

  const currentGameMaps = GAME_MAPS[matchForm.gameId.toLowerCase()] || ['Bermuda', 'Erangel', 'Custom Map'];

  return (
    <div className="pb-24 max-w-lg mx-auto bg-slate-50 dark:bg-black text-slate-900 dark:text-white min-h-screen transition-colors">
      <div className="px-5 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => onPageChange(Page.ADMIN)}
            className="p-2.5 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white transition-colors shadow-xs"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-slate-900 dark:text-white leading-none">
              {duplicateId ? 'Duplicate' : 'Create'} <span className="text-purple-600 dark:text-purple-500">Match</span>
            </h2>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 mt-1">
              Select Game &rarr; Select Tournament Mode &rarr; Publish Match
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateMatch} className="space-y-5">
          {/* STEP 1: SELECT GAME */}
          <div className="space-y-2 p-4 bg-white dark:bg-neutral-900/80 border border-purple-200 dark:border-purple-500/30 rounded-2xl shadow-xs">
            <label className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <Gamepad2 size={14} /> 1. Select Game First *
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {gamesList.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleGameChange(g.id)}
                  className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all truncate ${
                    matchForm.gameId === g.id
                      ? 'bg-purple-600 border-purple-500 text-black shadow-lg shadow-purple-600/20'
                      : 'bg-slate-100 dark:bg-black border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-white'
                  }`}
                >
                  {g.title}
                </button>
              ))}
            </div>
          </div>

          {/* STEP 2: SELECT TOURNAMENT MODE IN THE SELECTED GAME */}
          <div className="space-y-2 p-4 bg-white dark:bg-neutral-900/60 border border-purple-200 dark:border-purple-500/20 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <Layers size={13} /> 2. Select Tournament (In {gamesList.find(g => g.id === matchForm.gameId)?.title || matchForm.gameId.toUpperCase()}) *
              </label>
              {loadingModes && <Loader2 size={12} className="animate-spin text-purple-400" />}
            </div>

            <select
              value={matchForm.selectedModeDocId}
              onChange={(e) => handleSelectGameModeFromList(e.target.value)}
              className="w-full h-12 bg-slate-50 dark:bg-black border border-purple-300 dark:border-purple-500/30 rounded-xl px-4 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white"
            >
              {availableModes.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title} — {m.subtitle || m.category || 'Tournament'} (ID: {m.id})
                </option>
              ))}
            </select>

            {/* Quick Mode Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {availableModes.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectGameModeFromList(m.id)}
                  className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all ${
                    matchForm.selectedModeDocId === m.id
                      ? 'bg-purple-600 border-purple-500 text-black shadow-sm'
                      : 'bg-slate-100 dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-white'
                  }`}
                >
                  {m.title}
                </button>
              ))}
            </div>
          </div>

          {/* Match Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">3. Match Title *</label>
            <input 
              type="text"
              required
              placeholder="e.g. Daily Battle Room #1"
              value={matchForm.title}
              onChange={(e) => setMatchForm({...matchForm, title: e.target.value})}
              className="w-full h-13 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600 shadow-xs"
            />
          </div>

          {/* MATCH THUMBNAIL / BANNER UPLOAD */}
          <div className="space-y-3 p-4 bg-white dark:bg-neutral-900/70 border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                <ImageIcon size={14} /> Match Thumbnail / Cover Image
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMediaPickerOpen(true)}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-300 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                  title="Choose from saved media library"
                >
                  <ImageIcon size={11} />
                  <span>Media Library</span>
                </button>
                {matchForm.image && (
                  <button
                    type="button"
                    onClick={() => setMatchForm(prev => ({ ...prev, image: '' }))}
                    className="text-[9px] font-black text-rose-500 hover:text-rose-600 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                )}
              </div>
            </div>

            <input 
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {matchForm.image ? (
              <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-slate-200 dark:border-neutral-700 shadow-md group">
                <img 
                  src={matchForm.image} 
                  alt="Match Thumbnail Preview" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-between p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/90 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 size={10} /> Active Thumbnail
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[9px] font-black uppercase tracking-wider bg-black/70 hover:bg-black text-white px-2.5 py-1 rounded-lg border border-white/20 backdrop-blur-xs flex items-center gap-1 transition-colors"
                    >
                      <Upload size={11} /> Change File
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 dark:border-neutral-700 hover:border-purple-500/60 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50 dark:bg-neutral-950/60 hover:bg-purple-50/40 dark:hover:bg-neutral-900/60 group"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-neutral-900 group-hover:bg-purple-100 dark:group-hover:bg-purple-950/60 border border-slate-200 dark:border-neutral-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/40 flex items-center justify-center text-slate-500 dark:text-neutral-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors mb-2">
                  <Upload size={18} />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300">
                  Click to Upload Thumbnail Image
                </p>
              </div>
            )}

            {isUploadingImage && (
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] font-black uppercase text-purple-600 dark:text-purple-400">
                  <span>Uploading Image...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[linear-gradient(90deg,#F37A1F,#FF9A4D)] rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              {PRESET_MATCH_THUMBNAILS.map((preset, idx) => {
                const isSelected = matchForm.image === preset.url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMatchForm(prev => ({ ...prev, image: preset.url }))}
                    className={`relative aspect-video rounded-lg overflow-hidden border transition-all text-left group ${
                      isSelected 
                        ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-sm' 
                        : 'border-slate-200 dark:border-neutral-800 hover:border-slate-400 dark:hover:border-neutral-600 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Map & Section Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Map</label>
              <select 
                value={matchForm.map}
                onChange={(e) => setMatchForm({...matchForm, map: e.target.value})}
                className="w-full h-12 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white shadow-xs"
              >
                {currentGameMaps.map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Mode Type</label>
              <input 
                type="text"
                value={matchForm.mode}
                onChange={(e) => setMatchForm({...matchForm, mode: e.target.value})}
                placeholder="Solo, Duo, Squad"
                className="w-full h-12 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600 shadow-xs"
              />
            </div>
          </div>

          {/* Schedule Time & Total Slots */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Schedule Time *</label>
              <input 
                type="datetime-local"
                required
                value={matchForm.time}
                onChange={(e) => setMatchForm({...matchForm, time: e.target.value})}
                className="w-full h-12 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Total Slots *</label>
              <input 
                type="number"
                required
                placeholder="48"
                value={matchForm.totalSlots}
                onChange={(e) => setMatchForm({...matchForm, totalSlots: Number(e.target.value)})}
                className="w-full h-12 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600 shadow-xs"
              />
            </div>
          </div>

          {/* Entry Fee & Prize Pool */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Entry Fee (₹) *</label>
              <input 
                type="number"
                required
                value={matchForm.entryFee}
                onChange={(e) => setMatchForm({...matchForm, entryFee: Number(e.target.value)})}
                className="w-full h-12 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Prize Pool (₹)</label>
              <input 
                type="number"
                value={matchForm.prizePool}
                onChange={(e) => setMatchForm({...matchForm, prizePool: Number(e.target.value)})}
                className="w-full h-12 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white shadow-xs"
              />
            </div>
          </div>

          {/* Prize Distribution Section */}
          <div className="space-y-5 p-5 bg-purple-50/60 dark:bg-purple-600/5 border border-purple-200 dark:border-purple-500/15 rounded-3xl shadow-xs">
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setMatchForm({...matchForm, prizeType: 'perKill'})}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  matchForm.prizeType === 'perKill' 
                    ? 'bg-purple-600 border-purple-500 text-black shadow-sm' 
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                Per Kill + Rewards
              </button>
              <button 
                type="button"
                onClick={() => setMatchForm({...matchForm, prizeType: 'survival'})}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  matchForm.prizeType === 'survival' 
                    ? 'bg-purple-600 border-purple-500 text-black shadow-sm' 
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}
              >
                Survival / Ranks
              </button>
            </div>

            {matchForm.prizeType === 'perKill' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Per Kill (₹)</label>
                    <input 
                      type="number"
                      value={matchForm.perKillAmount}
                      onChange={(e) => setMatchForm({...matchForm, perKillAmount: Number(e.target.value)})}
                      className="w-full h-12 bg-white dark:bg-black/50 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Total Pool (₹)</label>
                    <input 
                      type="number"
                      value={matchForm.prizePool}
                      onChange={(e) => setMatchForm({...matchForm, prizePool: Number(e.target.value)})}
                      className="w-full h-12 bg-white dark:bg-black/50 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-neutral-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Position Rewards (Optional)</label>
                    <div className="relative min-w-[140px]">
                      <select 
                        value={matchForm.positionWinnersCount}
                        onChange={(e) => handlePositionWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] appearance-none pr-8"
                      >
                        <option value={0}>No Position Reward</option>
                        {[1, 2, 3, 5, 10].map(n => (
                          <option key={n} value={n}>Top {n} Winners</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  {matchForm.positionWinnersCount > 0 && (
                    <div className="space-y-2">
                      {Array.from({ length: matchForm.positionWinnersCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-14 h-9 bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg flex items-center justify-center text-[9px] font-black text-slate-600 dark:text-neutral-400">
                            RANK {i + 1}
                          </div>
                          <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 font-bold text-xs">₹</span>
                            <input 
                              type="number"
                              placeholder="0"
                              value={matchForm.positionPrizeDistribution[i + 1] || ''}
                              onChange={(e) => handlePositionPrizeDistributionChange(i + 1, Number(e.target.value))}
                              className="w-full h-9 bg-white dark:bg-black/30 border border-slate-200 dark:border-neutral-800 rounded-lg pl-7 pr-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-neutral-400 ml-1">Prize Title (e.g. ₹500)</label>
                  <input 
                    type="text"
                    value={matchForm.prize}
                    onChange={(e) => setMatchForm({...matchForm, prize: e.target.value})}
                    className="w-full h-12 bg-white dark:bg-black/50 border border-slate-200 dark:border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-neutral-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Winning Distribution</label>
                    <div className="relative min-w-[140px]">
                      <select 
                        value={matchForm.winnersCount}
                        onChange={(e) => handleWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] appearance-none pr-8"
                      >
                        {[1, 2, 3, 5, 10, 20].map(n => (
                          <option key={n} value={n}>Top {n} Winners</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {Array.from({ length: matchForm.winnersCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-14 h-9 bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg flex items-center justify-center text-[9px] font-black text-slate-600 dark:text-neutral-400">
                          RANK {i + 1}
                        </div>
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 font-bold text-xs">₹</span>
                          <input 
                            type="number"
                            placeholder="0"
                            value={matchForm.prizeDistribution[i + 1] || ''}
                            onChange={(e) => handlePrizeDistributionChange(i + 1, Number(e.target.value))}
                            className="w-full h-9 bg-white dark:bg-black/30 border border-slate-200 dark:border-neutral-800 rounded-lg pl-7 pr-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button 
            type="submit"
            disabled={isProcessing}
            className="w-full py-4.5 bg-purple-600 hover:bg-purple-700 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-purple-600/30 mt-6 active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-black"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin text-white" />
                <span>Publishing Match...</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span>Confirm & Publish Match</span>
              </>
            )}
          </button>
        </form>
      </div>

      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        defaultCategory="banner"
        title="Select Tournament Thumbnail / Banner"
        onSelect={(url) => {
          setMatchForm(prev => ({ ...prev, image: url }));
        }}
      />
    </div>
  );
}
