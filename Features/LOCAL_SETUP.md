# XBoom Workflow — Local Development Setup

> Instructions for running the project locally for development and testing.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| npm or bun | Latest |
| Git | Latest |

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repo-url>
cd xboom-workflow
```

### 2. Install Dependencies

```bash
npm install
```

Or using bun:

```bash
bun install
```

### 3. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (default Vite port).

---

## Environment Variables

The project uses a `.env` file that is **auto-configured** by Lovable Cloud. The following variables are required:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Backend API endpoint |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client-side API key (anon key) |
| `VITE_SUPABASE_PROJECT_ID` | Project identifier |

> ⚠️ **Do not edit the `.env` file manually** — it is managed automatically by the platform.

### Server-Side Secrets

The following secrets are configured via Lovable Cloud secrets manager and are only available to edge functions:

| Secret | Purpose |
|--------|---------|
| `SHOPIFY_STORE_DOMAIN` | Shopify store domain |
| `SHOPIFY_ADMIN_API_TOKEN` | Shopify Admin API token |
| `SHOPIFY_API_SECRET` | Shopify webhook HMAC secret |

---

## Project Structure

```
xboom-workflow/
├── public/                    # Static assets
├── src/
│   ├── assets/                # Images and static resources
│   ├── components/            # React components
│   │   ├── ui/                # shadcn/ui base components
│   │   ├── admin/             # Admin panel components
│   │   ├── attendance/        # Attendance widgets
│   │   ├── auth/              # Authentication components
│   │   ├── billing/           # Invoice and quote components
│   │   ├── buyback/           # Buyback module
│   │   ├── calendar/          # Calendar views
│   │   ├── candidates/        # Recruitment components
│   │   ├── finance/           # Finance dashboards
│   │   ├── forms/             # Form builder components
│   │   ├── hr/                # HR module components
│   │   ├── inventory/         # Inventory widgets
│   │   ├── kpi/               # KPI management
│   │   ├── leads/             # Lead management
│   │   ├── meetings/          # Meeting components
│   │   ├── notices/           # Notice board
│   │   ├── pipeline/          # Sales pipeline
│   │   ├── pricelist/         # Product catalog
│   │   ├── procurement/       # Procurement module
│   │   ├── repairs/           # Repair tracking
│   │   ├── salary/            # Payroll components
│   │   ├── sales/             # Sales CRM
│   │   ├── shopify/           # Shopify integration
│   │   ├── tally/             # Tally dashboard
│   │   ├── tasks/             # Task management
│   │   ├── tickets/           # IT ticketing
│   │   └── trainings/         # Training module
│   ├── hooks/                 # Custom React hooks
│   ├── integrations/          # Auto-generated client and types
│   ├── lib/                   # Utility functions
│   ├── pages/                 # Route page components
│   ├── App.tsx                # Root component with routing
│   ├── main.tsx               # Entry point
│   └── index.css              # Global styles and design tokens
├── supabase/
│   ├── functions/             # Edge functions (Deno)
│   ├── migrations/            # Database migration SQL files
│   └── config.toml            # Function configuration
├── Features/                  # Documentation
└── package.json
```

---

## Key Development Notes

### Auto-Generated Files (Do Not Edit)

The following files are managed automatically and should **never** be edited manually:

| File | Managed By |
|------|-----------|
| `.env` | Lovable Cloud |
| `supabase/config.toml` | Lovable Cloud |
| `src/integrations/supabase/client.ts` | Lovable Cloud |
| `src/integrations/supabase/types.ts` | Lovable Cloud |

### Code Style

- **TypeScript** strict mode — avoid `any` types
- **Tailwind CSS** with semantic design tokens from `index.css` — no hardcoded colors
- **shadcn/ui** components as the UI foundation
- **React Query** for all server state management
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `refactor:`)

### Adding Database Changes

All database modifications must use migration files in `supabase/migrations/`. Migrations are applied automatically on deployment.

### Adding Edge Functions

1. Create a new directory in `supabase/functions/{function-name}/`
2. Add `index.ts` with the function implementation
3. Add configuration to `supabase/config.toml` if JWT verification should be disabled
4. Functions are deployed automatically

### Building for Production

```bash
npm run build
```

Output is generated in the `dist/` directory.

---

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |

---

*Last updated: 2026-03-06*
