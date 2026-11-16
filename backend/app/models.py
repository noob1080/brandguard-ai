from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    draft: str = Field(min_length=1, max_length=20_000)
    top_k: int = Field(default=3, ge=3, le=3)


class RetrievalEvalCase(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    expected_chunk: int = Field(ge=1)


class RetrievalEvalRequest(BaseModel):
    cases: list[RetrievalEvalCase] = Field(min_length=1, max_length=200)
    top_k: int = Field(default=3, ge=1, le=10)


class Guideline(BaseModel):
    id: str
    text: str
    source: str
    chunk: int


class Finding(BaseModel):
    id: str
    category: str
    severity: str
    original_text: str
    suggested_text: str
    explanation: str
    guideline: str
    source: str
    start: int
    end: int
    citation_verified: bool = True
    source_start: int = 0
    source_end: int = 0


class IngestResponse(BaseModel):
    filename: str
    chunks_indexed: int
    guidelines: list[Guideline]


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    retrieved_guidelines: list[Guideline]
    score: int
    summary: str
    engine: str

