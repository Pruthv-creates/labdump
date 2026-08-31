'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiResponse } from '@/types/database';
import { getMimeToType } from '@/lib/validation';

export function WorkspacePasswordPrompt({ slug }: { slug: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!password.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/workspace/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password: password.trim() }),
      });

      const result: ApiResponse<{ granted: boolean }> = await res.json();

      if (result.error || !result.data?.granted) {
        setErrorMsg('— INCORRECT PASSWORD');
        setIsLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setErrorMsg('— VERIFICATION FAILED');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md border-3 border-[#000000] bg-[#FFFFFF] p-8 shadow-[4px_4px_0px_#000000] space-y-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-center">
        PROTECTED WORKSPACE
      </h2>
      <p className="text-xs text-center text-[#666666] font-bold uppercase">
        ENTER PASSWORD TO ACCESS FILES
      </p>

      <div className="space-y-4">
        <input
          type="password"
          placeholder="ENTER WORKSPACE PASSWORD"
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
          onClick={handleVerify}
          disabled={!password.trim() || isLoading}
          className="w-full py-3 text-xs font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[2px_2px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50"
        >
          {isLoading ? 'VERIFYING...' : 'ENTER PASSWORD →'}
        </button>
      </div>
    </div>
  );
}

export function InlineDropZone({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processUploads(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processUploads(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const processUploads = async (files: File[]) => {
    setIsUploading(true);
    setErrorMsg(null);

    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      setUploadProgress(files.length > 1 ? `${i + 1}/${files.length}` : null);
      try {
        await processUpload(files[i]);
      } catch (err: any) {
        errors.push(`${files[i].name}: ${err.message || 'UPLOAD FAILED'}`);
      }
    }

    if (errors.length > 0) {
      setErrorMsg(errors.join(' / '));
    }
    setUploadProgress(null);
    setIsUploading(false);
    router.refresh();
  };

  const processUpload = async (file: File) => {
    const type = getMimeToType(file.type);

    // 1. Slug
    const slugRes = await fetch('/api/slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    const slugData = await slugRes.json();
    if (slugData.error) throw new Error(slugData.error);

    const reservedSlug = slugData.data.slug;

    // 2. Upload URL
    const uploadRes = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        slug: reservedSlug,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      }),
    });
    const uploadData = await uploadRes.json();
    if (uploadData.error) throw new Error(uploadData.error);

    // Storage PUT
    const putRes = await fetch(uploadData.data.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!putRes.ok) throw new Error('STORAGE UPLOAD FAILED');

    // 3. Finalize
    const finalizeRes = await fetch('/api/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        slug: reservedSlug,
        storage_key: uploadData.data.storage_key,
        bundle_workspace_id: workspaceId,
      }),
    });
    const finalizeData = await finalizeRes.json();
    if (finalizeData.error) throw new Error(finalizeData.error);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="border-2 border-dashed border-[#000000] bg-[#FFFFFF] p-6 text-center shadow-[2px_2px_0px_#000000] space-y-2 cursor-pointer"
    >
      <input type="file" id="inline-file" onChange={handleChange} multiple className="hidden" />
      <label htmlFor="inline-file" className="cursor-pointer text-xs font-bold uppercase block">
        {isUploading
          ? `— UPLOADING FILE${uploadProgress ? ` ${uploadProgress}` : ''}...`
          : 'DROP FILES HERE OR CLICK TO UPLOAD TO WORKSPACE'}
      </label>
      {errorMsg && <div className="text-xs font-bold text-[#FF3B00]">{errorMsg}</div>}
    </div>
  );
}

/**
 * The recovery key is shown once, at creation, and only its hash is stored.
 * It can no longer be re-displayed here: on a shared lab PC that let anyone
 * holding a live session walk away with permanent ownership of the workspace.
 */
export function WorkspaceRecoverySection() {
  return (
    <div className="pt-8 border-t-2 border-[#000000] space-y-3">
      <div className="text-xs font-bold uppercase text-[#666666]">
        RECOVERY KEY
      </div>
      <div className="border-2 border-[#000000] bg-[#FFFFFF] p-4 shadow-[4px_4px_0px_#000000] text-xs font-bold uppercase text-[#666666]">
        SHOWN ONCE WHEN THIS WORKSPACE WAS CREATED. IT CANNOT BE DISPLAYED AGAIN.
      </div>
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/workspace/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={busy}
      className="bg-[#FF3B00] text-[#FFFFFF] text-[10px] font-bold px-3 py-1.5 uppercase border-2 border-[#000000] disabled:opacity-50"
    >
      {busy ? '...' : 'SIGN OUT'}
    </button>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="bg-[#000000] text-[#FFFFFF] text-[10px] font-bold px-2 py-1 uppercase border border-[#000000] hover:bg-[#FF3B00]"
    >
      {copied ? 'COPIED' : 'COPY LINK'}
    </button>
  );
}

export function DeleteFileButton({ fileId }: { fileId: number }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('DELETE THIS FILE?')) return;
    setDeleting(true);

    try {
      await fetch(`/api/file/delete?id=${fileId}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="bg-[#FF3B00] text-[#FFFFFF] text-[10px] font-bold px-2 py-1 uppercase border border-[#000000]"
    >
      {deleting ? '...' : 'DELETE'}
    </button>
  );
}
