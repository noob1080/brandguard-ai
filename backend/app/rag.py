"""LangChain chunking plus persistent Chroma retrieval for the active guide."""
import json
import os
from pathlib import Path
from uuid import uuid4

import chromadb
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CHROMA_DIR = DATA_DIR / "chroma"
COLLECTION_NAME = "brand_guidelines"
ACTIVE_COLLECTION_FILE = DATA_DIR / "active_collection.json"


def _client():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMA_DIR))


def _active_collection_name() -> str:
    try:
        pointer = json.loads(ACTIVE_COLLECTION_FILE.read_text(encoding="utf-8"))
        name = pointer.get("collection")
        if isinstance(name, str) and name:
            return name
    except (OSError, ValueError, AttributeError):
        pass
    # Keep existing installations that predate the active-guide pointer readable.
    return COLLECTION_NAME


def _collection(name: str | None = None):
    client = _client()
    collection_name = name or _active_collection_name()
    try:
        collection = client.get_collection(collection_name)
    except Exception:
        collection = client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )
    return client, collection


def chunks_from_text(text: str, filename: str) -> list[dict]:
    source_doc = Document(page_content=text, metadata={"source": filename})
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=60,
        separators=["\n\n", "\n", ". ", "; ", " ", ""],
    )
    split_docs = splitter.split_documents([source_doc])
    return [
        {"id": str(uuid4()), "text": doc.page_content,
         "source": filename, "chunk": index + 1}
        for index, doc in enumerate(split_docs)
        if doc.page_content.strip()
    ]


def save_guidelines(text: str, filename: str) -> list[dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    chunks = chunks_from_text(text, filename)
    if not chunks:
        raise ValueError("The guide did not contain any indexable text.")

    client = _client()
    previous_name = _active_collection_name()
    staging_name = f"brand_guidelines_{uuid4().hex}"
    staging = None
    try:
        staging = client.create_collection(
            name=staging_name,
            metadata={"hnsw:space": "cosine", "source": filename},
        )
        staging.add(
            ids=[chunk["id"] for chunk in chunks],
            documents=[chunk["text"] for chunk in chunks],
            metadatas=[{"source": chunk["source"], "chunk": chunk["chunk"]} for chunk in chunks],
        )
        if staging.count() != len(chunks):
            raise RuntimeError("The indexed guide did not pass its chunk-count check.")

        # Flip the active pointer only after Chroma has embedded and stored every chunk.
        pointer_tmp = ACTIVE_COLLECTION_FILE.with_name(f"{ACTIVE_COLLECTION_FILE.name}.{uuid4().hex}.tmp")
        try:
            with pointer_tmp.open("w", encoding="utf-8") as pointer_file:
                json.dump({"collection": staging_name}, pointer_file)
                pointer_file.flush()
                os.fsync(pointer_file.fileno())
            os.replace(pointer_tmp, ACTIVE_COLLECTION_FILE)
        finally:
            pointer_tmp.unlink(missing_ok=True)
    except Exception:
        if staging is not None:
            try:
                client.delete_collection(staging_name)
            except Exception:
                pass
        raise

    if previous_name != staging_name:
        try:
            client.delete_collection(previous_name)
        except Exception:
            # The new collection is already active; stale data is harmless and can be
            # cleaned up later without risking the working guide.
            pass
    return chunks


def load_guidelines() -> list[dict]:
    try:
        _, collection = _collection()
        result = collection.get(include=["documents", "metadatas"])
    except Exception:
        return []
    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []
    ids = result.get("ids") or []
    rows = [
        {"id": ids[index], "text": content, "source": (meta or {}).get("source", "brand-guide.txt"),
         "chunk": (meta or {}).get("chunk", index + 1)}
        for index, (content, meta) in enumerate(zip(documents, metadatas))
    ]
    return sorted(rows, key=lambda row: row["chunk"])


def retrieve(query: str, top_k: int = 3) -> list[dict]:
    try:
        _, collection = _collection()
        total = collection.count()
        if not total:
            return []
        result = collection.query(
            query_texts=[query],
            n_results=min(top_k, total),
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        return []
    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    ids = (result.get("ids") or [[]])[0]
    return [
        {"id": ids[index], "text": doc, "source": (meta or {}).get("source", "brand-guide.txt"),
         "chunk": (meta or {}).get("chunk", index + 1)}
        for index, (doc, meta) in enumerate(zip(docs, metas))
    ]
