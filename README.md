# GramWIN

GramWIN is a health and wellness claim-checking app that helps you go from "I saw this on the internet" to a structured, evidence-backed answer you can actually trust.

It pairs an Expo (React Native) client with a FastAPI backend that runs a staged, multi-agent investigation pipeline. The backend is intentionally conservative: it validates sources, cross-checks sentiment, and verifies quotes before anything shows up in the UI.

## Highlights

- Guided claim investigations with quick/standard/deep depth options
- Source and quote validation to reduce hallucinated citations
- Weighted consensus scoring across multiple evidence sources
- Investigation history persisted in SQLite
- Optional account sync via Firebase Authentication

## Tech Stack

- Frontend: Expo + React Native + TypeScript (exports to static web for Vercel)
- Backend: FastAPI + Python (Render Web Service)
- Search: SerpAPI (breadth) + Tavily / Exa (depth), depending on configured keys
- LLM providers: OpenAI, Claude, Gemini, xAI, DeepSeek (optional; enabled via env keys)

## Repo Layout

- `frontend/`: Expo client (mobile + web export)
- `backend/`: FastAPI API + investigation pipeline
- `render.yaml`: Render Blueprint for the backend service

## How It Works (High Level)

- Understand the claim (subject/action/outcome + strength)
- Generate meaning-preserving search queries
- Retrieve sources (breadth + depth)
- Validate accessibility and extract readable text
- Verify quotes against extracted page text
- Run dual sentiment passes (scientific + critical)
- Produce weighted consensus with cross-agent review

## Local Development

### Quick Start (recommended)

From the repo root:

- `pwsh -ExecutionPolicy Bypass -File .\run-backend.ps1`
- `pwsh -ExecutionPolicy Bypass -File .\run-frontend.ps1`
- `pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1`

### Backend configuration

1. Copy `backend/.env.example` to `backend/.env` (do not commit it)
2. Set the runtime values first:
   - `BACKEND_HOST`
   - `BACKEND_PORT`
   - `BACKEND_PUBLIC_BASE_URL`
   - `CORS_ALLOWED_ORIGINS`
3. Add whichever provider keys you want enabled:
   - `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`
   - `TAVILY_API_KEY`, `SERPAPI_API_KEY`, `EXA_API_KEY` (if you use them)

The backend loads configuration from `backend/.env`, `backend/.env.local`, `.env`, and `.env.local`.

### Frontend (manual)

1. `cd frontend`
2. `npm install`
3. `npm run start:lan`

### Backend (manual)

1. `cd backend`
2. `python -m venv .venv`
3. `.venv\\Scripts\\activate`
4. `pip install -r requirements.txt`
5. `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

### Phone / emulator notes

- Android emulator backend address: `http://10.0.2.2:8000`
- Physical phone: set `BACKEND_PUBLIC_BASE_URL` to `http://YOUR_PC_LAN_IP:8000` and allow inbound connections to port `8000` on your firewall.

## Deployment

### Frontend on Vercel (static Expo web export)

The frontend deploys as a static site generated via `expo export --platform web` (scripted as `npm run build`).

1. Push this repo to GitHub (or GitLab).
2. In Vercel, create a new project from the repo.
3. Set **Root Directory** to `frontend/`.
4. Build settings (these match `frontend/vercel.json`):
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Add environment variables in Vercel (Project Settings → Environment Variables):
   - `EXPO_PUBLIC_API_BASE_URL=https://YOUR-SERVICE.onrender.com`

#### Firebase auth on Vercel

If you want account sync (email/password + Google popup on web), set these Vercel env vars:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Note: The web build reads `FIREBASE_*` via `frontend/app.config.js` and `expo-constants` so you do not need to rename them.

### Backend on Render (FastAPI)

You can deploy with the Blueprint (`render.yaml`) or set up a Web Service manually.

Manual setup:

1. Create a Render **Web Service** from this repo.
2. Set **Root Directory** to `backend/`.
3. Set:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables in Render (minimum):
   - `APP_ENV=production`
   - `BACKEND_PUBLIC_BASE_URL=https://YOUR-SERVICE.onrender.com`
   - `CORS_ALLOWED_ORIGINS=https://YOUR-VERCEL-SITE.vercel.app`
   - Provider keys you want enabled (for example `OPENAI_API_KEY`, plus search keys like `TAVILY_API_KEY` / `SERPAPI_API_KEY` as needed)

## Common Troubleshooting

- Mixed content errors on Vercel:
  - Ensure `EXPO_PUBLIC_API_BASE_URL` is an `https://` Render URL (not `http://...:8000`).
- Firebase “not configured” on Vercel:
  - Confirm the `FIREBASE_*` env vars are set in Vercel and redeploy.
