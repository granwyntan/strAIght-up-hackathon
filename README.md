# GramWIN

Health and wellness claim checker with:

- `backend/`: FastAPI API
- `frontend/`: Expo app for mobile and web

This repo originally included PowerShell launch scripts for Windows. It now also includes Python launch scripts so you can run it on macOS and Windows without needing PowerShell.

## What you need

- Python 3.10+
- Node.js 18+
- npm

Check that these work:

```bash
python3 --version
node --version
npm --version
```

On Windows, `python` usually works instead of `python3`.

## First-time setup

1. Copy the example env file:

```bash
cp backend/.env.example backend/.env
```

On Windows Command Prompt:

```cmd
copy backend\.env.example backend\.env
```

2. Open `backend/.env`
3. Fill in the API keys you want to use
4. Leave `BACKEND_PORT=8000` unless you specifically want a different port

## Easiest way to open the app

### macOS

Start both backend and frontend together:

```bash
python3 run_dev.py
```

If you want the app in your browser instead of Expo mobile mode:

```bash
python3 run_dev.py --web
```

### Windows

You can use either Python or the original PowerShell scripts.

Python:

```cmd
python run_dev.py
```

Browser mode:

```cmd
python run_dev.py --web
```

PowerShell:

```powershell
pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1
```

## Open backend and frontend separately

### macOS

Backend:

```bash
python3 run_backend.py
```

Frontend:

```bash
python3 run_frontend.py
```

Frontend in browser:

```bash
python3 run_frontend.py --web
```

### Windows

Backend:

```cmd
python run_backend.py
```

Frontend:

```cmd
python run_frontend.py
```

Frontend in browser:

```cmd
python run_frontend.py --web
```

## What these scripts do

`run_backend.py`

- creates `backend/.venv` if needed
- installs backend dependencies from `backend/requirements.txt`
- starts FastAPI with uvicorn

`run_frontend.py`

- installs frontend dependencies in `frontend/`
- generates `frontend/.env.local` from `backend/.env`
- starts Expo

`run_dev.py`

- starts the backend in the background
- starts the frontend in the foreground
- stops the backend when you exit

## If you want to open the app in a browser

Use:

```bash
python3 run_frontend.py --web
```

or:

```bash
python3 run_dev.py --web
```

Expo will print a local URL in the terminal, usually something like:

- `http://localhost:8081`

Open that URL in your browser.

## If you want to open the app on your phone

Run:

```bash
python3 run_dev.py
```

Then:

1. Install Expo Go on your phone
2. Make sure your phone and computer are on the same Wi‑Fi
3. Scan the QR code shown by Expo

## Useful options

Skip backend auto-reload:

```bash
python3 run_backend.py --no-reload
```

Update Python and frontend packages while starting:

```bash
python3 run_dev.py --update-deps
```

Override the API URL manually:

```bash
python3 run_frontend.py --api-base-url http://127.0.0.1:8000
```

## Troubleshooting

### `python3: command not found`

Try:

```bash
python --version
```

If `python` works, use `python` instead of `python3`.

### `npm: command not found`

Install Node.js from:

- https://nodejs.org/

### The frontend opens but cannot reach the backend

Check:

- `backend/.env` exists
- `BACKEND_PORT` matches what you expect
- the backend terminal says it started successfully

You can also force the frontend to use localhost:

```bash
python3 run_frontend.py --api-base-url http://127.0.0.1:8000
```

### I only want the backend API

Run:

```bash
python3 run_backend.py
```

Then open:

- `http://127.0.0.1:8000/docs`

## Legacy Windows scripts

These still work on Windows:

- `run-backend.ps1`
- `run-frontend.ps1`
- `run-dev.ps1`

They are no longer required on macOS because the Python launchers provide the same local workflow.
