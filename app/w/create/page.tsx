'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkspaceMode, ApiResponse } from '@/types/database';

export default function CreateWorkspacePage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [mode, setMode] = useState<WorkspaceMode>('private');
  const [password, setPassword] = useState('');

  const [checkingSlug, setCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Debounced slug check
  useEffect(() => {
    if (!slug.trim()) {
      setSlugAvailable(null);
      setSlugError(null);
      return;
    }

    setCheckingSlug(true);
    setSlugAvailable(null);
    setSlugError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/workspace/check-slug?slug=${encodeURIComponent(slug.trim().toLowerCase())}`);
        const result: ApiResponse<{ available: boolean }> = await res.json();

        if (result.data) {
          setSlugAvailable(result.data.available);
        } else {
          setSlugAvailable(false);
        }
      } catch {
        setSlugAvailable(false);
      } finally {
        setCheckingSlug(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) return;
    if (mode === 'protected' && !password.trim()) {
      setErrorMsg('— PASSWORD REQUIRED FOR PROTECTED WORKSPACE');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/workspace/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          mode,
          password: mode === 'protected' ? password.trim() : undefined,
        }),
      });

      const result: ApiResponse<{
        slug: string;
        mode: WorkspaceMode;
        name: string;
        recoveryKey: string;
      }> = await res.json();

      if (result.error || !result.data) {
        if (result.error === 'SLUG_TAKEN') {
          setSlugError('— THIS URL IS TAKEN');
        } else {
          setErrorMsg(`— ${result.error || 'FAILED TO CREATE WORKSPACE'}`);
        }
        setIsLoading(false);
        return;
      }

      // The recovery key is only ever returned here — it is stored hashed and
      // cannot be shown again. Make the student save it before moving on.
      setRecoveryKey(result.data.recoveryKey);
      setCreatedSlug(result.data.slug);
      setIsLoading(false);
    } catch (err: any) {
      setErrorMsg(`— ${err.message || 'UNEXPECTED ERROR'}`);
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

        {recoveryKey && createdSlug ? (
          <div className="space-y-6">
            <h1 className="text-xl font-bold uppercase tracking-wide">
              SAVE YOUR RECOVERY KEY
            </h1>

            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-6 shadow-[4px_4px_0px_#000000] space-y-4">
              <div className="text-xs font-bold uppercase text-[#FF3B00]">
                THIS IS SHOWN ONCE. IT CANNOT BE RECOVERED LATER.
                WITHOUT IT YOU LOSE ACCESS TO THIS WORKSPACE.
              </div>

              <div className="p-3 bg-[#E8E6E1] border-2 border-[#000000] font-mono text-xs font-bold select-all break-all">
                {recoveryKey}
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(recoveryKey);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
                className="brutalist-btn-accent px-6 py-3 text-xs uppercase tracking-wider"
              >
                {copiedKey ? 'COPIED!' : 'COPY KEY'}
              </button>
            </div>

            <div className="border-2 border-[#000000] bg-[#FFFFFF] p-3 text-xs font-bold uppercase text-[#666666]">
              ON A SHARED LAB PC, SIGN OUT WHEN YOU FINISH — YOUR SESSION ALSO
              ENDS WHEN THE BROWSER CLOSES.
            </div>

            <button
              onClick={() => router.push(`/w/${createdSlug}`)}
              className="w-full py-4 text-sm font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              I SAVED IT — OPEN WORKSPACE →
            </button>
          </div>
        ) : (
        <>
        <h1 className="text-xl font-bold uppercase tracking-wide">
          CREATE YOUR WORKSPACE
        </h1>

        <div className="space-y-6">
          {/* WORKSPACE NAME */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider">
              WORKSPACE NAME
            </label>
            <input
              type="text"
              placeholder="E.G. PRUTHV'S LAB"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
            />
          </div>

          {/* WORKSPACE URL */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider">
              WORKSPACE URL
            </label>
            <div className="flex items-center bg-[#FFFFFF] border-2 border-[#000000] shadow-[2px_2px_0px_#000000]">
              <span className="px-3 text-xs font-bold text-[#666666] border-r-2 border-r-[#000000] bg-[#E8E6E1] py-3 select-none">
                labdump.com/w/
              </span>
              <input
                type="text"
                placeholder="pruthv"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full bg-transparent p-3 text-xs font-mono uppercase focus:outline-none"
              />
            </div>

            {/* Slug status indicator */}
            <div className="text-xs font-bold uppercase">
              {checkingSlug && <span className="text-[#666666]">— CHECKING...</span>}
              {!checkingSlug && slugAvailable === true && (
                <span className="text-[#3D9A3D]">✓ AVAILABLE</span>
              )}
              {!checkingSlug && slugAvailable === false && (
                <span className="text-[#FF3B00]">✗ TAKEN</span>
              )}
              {slugError && <div className="text-[#FF3B00] mt-1">{slugError}</div>}
            </div>
          </div>

          {/* VISIBILITY MODE */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider">
              VISIBILITY MODE
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['private', 'public', 'protected'] as WorkspaceMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`py-3 text-xs font-bold uppercase border-2 border-[#000000] shadow-[2px_2px_0px_#000000] transition-none ${
                    mode === m
                      ? 'bg-[#000000] text-[#FFFFFF]'
                      : 'bg-[#FFFFFF] text-[#000000]'
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* PASSWORD FOR PROTECTED */}
          {mode === 'protected' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider">
                WORKSPACE PASSWORD
              </label>
              <input
                type="password"
                placeholder="SET WORKSPACE PASSWORD"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
              />
            </div>
          )}

          {errorMsg && (
            <div className="border-2 border-[#000000] bg-[#FF3B00] text-[#FFFFFF] p-3 text-xs font-bold uppercase">
              {errorMsg}
            </div>
          )}

          {/* CREATE BUTTON */}
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !slug.trim() || isLoading || slugAvailable === false}
            className="w-full py-4 text-sm font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'CREATING...' : 'CREATE WORKSPACE →'}
          </button>
        </div>
        </>
        )}
      </div>
    </main>
  );
}
