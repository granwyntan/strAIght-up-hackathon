# Verity Lens

A multi-agent health claim investigation app with an Expo frontend and FastAPI backend.

## Product focus

- Investigate health and wellness claims with a staged multi-agent workflow
- Score source quality, study quality, citation integrity, and cross-source agreement
- Persist investigation history, agent runs, and progress logs in SQLite
- Review results in a mobile-friendly Expo frontend

## Stack

- Frontend: Expo + React Native + TypeScript
- Backend: FastAPI + Python
- AI/CV path: image upload from the mobile app, structured analysis from the backend, and a vision model integration point for food and medicine recognition

## Structure

- `frontend/` Expo React Native client
- `backend/` FastAPI API

## Run locally

### Quick scripts

From the repository root:

- `pwsh -ExecutionPolicy Bypass -File .\run-backend.ps1`
- `pwsh -ExecutionPolicy Bypass -File .\run-frontend.ps1`
- `pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1`

### Configuration

1. Copy `backend/.env.example` to `backend/.env`
2. Update the deployment/runtime values first:

- `BACKEND_HOST`
- `BACKEND_PORT`
- `BACKEND_PUBLIC_BASE_URL`
- `CORS_ALLOWED_ORIGINS`

3. Then fill in the provider keys you want to use:

- `OPENAI_API_KEY`
- `TAVILY_API_KEY`
- `SERPAPI_API_KEY`

The backend loads configuration from:

- `backend/.env`
- `backend/.env.local`
- `.env`
- `.env.local`

The frontend launcher reads `backend/.env` and generates `frontend/.env.local` automatically, so you should not need to type API addresses into the app for normal local use.

Optional frontend API override:

- `pwsh -ExecutionPolicy Bypass -File .\run-frontend.ps1 -ApiBaseUrl http://127.0.0.1:8000`
- `pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1 -ApiBaseUrl http://127.0.0.1:8000`

If `-ApiBaseUrl` is omitted, `run-frontend.ps1` uses `BACKEND_PUBLIC_BASE_URL` first and also generates fallback candidates from your machine's current LAN IPs.

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
