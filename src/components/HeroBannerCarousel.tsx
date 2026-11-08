import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Banner, Page } from '../types';
import SafeImage from './SafeImage';

interface HeroBannerCarouselProps {
  banners: Banner[];
  onPageChange: (page: Page, id?: string) => void;
}

export default function HeroBannerCarousel({ banners, onPageChange }: HeroBannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const fallbackBanners: Banner[] = [
    {
      id: 'default-1',
      imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop',
      type: 'main',
      order: 0,
      isActive: true,
    },
  ];

  const activeBanners = banners.length > 0 ? banners : fallbackBanners;
  const safeIndex = currentIndex >= activeBanners.length ? 0 : currentIndex;

  useEffect(() => {
    if (currentIndex >= activeBanners.length) {
      setCurrentIndex(0);
    }
  }, [activeBanners.length, currentIndex]);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
  }, [activeBanners.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
  }, [activeBanners.length]);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const timer = setInterval(nextSlide, 3800);
    return () => clearInterval(timer);
  }, [activeBanners.length, nextSlide]);

  const handleBannerClick = (banner: Banner) => {
    if (banner?.redirectUrl) {
      if (banner.redirectUrl.startsWith('http')) {
        window.open(banner.redirectUrl, '_blank', 'noopener,noreferrer');
      } else {
        onPageChange(Page.TOURNAMENTS);
      }
    } else {
      onPageChange(Page.TOURNAMENTS);
    }
  };

  return (
    <section className="px-4 pt-3 pb-2">
      <div className="relative w-full aspect-[16/9.2] rounded-[28px] overflow-hidden border border-slate-200/70 dark:border-purple-500/20 shadow-[0_12px_35px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_35px_rgba(88,28,135,0.2)] bg-slate-100 dark:bg-slate-900 group">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeBanners[safeIndex]?.id || safeIndex}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            drag={activeBanners.length > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -40) nextSlide();
              else if (info.offset.x > 40) prevSlide();
            }}
            onClick={() => handleBannerClick(activeBanners[safeIndex])}
            className="w-full h-full cursor-pointer relative rounded-[28px] overflow-hidden"
          >
            <SafeImage
              src={activeBanners[safeIndex]?.imageUrl}
              alt={`Promotion Banner ${safeIndex + 1}`}
              className="w-full h-full object-cover"
            />
          </motion.div>
        </AnimatePresence>

        {/* Bottom Dot Indicators inside the rounded card */}
        {activeBanners.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20 px-3 py-1 rounded-full bg-black/45 backdrop-blur-md max-w-[85%] overflow-x-auto no-scrollbar">
            {activeBanners.map((b, idx) => (
              <button
                key={b.id || idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                aria-label={`Slide ${idx + 1}`}
                className={`rounded-full shrink-0 transition-all duration-300 ${
                  idx === safeIndex
                    ? 'w-5 h-2 bg-white shadow-sm'
                    : 'w-2 h-2 bg-white/45 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

