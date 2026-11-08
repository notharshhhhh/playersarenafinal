import React, { useState, useEffect } from 'react';
import { 
  Image as ImageIcon, Plus, Trash2, Copy, Check, ExternalLink, 
  Search, Filter, Sparkles, AlertCircle, Loader2, Layers, 
  Gamepad2, Swords, Flag, RefreshCw, X, Eye
} from 'lucide-react';
import { db } from '../lib/firebase';
import { 
  collection, onSnapshot, addDoc, deleteDoc, doc, 
  serverTimestamp, query, orderBy 
} from 'firebase/firestore';
import { MediaAsset, MediaCategory, User } from '../types';
import { usePopup } from './PopupProvider';
import SafeImage from './SafeImage';

interface MediaLibraryTabProps {
  currentUser?: User | null;
  onSelectImage?: (url: string, asset?: MediaAsset) => void;
  selectableMode?: boolean;
}

// High-quality esports starter presets so the user has ready-to-use tournament banners, game covers, and mode images
const DEFAULT_ESPORTS_PRESETS: Omit<MediaAsset, 'id'>[] = [
  {
    title: 'Free Fire Battle Royale Banner',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop',
    category: 'banner',
    tags: ['freefire', 'banner', 'esports']
  },
  {
    title: 'BGMI Champions Arena Banner',
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop',
    category: 'banner',
    tags: ['bgmi', 'pubg', 'banner']
  },
  {
    title: 'Clash Squad Tournament Banner',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop',
    category: 'banner',
    tags: ['clashsquad', 'tournament']
  },
  {
    title: 'Free Fire MAX Game Poster',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop',
    category: 'game',
    tags: ['freefire', 'game']
  },
  {
    title: 'BGMI Battlegrounds Poster',
    url: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?q=80&w=800&auto=format&fit=crop',
    category: 'game',
    tags: ['bgmi', 'game']
  },
  {
    title: 'Call of Duty Mobile Poster',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=800&auto=format&fit=crop',
    category: 'game',
    tags: ['codm', 'game']
  },
  {
    title: 'Battle Royale Mode Artwork',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
    category: 'mode',
    tags: ['br', 'mode', 'survival']
  },
  {
    title: 'Clash Squad 4v4 Mode Artwork',
    url: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=800&auto=format&fit=crop',
    category: 'mode',
    tags: ['clashsquad', '4v4', 'mode']
  },
  {
    title: 'Lone Wolf 1v1 Duel Artwork',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
    category: 'mode',
    tags: ['lonewolf', '1v1', 'mode']
  }
];

export default function MediaLibraryTab({ 
  currentUser, 
  onSelectImage, 
  selectableMode = false 
}: MediaLibraryTabProps) {
  const { showConfirm, showSuccess, showError } = usePopup();

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'all' | MediaCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal / Form state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState<MediaCategory>('banner');
  const [newTags, setNewTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Full preview state
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);

  // Real-time Firestore sync
  useEffect(() => {
    const q = query(collection(db, 'mediaAssets'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as MediaAsset));

      // Sort by newest first
      list.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
        return timeB - timeA;
      });

      setAssets(list);
      setLoading(false);
    }, (err) => {
      console.warn('Error fetching mediaAssets:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Filtered assets
  const filteredAssets = assets.filter(item => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.tags && item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
    return matchesCategory && matchesSearch;
  });

  const categoryCounts = {
    all: assets.length,
    banner: assets.filter(a => a.category === 'banner').length,
    game: assets.filter(a => a.category === 'game').length,
    mode: assets.filter(a => a.category === 'mode').length,
    general: assets.filter(a => a.category === 'general').length,
  };

  // Add new media asset
  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) {
      showError('MISSING INFORMATION', 'Please enter both an image title and a valid image URL.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tagsArray = newTags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

      await addDoc(collection(db, 'mediaAssets'), {
        title: newTitle.trim(),
        url: newUrl.trim(),
        category: newCategory,
        tags: tagsArray,
        uploadedBy: currentUser?.id || 'admin',
        uploadedByName: currentUser?.username || 'Staff / Admin',
        createdAt: serverTimestamp()
      });

      showSuccess('IMAGE SAVED!', `"${newTitle.trim()}" has been added to your media library.`);
      setNewTitle('');
      setNewUrl('');
      setNewTags('');
      setIsAddModalOpen(false);
    } catch (err: any) {
      console.error('Error saving media asset:', err);
      showError('SAVE FAILED', err.message || 'Could not save the image to media library.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Seed Presets
  const handleSeedPresets = async () => {
    const confirmed = await showConfirm({
      title: 'LOAD ESPORTS PRESETS?',
      message: 'This will add 9 official high-definition esports banners, games, and tournament mode artworks to your library.',
      confirmText: 'LOAD PRESETS',
      cancelText: 'CANCEL'
    });

    if (confirmed) {
      try {
        for (const item of DEFAULT_ESPORTS_PRESETS) {
          await addDoc(collection(db, 'mediaAssets'), {
            ...item,
            uploadedBy: currentUser?.id || 'system',
            uploadedByName: 'System Starter Kit',
            createdAt: serverTimestamp()
          });
        }
        showSuccess('PRESETS ADDED!', '9 starter esports images have been added to your library.');
      } catch (err: any) {
        showError('ERROR', err.message || 'Failed to add starter presets.');
      }
    }
  };

  // Delete media asset
  const handleDeleteMedia = async (asset: MediaAsset) => {
    const confirmed = await showConfirm({
      variant: 'warning',
      title: 'DELETE IMAGE?',
      message: `Are you sure you want to remove "${asset.title}" from your media library? Any existing tournament or game using this URL will keep their URL, but it won't be listed in the library.`,
      confirmText: 'DELETE',
      cancelText: 'CANCEL'
    });

    if (confirmed) {
      try {
        if (!asset.id) return;
        await deleteDoc(doc(db, 'mediaAssets', asset.id));
        showSuccess('DELETED', `"${asset.title}" was removed from the library.`);
      } catch (err: any) {
        showError('DELETE FAILED', err.message || 'Failed to delete media asset.');
      }
    }
  };

  // Copy URL to clipboard
  const handleCopyUrl = (asset: MediaAsset) => {
    if (!asset.url) return;
    navigator.clipboard.writeText(asset.url);
    setCopiedId(asset.id || asset.url);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCategoryBadge = (cat: MediaCategory) => {
    switch (cat) {
      case 'banner':
        return (
          <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25 flex items-center gap-1">
            <Flag size={9} />
            <span>Tournament Banner</span>
          </span>
        );
      case 'game':
        return (
          <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
            <Gamepad2 size={9} />
            <span>Game Image</span>
          </span>
        );
      case 'mode':
        return (
          <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center gap-1">
            <Swords size={9} />
            <span>Tournament Mode</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 flex items-center gap-1">
            <Layers size={9} />
            <span>General</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* 1. Header Banner & Actions */}
      <div className="p-5 bg-gradient-to-br from-purple-900/15 via-white dark:via-neutral-900 to-indigo-900/10 dark:from-purple-950/40 dark:to-neutral-900 border border-purple-200/60 dark:border-purple-500/25 rounded-3xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-black flex items-center justify-center shadow-md shadow-purple-600/30">
              <ImageIcon size={16} />
            </div>
            <h3 className="text-base sm:text-lg font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
              Media &amp; Image Assets Library
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 max-w-xl">
            Store, manage, and reuse tournament banner images, game covers, and tournament mode artworks. When creating or editing any game, mode, or tournament, you can pick directly from this library.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
          {assets.length === 0 && !loading && (
            <button
              onClick={handleSeedPresets}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]"
            >
              <Sparkles size={13} className="text-amber-500" />
              <span>Load Starter Pack</span>
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-purple-600/30 transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]"
          >
            <Plus size={15} />
            <span>Add New Image</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              activeCategory === 'all'
                ? 'bg-purple-600 border-purple-600 text-black shadow-sm'
                : 'bg-white dark:bg-neutral-900 border-slate-200/80 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:border-slate-300'
            }`}
          >
            <span>All</span>
            <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-mono bg-black/15 dark:bg-white/15">
              {categoryCounts.all}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('banner')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              activeCategory === 'banner'
                ? 'bg-purple-600 border-purple-600 text-black shadow-sm'
                : 'bg-white dark:bg-neutral-900 border-slate-200/80 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:border-slate-300'
            }`}
          >
            <Flag size={11} />
            <span>Banners</span>
            <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-mono bg-black/15 dark:bg-white/15">
              {categoryCounts.banner}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('game')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              activeCategory === 'game'
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                : 'bg-white dark:bg-neutral-900 border-slate-200/80 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:border-slate-300'
            }`}
          >
            <Gamepad2 size={11} />
            <span>Games</span>
            <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-mono bg-black/15 dark:bg-white/15">
              {categoryCounts.game}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('mode')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              activeCategory === 'mode'
                ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                : 'bg-white dark:bg-neutral-900 border-slate-200/80 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:border-slate-300'
            }`}
          >
            <Swords size={11} />
            <span>Tournament Modes</span>
            <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-mono bg-black/15 dark:bg-white/15">
              {categoryCounts.mode}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('general')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              activeCategory === 'general'
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-neutral-900 border-slate-200/80 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:border-slate-300'
            }`}
          >
            <Layers size={11} />
            <span>General</span>
            <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-mono bg-black/15 dark:bg-white/15">
              {categoryCounts.general}
            </span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
          <input
            type="text"
            placeholder="Search by title or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 3. Media Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 dark:text-neutral-500 space-y-2">
          <Loader2 size={28} className="animate-spin text-purple-600" />
          <span className="text-xs font-black uppercase tracking-widest">Loading Media Library...</span>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="py-16 px-4 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-3xl text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center mx-auto">
            <ImageIcon size={26} />
          </div>
          <h4 className="text-sm font-black italic uppercase text-slate-900 dark:text-white">
            {searchQuery ? 'No matching images found' : 'No images in this category yet'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-neutral-400 max-w-sm mx-auto">
            {searchQuery 
              ? 'Try adjusting your search keywords or clear the search field.' 
              : 'Add your tournament banners, game covers, and mode images here so they can be selected anytime.'}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-purple-600/20 transition-all active:scale-[0.97]"
            >
              Add New Image
            </button>
            {assets.length === 0 && (
              <button
                onClick={handleSeedPresets}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.97]"
              >
                Load Starter Pack
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => {
            const isBanner = asset.category === 'banner';
            const isCopied = copiedId === (asset.id || asset.url);

            return (
              <div
                key={asset.id}
                className={`group bg-white dark:bg-neutral-900 border rounded-2xl overflow-hidden transition-all flex flex-col shadow-xs hover:shadow-md ${
                  selectableMode 
                    ? 'cursor-pointer hover:border-purple-500 active:scale-[0.97] border-slate-200/80 dark:border-neutral-800' 
                    : 'border-slate-200/80 dark:border-neutral-800 hover:border-purple-500/50'
                }`}
                onClick={() => {
                  if (selectableMode && onSelectImage) {
                    onSelectImage(asset.url, asset);
                  }
                }}
              >
                {/* Thumbnail */}
                <div className={`relative bg-slate-100 dark:bg-black/60 overflow-hidden ${
                  isBanner ? 'aspect-[16/9]' : 'aspect-[4/3]'
                }`}>
                  <SafeImage
                    src={asset.url}
                    alt={asset.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80" />

                  {/* Category Pill Top Left */}
                  <div className="absolute top-2 left-2 z-10">
                    {getCategoryBadge(asset.category)}
                  </div>

                  {/* Preview button Top Right */}
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAsset(asset);
                      }}
                      className="w-7 h-7 rounded-lg bg-black/70 hover:bg-black text-white flex items-center justify-center backdrop-blur-xs transition-colors"
                      title="View Full Resolution"
                    >
                      <Eye size={12} />
                    </button>
                  </div>

                  {/* Direct Select Overlay if in picker mode */}
                  {selectableMode && (
                    <div className="absolute inset-0 bg-purple-600/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="px-3 py-1 rounded-lg bg-purple-600 text-black text-[9px] font-black uppercase tracking-widest shadow-md">
                        Use This Image
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Info & Actions */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white line-clamp-1" title={asset.title}>
                      {asset.title}
                    </h4>
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {asset.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="text-[7.5px] font-mono font-bold text-slate-400 dark:text-neutral-500">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Bar */}
                  <div className="pt-1 border-t border-slate-100 dark:border-neutral-800/80 flex items-center justify-between gap-1.5">
                    {selectableMode ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectImage) onSelectImage(asset.url, asset);
                        }}
                        className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-black rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                      >
                        Select Image
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyUrl(asset);
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                            isCopied
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-100 dark:bg-neutral-800 hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-500/20 dark:hover:text-purple-300 text-slate-600 dark:text-neutral-300'
                          }`}
                          title="Copy Image URL"
                        >
                          {isCopied ? <Check size={11} /> : <Copy size={11} />}
                          <span>{isCopied ? 'Copied' : 'Copy URL'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMedia(asset);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          title="Delete image from library"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Add Media Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-600/15 text-purple-600 flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black italic uppercase text-slate-900 dark:text-white">
                    Add Image to Media Library
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-neutral-500">
                    Store tournament banners, games, and tournament mode artwork
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddMedia} className="space-y-4">
              {/* Category Selector */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 block mb-1.5">
                  Category *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCategory('banner')}
                    className={`py-2 px-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider border flex flex-col items-center gap-1 transition-all ${
                      newCategory === 'banner'
                        ? 'bg-purple-600 border-purple-600 text-black shadow-sm'
                        : 'bg-slate-50 dark:bg-neutral-800 border-slate-200/80 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
                    }`}
                  >
                    <Flag size={14} />
                    <span>Banner</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCategory('game')}
                    className={`py-2 px-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider border flex flex-col items-center gap-1 transition-all ${
                      newCategory === 'game'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-neutral-800 border-slate-200/80 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
                    }`}
                  >
                    <Gamepad2 size={14} />
                    <span>Game</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCategory('mode')}
                    className={`py-2 px-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider border flex flex-col items-center gap-1 transition-all ${
                      newCategory === 'mode'
                        ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-neutral-800 border-slate-200/80 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
                    }`}
                  >
                    <Swords size={14} />
                    <span>Mode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCategory('general')}
                    className={`py-2 px-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider border flex flex-col items-center gap-1 transition-all ${
                      newCategory === 'general'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-neutral-800 border-slate-200/80 dark:border-neutral-700 text-slate-600 dark:text-neutral-400'
                    }`}
                  >
                    <Layers size={14} />
                    <span>General</span>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 block mb-1">
                  Image Title / Label *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Free Fire Bermuda Solo Banner HD"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                />
              </div>

              {/* URL */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 block mb-1">
                  Direct Image URL * (HTTPS or Web URL)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                />
              </div>

              {/* Optional Tags */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 block mb-1">
                  Tags (Comma separated, optional)
                </label>
                <input
                  type="text"
                  placeholder="freefire, battle royale, solo, ranked"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-[#F37A1F] focus:shadow-[0_0_0_3px_rgba(243,122,32,0.18)]"
                />
              </div>

              {/* Live Preview */}
              {newUrl.trim() && (
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                    Live Preview:
                  </span>
                  <div className={`w-full rounded-xl overflow-hidden border border-slate-200 dark:border-neutral-700 bg-slate-100 dark:bg-black/40 ${
                    newCategory === 'banner' ? 'aspect-[16/8]' : 'aspect-[16/10]'
                  }`}>
                    <SafeImage
                      src={newUrl.trim()}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-purple-600/30 transition-all flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save to Library</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Full Preview Modal */}
      {previewAsset && (
        <div 
          onClick={() => setPreviewAsset(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {getCategoryBadge(previewAsset.category)}
                  <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white">
                    {previewAsset.title}
                  </h4>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono mt-0.5 truncate max-w-md">
                  {previewAsset.url}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="w-full max-h-[60vh] rounded-2xl overflow-hidden bg-black/20 flex items-center justify-center">
              <SafeImage
                src={previewAsset.url}
                alt={previewAsset.title}
                className="w-full max-h-[60vh] object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-neutral-800">
              <div className="text-[9px] text-slate-400 dark:text-neutral-500">
                Uploaded by {previewAsset.uploadedByName || 'Admin'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyUrl(previewAsset)}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-black rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/25"
                >
                  <Copy size={13} />
                  <span>Copy Image URL</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
