import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getWorkspaceBySlug } from '@/lib/workspace';
import { getSessionWorkspace } from '@/lib/session';
import { SupabaseFile } from '@/types/database';
import {
  WorkspacePasswordPrompt,
  InlineDropZone,
  WorkspaceRecoverySection,
  CopyLinkButton,
  DeleteFileButton,
  SignOutButton,
} from './WorkspaceClientComponents';

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

export default async function WorkspacePage({ params }: PageProps) {
  const { slug } = await params;

  const workspace = await getWorkspaceBySlug(slug);

  if (!workspace) {
    return (
      <main className="min-h-screen bg-[#E8E6E1] text-[#000000] flex flex-col items-center justify-center p-6 font-mono border-4 border-[#000000]">
        <div className="text-center space-y-6 max-w-lg">
          <h1 className="text-3xl font-extrabold uppercase tracking-tight">
            404 — WORKSPACE NOT FOUND.
          </h1>
          <p className="text-xs font-bold text-[#666666] uppercase">
            THE REQUESTED WORKSPACE DOES NOT EXIST OR WAS DELETED.
          </p>
          <div>
            <Link
              href="/w/create"
              className="brutalist-btn inline-block px-6 py-3 text-xs uppercase tracking-wider"
            >
              ← CREATE WORKSPACE
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Ownership comes from the signed-in session only — never from a header or
  // a long-lived cookie that a later student on the same PC would inherit.
  const sessionWorkspace = await getSessionWorkspace();
  const isOwner = sessionWorkspace?.id === workspace.id;

  const cookieStore = await cookies();
  const hasAccessCookie = cookieStore.get(`workspace_access_${slug}`)?.value === 'granted';

  // Check Mode access
  if (workspace.mode === 'private' && !isOwner) {
    return (
      <main className="min-h-screen bg-[#E8E6E1] text-[#000000] flex flex-col items-center justify-center p-6 font-mono border-4 border-[#000000]">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold uppercase tracking-wide">
            — PRIVATE WORKSPACE.
          </h1>
          <p className="text-xs text-[#666666] font-bold uppercase">
            IF THIS IS YOURS, RESTORE ACCESS AT{' '}
            <Link href="/w/restore" className="underline text-[#000000]">
              /W/RESTORE
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (workspace.mode === 'protected' && !isOwner && !hasAccessCookie) {
    return (
      <main className="min-h-screen bg-[#E8E6E1] text-[#000000] flex flex-col items-center justify-center p-6 font-mono">
        <WorkspacePasswordPrompt slug={slug} />
      </main>
    );
  }

  // Fetch workspace files
  const nowIso = new Date().toISOString();
  const { data: filesData } = await supabaseAdmin
    .from('files')
    .select('*')
    .eq('workspace_id', workspace.id)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });

  const files = (filesData || []) as SupabaseFile[];

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDaysLeft = (expiresAtStr: string) => {
    const expiresDate = new Date(expiresAtStr);
    const diffTime = expiresDate.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  return (
    <main className="min-h-screen bg-[#E8E6E1] text-[#000000] p-6 sm:p-12 font-mono flex flex-col justify-between">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex justify-between items-center pb-4 border-b-3 border-[#000000]">
          <Link href="/" className="text-[22px] font-bold tracking-[6px] uppercase text-[#000000]">
            LABDUMP
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase text-[#666666]">
              WORKSPACE:
            </span>
            <div className="bg-[#000000] text-[#FFFFFF] px-3 py-1 text-xs font-bold uppercase tracking-wider border-2 border-[#000000]">
              {workspace.mode.toUpperCase()}
            </div>
            {/* Shared lab PCs: let a student end their session deliberately. */}
            {isOwner && <SignOutButton />}
          </div>
        </header>

        {/* Workspace Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold uppercase tracking-tight">
            {workspace.name}
          </h1>

          {isOwner && (
            <Link
              href="/upload"
              className="brutalist-btn px-6 py-3 text-xs uppercase tracking-wider text-center"
            >
              UPLOAD TO THIS WORKSPACE →
            </Link>
          )}
        </div>

        {/* Public Notice */}
        {workspace.mode === 'public' && (
          <div className="border-2 border-[#000000] bg-[#FFFFFF] p-3 text-xs font-bold uppercase text-[#666666] shadow-[2px_2px_0px_#000000]">
            PUBLIC WORKSPACE — ANYONE CAN UPLOAD
          </div>
        )}

        {/* Inline Upload Zone (if Public or Owner) */}
        {(workspace.mode === 'public' || isOwner) && (
          <InlineDropZone workspaceId={workspace.id} />
        )}

        {/* Files List */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#666666]">
            FILES IN THIS WORKSPACE ({files.length})
          </h2>

          {files.length === 0 ? (
            <div className="border-2 border-[#000000] bg-[#FFFFFF] p-12 text-center text-xs font-bold uppercase text-[#666666] shadow-[4px_4px_0px_#000000]">
              NO FILES YET. DROP SOMETHING ABOVE.
            </div>
          ) : (
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="border-2 border-[#000000] bg-[#FFFFFF] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[2px_2px_0px_#000000]"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="bg-[#000000] text-[#FFFFFF] text-[10px] font-bold px-2 py-0.5 uppercase border border-[#000000] shrink-0">
                      {file.type}
                    </span>
                    <span className="text-xs font-bold truncate">
                      {file.slug}
                    </span>
                    <span className="text-[10px] text-[#666666] font-bold shrink-0">
                      ({formatFileSize(file.size_bytes)})
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-[#666666] font-bold uppercase">
                      EXPIRES IN {getDaysLeft(file.expires_at)} DAYS
                    </span>

                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 border uppercase ${
                        file.visibility === 'private'
                          ? 'border-[#FF3B00] text-[#FF3B00]'
                          : 'border-[#000000] text-[#000000]'
                      }`}
                    >
                      {file.visibility}
                    </span>

                    <CopyLinkButton url={`${process.env.NEXT_PUBLIC_SITE_URL || ''}/${file.type}/${file.slug}`} />

                    {isOwner && <DeleteFileButton fileId={file.id} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recovery Key (Owner only) */}
        {isOwner && <WorkspaceRecoverySection />}
      </div>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto pt-8 mt-12 border-t-2 border-[#000000] flex justify-between items-center text-[10px] font-bold text-[#666666] uppercase">
        <div>CREATED: {new Date(workspace.created_at).toLocaleDateString()}</div>
        <div>LABDUMP WORKSPACE ENGINE</div>
      </footer>
    </main>
  );
}
