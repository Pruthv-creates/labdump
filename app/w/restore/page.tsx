'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiResponse } from '@/types/database';

export default function RestoreWorkspacePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRestore = async () => {
    if (!token.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/workspace/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      const result: ApiResponse<{ slug: string; name: string }> = await res.json();

      if (result.error || !result.data) {
        setErrorMsg('— INVALID KEY. CHECK AND TRY AGAIN.');
        setIsLoading(false);
        return;
      }

      router.push(`/w/${result.data.slug}`);
    } catch {
      setErrorMsg('— INVALID KEY. CHECK AND TRY AGAIN.');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#E8E6E1] text-[#000000] p-6 sm:p-12 font-mono flex flex-col items-center">
      <div className="w-full max-w-xl space-y-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-[48px]">
          <Link href="/" className="text-[22px] font-bold tracking-[6px] uppercase text-[#000000]">
            LABDUMP
          </Link>
        </header>

        <h1 className="text-xl font-bold uppercase tracking-wide">
          RESTORE WORKSPACE ACCESS
        </h1>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider">
              PASTE YOUR RECOVERY KEY
            </label>
            <input
              type="text"
              placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
            />
          </div>

          {errorMsg && (
            <div className="border-2 border-[#000000] bg-[#FF3B00] text-[#FFFFFF] p-3 text-xs font-bold uppercase">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleRestore}
            disabled={!token.trim() || isLoading}
            className="w-full py-4 text-sm font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'RESTORING...' : 'RESTORE →'}
          </button>
        </div>
      </div>
    </main>
  );
}
