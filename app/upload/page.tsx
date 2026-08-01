'use client';

import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import { validateFile } from '@/lib/validation';
import { FileType, ApiResponse } from '@/types/database';

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<'file' | 'note'>('file');

  // File mode states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [derivedFileType, setDerivedFileType] = useState<FileType | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [customSlug, setCustomSlug] = useState<string>('');

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

  const handleFileSelect = (file: File) => {
    setFileError(null);
    setCreatedUrl(null);
    const validation = validateFile(file);
    if (!validation.valid) {
      setFileError(validation.error);
      setSelectedFile(null);
      setDerivedFileType(null);
      return;
    }
    setSelectedFile(file);
    setDerivedFileType(validation.type);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile || !derivedFileType) return;

    setIsLoading(true);
    setFileError(null);
    setStatusMessage('— RESERVING LINK');

    try {
      // Step 1: Reserve slug
      const slugRes = await fetch('/api/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: derivedFileType, slug: customSlug || undefined }),
      });
      const slugData: ApiResponse<{ slug: string; type: FileType }> = await slugRes.json();

      if (slugData.error || !slugData.data) {
        setFileError(slugData.error || 'FAILED TO RESERVE SLUG');
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }

      const reservedSlug = slugData.data.slug;

      // Step 2: Get signed upload URL
      setStatusMessage('— UPLOADING');
      const uploadUrlRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: derivedFileType,
          slug: reservedSlug,
          filename: selectedFile.name,
          mimeType: selectedFile.type,
        }),
      });
      const uploadUrlData: ApiResponse<{ signedUrl: string; storage_key: string }> = await uploadUrlRes.json();

      if (uploadUrlData.error || !uploadUrlData.data) {
        setFileError(uploadUrlData.error || 'FAILED TO GENERATE UPLOAD URL');
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }

      const { signedUrl, storage_key } = uploadUrlData.data;

      // Direct upload to Supabase Storage signed URL
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      });

      if (!putRes.ok) {
        setFileError('STORAGE UPLOAD FAILED');
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }

      // Step 3: Finalize
      setStatusMessage('— FINALIZING');
      const finalizeRes = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: derivedFileType,
          slug: reservedSlug,
          storage_key,
          size_bytes: selectedFile.size,
          mime_type: selectedFile.type,
        }),
      });
      const finalizeData: ApiResponse<{ url: string }> = await finalizeRes.json();

      if (finalizeData.error || !finalizeData.data) {
        setFileError(finalizeData.error || 'FAILED TO FINALIZE UPLOAD');
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }

      const fullUrl = `${window.location.origin}${finalizeData.data.url}`;
      setCreatedUrl(fullUrl);
    } catch (err: any) {
      setFileError(err.message || 'UNEXPECTED ERROR OCCURRED');
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
        }),
      });
      const finalizeData: ApiResponse<{ url: string }> = await finalizeRes.json();

      if (finalizeData.error || !finalizeData.data) {
        setNoteError(finalizeData.error || 'FAILED TO SAVE NOTE');
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }

      const fullUrl = `${window.location.origin}${finalizeData.data.url}`;
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
            <div className="p-3 bg-[#E8E6E1] border-2 border-[#000000] text-xs font-mono break-all font-bold">
              {createdUrl}
            </div>
            <div className="flex gap-4 items-center pt-2">
              <button
                onClick={handleCopy}
                className="brutalist-btn-accent px-6 py-3 text-xs tracking-wider uppercase flex-1"
              >
                {copied ? 'COPIED!' : 'COPY'}
              </button>
              <button
                onClick={() => {
                  setCreatedUrl(null);
                  setSelectedFile(null);
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
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="w-full flex justify-between items-center bg-[#E8E6E1] border-2 border-[#000000] p-4 text-xs font-bold">
                      <span className="truncate max-w-[80%] uppercase">
                        {selectedFile.name} ({formatFileSize(selectedFile.size)})
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          setDerivedFileType(null);
                        }}
                        className="text-[#FF3B00] font-bold hover:opacity-80 px-2"
                      >
                        [X]
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs font-bold uppercase text-[#000000] tracking-wider">
                      DROP FILE HERE OR CLICK TO BROWSE
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
                    CUSTOM SLUG (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. cs101-notes"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
                  />
                </div>

                {statusMessage && (
                  <div className="text-xs font-bold uppercase tracking-widest text-[#000000]">
                    {statusMessage}
                  </div>
                )}

                <button
                  onClick={handleUploadFile}
                  disabled={!selectedFile || isLoading}
                  className="w-full py-4 text-sm font-bold tracking-widest uppercase bg-[#000000] text-[#FFFFFF] border-2 border-[#000000] shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_#000000]"
                >
                  SHARE →
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
                    CUSTOM SLUG (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. lab3-solution"
                    value={noteSlug}
                    onChange={(e) => setNoteSlug(e.target.value)}
                    className="w-full bg-[#FFFFFF] border-2 border-[#000000] p-3 text-xs font-mono uppercase focus:outline-none shadow-[2px_2px_0px_#000000]"
                  />
                </div>

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
