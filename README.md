# GramWIN

GramWIN is a multi-tool health app with an Expo frontend and a FastAPI backend.

It currently combines four main experiences:

- `Verify`: multi-agent investigation of health, wellness, diet, supplement, and medical claims
- `Consumables`: food and drink analysis, intake logging, and pattern tracking
- `Nutraceuticals`: medicine/drug deep-dives and supplement analysis
- `Activity`: workouts, routines, and lifestyle tracking

The app is designed to be profile-aware, visually clean, and conservative about evidence presentation.

## What The App Does

### 1. Verify

The claim investigator:

- breaks a claim into stages
- searches the web for supporting and opposing evidence
- validates source accessibility before showing evidence
- checks quote integrity
- scores consensus and confidence
- stores saved investigations and comparisons

The verify backend is centered around staged orchestration in [backend/app/core/orchestrator.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/core/orchestrator.py) and the API surface in [backend/app/main.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/main.py).

### 2. Consumables

The consumables flow covers:

- food analysis
- drink analysis
- meal and hydration logging
- previous AI analysis runs
- timeline, day, week, month, and year views

The current UI and storage live mainly in:

- [frontend/src/pages/CaloriesPage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/CaloriesPage.tsx)
- [frontend/src/components/calories/CalorieForm.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/components/calories/CalorieForm.tsx)
- [frontend/src/components/calories/CalorieResult.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/components/calories/CalorieResult.tsx)
- [frontend/src/pages/CalorieHistoryPage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/CalorieHistoryPage.tsx)
- [frontend/src/storage/calorieTrackerStorage.ts](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/storage/calorieTrackerStorage.ts)

### 3. Nutraceuticals

This screen combines:

- medicine/drug lookup and deep-dive analysis
- supplement analysis
- saved history
- logs of previous analyses

Main files:

- [frontend/src/pages/SupplementsPage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/SupplementsPage.tsx)
- [frontend/src/components/supplements/AnalysisResult.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/components/supplements/AnalysisResult.tsx)
- [frontend/src/components/supplements/DrugDeepDiveResult.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/components/supplements/DrugDeepDiveResult.tsx)
- [backend/app/routes/supplements.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/routes/supplements.py)
- [backend/app/services/supplement_analyzer.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/services/supplement_analyzer.py)

### 4. Activity

The activity tool includes:

- exercise logging
- routine generation
- workout tasks
- profile-aware suggestions

Main files:

- [frontend/src/pages/ActivityPage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/ActivityPage.tsx)
- [backend/app/routes/workout_routes.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/routes/workout_routes.py)

### 5. Onboarding And Profile

GramWIN uses onboarding and a reusable profile store to support:

- conditions
- allergies
- family history
- diet preferences
- goals
- medication/supplement context
- personalization flags

Main files:

- [frontend/src/components/profile/OnboardingSheet.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/components/profile/OnboardingSheet.tsx)
- [frontend/src/pages/ProfilePage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/ProfilePage.tsx)
- [frontend/src/storage/profileStorage.ts](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/storage/profileStorage.ts)

## Stack

### Frontend

- Expo
- React Native
- TypeScript
- React Native Paper
- Expo Vector Icons
- Poppins font
- NativeWind/Tailwind support where useful
- Firebase client-side account sync support

Frontend dependencies are defined in [frontend/package.json](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/package.json).

### Backend

- FastAPI
- Python
- SQLite persistence for investigations and local workflow state
- provider-based orchestration for research and reasoning stages

### Search + AI Providers

The backend can use some or all of:

- OpenAI
- Anthropic Claude
- Google Gemini
- xAI
- DeepSeek
- NLP Cloud
- Tavily
- SerpAPI
- Exa

Actual availability depends on which API keys are present in `backend/.env`.

## Repo Structure

- `frontend/` Expo application
- `backend/` FastAPI application
- `run-backend.ps1` start backend locally
- `run-frontend.ps1` start Expo locally
- `run-dev.ps1` start both

## Environment Setup

The backend env file is the source of truth.

### Main runtime file

- [backend/.env.example](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/.env.example)

Create:

- `backend/.env`

Then fill in the values you need.

### Important note

The frontend launcher reads `backend/.env` and generates `frontend/.env.local` automatically. That means:

- backend URLs should be managed in `backend/.env`
- Firebase env values should also be managed from `backend/.env`
- you usually do not need to edit `frontend/.env.local` manually

## Running Locally

### Quick start from repo root

```powershell
pwsh -ExecutionPolicy Bypass -File .\run-backend.ps1
pwsh -ExecutionPolicy Bypass -File .\run-frontend.ps1
```

Or:

```powershell
pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1
```

### Frontend only

```powershell
cd frontend
npm install
npx expo start --clear
```

### Backend only

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

Some core routes from [backend/app/main.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/main.py):

- `GET /health`
- `GET /api/bootstrap`
- `GET /api/investigations`
- `POST /api/investigations`
- `GET /api/investigations/{id}`
- `POST /api/investigations/{id}/cancel`
- `POST /api/investigations/compare`
- `DELETE /api/investigations/{id}`
- `DELETE /api/investigations`
- `GET /api/claim-suggestions`
- `GET /api/search-suggestions`

Additional feature routers include:

- calorie/consumables routes
- supplements/nutraceutical routes
- workout/activity routes

## UI Notes

The current UI direction is:

- green minimal palette
- Poppins typography
- card-based layouts
- mobile-first spacing
- consistent top navigation across tools

App icon assets are expected in:

- [frontend/assets/app-icons](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/assets/app-icons)

## Current Important Files

If you need to change major behavior, these are the most useful starting points:

- [frontend/App.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/App.tsx)
- [frontend/src/pages/CaloriesPage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/CaloriesPage.tsx)
- [frontend/src/pages/SupplementsPage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/SupplementsPage.tsx)
- [frontend/src/pages/ActivityPage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/ActivityPage.tsx)
- [frontend/src/pages/ProfilePage.tsx](C:/Users/granw/Downloads/strAIght-up-hackathon/frontend/src/pages/ProfilePage.tsx)
- [backend/app/main.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/main.py)
- [backend/app/core/orchestrator.py](C:/Users/granw/Downloads/strAIght-up-hackathon/backend/app/core/orchestrator.py)

## Verification

Typical checks:

```powershell
cd frontend
npm exec tsc --noEmit
```

```powershell
cd backend
.venv\Scripts\python.exe -m compileall app
```

## Security

Do not commit real secrets.

If any API keys or tokens were ever pasted into chat, logs, screenshots, or tracked files, rotate them.
