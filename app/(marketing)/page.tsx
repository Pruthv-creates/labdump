import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#E8E6E1] text-[#000000] flex flex-col justify-between p-6 sm:p-12 font-mono border-4 border-[#000000]">
      {/* Top Header */}
      <header className="flex justify-between items-center">
        <div className="text-[13px] font-bold tracking-[4px] uppercase text-[#000000]">
          LABDUMP
        </div>
      </header>

      {/* Main Hero Section */}
      <div className="my-auto py-12">
        <h1 className="text-[14vw] leading-[0.85] font-extrabold tracking-tighter uppercase text-[#000000] select-none">
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
