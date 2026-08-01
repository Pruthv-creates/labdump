# LabDump

> Zero-trace file and text sharing for college labs. No login. No history. No trace.

---

## The problem

Every college computer lab has the same unspoken ritual.

You need to move a file — a PDF, a lab report, an audio recording — from the shared lab PC to your phone or laptop. So you open Gmail. Or WhatsApp Web. You log in, send the file, and log out. Every time. Because leaving your account open on a machine that 40 other people will use today isn't an option.

Except people forget. ChatGPT sessions left open. Gmail inboxes sitting unlocked. We've all seen it — 2 or 3 PCs per lab session with someone else's account still signed in, history visible, files accessible.

**The login-logout ritual exists because there's no better option. LabDump is the better option.**

---

## Inspiration

[Shrib](https://shrib.com) already cracked the text-sharing habit in our college. No login, custom URL, paste text and go. Everyone uses it. The problem: it only does text. The moment you need to share a PDF, a `.docx`, an image, or an audio recording — you're back to Gmail and the login-logout ritual.

LabDump is Shrib, but for every file type a college lab actually produces. Same zero-friction philosophy. Extended to files. Built with the specific privacy anxiety of shared lab PCs in mind.

---

## What it does

- **Upload anything** — PDF, DOCX, images, audio, plain text notes
- **Get a link instantly** — no account, no signup, ever
- **Custom URLs** — choose your own slug: `labdump.com/pdf/os-notes`
- **Workspaces** — organize your uploads under a personal URL: `labdump.com/w/pruthv`
- **Three workspace modes:**
  - `PRIVATE` — only you can read or write, others get nothing
  - `PUBLIC` — open drop-zone, anyone can upload and view (built for shared class folders)
  - `PROTECTED` — password-gated, anyone with the password can view
- **Per-file visibility** — mark individual files public or private, independent of the workspace
- **6-month file retention** — built for semester-long access, not 24-hour links
- **Zero trace by design** — session cookie expires when the browser closes, one-click "clear this device" wipes any local state

---

## How it works

```
Upload a file or paste text
        ↓
Get a permanent share link (e.g. labdump.com/pdf/os-notes)
        ↓
Share the link — recipient opens it directly
        ↓
Signed download URL generated fresh on every visit
        ↓
File auto-expires after 6 months
```

The share link never changes. The storage access rotates on every request. Nobody ever touches your Supabase bucket directly.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | Next.js 14 (App Router) | Colocated frontend/backend, serverless functions, no CORS to configure |
| Database | Supabase Postgres | Real Postgres, no card required for free tier, schema portable via pg_dump |
| File storage | Supabase Storage (private bucket) | S3-compatible signed URLs, same account as DB, migratable to self-hosted MinIO later |
| Deployment | Vercel | Zero-config Next.js, no sleeping backend (unlike Render free tier) |
| Styling | Tailwind CSS + IBM Plex Mono | Brutalist design direction — hard borders, monospace, no border-radius |

---

## Privacy model

LabDump is **unguessable-link private**, not walled-garden private.

- Slugs are random nanoids — nobody can enumerate other people's files by guessing URLs
- No public browse or search page exists
- Individual file pages ship `noindex, nofollow` — search engines cannot index shared links
- Signed storage URLs expire in minutes — raw storage paths are never permanently accessible
- Workspace ownership is device-bound via `httpOnly` session cookie — no JavaScript can read or steal it
- Optional recovery key (the raw workspace UUID) lets you restore access on another device

---

## Workspace access model

```
owner_token cookie → full management access (upload, delete, settings)
workspace password → read access for protected workspaces
direct file link → public if file.visibility = 'public', password-gated if 'private'
```

These are independent layers. A file in a private workspace can still have a publicly accessible direct link if the owner explicitly sets it to public visibility.

---

## Database schema

```sql
create table workspaces (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  mode          text not null default 'private',
  password_hash text,
  share_token   uuid,
  share_enabled boolean default false,
  created_at    timestamptz default now()
);

create table files (
  id            bigserial primary key,
  type          text not null,
  slug          text not null,
  status        text not null default 'pending',
  content       text,
  storage_key   text,
  mime_type     text,
  size_bytes    bigint,
  view_count    bigint default 0,
  workspace_id  uuid not null references workspaces(id),
  file_token    uuid not null default gen_random_uuid(),
  password_hash text,
  visibility    text not null default 'public',
  created_at    timestamptz default now(),
  expires_at    timestamptz not null,
  unique (type, slug)
);
```

---

## Project structure

```
labdump/
├── app/
│   ├── (marketing)/page.tsx      → landing page
│   ├── [type]/[slug]/page.tsx    → file retrieval
│   ├── upload/page.tsx           → upload page
│   ├── w/
│   │   ├── create/page.tsx       → workspace creation
│   │   ├── restore/page.tsx      → recovery key restore
│   │   └── [slug]/page.tsx       → workspace dashboard
│   ├── admin/page.tsx            → moderation (env-gated)
│   └── api/
│       ├── slug/route.ts
│       ├── upload-url/route.ts
│       ├── finalize/route.ts
│       ├── unlock/route.ts
│       └── workspace/
│           ├── create/route.ts
│           ├── restore/route.ts
│           ├── me/route.ts
│           ├── check-slug/route.ts
│           └── verify-password/route.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts             → browser client (anon key)
│   │   └── server.ts             → server-only admin client
│   ├── slug.ts
│   ├── validation.ts
│   ├── workspace.ts
│   ├── rate-limit.ts
│   └── expiry.ts
├── components/
│   ├── ui/
│   └── features/
├── types/
│   └── database.ts
└── middleware.ts
```

---

## Running locally

```bash
git clone https://github.com/yourusername/labdump
cd labdump
npm install
```

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Run the SQL schema in your Supabase SQL editor (see `schema.sql`).

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Roadmap

- [x] File + text upload with custom slugs
- [x] Private / public / protected workspaces
- [x] Per-file visibility (public / private)
- [x] 6-month file retention + auto-expiry
- [ ] Admin moderation view + report button
- [ ] MIME-type sniffing validation (server-side, not just extension)
- [ ] Usage analytics dashboard
- [ ] Self-host migration: Oracle Cloud VM + MinIO + Docker
- [ ] AI-assisted moderation on public workspaces (post-launch)

---

## Why not just use Google Drive / WhatsApp?

You have to log in. And then log out. Every time. On every shared machine.
And sometimes you forget.

LabDump has nothing to log out of.

---

## License

MIT
