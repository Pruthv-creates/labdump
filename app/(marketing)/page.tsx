import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { FileType } from '@/types/database';

export const dynamic = 'force-dynamic';

interface LandingStats {
  totalShared: number;
  totalViews: number;
  sharedThisWeek: number;
  byType: { type: FileType; count: number }[];
}

async function getLandingStats(): Promise<LandingStats | null> {
  const { data, error } = await supabaseAdmin
    .from('files')
    .select('type, view_count, created_at')
    .neq('status', 'pending');

  if (error || !data) return null;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  let totalViews = 0;
  let sharedThisWeek = 0;
  const typeCounts = new Map<FileType, number>();

  for (const row of data) {
    totalViews += row.view_count || 0;
    if (new Date(row.created_at) >= oneWeekAgo) sharedThisWeek++;
    typeCounts.set(row.type, (typeCounts.get(row.type) || 0) + 1);
  }

  const byType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalShared: data.length,
    totalViews,
    sharedThisWeek,
    byType,
  };
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

export default async function LandingPage() {
  const stats = await getLandingStats();

  return (
    <main className="min-h-screen bg-[#E8E6E1] text-[#000000] flex flex-col justify-between p-6 sm:p-12 font-mono border-4 border-[#000000]">
      {/* Top Header */}
      <header className="flex justify-between items-center">
        <div className="text-[13px] font-bold tracking-[4px] uppercase text-[#000000]">
          LABDUMP
        </div>
      </header>

      {/* Main Hero Section */}
      <div className="my-auto py-12 flex flex-col lg:flex-row lg:items-center gap-12">
        <div className="flex-1">
          <h1 className="text-[14vw] lg:text-[9vw] leading-[0.85] font-extrabold tracking-tighter uppercase text-[#000000] select-none">
            LABDUMP
          </h1>

          <p className="mt-8 text-sm sm:text-base font-bold uppercase tracking-wider text-[#000000]">
            SHARE FILES AND NOTES INSTANTLY. NO LOGIN. NO TRACE.
          </p>

          <div className="mt-10">
            <Link
              href="/upload"
              className="brutalist-btn inline-block px-8 py-4 text-base tracking-widest uppercase"
            >
              START SHARING →
            </Link>
          </div>
        </div>

        {stats && stats.totalShared > 0 && (
          <div className="lg:w-72 shrink-0 space-y-3">
            <div className="border-2 border-[#000000] bg-[#FFFFFF] p-4 shadow-[3px_3px_0px_#000000]">
              <div className="text-2xl font-extrabold">{formatCount(stats.totalShared)}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#666666] mt-1">
                FILES & NOTES SHARED
              </div>
            </div>

            <div className="border-2 border-[#000000] bg-[#FFFFFF] p-4 shadow-[3px_3px_0px_#000000]">
              <div className="text-2xl font-extrabold">{formatCount(stats.totalViews)}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#666666] mt-1">
                TOTAL VIEWS
              </div>
            </div>

            <div className="border-2 border-[#000000] bg-[#FFFFFF] p-4 shadow-[3px_3px_0px_#000000]">
              <div className="text-2xl font-extrabold">{formatCount(stats.sharedThisWeek)}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#666666] mt-1">
                SHARED THIS WEEK
              </div>
            </div>

            {stats.byType.length > 0 && (
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#666666] pt-1">
                {stats.byType
                  .map((t) => `${formatCount(t.count)} ${t.type}${t.count === 1 ? '' : 'S'}`)
                  .join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <footer className="pt-6 border-t-2 border-[#000000] flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs font-bold text-[#000000] uppercase tracking-wider gap-2">
        <div>
          PDF · DOCX · IMAGE · AUDIO · NOTE
        </div>
        <div className="text-slate-600">
          ZERO TRACE // NO ACCOUNTS REQUIRED
        </div>
      </footer>
    </main>
  );
}
