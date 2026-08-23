import { Metadata } from 'next';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getWorkspaceBySlug } from '@/lib/workspace';
import { SupabaseFile } from '@/types/database';
import { DownloadButton } from '@/components/features/DownloadButton';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function BundlePage({ params }: PageProps) {
  const { slug } = await params;

  const bundle = await getWorkspaceBySlug(slug);

  if (!bundle) {
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
              ← UPLOAD NEW FILES
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const nowIso = new Date().toISOString();
  const { data: filesData } = await supabaseAdmin
    .from('files')
    .select('*')
    .eq('workspace_id', bundle.id)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true });

  const files = (filesData || []) as SupabaseFile[];

  // Short-lived signed preview/download URLs for each file
  const filesWithUrls = await Promise.all(
    files.map(async (file) => {
      let signedUrl: string | null = null;
      let originalFilename = file.slug;

      if (file.type !== 'note' && file.storage_key) {
        originalFilename = file.storage_key.split('/').pop() || file.slug;
        const { data: signedData } = await supabaseAdmin.storage
          .from('labdump-files')
          .createSignedUrl(file.storage_key, 120);
        if (signedData) {
          signedUrl = signedData.signedUrl;
        }
      }

      return { file, signedUrl, originalFilename };
    })
  );

  return (
    <main className="min-h-screen bg-[#E8E6E1] text-[#000000] p-6 sm:p-12 font-mono flex flex-col justify-between">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center pb-4 border-b-3 border-[#000000]">
          <Link href="/" className="text-[13px] font-bold tracking-[4px] uppercase text-[#000000]">
            LABDUMP
          </Link>
          <div className="bg-[#000000] text-[#FFFFFF] px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-[#000000]">
            BUNDLE ({files.length})
          </div>
        </header>

        {/* Files List */}
        <div className="space-y-4">
          {filesWithUrls.length === 0 ? (
            <div className="border-2 border-[#000000] bg-[#FFFFFF] p-12 text-center text-xs font-bold uppercase text-[#666666] shadow-[4px_4px_0px_#000000]">
              NO FILES IN THIS BUNDLE.
            </div>
          ) : (
            filesWithUrls.map(({ file, signedUrl, originalFilename }) => (
              <div
                key={file.id}
                className="border-3 border-[#000000] bg-[#FFFFFF] p-4 shadow-[4px_4px_0px_#000000] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="bg-[#000000] text-[#FFFFFF] text-[10px] font-bold px-2 py-0.5 uppercase border border-[#000000] shrink-0">
                    {file.type}
                  </span>
                  <span className="text-xs font-bold truncate uppercase">
                    {originalFilename}
                  </span>
                  {file.size_bytes != null && (
                    <span className="text-[10px] text-[#666666] font-bold shrink-0">
                      ({formatFileSize(file.size_bytes)})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {file.type === 'note' ? (
                    <Link
                      href={`/note/${file.slug}`}
                      className="brutalist-btn px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
                    >
                      VIEW NOTE →
                    </Link>
                  ) : signedUrl ? (
                    <DownloadButton signedUrl={signedUrl} filename={originalFilename} />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer Info */}
      <footer className="w-full max-w-4xl mx-auto pt-6 border-t-2 border-[#000000] flex justify-between items-center text-xs font-bold text-[#666666] uppercase">
        <div>LABDUMP BUNDLE</div>
      </footer>
    </main>
  );
}
