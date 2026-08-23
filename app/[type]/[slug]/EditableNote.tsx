'use client';

import { useState } from 'react';
import { ApiResponse } from '@/types/database';

export function EditableNote({ slug, initialContent }: { slug: string; initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const isDirty = content !== savedContent;

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/note/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, content }),
      });
      const result: ApiResponse<{ success: true }> = await res.json();

      if (result.error || !result.data) {
        setSaveError(result.error || 'FAILED TO SAVE');
        setIsSaving(false);
        return;
      }

      setSavedContent(content);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err: any) {
      setSaveError(err.message || 'FAILED TO SAVE');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="brutalist-btn-accent flex-1 py-3 text-xs tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'SAVING...' : justSaved ? 'SAVED!' : isDirty ? 'SAVE CHANGES →' : 'SAVED'}
        </button>
        <button onClick={handleCopy} className="brutalist-btn flex-1 py-3 text-xs tracking-wider uppercase">
          COPY TEXT
        </button>
      </div>

      {saveError && (
        <div className="border-2 border-[#000000] bg-[#FF3B00] text-[#FFFFFF] p-3 text-xs font-bold uppercase">
          {saveError}
        </div>
      )}

      <div className="border-3 border-[#000000] bg-[#FFFFFF] p-6 shadow-[4px_4px_0px_#000000]">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="w-full text-xs font-mono whitespace-pre-wrap uppercase leading-relaxed focus:outline-none resize-y bg-transparent"
        />
      </div>
    </div>
  );
}
