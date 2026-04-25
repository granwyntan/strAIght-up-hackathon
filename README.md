# GramWIN

Health and Wellness at your fingertips.

A multi-agent health-claim credibility app with an Expo frontend and a FastAPI backend. The backend is designed to minimize hallucination by validating sources and quotes before they can appear in the UI, and by cross-checking sentiment across multiple LLM roles.

## Product focus

- Investigate health and wellness claims with a staged multi-agent workflow
- Validate source accessibility and quote integrity before rendering evidence
- Score source quality, evidence depth, citation integrity, weighted consensus, and agreement penalties
- Persist investigation history, agent runs, and progress logs in SQLite
- Review results in a mobile-friendly Expo frontend

## Stack

- Frontend: Expo + React Native + TypeScript
- Backend: FastAPI + Python
- Search: SerpAPI (breadth) + Tavily (depth)
- Multi-LLM: OpenAI, Claude, Gemini, xAI, DeepSeek (optional; driven by env keys)

## Structure

- `frontend/` Expo React Native client
- `backend/` FastAPI API

## Pipeline (high level)

- Claim understanding: semantic subject/action/outcome + claim-strength score
- Query generation: meaning-preserving search queries
- Retrieval: SerpAPI breadth + Tavily depth (or offline seeded sources)
- Source validation: discard dead/inaccessible pages, extract readable text
- Quote verification: only show quotes that match extracted text
- Dual sentiment: scientific + critical passes; disagreements downgrade to neutral and reduce weight
- Weighted consensus: source weight × sentiment × agreement factor
- Cross-agent validation: reviewer + challenger adjust and flag overclaiming

## Run locally

### Quick scripts

From the repository root:

- `pwsh -ExecutionPolicy Bypass -File .\run-backend.ps1`
- `pwsh -ExecutionPolicy Bypass -File .\run-frontend.ps1`
- `pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1`

### Configuration

1. Copy `backend/.env.example` to `backend/.env` (do not commit it)
2. Update the deployment/runtime values first:

- `BACKEND_HOST`
- `BACKEND_PORT`
- `BACKEND_PUBLIC_BASE_URL`
- `CORS_ALLOWED_ORIGINS`

3. Then fill in the providers you want to use:

- `OPENAI_API_KEY`
- `CLAUDE_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `TAVILY_API_KEY`
- `SERPAPI_API_KEY`

The backend loads configuration from:

- `backend/.env`
- `backend/.env.local`
- `.env`
- `.env.local`

The frontend launcher reads `backend/.env` and generates `frontend/.env.local` automatically. Users should not need to type API addresses into the app for normal local use.

Optional frontend API override:

- `pwsh -ExecutionPolicy Bypass -File .\run-frontend.ps1 -ApiBaseUrl http://127.0.0.1:8000`
- `pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1 -ApiBaseUrl http://127.0.0.1:8000`

If `-ApiBaseUrl` is omitted, `run-frontend.ps1` uses `BACKEND_PUBLIC_BASE_URL` first and also generates fallback candidates from your machine's current LAN IPs.

### Phone / emulator notes

- Android emulator: `http://10.0.2.2:8000`
- Physical phone: set `BACKEND_PUBLIC_BASE_URL` to `http://YOUR_PC_LAN_IP:8000` and ensure your firewall allows inbound connections to port `8000`.

### Frontend

1. `cd frontend`
2. `npm install`
3. `npm run start:lan`

For Android emulators, `http://10.0.2.2:8000` is still added automatically as a fallback candidate.

### Backend

1. `cd backend`
2. `python -m venv .venv`
3. `.venv\\Scripts\\activate`
4. `pip install -r requirements.txt`
5. `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

If you launch from VS Code, use the `Backend: FastAPI` launch configuration so the API is reachable from emulators and devices on your local network.

## Deploy

### Frontend to Vercel (static web export)

This Expo app is deployed as a static site using `expo export --platform web`.

1. Push this repo to GitHub (or GitLab).
2. In Vercel, create a new project and select the repo.
3. Set the project **Root Directory** to `frontend/`.
4. Confirm build settings (these match `frontend/vercel.json`):
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Add environment variables in Vercel (Project Settings -> Environment Variables):
   - `EXPO_PUBLIC_API_BASE_URL` = your Render backend URL (for example `https://YOUR-SERVICE.onrender.com`)

### Backend to Render (FastAPI)

Render runs the backend as a Python Web Service using `uvicorn`.

1. In Render, create a new **Web Service** from this repo.
2. Set **Root Directory** to `backend/`.
3. Set:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables in Render (at minimum):
   - `APP_ENV=production`
   - `BACKEND_PUBLIC_BASE_URL=https://YOUR-SERVICE.onrender.com`
   - `CORS_ALLOWED_ORIGINS=https://YOUR-VERCEL-SITE.vercel.app`
   - Provider keys you want enabled (for example `OPENAI_API_KEY`, plus any of `TAVILY_API_KEY`, `SERPAPI_API_KEY`, etc.)

Note: `render.yaml` at the repo root can also be used to deploy with Render Blueprints; it assumes the backend service name `gramwin-backend` and `backend/` as the root dir.
