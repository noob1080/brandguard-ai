import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .analyzer import analyze
from .models import AnalyzeRequest, AnalyzeResponse, IngestResponse, RetrievalEvalRequest
from .rag import evaluate_retrieval, load_guidelines, save_guidelines

load_dotenv()

app = FastAPI(title="Rulebook Reviewer API", version="0.1.0")
logger = logging.getLogger(__name__)
allowed_origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    rules = load_guidelines()
    return {"ok": True, "guidelines_loaded": bool(rules), "chunks": len(rules),
            "ai_enabled": bool(os.getenv("OPENAI_API_KEY"))}


@app.get("/api/guidelines")
def get_guidelines():
    return {"guidelines": load_guidelines()}


@app.post("/api/ingest", response_model=IngestResponse)
async def ingest(file: UploadFile = File(...)):
    filename = file.filename or "brand-guide.txt"
    if not filename.lower().endswith((".txt", ".md")):
        raise HTTPException(415, "Please upload a .txt or .md guideline file.")
    raw = await file.read(1_000_001)
    if len(raw) > 1_000_000:
        raise HTTPException(413, "The guide is too large. Please keep it under 1 MB.")
    try:
        content = raw.decode("utf-8-sig").strip()
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "Please save the guide as a UTF-8 text file.") from exc
    if len(content) < 10:
        raise HTTPException(400, "The guide looks empty. Add a few guideline sentences and retry.")
    try:
        chunks = save_guidelines(content, filename)
    except Exception as exc:
        logger.exception("Could not stage the uploaded brand guide")
        raise HTTPException(
            503,
            "The guide could not be indexed. The previous approved guide is still active; please try again.",
        ) from exc
    return {"filename": filename, "chunks_indexed": len(chunks), "guidelines": chunks}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_draft(request: AnalyzeRequest):
    if not load_guidelines():
        raise HTTPException(409, "Upload or load a brand guide before analyzing a draft.")
    return analyze(request.draft, request.top_k)


@app.post("/api/evaluate-retrieval")
def evaluate_guideline_retrieval(request: RetrievalEvalRequest):
    if not load_guidelines():
        raise HTTPException(409, "Upload or load a brand guide before evaluating retrieval.")
    return evaluate_retrieval([case.model_dump() for case in request.cases], request.top_k)

