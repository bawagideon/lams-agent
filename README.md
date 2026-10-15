# LAMS HQ — Personal Creator Operations Center & AI Workforce

A creator-first AI operations platform and workforce system for automated video production pipelines, CapCut desktop assembly, and YouTube Data API v3 publishing.

---

## Architecture & Substrates

```
                    LAMS HQ (http://localhost:4200)
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
      LAMS AI Assistant (Chat)          Creator Workspace Tabs
      - "Schedule Episode 1"            - Today (Needs You Queue)
      - "Assemble CapCut Draft"         - Episodes (48 Live DB Cards)
      - "Check YouTube Status"          - Workforce Skills Library
                                        - Integrations & Connections
                                 │
                     Resolution Ladder Substrates
      ┌──────────────────────────┼──────────────────────────┐
      ▼                          ▼                          ▼
Deterministic APIs         File / Draft Adapters      Headless Renderer
YouTube Data API v3        CapCut Draft Injector      FFmpeg Filtergraph
Supabase Storage           (draft_content.json)       (Local / Fallback)
```

- **Zero Mocks**: Directly connects to live Supabase database and storage buckets.
- **Scene Preview Player (`/api/episodes/:id/preview`)**: Full HTML5 video player streaming live scene clips with interactive prompt and character dialogue inspection.
- **Watched Export Folder (`watched_exports/`)**: Detects exported master videos from CapCut and feeds them into the publishing gate.
- **Human-in-the-Loop Governance**: Safe release gates require creator confirmation before publishing videos as `private` on YouTube.

---

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your Supabase and Google OAuth keys

# 3. Start local operations cockpit
npm start
```

Open `http://localhost:4200` in your browser.

---

## Deploying to Vercel

1. **Push to GitHub**: Push this repository to your GitHub account.
2. **Import in Vercel**: Connect your GitHub repository to Vercel.
3. **Set Environment Variables**: In **Vercel Project Settings → Environment Variables**, add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
4. **Deploy**: Vercel automatically detects the serverless configuration in `vercel.json` and routes requests to `api/index.ts`.
