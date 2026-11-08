import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Edit2, Trash2, Save, X, Search, 
  Loader2, Gamepad2, ArrowLeft, Upload, 
  Sparkles, Check, Image as ImageIcon
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, setDoc, doc, deleteDoc, onSnapshot, orderBy, writeBatch } from 'firebase/firestore';
import { Page, Game } from '../types';
import { GAMES, GAME_MODES_DATA } from '../constants';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';
import { usePopup } from '../components/PopupProvider';
import AdvancedLoader from '../components/AdvancedLoader';
import MediaPickerModal from '../components/MediaPickerModal';

export interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface AdminModesProps {
  onPageChange: (page: Page) => void;
}

const PRESET_COVERS = [
  {
    name: 'Battle Royale Classic',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Clash Squad / 4v4',
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Lone Wolf / 1v1',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Survival Arena',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Cyberpunk Esports',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Sniper / Stealth',
    url: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop'
  }
];

const SUGGESTED_TITLES = [
  'BR SOLO', 'BR DUO', 'BR SQUAD',
  'CS SOLO', 'CS DUO', 'CS SQUAD',
  'LONE WOLF SOLO', 'LONE WOLF DUO',
  'CS HEADSHOT', 'TDM 4V4', 'ERANGEL SQUAD', 'CUSTOM ROOM'
];

const SUGGESTED_SUBTITLES = [
  'Battle Royale', 'Clash Squad', 'Lone Wolf',
  'Team Deathmatch', 'Custom Room', 'Survival Arena'
];

export default function AdminModes({ onPageChange }: AdminModesProps) {
  const { showConfirm, showSuccess, showWarning, showError } = usePopup();
  const [gamesList, setGamesList] = useState<Game[]>(GAMES);
  const [selectedGameId, setSelectedGameId] = useState<string>(GAMES[0].id);
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMode, setEditingMode] = useState<Partial<GameMode> | null>(null);
  const [modeToDelete, setModeToDelete] = useState<GameMode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch dynamic games added by Admin strictly from Firestore
  useEffect(() => {
    const unsubGames = onSnapshot(collection(db, 'games'), (snapshot) => {
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Game));
      fetched.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setGamesList(fetched);
      if (fetched.length > 0) {
        if (!fetched.some(g => g.id === selectedGameId)) {
          setSelectedGameId(fetched[0].id);
        }
      } else {
        setSelectedGameId('');
      }
    });
    return () => unsubGames();
  }, [selectedGameId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      const url = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setEditingMode(prev => prev ? { ...prev, image: url } : null);
    } catch (err) {
      console.error('Mode image upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'gameModes'), (snapshot) => {
      const allModes = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as GameMode));
      const filtered = allModes
        .filter(m => m.gameId === selectedGameId)
        .sort((a, b) => Number(a.order ?? 99) - Number(b.order ?? 99));
      setModes(filtered);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'gameModes');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedGameId]);

  const handleSeedDefaults = async () => {
    const selectedGameTitle = gamesList.find(g => g.id === selectedGameId)?.title || selectedGameId;
    const confirmed = await showConfirm({
      title: 'LOAD PRESET MODES?',
      message: `Initialize standard tournament modes for ${selectedGameTitle}?`,
      variant: 'instruction',
      confirmText: 'LOAD PRESETS',
      cancelText: 'CANCEL',
    });
    if (!confirmed) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      const presets = GAME_MODES_DATA[selectedGameId] || GAME_MODES_DATA.freefire;
      presets.forEach((mode, i) => {
        const modeDocId = `${selectedGameId}_${mode.id}`;
        const ref = doc(db, 'gameModes', modeDocId);
        batch.set(ref, {
          ...mode,
          gameId: selectedGameId,
          order: i + 1
        }, { merge: true });
      });
      await batch.commit();
      showSuccess('MODES LOADED', `Preset tournament modes added for ${selectedGameTitle}!`);
    } catch (err) {
      console.error("Error seeding modes:", err);
      handleFirestoreError(err, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSeeding(false);
    }
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleTitleChange = (title: string) => {
    const slug = generateSlug(title);
    let subtitle = editingMode?.subtitle || '';
    let category = editingMode?.category || '';

    if (!subtitle || subtitle === 'Battle Royale' || subtitle === 'Clash Squad' || subtitle === 'Lone Wolf') {
      const upper = title.toUpperCase();
      if (upper.includes('BR') || upper.includes('ROYALE') || upper.includes('ERANGEL')) {
        subtitle = 'Battle Royale';
        category = 'Battle Royale';
      } else if (upper.includes('CS') || upper.includes('CLASH') || upper.includes('4V4') || upper.includes('TDM')) {
        subtitle = 'Clash Squad';
        category = 'Clash Squad';
      } else if (upper.includes('LONE') || upper.includes('WOLF') || upper.includes('1V1')) {
        subtitle = 'Lone Wolf';
        category = 'Lone Wolf';
      } else if (upper.includes('CUSTOM') || upper.includes('ROOM')) {
        subtitle = 'Custom Room';
        category = 'Custom Room';
      }
    }

    setEditingMode(prev => ({
      ...prev,
      title,
      id: prev?.id && prev.id !== '' ? prev.id : slug,
      subtitle: subtitle || 'Battle Royale',
      category: category || subtitle || 'Battle Royale',
      image: prev?.image || PRESET_COVERS[0].url
    }));
  };

  const handleSave = async () => {
    const targetGameId = editingMode?.gameId || selectedGameId;
    if (!targetGameId) {
      showWarning('SELECT GAME', 'Please select a Game first.');
      return;
    }
    if (!editingMode?.title?.trim()) {
      showWarning('MISSING TITLE', 'Please enter a Tournament Mode Title.');
      return;
    }

    const rawId = (editingMode.id || generateSlug(editingMode.title)).trim();
    if (!rawId) {
      showWarning('INVALID MODE ID', 'Please enter a valid Mode ID.');
      return;
    }

    setIsSaving(true);
    try {
      const modeId = `${targetGameId}_${rawId}`;
      let defaultImage = editingMode.image && editingMode.image.trim() !== ''
        ? editingMode.image.trim()
        : PRESET_COVERS[0].url;

      if (defaultImage && defaultImage.startsWith('data:')) {
        try {
          defaultImage = await uploadOriginalImage(defaultImage);
        } catch (imgErr) {
          console.warn('Mode image upload warning:', imgErr);
        }
      }

      const modeData: GameMode = {
        id: rawId,
        gameId: targetGameId,
        title: editingMode.title.trim(),
        subtitle: (editingMode.subtitle || 'Battle Royale').trim(),
        category: (editingMode.category || editingMode.subtitle || 'Battle Royale').trim(),
        image: defaultImage,
        order: Number(editingMode.order) || modes.length + 1
      };

      await setDoc(doc(db, 'gameModes', modeId), modeData, { merge: true });
      setSelectedGameId(targetGameId);
      setEditingMode(null);
    } catch (error) {
      console.error("Error saving mode:", error);
      handleFirestoreError(error, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!modeToDelete || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'gameModes', `${modeToDelete.gameId || selectedGameId}_${modeToDelete.id}`));
      setModeToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'gameModes');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredModes = modes.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="pb-24 max-w-lg mx-auto bg-slate-50 dark:bg-black min-h-screen text-slate-900 dark:text-white transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-black/90 backdrop-blur-md px-5 h-16 flex items-center justify-between border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onPageChange(Page.ADMIN)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white active:scale-[0.97] transition-all"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-base font-extrabold tracking-tight uppercase text-slate-900 dark:text-white">Tournament Modes</h1>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500">Select Game & Add Tournament Modes</p>
          </div>
        </div>

        <button 
          onClick={handleSeedDefaults}
          disabled={isSeeding}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-neutral-900 border border-purple-300 dark:border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-600 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50"
        >
          {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          <span>Preset Modes</span>
        </button>
      </header>

      <section className="px-5 py-6 space-y-6">
        {/* Step 1: Game Selector */}
        <div className="space-y-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 block">
            1. Select Game Arena
          </label>
          {gamesList.length === 0 ? (
            <div className="p-4 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white uppercase">No Games Created Yet</p>
                <p className="text-[10px] text-slate-500 dark:text-neutral-400 mt-0.5">Please add a game arena (e.g. Free Fire, BGMI) from Admin Panel first.</p>
              </div>
              <button
                onClick={() => onPageChange(Page.ADMIN)}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Go to Admin Games
              </button>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {gamesList.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap active:scale-[0.97] ${
                    selectedGameId === game.id 
                      ? 'bg-purple-600 text-black shadow-lg shadow-purple-500/20' 
                      : 'bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-500 border border-slate-200 dark:border-white/5'
                  }`}
                >
                  {game.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={14} />
            <input 
              type="text"
              placeholder="Search tournament modes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 transition-all shadow-xs"
            />
          </div>

          <button 
            onClick={() => setEditingMode({ 
              id: '', 
              gameId: selectedGameId,
              title: '', 
              subtitle: 'Battle Royale', 
              image: PRESET_COVERS[0].url, 
              category: 'Battle Royale', 
              order: modes.length + 1 
            })}
            className="flex items-center gap-1.5 bg-purple-600 text-black px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg active:scale-[0.97] shrink-0"
          >
            <Plus size={14} /> Add Tournament Mode
          </button>
        </div>

        {/* Modes List */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
              <Loader2 size={32} className="animate-spin mb-3 text-purple-500" />
              <p className="text-xs font-black uppercase tracking-widest">Loading Modes...</p>
            </div>
          ) : filteredModes.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-neutral-900/50 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xs">
              <Gamepad2 size={36} className="mx-auto mb-3 text-slate-300 dark:text-neutral-700" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-neutral-400">No tournament modes in this game yet</p>
              <p className="text-[10px] text-slate-400 dark:text-neutral-600 mt-1 mb-4">Click "Add Tournament Mode" or load presets</p>
              <button 
                onClick={handleSeedDefaults}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-600/20 border border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all"
              >
                <Sparkles size={12} /> Load Default Modes
              </button>
            </div>
          ) : (
            filteredModes.map((mode, index) => (
              <div 
                key={mode.id}
                className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/5 rounded-2xl p-3.5 flex items-center justify-between group shadow-xs hover:border-purple-500/40 transition-all text-slate-900 dark:text-white"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-xs bg-slate-100 dark:bg-black shrink-0 relative">
                    <SafeImage 
                      src={mode.image || PRESET_COVERS[0].url} 
                      alt={mode.title} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[7px] font-black text-purple-400">
                      #{mode.order || index + 1}
                    </div>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-black italic uppercase tracking-tight text-slate-900 dark:text-white truncate">{mode.title}</h4>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider truncate">{mode.subtitle || 'Battle Royale'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-neutral-800 rounded text-[7px] font-black text-slate-600 dark:text-neutral-400 uppercase tracking-widest border border-slate-200 dark:border-transparent">
                        ID: {mode.id}
                      </span>
                      <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/40 rounded text-[7px] font-black text-purple-700 dark:text-purple-300 uppercase tracking-widest">
                        {gamesList.find(g => g.id === mode.gameId)?.title || mode.gameId}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0 ml-2">
                  <button 
                    onClick={() => setEditingMode({ ...mode })}
                    className="p-2.5 bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 rounded-xl hover:bg-purple-600 hover:text-white transition-all active:scale-90"
                    title="Edit Mode"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => setModeToDelete(mode)}
                    className="p-2.5 bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-90"
                    title="Delete Mode"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Edit / Add Modal */}
      <AnimatePresence>
        {editingMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col text-slate-900 dark:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-200 dark:border-white/5">
                <div>
                  <h3 className="text-base font-black italic tracking-tight uppercase text-slate-900 dark:text-white">
                    {editingMode.id ? 'Edit' : 'Add'} <span className="text-purple-600 dark:text-purple-500">Tournament Mode</span>
                  </h3>
                  <p className="text-[8px] font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-widest">
                    Select game first, then configure tournament mode
                  </p>
                </div>
                <button 
                  onClick={() => setEditingMode(null)} 
                  className="p-2 text-slate-400 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-white rounded-xl bg-slate-100 dark:bg-neutral-800/80"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
                {/* 0. Select Game First */}
                <div>
                  <label className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1.5 block">
                    1. Select Game *
                  </label>
                  <select
                    value={editingMode.gameId || selectedGameId}
                    onChange={(e) => setEditingMode({ ...editingMode, gameId: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-black border border-purple-300 dark:border-purple-500/40 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white transition-all"
                  >
                    {gamesList.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title} ({g.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 1. Mode Title */}
                <div>
                  <label className="text-[9px] font-black text-slate-600 dark:text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    2. Tournament Mode Title (e.g. BR SOLO, CS SQUAD) *
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="Enter mode title..."
                    value={editingMode.title || ''}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                  
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_TITLES.map(title => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => handleTitleChange(title)}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all ${
                          editingMode.title?.toUpperCase() === title 
                            ? 'bg-purple-600 border-purple-500 text-black' 
                            : 'bg-slate-100 dark:bg-neutral-800/80 border-slate-200 dark:border-white/5 text-slate-700 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-white'
                        }`}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Mode ID */}
                <div>
                  <label className="text-[9px] font-black text-slate-600 dark:text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Mode ID (Slug, e.g. br_solo, cs_squad) *
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. br_solo"
                    value={editingMode.id || ''}
                    onChange={(e) => setEditingMode({ ...editingMode, id: generateSlug(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white transition-all font-mono"
                  />
                </div>

                {/* 3. Subtitle / Category */}
                <div>
                  <label className="text-[9px] font-black text-slate-600 dark:text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Subtitle / Category (e.g. Battle Royale, Clash Squad)
                  </label>
                  <input 
                    type="text"
                    placeholder="Enter category / subtitle..."
                    value={editingMode.subtitle || ''}
                    onChange={(e) => setEditingMode({ 
                      ...editingMode, 
                      subtitle: e.target.value,
                      category: e.target.value 
                    })}
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                  />
                  
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_SUBTITLES.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setEditingMode({ ...editingMode, subtitle: sub, category: sub })}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all ${
                          editingMode.subtitle === sub 
                            ? 'bg-purple-600 border-purple-500 text-black' 
                            : 'bg-slate-100 dark:bg-neutral-800/80 border-slate-200 dark:border-white/5 text-slate-700 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-white'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Display Order */}
                <div>
                  <label className="text-[9px] font-black text-slate-600 dark:text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Display Order (Sorting)
                  </label>
                  <input 
                    type="number"
                    value={editingMode.order || 1}
                    onChange={(e) => setEditingMode({ ...editingMode, order: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white transition-all"
                  />
                </div>

                {/* 5. Cover Image Selector */}
                <div>
                  <label className="text-[9px] font-black text-slate-600 dark:text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Mode Thumbnail Cover
                  </label>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {PRESET_COVERS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditingMode({ ...editingMode, image: preset.url })}
                        className={`relative aspect-[16/10] rounded-xl overflow-hidden border-2 transition-all group ${
                          editingMode.image === preset.url 
                            ? 'border-purple-500 shadow-md shadow-purple-500/30' 
                            : 'border-slate-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-white/30'
                        }`}
                      >
                        <SafeImage src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-1 text-center">
                          <span className="text-[7px] font-black uppercase text-white leading-tight">
                            {preset.name}
                          </span>
                        </div>
                        {editingMode.image === preset.url && (
                          <div className="absolute top-1 right-1 bg-purple-600 rounded-full p-0.5">
                            <Check size={10} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={editingMode.image || ''}
                        onChange={(e) => setEditingMode({ ...editingMode, image: e.target.value })}
                        placeholder="https://image-url.jpg"
                        className="flex-1 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                      />
                      <button 
                        type="button"
                        onClick={() => setIsMediaPickerOpen(true)}
                        className="px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-500/20 rounded-xl text-purple-600 dark:text-purple-300 transition-all flex items-center gap-1 text-[9px] font-black uppercase"
                        title="Select saved image from Media Library"
                      >
                        <ImageIcon size={13} />
                        <span>Library</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-3 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-neutral-300 hover:text-purple-600 dark:hover:text-white transition-all disabled:opacity-50 flex items-center gap-1 text-[9px] font-black uppercase"
                      >
                        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        <span>Upload</span>
                      </button>
                      <input 
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/5 grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingMode(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 py-3.5 rounded-xl text-slate-700 dark:text-neutral-300 font-black uppercase tracking-widest text-[10px] transition-all active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !editingMode.title?.trim()}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-3.5 rounded-xl text-black font-black uppercase tracking-widest text-[10px] shadow-lg shadow-purple-600/30 active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  <span>Save Mode</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {modeToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl text-center text-slate-900 dark:text-white"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-500 border border-red-500/20">
                <Trash2 size={32} />
              </div>
              
              <h3 className="text-lg font-black italic uppercase tracking-tight mb-1 text-slate-900 dark:text-white">
                Delete <span className="text-red-500">Mode?</span>
              </h3>
              
              <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium mb-6 leading-relaxed">
                Are you sure you want to delete <span className="text-slate-900 dark:text-white font-bold">{modeToDelete.title}</span>?
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={isDeleting}
                  onClick={() => setModeToDelete(null)}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 py-3 rounded-xl text-slate-700 dark:text-neutral-400 font-black uppercase tracking-widest text-[10px] transition-all active:scale-[0.97] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700 py-3 rounded-xl text-white font-black uppercase tracking-widest text-[10px] transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        defaultCategory="mode"
        title="Select Mode Cover Image"
        onSelect={(url) => {
          if (editingMode) {
            setEditingMode({ ...editingMode, image: url });
          }
        }}
      />
    </div>
  );
}
