import React, { useState, useEffect } from 'react';
import { 
  X, Search, Image as ImageIcon, Check, Plus, Flag, Gamepad2, 
  Swords, Layers, Loader2, Sparkles 
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { MediaAsset, MediaCategory } from '../types';
import SafeImage from './SafeImage';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string, asset?: MediaAsset) => void;
  defaultCategory?: MediaCategory;
  title?: string;
}

export default function MediaPickerModal({
  isOpen,
  onClose,
  onSelect,
  defaultCategory,
  title = 'Select Image from Media Library'
}: MediaPickerModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<'all' | MediaCategory>(defaultCategory || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  
  // Quick Add Drawer inside the picker
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickUrl, setQuickUrl] = useState('');
  const [quickCategory, setQuickCategory] = useState<MediaCategory>(defaultCategory || 'banner');
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (defaultCategory) {
      setSelectedCategory(defaultCategory);
      setQuickCategory(defaultCategory);
    }

    const q = query(collection(db, 'mediaAssets'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as MediaAsset));

      list.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
        return timeB - timeA;
      });

      setAssets(list);
      setLoading(false);
    }, (err) => {
      console.warn('Error fetching media assets:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, defaultCategory]);

  if (!isOpen) return null;

  const filteredAssets = assets.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.tags && item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
    return matchesCategory && matchesSearch;
  });

  const handleConfirmSelect = (url: string, asset?: MediaAsset) => {
    onSelect(url, asset);
    onClose();
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || !quickUrl.trim()) return;

    setIsSavingQuick(true);
    try {
      const docRef = await addDoc(collection(db, 'mediaAssets'), {
        title: quickTitle.trim(),
        url: quickUrl.trim(),
        category: quickCategory,
        createdAt: serverTimestamp()
      });

      // Auto select the newly added image
      handleConfirmSelect(quickUrl.trim(), {
        id: docRef.id,
        title: quickTitle.trim(),
        url: quickUrl.trim(),
        category: quickCategory
      });
    } catch (err) {
      console.error('Failed to quick add media asset:', err);
    } finally {
      setIsSavingQuick(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-3xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ImageIcon size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black italic uppercase text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-wider">
                Select from saved banners, games, and tournament modes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
              className="px-3 py-1.5 bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-purple-100 dark:hover:bg-purple-500/25 transition-colors flex items-center gap-1"
            >
              <Plus size={12} />
              <span>Add New Image</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quick Add Form Drawer */}
        {isQuickAddOpen && (
          <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-200/50 dark:border-purple-500/20 shrink-0 animate-fadeIn">
            <form onSubmit={handleQuickAdd} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">
                  Quick Add Image to Library
                </span>
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Image Title..."
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                />

                <input
                  type="url"
                  required
                  placeholder="Image URL (https://...)"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400"
                />

                <div className="flex gap-2">
                  <select
                    value={quickCategory}
                    onChange={(e) => setQuickCategory(e.target.value as MediaCategory)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  >
                    <option value="banner">Banner</option>
                    <option value="game">Game</option>
                    <option value="mode">Mode</option>
                    <option value="general">General</option>
                  </select>

                  <button
                    type="submit"
                    disabled={isSavingQuick}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center shrink-0 disabled:opacity-50"
                  >
                    {isSavingQuick ? <Loader2 size={13} className="animate-spin" /> : 'Save & Select'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="p-3 sm:px-5 sm:py-3 border-b border-slate-100 dark:border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 bg-slate-50/70 dark:bg-neutral-900/50">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all border ${
                selectedCategory === 'all'
                  ? 'bg-purple-600 border-purple-600 text-black shadow-xs'
                  : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('banner')}
              className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
                selectedCategory === 'banner'
                  ? 'bg-purple-600 border-purple-600 text-black shadow-xs'
                  : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
              }`}
            >
              <Flag size={10} />
              <span>Banners</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('game')}
              className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
                selectedCategory === 'game'
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
              }`}
            >
              <Gamepad2 size={10} />
              <span>Games</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('mode')}
              className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
                selectedCategory === 'mode'
                  ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                  : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
              }`}
            >
              <Swords size={10} />
              <span>Modes</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('general')}
              className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
                selectedCategory === 'general'
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
              }`}
            >
              <Layers size={10} />
              <span>General</span>
            </button>
          </div>

          {/* Search box */}
          <div className="relative min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
            <input
              type="text"
              placeholder="Search images..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Image Grid Scroll Area */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-[280px]">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Loader2 size={24} className="animate-spin text-purple-600" />
              <span className="text-xs font-black uppercase tracking-wider">Loading saved images...</span>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center mx-auto">
                <ImageIcon size={22} />
              </div>
              <h4 className="text-xs font-black uppercase text-slate-900 dark:text-white">
                No images found
              </h4>
              <p className="text-[11px] text-slate-400 dark:text-neutral-500 max-w-sm mx-auto">
                {searchQuery ? 'No images matched your search keywords.' : 'Add your first image using the button above.'}
              </p>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(true)}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-[10px] font-black uppercase tracking-wider"
              >
                Add Image Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredAssets.map((asset) => {
                const isSelected = selectedUrl === asset.url;
                const isBanner = asset.category === 'banner';

                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      setSelectedUrl(asset.url);
                      handleConfirmSelect(asset.url, asset);
                    }}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.97] flex flex-col bg-slate-50 dark:bg-black/40 ${
                      isSelected
                        ? 'border-purple-600 ring-2 ring-purple-500/40'
                        : 'border-slate-200 dark:border-neutral-800 hover:border-purple-500'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className={`relative w-full overflow-hidden ${
                      isBanner ? 'aspect-[16/9]' : 'aspect-[4/3]'
                    }`}>
                      <SafeImage
                        src={asset.url}
                        alt={asset.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-75" />

                      {/* Select check badge */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-purple-600 text-black flex items-center justify-center shadow-md">
                          <Check size={13} className="stroke-[3]" />
                        </div>
                      )}

                      {/* Hover label */}
                      <div className="absolute inset-0 bg-purple-600/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="px-2.5 py-1 rounded-md bg-purple-600 text-black text-[8px] font-black uppercase tracking-widest shadow-md">
                          Select
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <div className="p-2">
                      <p className="text-[10px] font-black uppercase tracking-tight text-slate-900 dark:text-white truncate" title={asset.title}>
                        {asset.title}
                      </p>
                      <span className="text-[7.5px] font-mono text-purple-600 dark:text-purple-400 uppercase tracking-widest font-black">
                        {asset.category}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:px-5 sm:py-3 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-neutral-900">
          <span className="text-[10px] text-slate-400 dark:text-neutral-500">
            {filteredAssets.length} image{filteredAssets.length === 1 ? '' : 's'} available
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
