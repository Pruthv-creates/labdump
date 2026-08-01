'use client';

import { useState } from 'react';

export function CopyButton({ textToCopy }: { textToCopy: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="brutalist-btn w-full py-3 text-xs tracking-wider uppercase"
    >
      {copied ? 'COPIED!' : 'COPY TEXT'}
    </button>
  );
}
