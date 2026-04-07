# MarkMaster — X Bookmark Manager

Search, sort, categorize, and curate your X bookmarks. Built for power users who actually want to find what they saved.

## Features

- **Full-text search** across tweet content, authors, and notes
- **Sort & filter** by date, engagement metrics, content type, author, and tags
- **Custom tags** with color coding and smart auto-categorization
- **Collections** — curate themed bookmark lists with drag-and-drop ordering
- **Share collections** via public links or post them as X threads
- **Analytics** — see who you bookmark most, content breakdown, and trends
- **Export** to JSON or CSV with all metadata
- **Keyboard shortcuts** — `j/k` navigate, `/` search, `t` tag, `c` collect
- **Dark/light theme** with amber accent branding
- **Infinite history** — syncs and caches bookmarks beyond X's 800-bookmark API limit

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Tailwind CSS 4** + **shadcn/ui** components
- **PostgreSQL** via **Prisma** ORM
- **NextAuth.js** (Auth.js) with X/Twitter OAuth 2.0
- **TanStack Query** for client-side state
- **Recharts** for analytics charts

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (local Docker, Neon, or Supabase)
- X Developer App with OAuth 2.0 credentials (Basic tier or pay-per-use)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env` and fill in your values:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/markmaster"
AUTH_SECRET="openssl rand -base64 32"
AUTH_TWITTER_ID="your-x-oauth2-client-id"
AUTH_TWITTER_SECRET="your-x-oauth2-client-secret"
NEXTAUTH_URL="http://localhost:3000"
ENCRYPTION_KEY="openssl rand -hex 32"
```

### 3. Set up the database

```bash
npx prisma migrate dev --name init
```

### 4. Configure your X Developer App

1. Go to [developer.x.com](https://developer.x.com) and create a project/app
2. Under **User authentication settings**, enable OAuth 2.0
3. Set the callback URL to `http://localhost:3000/api/auth/callback/twitter`
4. Request scopes: `tweet.read`, `tweet.write`, `users.read`, `bookmark.read`, `bookmark.write`, `offline.access`
5. Copy your Client ID and Client Secret into `.env`

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── login/page.tsx              # OAuth sign-in
│   ├── (main)/                     # Auth-protected routes
│   │   ├── dashboard/page.tsx      # Main bookmark browser
│   │   ├── collections/page.tsx    # Collections list
│   │   ├── collections/[id]/       # Collection detail
│   │   ├── analytics/page.tsx      # Bookmark analytics
│   │   └── settings/page.tsx       # User settings
│   ├── share/[slug]/page.tsx       # Public collection view
│   └── api/                        # API routes
├── components/                     # React components
├── lib/
│   ├── auth.ts                     # NextAuth configuration
│   ├── x-api.ts                    # X API client
│   ├── sync.ts                     # Bookmark sync engine
│   ├── auto-tag.ts                 # Smart tagging
│   ├── prisma.ts                   # Database client
│   └── encryption.ts               # Token encryption
└── types/                          # TypeScript types
```

## X API Costs

MarkMaster requires X API bookmark access (Basic tier at $200/month or pay-per-use):

- **Reads**: $0.005 per API read (fetching bookmarks)
- **Writes**: $0.01 per API write (posting threads)
- A full sync of 800 bookmarks costs approximately $4

The app caches everything locally to minimize repeated API calls.
