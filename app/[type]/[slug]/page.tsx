import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SupabaseFile } from '@/types/database';
import { CopyButton } from '@/components/features/CopyButton';
import { FilePasswordPrompt } from './FilePasswordPrompt';

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

  // Increment view count (fire and forget)
  void (async () => {
    try {
      await supabaseAdmin
        .from('files')
        .update({ view_count: (typedFile.view_count || 0) + 1 })
        .eq('id', typedFile.id);
    } catch {
      // Ignore increment errors
    }
  })();

  // Generate short-lived signed URL for binary types
  let signedDownloadUrl: string | null = null;
  if (typedFile.type !== 'note' && typedFile.storage_key) {
    const { data: signedData } = await supabaseAdmin.storage
      .from('labdump-files')
      .createSignedUrl(typedFile.storage_key, 60);

    if (signedData) {
      signedDownloadUrl = signedData.signedUrl;
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
            {signedDownloadUrl && (
              <a
                href={signedDownloadUrl}
                download
                className="brutalist-btn px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
              >
                DOWNLOAD FILE ↓
              </a>
            )}
            <div className="bg-[#000000] text-[#FFFFFF] px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-[#000000]">
              {typedFile.type.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Content Viewer */}
        <div className="space-y-6">
          {typedFile.type === 'note' && (
            <div className="space-y-4">
              <div className="border-3 border-[#000000] bg-[#FFFFFF] p-6 shadow-[4px_4px_0px_#000000]">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all uppercase leading-relaxed">
                  {typedFile.content || '(EMPTY NOTE)'}
                </pre>
              </div>
              <CopyButton textToCopy={typedFile.content || ''} />
            </div>
          )}

          {typedFile.type === 'image' && signedDownloadUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-2 shadow-[4px_4px_0px_#000000]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signedDownloadUrl}
                alt={typedFile.slug}
                className="w-full max-h-[70vh] object-contain border border-[#000000]"
              />
            </div>
          )}

          {typedFile.type === 'pdf' && signedDownloadUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-2 shadow-[4px_4px_0px_#000000]">
              <iframe
                src={signedDownloadUrl}
                className="w-full h-[70vh] border border-[#000000]"
                title={typedFile.slug}
              />
            </div>
          )}

          {typedFile.type === 'audio' && signedDownloadUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-6 shadow-[4px_4px_0px_#000000]">
              <audio controls>
                <source src={signedDownloadUrl} type={typedFile.mime_type || undefined} />
                BROWSER DOES NOT SUPPORT AUDIO PREVIEW.
              </audio>
            </div>
          )}

          {typedFile.type === 'docx' && signedDownloadUrl && (
            <div className="border-3 border-[#000000] bg-[#FFFFFF] p-8 text-center shadow-[4px_4px_0px_#000000] space-y-4">
              <div className="text-sm font-bold uppercase tracking-wider">
                WORD DOCUMENT (.DOCX)
              </div>
              <div>
                <a
                  href={signedDownloadUrl}
                  download
                  className="brutalist-btn inline-block px-8 py-3 text-xs tracking-wider uppercase"
                >
                  DOWNLOAD FILE →
                </a>
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
