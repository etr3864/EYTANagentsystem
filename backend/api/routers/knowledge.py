"""Knowledge Base API routes - Documents and Tables."""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.core.database import get_db
from backend.services import documents, tables

router = APIRouter(prefix="/agents/{agent_id}/knowledge", tags=["knowledge"])


class SearchQuery(BaseModel):
    query: str
    limit: int = 5


class TableQuery(BaseModel):
    filters: Optional[dict] = None


class AggregateQuery(BaseModel):
    column: str
    operation: str  # count, sum, avg, min, max


# === Documents ===

@router.get("/documents")
def list_documents(agent_id: int, db: Session = Depends(get_db)):
    """List all documents for an agent."""
    docs = documents.get_by_agent(db, agent_id)
    return [
        {
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "chunk_count": doc.chunk_count,
            "created_at": doc.created_at.isoformat()
        }
        for doc in docs
    ]


@router.post("/documents")
async def upload_document(
    agent_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a document (PDF, DOCX)."""
    content = await file.read()
    try:
        doc = documents.upload(db, agent_id, file.filename, content)
        return {"id": doc.id, "filename": doc.filename, "chunks": doc.chunk_count}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/documents/{doc_id}")
def delete_document(agent_id: int, doc_id: int, db: Session = Depends(get_db)):
    """Delete a document."""
    if not documents.delete(db, doc_id):
        raise HTTPException(404, "Document not found")
    return {"message": "deleted"}


@router.post("/documents/search")
def search_documents(agent_id: int, data: SearchQuery, db: Session = Depends(get_db)):
    """Semantic search in documents."""
    results = documents.search(db, agent_id, data.query, data.limit)
    return results


# === Data Tables ===

@router.get("/tables")
def list_tables(agent_id: int, db: Session = Depends(get_db)):
    """List all data tables for an agent."""
    tbls = tables.get_by_agent(db, agent_id)
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "columns": t.columns,
            "row_count": t.row_count,
            "created_at": t.created_at.isoformat()
        }
        for t in tbls
    ]


@router.post("/tables")
async def upload_table(
    agent_id: int,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    db: Session = Depends(get_db)
):
    """Upload a CSV file as a data table."""
    content = await file.read()
    try:
        table = tables.upload_csv(db, agent_id, name, content, description)
        return {"id": table.id, "name": table.name, "rows": table.row_count}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/tables/{table_id}")
def delete_table(agent_id: int, table_id: int, db: Session = Depends(get_db)):
    """Delete a data table."""
    if not tables.delete(db, table_id):
        raise HTTPException(404, "Table not found")
    return {"message": "deleted"}


@router.post("/tables/{table_id}/search")
def search_table(agent_id: int, table_id: int, data: SearchQuery, db: Session = Depends(get_db)):
    """Semantic search in table rows."""
    results = tables.search_rows(db, table_id, data.query, data.limit)
    return results


@router.post("/tables/{table_id}/query")
def query_table(agent_id: int, table_id: int, data: TableQuery, db: Session = Depends(get_db)):
    """Query table with filters."""
    results = tables.query_table(db, table_id, data.filters)
    return results


@router.post("/tables/{table_id}/aggregate")
def aggregate_table(agent_id: int, table_id: int, data: AggregateQuery, db: Session = Depends(get_db)):
    """Perform aggregation on table column."""
    result = tables.aggregate_table(db, table_id, data.column, data.operation)
    return {"result": result}
