import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SupabaseFile } from '@/types/database';
import { DownloadButton } from '@/components/features/DownloadButton';
import { FilePasswordPrompt } from './FilePasswordPrompt';
import { EditableNote } from './EditableNote';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

interface PageProps {
  params: Promise<{
    type: string;
    slug: string;
  }>;
}

export default async function RetrievalPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { type, slug } = resolvedParams;

  const nowIso = new Date().toISOString();

  // Query active, non-expired file record
  const { data: fileRecord } = await supabaseAdmin
    .from('files')
    .select('*')
    .eq('type', type)
    .eq('slug', slug)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (!fileRecord) {
    return (
      <main className="min-h-screen bg-[#E8E6E1] text-[#000000] flex flex-col items-center justify-center p-6 font-mono border-4 border-[#000000]">
        <div className="text-center space-y-6 max-w-lg">
          <h1 className="text-3xl font-extrabold uppercase tracking-tight">
            404 — THIS LINK IS DEAD.
          </h1>
          <p className="text-xs font-bold text-[#666666] uppercase">
            THE LINK HAS EXPIRED OR NEVER EXISTED.
          </p>
          <div>
            <Link
              href="/upload"
              className="brutalist-btn inline-block px-6 py-3 text-xs uppercase tracking-wider"
            >
              ← UPLOAD NEW FILE
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const typedFile = fileRecord as SupabaseFile;

  // Check file-level visibility & lock cookie
  const cookieStore = await cookies();
  const isUnlocked = cookieStore.get(`file_unlock_${type}_${slug}`)?.value === 'granted';

  if (typedFile.visibility === 'private' && !isUnlocked) {
    return (
      <main className="min-h-screen bg-[#E8E6E1] text-[#000000] flex flex-col items-center justify-center p-6 font-mono">
        <FilePasswordPrompt type={type} slug={slug} />
      </main>
    );
  }

  // Calculate remaining days
  const expiresDate = new Date(typedFile.expires_at);
  const diffTime = expiresDate.getTime() - new Date().getTime();
  const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // Increment the view count after the response is sent. Read-then-write from
  // the render pass lost concurrent views and left a floating promise; an
  // atomic RPC scheduled via `after` avoids both.
  after(async () => {
    try {
      await supabaseAdmin.rpc('increment_view_count', { p_file_id: typedFile.id });
    } catch {
      // A missed view count must never break the page.
    }
  });

  // Generate short-lived preview URL (inline disposition)
  let previewUrl: string | null = null;
  let originalFilename = `${typedFile.slug}`;

  if (typedFile.type !== 'note' && typedFile.storage_key) {
    originalFilename = typedFile.storage_key.split('/').pop() || `${typedFile.slug}`;
    const { data: signedData } = await supabaseAdmin.storage
      .from('labdump-files')
      .createSignedUrl(typedFile.storage_key, 120);

    if (signedData) {
      previewUrl = signedData.signedUrl;
    }
  }

  return (
    <main className="min-h-screen bg-[#E8E6E1] text-[#000000] p-6 sm:p-12 font-mono flex flex-col justify-between">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center pb-4 border-b-3 border-[#000000]">
          <Link href="/" className="text-[13px] font-bold tracking-[4px] uppercase text-[#000000]">
            LABDUMP
          </Link>
          <div className="flex items-center gap-3">
            {previewUrl && (
              <DownloadButton signedUrl={previewUrl} filename={originalFilename} />
            )}
            <div className="bg-[#000000] text-[#FFFFFF] px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-[#000000]">
              {typedFile.type.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Content Viewer */}
        <div className="space-y-6">
          {typedFile.type === 'note' && (
            <EditableNote slug={typedFile.slug} initialContent={typedFile.content || ''} />
          )}

          {typedFile.type === 'image' && previewUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-2 shadow-[4px_4px_0px_#000000]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={typedFile.slug}
                className="w-full max-h-[70vh] object-contain border border-[#000000]"
              />
            </div>
          )}

          {typedFile.type === 'pdf' && previewUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-2 shadow-[4px_4px_0px_#000000]">
              <iframe
                src={previewUrl}
                className="w-full h-[70vh] border border-[#000000]"
                title={typedFile.slug}
              />
            </div>
          )}

          {typedFile.type === 'audio' && previewUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-6 shadow-[4px_4px_0px_#000000]">
              <audio controls className="w-full">
                <source src={previewUrl} type={typedFile.mime_type || undefined} />
                BROWSER DOES NOT SUPPORT AUDIO PREVIEW.
              </audio>
            </div>
          )}

          {typedFile.type === 'docx' && previewUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-8 text-center shadow-[4px_4px_0px_#000000] space-y-4">
              <div className="text-sm font-bold uppercase tracking-wider">
                WORD DOCUMENT (.DOCX)
              </div>
              <div>
                <DownloadButton
                  signedUrl={previewUrl}
                  filename={originalFilename}
                  className="brutalist-btn inline-block px-8 py-3 text-xs tracking-wider uppercase"
                />
              </div>
            </div>
          )}

          {typedFile.type === 'file' && previewUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-8 text-center shadow-[4px_4px_0px_#000000] space-y-4">
              <div className="text-sm font-bold uppercase tracking-wider break-all">
                {originalFilename}
              </div>
              <div>
                <DownloadButton
                  signedUrl={previewUrl}
                  filename={originalFilename}
                  className="brutalist-btn inline-block px-8 py-3 text-xs tracking-wider uppercase"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <footer className="w-full max-w-4xl mx-auto pt-6 border-t-2 border-[#000000] flex justify-between items-center text-xs font-bold text-[#666666] uppercase">
        <div>EXPIRES IN {diffDays} DAYS</div>
        <div>VIEW COUNT: {typedFile.view_count || 0}</div>
      </footer>
    </main>
  );
}
