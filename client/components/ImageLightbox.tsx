'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface LightboxImage {
  attachmentId: string;
  filename: string;
  mimeType: string;
  threadId: string;
  messageId: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const current = images[currentIndex];

  const loadImage = useCallback(async (img: LightboxImage) => {
    setLoading(true);
    setImageSrc(null);
    try {
      const blob = await api.downloadAttachment(img.threadId, img.messageId, img.attachmentId);
      const url = URL.createObjectURL(blob);
      setImageSrc(url);
    } catch {
      setImageSrc(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (current) loadImage(current);
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) setCurrentIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight' && images.length > 1) setCurrentIndex((i) => Math.min(images.length - 1, i + 1));
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [images.length, onClose]);

  async function handleDownload() {
    if (!current) return;
    setDownloading(true);
    try {
      const blob = await api.downloadAttachment(current.threadId, current.messageId, current.attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = current.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Kunde inte ladda ner');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors backdrop-blur-sm"
        >
          <Download size={14} />
          {downloading ? 'Laddar...' : 'Ladda ner'}
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors backdrop-blur-sm"
        >
          <X size={18} />
        </button>
      </div>

      {/* Filename */}
      <div className="absolute top-4 left-4 text-white/80 text-sm font-medium backdrop-blur-sm bg-black/30 px-3 py-1.5 rounded-lg max-w-xs truncate">
        {current?.filename}
      </div>

      {/* Left arrow */}
      {images.length > 1 && currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i - 1); }}
          className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-sm"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Image */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        ) : imageSrc ? (
          <img
            src={imageSrc}
            alt={current?.filename}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <div className="text-white/60 text-sm">Kunde inte ladda bilden</div>
        )}
      </div>

      {/* Right arrow */}
      {images.length > 1 && currentIndex < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i + 1); }}
          className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-sm"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute bottom-4 text-white/60 text-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
