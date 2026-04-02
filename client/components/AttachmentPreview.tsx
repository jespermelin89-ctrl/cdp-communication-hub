'use client';

import { useState } from 'react';
import { Download, FileText, FileImage, File, Film, Archive } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import ImageLightbox from './ImageLightbox';
import type { EmailAttachment } from '@/lib/types';
import { isInviteAttachmentDownloadable } from '@/lib/calendar-invite';

interface AttachmentPreviewProps {
  attachments: EmailAttachment[];
  threadId: string;
  messageId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(mimeType);
}

function isPDF(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

function getFileIcon(mimeType: string) {
  if (isImage(mimeType)) return FileImage;
  if (isPDF(mimeType)) return FileText;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return Archive;
  if (mimeType.includes('text') || mimeType.includes('document') || mimeType.includes('sheet')) return FileText;
  return File;
}

function getIconColor(mimeType: string): string {
  if (isImage(mimeType)) return 'text-green-500 dark:text-green-400';
  if (isPDF(mimeType)) return 'text-red-500 dark:text-red-400';
  if (mimeType.startsWith('video/')) return 'text-purple-500 dark:text-purple-400';
  return 'text-blue-500 dark:text-blue-400';
}

export default function AttachmentPreview({ attachments, threadId, messageId }: AttachmentPreviewProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const imageAttachments = attachments.filter((a) => isImage(a.mimeType));

  async function handleDownload(att: EmailAttachment) {
    if (!isInviteAttachmentDownloadable(att)) {
      return;
    }

    setDownloadingId(att.attachmentId);
    try {
      const blob = await api.downloadAttachment(threadId, messageId, att.attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Kunde inte ladda ner bilagan');
    } finally {
      setDownloadingId(null);
    }
  }

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="mt-3 space-y-1">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Bilagor ({attachments.length})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {attachments.map((att, idx) => {
            const isImg = isImage(att.mimeType);
            const imageIdx = imageAttachments.findIndex((a) => a.attachmentId === att.attachmentId);
            const Icon = getFileIcon(att.mimeType);

            return (
              <div
                key={att.attachmentId}
              className="group flex flex-col items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-brand-300 dark:hover:border-brand-600 transition-colors cursor-pointer"
              onClick={() => {
                if (isImg && imageIdx >= 0) {
                  setLightboxIndex(imageIdx);
                  setLightboxOpen(true);
                } else if (isInviteAttachmentDownloadable(att)) {
                  handleDownload(att);
                }
              }}
              >
                <div className="mb-2">
                  <Icon size={28} className={getIconColor(att.mimeType)} />
                </div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center truncate w-full">
                  {att.filename}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatBytes(att.size)}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload(att); }}
                  disabled={downloadingId === att.attachmentId || !isInviteAttachmentDownloadable(att)}
                  className="mt-2 flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                >
                  <Download size={11} />
                  {downloadingId === att.attachmentId ? 'Laddar...' : 'Ladda ner'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {lightboxOpen && imageAttachments.length > 0 && (
        <ImageLightbox
          images={imageAttachments.map((a) => ({
            attachmentId: a.attachmentId,
            filename: a.filename,
            mimeType: a.mimeType,
            threadId,
            messageId,
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
