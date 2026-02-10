"""Embeddings service using OpenAI text-embedding-3-small."""
from openai import OpenAI
from backend.core.config import settings

_client: OpenAI | None = None

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY not configured")
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def get_embedding(text: str) -> list[float]:
    """Get embedding vector for a single text."""
    client = _get_client()
    text = text.replace("\n", " ").strip()
    
    if not text:
        return [0.0] * EMBEDDING_DIM
    
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text
    )
    return response.data[0].embedding


def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Get embeddings for multiple texts in one API call."""
    client = _get_client()
    
    cleaned = [t.replace("\n", " ").strip() for t in texts]
    non_empty = [(i, t) for i, t in enumerate(cleaned) if t]
    
    if not non_empty:
        return [[0.0] * EMBEDDING_DIM for _ in texts]
    
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=[t for _, t in non_empty]
    )
    
    result = [[0.0] * EMBEDDING_DIM for _ in texts]
    for j, (i, _) in enumerate(non_empty):
        result[i] = response.data[j].embedding
    
    return result
