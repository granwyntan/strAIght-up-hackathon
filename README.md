# GramWIN

Health and Wellness at your fingertips.

GramWIN is a health and wellness claim verification app with:

- `backend/`: FastAPI API and multi-agent evidence pipeline
- `frontend/`: Expo app for mobile and web

It is built to investigate claims, validate evidence, detect overstatement, and present a clean user-facing verdict without exposing the backend math in the UI.

## What GramWIN does

For users:

- Check whether a health or wellness claim looks trustworthy, uncertain, or untrustworthy
- Review supporting, mixed, and contradicting evidence in a clean mobile-friendly interface
- Reopen saved claim investigations from history

For developers:

- Run a staged multi-agent health-claim verification pipeline
- Validate source accessibility and quote integrity before rendering evidence
- Score evidence with calibrated weights, contradiction penalties, and cross-model checks
- Cache search, extraction, and final outputs to reduce cost and repeated work
- Persist investigations, agent runs, and progress logs in SQLite

## Result states

The app only shows 3 end-user states:

- `Trustworthy`
- `Uncertain`
- `Untrustworthy`

This is intentional. Internally, the backend may track more nuance, but the UI stays simple.

## Core stack

- Frontend: Expo + React Native + TypeScript
- Backend: FastAPI + Python
- Search: SerpAPI for breadth, Tavily for deeper retrieval
- LLM orchestration: OpenAI, Claude, Gemini, xAI, DeepSeek
- Optional NLP refinement: NLP Cloud
- Persistence: SQLite

## How the system works

GramWIN does not just summarize claims. It runs an evidence audit pipeline:

1. Claim analysis
   The claim is interpreted semantically as one full health assertion, including subject, intervention, outcome, relationship type, and claim strength.

2. Query planning
   The system generates multiple evidence-seeking and contradiction-seeking search paths using synonyms, medical phrasing, and inverse queries.

3. Retrieval
   SerpAPI and Tavily gather candidate sources. Search results are cached to reduce repeated calls.

4. Source validation
   Dead links, inaccessible pages, and low-signal extractions are removed before scoring.

5. Quote verification
   Quotes are only shown if they map back to accessible source text.

6. Stance detection
   Sources are judged as supportive, neutral, or contradicting using dual-model review and conservative rules around limited evidence.

7. Consensus scoring
   Evidence is weighted by source tier, evidence quality, and confidence factors, then calibrated to a 0-100 credibility score.

8. Final summary
   A plain-language explanation is produced for users while technical logic stays in the backend and docs.

## Multi-agent architecture

Each stage has a professional role:

- Claim Analyst: doctor-style clinical reasoning and claim parsing
- Research Agent: scientist-style literature and evidence retrieval
- NLP Agent: linguist-style semantic parsing and classification via NLP Cloud
- Validation Agent: data engineer-style link and extraction integrity checks
- Stance Agent: epidemiologist-style evidence interpretation
- Consensus Agent: statistician-style weighting and calibration
- Verifier Agent: auditor-style hallucination and inconsistency checks
- Summary Agent: health communicator-style user-facing explanation

## NLP Cloud in GramWIN

NLP Cloud is optional, but supported as a refinement layer.

It is used to improve:

- semantic claim parsing
- entity extraction
- ambiguity handling in stance refinement

Important:

- NLP Cloud is not the single source of truth
- it should refine ambiguous cases, not replace the main reasoning pipeline
- the app still works without it if `NLPCLOUD_API_KEY` is not configured

## Truth logic and interpretation rules

These rules are important to how the system behaves:

- Strong positive claim + lack of strong support should trend toward disagreement
- Strong negative claim + lack of contradiction can trend toward agreement
- Overstated wording like `cures`, `guaranteed`, or `definitely` is penalized
- `No evidence`, `not associated`, and similar phrasing count as negative
- `Inconclusive`, `limited evidence`, and similar phrasing count as neutral, not support
- Semantic meaning matters more than keyword matching

## Scoring model

The backend combines:

- source tier weight
- stance direction
- confidence factor

Source tiers are configured in:

- `backend/app/config/source_tiers.json`

Default weights:

- Verified authorities: `1.0`
- Established scientific or clinical sources: `0.75`
- General sources: `0.4`

The pipeline then:

1. sums weighted evidence
2. normalizes the score
3. calibrates it to `0-100`
4. applies penalties for unsupported strong claims, overstated wording, and contradiction pressure

The UI intentionally does not show formulas. The backend owns the scoring logic.

## Source tiers

Source tier configuration is no longer stored as long comma-separated env vars.

Instead, GramWIN reads a JSON file:

- `SOURCE_TIER_CONFIG_PATH=backend/app/config/source_tiers.json`

This makes it easier to:

- edit domain lists
- tune weights
- version-control source policy cleanly

## Caching and performance

The backend uses caching aggressively:

- search result cache
- extraction cache
- final result cache

The pipeline also uses async concurrency for:

- search
- validation
- extraction
- stance review

This helps reduce latency and cost, especially when the same or similar claims are investigated repeatedly.

## Repository structure

- `backend/app/agents/`: claim analysis, search planning, validation, scoring, reporting
- `backend/app/core/`: orchestration and scoring
- `backend/app/tools/`: retrieval helpers and search logic
- `backend/app/config/`: source tier configuration
- `backend/app/knowledge/`: seeded fallback knowledge and bootstrap content
- `frontend/`: Expo application

## Requirements

- Python `3.10+`
- Node.js `18+`
- npm

Check your environment:

```bash
python3 --version
node --version
npm --version
```

On Windows, `python` often works instead of `python3`.

## First-time setup

1. Copy the env template:

```bash
cp backend/.env.example backend/.env
```

Windows Command Prompt:

```cmd
copy backend\.env.example backend\.env
```

2. Open `backend/.env`

3. Fill in whichever providers you want to use:

- `OPENAI_API_KEY`
- `CLAUDE_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `NLPCLOUD_API_KEY`
- `TAVILY_API_KEY`
- `SERPAPI_API_KEY`

4. Leave `BACKEND_PORT=8000` unless you explicitly want another port

5. Review these useful config values:

- `SOURCE_TIER_CONFIG_PATH`
- `SEARCH_QUERY_BUDGET_STANDARD`
- `SEARCH_QUERY_BUDGET_DEEP`
- `SOURCE_TARGET_STANDARD`
- `SOURCE_TARGET_DEEP`
- `TAVILY_MAX_RESULTS`
- `SERPAPI_NUM_RESULTS`

## Running the project

### Start backend and frontend together

Python:

```bash
python3 run_dev.py
```

Browser mode:

```bash
python3 run_dev.py --web
```

Windows PowerShell still works too:

```powershell
pwsh -ExecutionPolicy Bypass -File .\run-dev.ps1
```

### Run the backend only

macOS/Linux:

```bash
python3 run_backend.py
```

Windows:

```cmd
python run_backend.py
```

### Run the frontend only

macOS/Linux:

```bash
python3 run_frontend.py
```

Windows:

```cmd
python run_frontend.py
```

### Run the frontend in a browser

macOS/Linux:

```bash
python3 run_frontend.py --web
```

Windows:

```cmd
python run_frontend.py --web
```

## What the helper scripts do

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

## Using the app on the web

Run:

```bash
python3 run_dev.py --web
```

or:

```bash
python3 run_frontend.py --web
```

Expo will print a local URL, usually something like:

- `http://localhost:8081`

## Using the app on a phone

Run:

```bash
python3 run_dev.py
```

Then:

1. install Expo Go
2. make sure your phone and computer are on the same Wi-Fi
3. scan the QR code shown by Expo

## Useful options

Skip backend auto-reload:

```bash
python3 run_backend.py --no-reload
```

Update backend and frontend packages while starting:

```bash
python3 run_dev.py --update-deps
```

Override the frontend API URL manually:

```bash
python3 run_frontend.py --api-base-url http://127.0.0.1:8000
```

## Troubleshooting

### `python3: command not found`

Try:

```bash
python --version
```

If that works, use `python` instead of `python3`.

### `npm: command not found`

Install Node.js, then verify:

```bash
node --version
npm --version
```

### The frontend opens but cannot reach the backend

Check:

- `backend/.env` exists
- `BACKEND_PORT` is what you expect
- the backend started successfully

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

## Limitations

- Live retrieval quality still depends on third-party APIs and network reliability
- Seeded fallback knowledge is useful for demos, not a replacement for live retrieval
- Some product tabs are still placeholders while the main claim-investigation workflow is the primary shipped experience
- NLP Cloud is optional and should be treated as a helper, not the main reasoning engine
- GramWIN evaluates claims; it does not provide diagnosis or personal medical advice

## Legacy Windows scripts

These still work on Windows:

- `run-backend.ps1`
- `run-frontend.ps1`
- `run-dev.ps1`

They are no longer required on macOS because the Python launchers provide the same local workflow.
