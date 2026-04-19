# GramWIN

Health and Wellness at your fingertips.

A multi-agent health-claim credibility app with an Expo frontend and a FastAPI backend. The backend is designed to minimize hallucination by validating sources and quotes before they can appear in the UI, and by cross-checking sentiment across multiple LLM roles.

## Product focus

- Investigate health and wellness claims with a staged multi-agent workflow
- Validate source accessibility and quote integrity before rendering evidence
- Score evidence with calibrated source weights, stance confidence factors, contradiction penalties, and cross-model checks
- Persist investigation history, agent runs, and progress logs in SQLite
- Review results in a mobile-friendly Expo frontend

## Stack

- Frontend: Expo + React Native + TypeScript
- Backend: FastAPI + Python
- Search: SerpAPI (breadth) + Tavily (depth)
- Multi-LLM: OpenAI, Claude, Gemini, xAI, DeepSeek (optional; driven by env keys)
- Optional NLP specialist: NLP Cloud for entity extraction, semantic classification, and ambiguity-breaking stance support

## Structure

- `frontend/` Expo React Native client
- `backend/` FastAPI API

## Pipeline (high level)

- Claim understanding: semantic subject/action/outcome + claim-strength score
- Query generation: meaning-preserving search queries with synonyms and contradiction paths
- Retrieval: SerpAPI breadth + Tavily depth (or offline seeded sources), cached with TTLs
- Source validation: discard dead/inaccessible pages, extract readable text, cache extracted content
- Quote verification: only show quotes that match extracted text
- Dual sentiment: scientific + critical passes; disagreements downgrade to neutral and reduce weight
- Weighted consensus: source weight × stance × confidence factor, then normalized and calibrated to 0-100
- Cross-agent validation: reviewer + challenger adjust and flag overclaiming
- Final-output caching: repeat investigations can return fresh cached decisions immediately

## Agent architecture

- Claim Analyst: Medical doctor style claim parsing and clinical wording review
- Research Agent: Scientist-style retrieval across supporting and contradiction-seeking searches
- Validation Agent: Data engineer style link and extraction integrity checks
- Stance Agent: Epidemiologist style evidence interpretation per source
- Consensus Agent: Statistician style weighting and calibration
- Verifier Agent: Auditor style hallucination and mismatch detection
- Summary Agent: Health communicator style plain-language result writing

## User-facing result states

- Trustworthy: stronger evidence leans in the same direction with high confidence
- Uncertain: evidence is mixed, limited, or too weak for a firm conclusion
- Untrustworthy: stronger evidence contradicts the claim or fails to support the wording

## Scoring explanation

The backend scores each source by combining:

- source tier weight
- stance direction
- confidence factor

Those source contributions are normalized into a credibility score from `0` to `100`. Strong unsupported claims, overstated wording, and heavy contradiction pressure apply explicit penalties before the final verdict is returned. Source tiers and their weights now live in `backend/app/config/source_tiers.json`, while the UI intentionally hides formulas and backend mechanics.

## Data flow

1. The claim is parsed semantically as one health assertion.
2. Query planning expands it into evidence and contradiction searches.
3. Search retrieval gathers sources with caching and fallback behavior.
4. Validation keeps only reachable, readable sources.
5. Quote checks remove any unsupported quote text.
6. Dual stance review judges each source as supporting, uncertain, or contradicting.
7. Consensus and verifier passes calibrate confidence and reduce hallucination risk.
8. A summary pass rewrites the result in plain language for the app.

## Limitations

- Live search quality still depends on configured third-party providers and API availability.
- Seeded offline data is useful for demos, but it is not a substitute for live evidence retrieval.
- The mobile UI is intentionally lightweight and still has placeholder sections for nutrition, supplements, and profile workflows.
- NLP Cloud support is optional and should refine ambiguous cases rather than replace the core reasoning pipeline.
- This app is for claim evaluation, not diagnosis or personal medical advice.

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
- `NLPCLOUD_API_KEY`
- `TAVILY_API_KEY`
- `SERPAPI_API_KEY`

4. Source tiers and weights are configured through:

- `SOURCE_TIER_CONFIG_PATH`
- Default file: `backend/app/config/source_tiers.json`

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
