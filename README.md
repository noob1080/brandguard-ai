# BrandGuard AI

**Smart guardrails for your brand’s voice. AI precision. Human decision.**

BrandGuard AI helps creators check campaign copy against a company’s approved brand rules. A manager loads the guide into the backend; creators work from the active rules and only upload or paste their draft. Every finding includes its source rule, and the creator chooses whether to accept or reject each edit.

## The judging workflow

1. Open the centered composer with its active approved guidelines.
2. Paste campaign copy or choose **Upload script** to load a `.txt` or `.md` draft.
3. Select **Analyze draft** to switch to the focused findings and output view.
4. Review each finding, its suggested replacement, and its guideline citation. Accept edits one by one or accept all pending edits at once; reject a finding to leave that text unchanged.
5. When all findings have a decision, edit the final output preview and export it as PDF, editable Word `.docx`, or UTF-8 text.

The sample workspace loads a ten-rule guide and a draft with deliberate issues so the flow can be tried immediately. If the API is unavailable, browser-local checks keep the review loop usable for the static demo.

## Technology

- **Frontend:** React and Vite with custom CSS. The creator workspace includes a centered composer, a focused findings/output view, script upload, review cards, decision controls, and a scrollable list of the active approved guidelines.
- **API:** FastAPI provides `/api/health`, `/api/guidelines`, `/api/ingest`, and `/api/analyze`.
- **Ingestion:** LangChain’s `RecursiveCharacterTextSplitter` chunks UTF-8 text and Markdown guides. The backend stages a new ChromaDB collection and switches the active-guide pointer only after indexing completes, so a failed replacement keeps the previous guide active.
- **Retrieval:** Analysis retrieves up to the three most relevant passages from the active guide before grading.
- **Grading:** With `OPENAI_API_KEY`, LangChain requests structured findings from the configured model. The backend verifies each citation against retrieved text and the matched phrase against the draft. Without a key, the API uses a deterministic rule matcher. The static demo uses its own deterministic browser checker; it does not make LLM or ChromaDB calls.
- **Human review:** Accept applies the replacement; reject leaves the draft intact. After review, the editable final output can be exported as PDF, TXT, or DOCX. The current draft is saved in browser storage.
- **Round 3 depth:** Citation checks expose the exact matched source rule; the backend includes a top-k retrieval benchmark; and the creator can compare and restore locally saved draft and decision versions.

## Run locally

Start the API:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

To enable model grading, set `OPENAI_API_KEY` in `backend/.env` (see `.env.example`). The Chroma retrieval and deterministic grader work without a key.

In a second terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL. The development server proxies `/api` to `http://localhost:8000`.

Managers can ingest the approved `.txt` or `.md` guide through `POST /api/ingest`. The creator interface deliberately has no rulebook-editing controls; it presents the current approved guide and focuses on draft review.

## Round 1 plan and current scope

The central proposed loop—rule ingestion, retrieval, grounded findings, citations, and human accept/reject decisions—is implemented. The creator screen now assumes the manager has already set the active rulebook. This keeps the judge-facing path focused on the creator’s task while the API retains the ingestion endpoint for the manager workflow. The static demo includes a local deterministic path so the end-to-end interaction remains available without a hosted backend.

This is a single-workspace prototype. It does not yet include authentication, isolated multi-company data, or persistent decision history. The public static demo does not host FastAPI or ChromaDB; use the local setup above for the full backend path.

## Round 3 improvements implemented

1. **Retrieval quality benchmark:** the review workspace can measure whether expected guideline chunks appear in the top three ChromaDB results, reporting recall@3 and mean reciprocal rank. When the backend is unavailable, the demo runs its deterministic local benchmark.
2. **Citation verification:** findings include a verified citation and source span, and creators can inspect the exact rule behind a suggestion before deciding.
3. **Versioned review history:** draft versions and accept/reject decisions can be compared and restored from browser storage on the same device. This prototype does not yet sync history across devices or use SQLite for revision storage.

The browser demo remains a deterministic local checker; ChromaDB retrieval and optional LLM grading are available when the FastAPI backend is running. The public static app does not currently host that backend.

## Deploy the browser demo to Vercel

Import this repository into Vercel from its root directory. `vercel.json` installs the frontend dependencies, builds the Vite app, and publishes the generated `dist` folder. This deploys the browser demo only; it does not host FastAPI, ChromaDB, or the optional LLM service.

