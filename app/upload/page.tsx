'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect } from 'react';
import Link from 'next/link';
import { validateFile } from '@/lib/validation';
import { FileType, FileVisibility, ApiResponse } from '@/types/database';
import { QrCode } from '@/components/features/QrCode';

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<'file' | 'note'>('file');

  // Workspace info
  const [workspaceInfo, setWorkspaceInfo] = useState<{ slug: string; name: string } | null>(null);

  // File mode states
  type QueuedFile = { file: File; type: FileType };
  const [selectedFiles, setSelectedFiles] = useState<QueuedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [customSlug, setCustomSlug] = useState<string>('');

  // Visibility & Password
  const [visibility, setVisibility] = useState<FileVisibility>('public');
  const [filePassword, setFilePassword] = useState<string>('');

  // Note mode states
  const [noteContent, setNoteContent] = useState<string>('');
  const [noteSlug, setNoteSlug] = useState<string>('');
  const [noteError, setNoteError] = useState<string | null>(null);

  // Status & output states
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayHost, setDisplayHost] = useState<string>('');
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    setDisplayHost(base.replace(/^https?:\/\//, ''));
  }, []);

  // Fetch current workspace info
  useEffect(() => {
    fetch('/api/workspace/me')
      .then((res) => res.json())
      .then((res: ApiResponse<{ slug: string; name: string }>) => {
        if (res.data) {
          setWorkspaceInfo(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const handleFilesSelect = (files: FileList | File[]) => {
    setFileError(null);
    setCreatedUrl(null);

    const accepted: QueuedFile[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((file) => {
      const validation = validateFile(file);
      if (!validation.valid || !validation.type) {
        errors.push(`${file.name}: ${validation.error}`);
        return;
      }
      accepted.push({ file, type: validation.type });
    });

    if (errors.length > 0) {
      setFileError(errors.join(' / '));
    }
    if (accepted.length > 0) {
      setSelectedFiles((prev) => [...prev, ...accepted]);
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelect(e.target.files);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(e.dataTransfer.files);
    }
  };

  const handleUploadFile = async () => {
    if (selectedFiles.length === 0) return;

    setIsLoading(true);
    setFileError(null);
    setCreatedUrl(null);

    const isBundle = selectedFiles.length > 1;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    let bundleWorkspaceId: string | undefined;
    let bundleSlug: string | undefined;

    try {
      if (isBundle) {
        setStatusMessage('— RESERVING LINK');
        const bundleRes = await fetch('/api/bundle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: customSlug || undefined }),
        });
        const bundleData: ApiResponse<{ id: string; slug: string }> = await bundleRes.json();

        if (bundleData.error || !bundleData.data) {
          setFileError(bundleData.error || 'FAILED TO RESERVE LINK');
          setIsLoading(false);
          setStatusMessage(null);
          return;
        }

        bundleWorkspaceId = bundleData.data.id;
        bundleSlug = bundleData.data.slug;
      }

      const errors: string[] = [];
      let singleFileUrl: string | null = null;

      for (let i = 0; i < selectedFiles.length; i++) {
        const { file, type } = selectedFiles[i];
        const progressPrefix = isBundle ? `(${i + 1}/${selectedFiles.length}) ` : '';

        try {
          // Step 1: Reserve slug
          setStatusMessage(`${progressPrefix}— RESERVING LINK`);
          const slugRes = await fetch('/api/slug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, slug: !isBundle ? customSlug || undefined : undefined }),
          });
          const slugData: ApiResponse<{ slug: string; type: FileType }> = await slugRes.json();

          if (slugData.error || !slugData.data) {
            errors.push(`${file.name}: ${slugData.error || 'FAILED TO RESERVE SLUG'}`);
            continue;
          }

          const reservedSlug = slugData.data.slug;

          // Step 2: Get signed upload URL
          setStatusMessage(`${progressPrefix}— UPLOADING`);
          const uploadUrlRes = await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              slug: reservedSlug,
              filename: file.name,
              mimeType: file.type,
            }),
          });
          const uploadUrlData: ApiResponse<{ signedUrl: string; storage_key: string }> = await uploadUrlRes.json();

          if (uploadUrlData.error || !uploadUrlData.data) {
            errors.push(`${file.name}: ${uploadUrlData.error || 'FAILED TO GENERATE UPLOAD URL'}`);
            continue;
          }

          const { signedUrl, storage_key } = uploadUrlData.data;

          // Direct upload to Supabase Storage signed URL
          const putRes = await fetch(signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
          });

          if (!putRes.ok) {
            errors.push(`${file.name}: STORAGE UPLOAD FAILED`);
            continue;
          }

          // Step 3: Finalize
          setStatusMessage(`${progressPrefix}— FINALIZING`);
          const finalizeRes = await fetch('/api/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              slug: reservedSlug,
              storage_key,
              size_bytes: file.size,
              mime_type: file.type,
              visibility,
              password: visibility === 'private' ? filePassword : undefined,
              bundle_workspace_id: bundleWorkspaceId,
            }),
          });
          const finalizeData: ApiResponse<{ url: string }> = await finalizeRes.json();

          if (finalizeData.error || !finalizeData.data) {
            errors.push(`${file.name}: ${finalizeData.error || 'FAILED TO FINALIZE UPLOAD'}`);
            continue;
          }

          if (!isBundle) {
            singleFileUrl = `${baseUrl}${finalizeData.data.url}`;
          }
        } catch (err: any) {
          errors.push(`${file.name}: ${err.message || 'UNEXPECTED ERROR OCCURRED'}`);
        }
      }

      if (errors.length > 0) {
        setFileError(errors.join(' / '));
      }

      if (isBundle && bundleSlug && errors.length === 0) {
        setCreatedUrl(`${baseUrl}/bundle/${bundleSlug}`);
      } else if (!isBundle && singleFileUrl) {
        setCreatedUrl(singleFileUrl);
      }
    } finally {
      setIsLoading(false);
      setStatusMessage(null);
    }
  };

  const handleUploadNote = async () => {
    if (!noteContent.trim()) return;

    setIsLoading(true);
    setNoteError(null);
    setStatusMessage('— RESERVING LINK');

    try {
      // Step 1: Reserve slug for note
      const slugRes = await fetch('/api/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', slug: noteSlug || undefined }),
      });
      const slugData: ApiResponse<{ slug: string; type: FileType }> = await slugRes.json();

      if (slugData.error || !slugData.data) {
        setNoteError(slugData.error || 'FAILED TO RESERVE SLUG');
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }

      const reservedSlug = slugData.data.slug;

      // Step 2: Finalize note directly
      setStatusMessage('— FINALIZING');
      const finalizeRes = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'note',
          slug: reservedSlug,
          content: noteContent,
          visibility,
          password: visibility === 'private' ? filePassword : undefined,
        }),
      });
      const finalizeData: ApiResponse<{ url: string }> = await finalizeRes.json();

      if (finalizeData.error || !finalizeData.data) {
        setNoteError(finalizeData.error || 'FAILED TO SAVE NOTE');
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }

      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const fullUrl = `${baseUrl}${finalizeData.data.url}`;
      setCreatedUrl(fullUrl);
    } catch (err: any) {
      setNoteError(err.message || 'UNEXPECTED ERROR OCCURRED');
    } finally {
      setIsLoading(false);
      setStatusMessage(null);
    }
  };

  const handleCopy = () => {
    if (!createdUrl) return;
    navigator.clipboard.writeText(createdUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="min-h-screen bg-[#E8E6E1] text-[#000000] p-6 sm:p-12 font-mono flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-[48px]">
          <Link href="/" className="text-[22px] font-bold tracking-[6px] uppercase text-[#000000]">
            LABDUMP
          </Link>
          {workspaceInfo && (
            <div className="text-xs font-bold uppercase">
              <Link href={`/w/${workspaceInfo.slug}`} className="hover:underline text-[#666666]">
                MY FILES →
              </Link>
            </div>
          )}
        </header>

        {/* Tab Switcher */}
        <div className="flex border-2 border-[#000000] bg-[#FFFFFF] shadow-[4px_4px_0px_#000000]">
          <button
            onClick={() => {
              setActiveTab('file');
              setCreatedUrl(null);
            }}
            className={`flex-1 py-3 text-xs font-bold uppercase transition-none ${
              activeTab === 'file'
                ? 'bg-[#FFFFFF] text-[#000000] border-l-4 border-l-[#FF3B00]'
                : 'bg-[#E8E6E1] text-[#666666]'
            }`}
          >
            FILE MODE
          </button>
          <button
            onClick={() => {
              setActiveTab('note');
              setCreatedUrl(null);
            }}
            className={`flex-1 py-3 text-xs font-bold uppercase transition-none border-l-2 border-l-[#000000] ${
              activeTab === 'note'
                ? 'bg-[#FFFFFF] text-[#000000] border-l-4 border-l-[#FF3B00]'
                : 'bg-[#E8E6E1] text-[#666666]'
            }`}
          >
            NOTE MODE
          </button>
        </div>

        {/* Success Card */}
        {createdUrl ? (
          <div className="border-3 border-[#000000] bg-[#FFFFFF] p-6 shadow-[4px_4px_0px_#000000] space-y-4">
            <h2 className="text-[#FF3B00] font-bold text-sm tracking-wider uppercase">
              LINK READY
            </h2>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-4">
                <div className="p-3 bg-[#E8E6E1] border-2 border-[#000000] text-xs font-mono break-all font-bold">
                  {createdUrl}
                </div>

                <div className="flex gap-4 items-center">
                  <button
                    onClick={handleCopy}
                    className="brutalist-btn-accent px-6 py-3 text-xs tracking-wider uppercase flex-1"
                  >
                    {copied ? 'COPIED!' : 'COPY LINK'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 shrink-0">
                <QrCode value={createdUrl} size={120} />
                <span className="text-[10px] font-bold uppercase text-[#666666] text-center">
                  SCAN TO OPEN ON PHONE
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setCreatedUrl(null);
                  setSelectedFiles([]);
                  setNoteContent('');
                }}
                className="text-xs font-bold uppercase underline hover:text-[#FF3B00]"
              >
                SHARE ANOTHER →
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* FILE MODE */}
            {activeTab === 'file' && (
              <div className="space-y-6">
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#000000] bg-[#FFFFFF] p-6 text-center cursor-pointer shadow-[4px_4px_0px_#000000] min-h-[200px] flex items-center justify-center"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    multiple
                    className="hidden"
                  />
                  {selectedFiles.length > 0 ? (
                    <div className="w-full space-y-2">
                      {selectedFiles.map((qf, i) => (
                        <div
                          key={i}
                          className="w-full flex justify-between items-center bg-[#E8E6E1] border-2 border-[#000000] p-4 text-xs font-bold"
                        >
                          <span className="truncate max-w-[80%] uppercase">
                            {qf.file.name} ({formatFileSize(qf.file.size)})
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSelectedFile(i);
                            }}
                            className="text-[#FF3B00] font-bold hover:opacity-80 px-2"
                          >
                            [X]
                          </button>
                        </div>
                      ))}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="text-[10px] font-bold uppercase text-[#666666] hover:text-[#FF3B00] underline pt-1"
                      >
                        + ADD MORE FILES
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-bold uppercase text-[#000000] tracking-wider">
                      DROP FILES HERE OR CLICK TO BROWSE
                    </div>
                  )}
                </div>

                {fileError && (
                  <div className="border-2 border-[#000000] bg-[#FF3B00] text-[#FFFFFF] p-3 text-xs font-bold uppercase">
                    {fileError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider">
                    CUSTOM LINK (OPTIONAL)
                  </label>
                  <div className="w-full flex items-stretch flex-wrap gap-y-1">
                    <span className="flex items-center pr-2 text-xs font-mono font-bold text-[#000000] whitespace-nowrap select-none">
                      {displayHost}/{selectedFiles.length > 1 ? 'bundle' : selectedFiles[0]?.type || 'file'}/
                    </span>
                    <input
                      type="text"
                      placeholder="cs101-notes"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      className="min-w-0 flex-1 bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
                    />
                  </div>
                  {selectedFiles.length > 1 && (
                    <p className="text-[10px] font-bold uppercase text-[#666666]">
                      ALL {selectedFiles.length} FILES WILL SHARE THIS ONE LINK
                    </p>
                  )}
                </div>

                {/* VISIBILITY TOGGLE */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider">
                    FILE VISIBILITY
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setVisibility('public')}
                      className={`py-3 text-xs font-bold uppercase border-2 border-[#000000] shadow-[2px_2px_0px_#000000] ${
                        visibility === 'public'
                          ? 'bg-[#000000] text-[#FFFFFF]'
                          : 'bg-[#FFFFFF] text-[#000000]'
                      }`}
                    >
                      PUBLIC
                    </button>
                    <button
                      onClick={() => setVisibility('private')}
                      className={`py-3 text-xs font-bold uppercase border-2 border-[#000000] shadow-[2px_2px_0px_#000000] ${
                        visibility === 'private'
                          ? 'bg-[#000000] text-[#FFFFFF]'
                          : 'bg-[#FFFFFF] text-[#000000]'
                      }`}
                    >
                      PRIVATE
                    </button>
                  </div>
                </div>

                {visibility === 'private' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider">
                      FILE PASSWORD
                    </label>
                    <input
                      type="password"
                      placeholder="ENTER FILE ACCESS PASSWORD"
                      value={filePassword}
                      onChange={(e) => setFilePassword(e.target.value)}
                      className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
                    />
                  </div>
                )}

                {statusMessage && (
                  <div className="text-xs font-bold uppercase tracking-widest text-[#000000]">
                    {statusMessage}
                  </div>
                )}

                <button
                  onClick={handleUploadFile}
                  disabled={selectedFiles.length === 0 || isLoading}
                  className="w-full py-4 text-sm font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_#000000]"
                >
                  {selectedFiles.length > 1 ? `SHARE ${selectedFiles.length} FILES →` : 'SHARE →'}
                </button>
              </div>
            )}

            {/* NOTE MODE */}
            {activeTab === 'note' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <textarea
                    rows={8}
                    placeholder="PASTE OR TYPE YOUR NOTE HERE"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-4 text-xs font-mono focus:outline-none shadow-[4px_4px_0px_#000000] resize-none uppercase"
                  />
                  <div className="text-right text-[10px] font-bold uppercase text-[#666666]">
                    CHARACTER COUNT: {noteContent.length}
                  </div>
                </div>

                {noteError && (
                  <div className="border-2 border-[#000000] bg-[#FF3B00] text-[#FFFFFF] p-3 text-xs font-bold uppercase">
                    {noteError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider">
                    CUSTOM LINK (OPTIONAL)
                  </label>
                  <div className="w-full flex items-stretch flex-wrap gap-y-1">
                    <span className="flex items-center pr-2 text-xs font-mono font-bold text-[#000000] whitespace-nowrap select-none">
                      {displayHost}/note/
                    </span>
                    <input
                      type="text"
                      placeholder="lab3-solution"
                      value={noteSlug}
                      onChange={(e) => setNoteSlug(e.target.value)}
                      className="min-w-0 flex-1 bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
                    />
                  </div>
                </div>

                {/* VISIBILITY TOGGLE */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider">
                    NOTE VISIBILITY
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setVisibility('public')}
                      className={`py-3 text-xs font-bold uppercase border-2 border-[#000000] shadow-[2px_2px_0px_#000000] ${
                        visibility === 'public'
                          ? 'bg-[#000000] text-[#FFFFFF]'
                          : 'bg-[#FFFFFF] text-[#000000]'
                      }`}
                    >
                      PUBLIC
                    </button>
                    <button
                      onClick={() => setVisibility('private')}
                      className={`py-3 text-xs font-bold uppercase border-2 border-[#000000] shadow-[2px_2px_0px_#000000] ${
                        visibility === 'private'
                          ? 'bg-[#000000] text-[#FFFFFF]'
                          : 'bg-[#FFFFFF] text-[#000000]'
                      }`}
                    >
                      PRIVATE
                    </button>
                  </div>
                </div>

                {visibility === 'private' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider">
                      NOTE PASSWORD
                    </label>
                    <input
                      type="password"
                      placeholder="ENTER NOTE ACCESS PASSWORD"
                      value={filePassword}
                      onChange={(e) => setFilePassword(e.target.value)}
                      className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
                    />
                  </div>
                )}

                {statusMessage && (
                  <div className="text-xs font-bold uppercase tracking-widest text-[#000000]">
                    {statusMessage}
                  </div>
                )}

                <button
                  onClick={handleUploadNote}
                  disabled={!noteContent.trim() || isLoading}
                  className="w-full py-4 text-sm font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_#000000]"
                >
                  SHARE →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
