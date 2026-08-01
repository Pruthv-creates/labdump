'use client';

import { useState } from 'react';

export function DownloadButton({
  signedUrl,
  filename,
  className,
}: {
  signedUrl: string;
  filename: string;
  className?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (err) {
      // Fallback: direct nav if blob fetch blocked
      window.location.href = signedUrl;
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={className || "brutalist-btn px-4 py-1.5 text-xs font-bold uppercase tracking-wider"}
    >
      {downloading ? 'DOWNLOADING...' : 'DOWNLOAD FILE ↓'}
    </button>
  );
}
