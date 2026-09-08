"""Knowledge Base API routes - Documents and Tables."""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from backend.core.database import get_db
from backend.services.knowledge import documents, tables
from backend.auth.models import AuthUser, UserRole
from backend.auth.dependencies import get_current_user, require_role
from backend.auth import service as auth_service

router = APIRouter(prefix="/agents/{agent_id}/knowledge", tags=["knowledge"])


def require_agent_access(agent_id: int, user: AuthUser, db: Session):
    if not auth_service.can_access_agent(db, user, agent_id):
        raise HTTPException(status_code=403, detail="Access denied to this agent")


class SearchQuery(BaseModel):
    query: str
    limit: int = 5


class TableQuery(BaseModel):
    filters: Optional[dict] = None


class AggregateQuery(BaseModel):
    column: str
    operation: str


class DocumentCreate(BaseModel):
    title: str
    content: str


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class BulkIds(BaseModel):
    ids: list[int] = Field(default_factory=list)


class TableCreate(BaseModel):
    name: str
    columns: list[str]


class TableUpdate(BaseModel):
    name: Optional[str] = None
    columns: list[str]
    rows: list[dict] = Field(default_factory=list)


def _http_value_error(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


# === Documents ===

@router.get("/documents")
def list_documents(
    agent_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    return [documents.to_list_item(doc) for doc in documents.get_by_agent(db, agent_id)]


@router.post("/documents")
async def upload_document(
    agent_id: int,
    file: UploadFile = File(...),
    title: str = Form(...),
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or "document"
    doc = _http_value_error(
        lambda: documents.upload(db, agent_id, filename, content, title)
    )
    return documents.to_list_item(doc)


@router.post("/documents/text")
def create_text_document(
    agent_id: int,
    data: DocumentCreate,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    doc = _http_value_error(
        lambda: documents.create_from_text(db, agent_id, data.title, data.content)
    )
    return documents.to_list_item(doc)


@router.post("/documents/bulk-delete")
def bulk_delete_documents(
    agent_id: int,
    data: BulkIds,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    deleted = documents.bulk_delete(db, agent_id, data.ids)
    return {"deleted": deleted}


@router.get("/documents/{doc_id}")
def get_document(
    agent_id: int,
    doc_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    doc = documents.get_for_agent(db, agent_id, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return documents.to_detail(doc)


@router.put("/documents/{doc_id}")
def update_document(
    agent_id: int,
    doc_id: int,
    data: DocumentUpdate,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    try:
        doc = documents.update(db, agent_id, doc_id, data.title, data.content)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not doc:
        raise HTTPException(404, "Document not found")
    return documents.to_detail(doc)


@router.delete("/documents/{doc_id}")
def delete_document(
    agent_id: int,
    doc_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    if not documents.delete(db, agent_id, doc_id):
        raise HTTPException(404, "Document not found")
    return {"message": "deleted"}


@router.post("/documents/search")
def search_documents(
    agent_id: int,
    data: SearchQuery,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    return documents.search(db, agent_id, data.query, data.limit)


# === Data Tables ===

@router.get("/tables")
def list_tables(
    agent_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    return [tables.to_list_item(t) for t in tables.get_by_agent(db, agent_id)]


@router.post("/tables")
async def upload_table(
    agent_id: int,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    content = await file.read()
    table = _http_value_error(
        lambda: tables.upload_csv(db, agent_id, name, content, description)
    )
    return {"id": table.id, "name": table.name, "rows": table.row_count}


@router.post("/tables/blank")
def create_blank_table(
    agent_id: int,
    data: TableCreate,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    table = _http_value_error(
        lambda: tables.create_blank(db, agent_id, data.name, data.columns)
    )
    return tables.to_list_item(table)


@router.get("/tables/{table_id}")
def get_table(
    agent_id: int,
    table_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    detail = tables.get_detail(db, agent_id, table_id)
    if not detail:
        raise HTTPException(404, "Table not found")
    return detail


@router.put("/tables/{table_id}")
def update_table(
    agent_id: int,
    table_id: int,
    data: TableUpdate,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    try:
        table = tables.replace_data(
            db, agent_id, table_id, data.columns, data.rows, data.name
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not table:
        raise HTTPException(404, "Table not found")
    return tables.get_detail(db, agent_id, table.id)


@router.delete("/tables/{table_id}")
def delete_table(
    agent_id: int,
    table_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    if not tables.delete(db, agent_id, table_id):
        raise HTTPException(404, "Table not found")
    return {"message": "deleted"}


@router.post("/tables/{table_id}/search")
def search_table(
    agent_id: int,
    table_id: int,
    data: SearchQuery,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    return tables.search_rows(db, table_id, data.query, data.limit)


@router.post("/tables/{table_id}/query")
def query_table_route(
    agent_id: int,
    table_id: int,
    data: TableQuery,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    return tables.query_table(db, table_id, data.filters)


@router.post("/tables/{table_id}/aggregate")
def aggregate_table_route(
    agent_id: int,
    table_id: int,
    data: AggregateQuery,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_agent_access(agent_id, current_user, db)
    result = tables.aggregate_table(db, table_id, data.column, data.operation)
    return {"result": result}
