import React, { useState, useEffect } from 'react';

interface SafeImageProps {
  src?: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackSrc?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  showLoader?: boolean;
}

const APP_LOGO = "https://i.ibb.co/n8jPYbMP/image.png";

export default function SafeImage({ 
  src, 
  alt = "Image", 
  className = "", 
  imgClassName = "",
  fallbackSrc = APP_LOGO,
  objectFit = 'cover',
}: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string>(src && src.trim() ? src : fallbackSrc);
  const [hasErrored, setHasErrored] = useState(false);

  useEffect(() => {
    setHasErrored(false);
    setCurrentSrc(src && src.trim() ? src : fallbackSrc);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (!hasErrored) {
      setHasErrored(true);
      setCurrentSrc(fallbackSrc);
    }
  };

  const fitClass =
    objectFit === 'contain'
      ? 'object-contain'
      : objectFit === 'fill'
      ? 'object-fill'
      : objectFit === 'none'
      ? 'object-none'
      : objectFit === 'scale-down'
      ? 'object-scale-down'
      : 'object-cover';

  return (
    <div className={`relative overflow-hidden bg-slate-900/40 ${className}`}>
      <img
        src={currentSrc}
        alt={alt}
        onError={handleError}
        loading="eager"
        decoding="async"
        className={`w-full h-full ${fitClass} block transition-opacity duration-200 ${imgClassName}`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
