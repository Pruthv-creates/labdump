'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function FilePasswordPrompt({ type, slug }: { type: string; slug: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUnlock = async () => {
    if (!password.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, slug, password: password.trim() }),
      });

      const result = await res.json();

      if (result.error || !result.data?.granted) {
        setErrorMsg('— INCORRECT PASSWORD');
        setIsLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setErrorMsg('— UNLOCK FAILED');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md border-3 border-[#000000] bg-[#FFFFFF] p-8 shadow-[4px_4px_0px_#000000] space-y-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-center">
        PROTECTED FILE
      </h2>
      <p className="text-xs text-center text-[#666666] font-bold uppercase">
        ENTER PASSWORD TO VIEW THIS FILE
      </p>

      <div className="space-y-4">
        <input
          type="password"
          placeholder="ENTER FILE PASSWORD"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
        />

        {errorMsg && (
          <div className="border-2 border-[#000000] bg-[#FF3B00] text-[#FFFFFF] p-3 text-xs font-bold uppercase">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleUnlock}
          disabled={!password.trim() || isLoading}
          className="w-full py-3 text-xs font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[2px_2px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50"
        >
          {isLoading ? 'VERIFYING...' : 'UNLOCK FILE →'}
        </button>
      </div>
    </div>
  );
}
