"""Data tables service - CSV parsing and querying."""
import io
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import select, cast, Text, delete as sql_delete

from backend.models.knowledge import DataTable, DataRow
from . import embeddings
from .retrieval import (
    CANDIDATE_MULTIPLIER,
    MAX_COSINE_DISTANCE,
    like_contains,
)
from backend.core.logger import log_upload

MAX_TABLE_ROWS = 1000
MAX_TABLE_COLS = 30
MAX_COL_NAME = 80


def _infer_column_types(df: pd.DataFrame) -> dict:
    """Infer column types for schema."""
    type_map = {
        "int64": "number",
        "float64": "number",
        "bool": "boolean",
        "object": "text",
        "datetime64[ns]": "date"
    }
    return {col: type_map.get(str(df[col].dtype), "text") for col in df.columns}


def _row_to_text(row: dict) -> str:
    """Convert row to searchable text."""
    return " | ".join(f"{k}: {v}" for k, v in row.items() if pd.notna(v))


def upload_csv(
    db: Session,
    agent_id: int,
    name: str,
    content: bytes,
    description: str | None = None
) -> DataTable:
    """Upload and process a CSV file."""
    from .documents import FILE_TOO_HEAVY, MAX_UPLOAD_BYTES

    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError(FILE_TOO_HEAVY)
    df = pd.read_csv(io.BytesIO(content))
    
    if df.empty:
        raise ValueError("CSV file is empty")
    
    columns = _infer_column_types(df)
    
    table = DataTable(
        agent_id=agent_id,
        name=name,
        description=description,
        columns=columns,
        row_count=len(df)
    )
    db.add(table)
    db.flush()
    
    rows_data = df.to_dict("records")
    row_texts = [_row_to_text(r) for r in rows_data]
    row_embeddings = embeddings.get_embeddings_batch(row_texts)
    
    for row_data, row_emb in zip(rows_data, row_embeddings):
        clean_data = {k: (None if pd.isna(v) else v) for k, v in row_data.items()}
        row = DataRow(
            table_id=table.id,
            data=clean_data,
            embedding=row_emb
        )
        db.add(row)
    
    db.commit()
    db.refresh(table)
    
    log_upload("table", name, f"{len(df)} rows, {len(columns)} cols")
    return table


def get_for_agent(db: Session, agent_id: int, table_id: int) -> DataTable | None:
    return db.scalar(
        select(DataTable).where(DataTable.id == table_id, DataTable.agent_id == agent_id)
    )


def delete(db: Session, agent_id: int, table_id: int) -> bool:
    table = get_for_agent(db, agent_id, table_id)
    if not table:
        return False
    db.delete(table)
    db.commit()
    return True


def to_list_item(table: DataTable) -> dict:
    created = table.created_at.isoformat() if table.created_at else None
    return {
        "id": table.id,
        "name": table.name,
        "description": table.description,
        "columns": table.columns,
        "row_count": table.row_count,
        "created_at": created,
    }


def unique_columns(names: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        base = (raw or "").strip()[:MAX_COL_NAME] or "עמודה"
        name = base
        n = 2
        while name in seen:
            name = f"{base} {n}"[:MAX_COL_NAME]
            n += 1
        seen.add(name)
        out.append(name)
    if not out:
        raise ValueError("חובה לפחות עמודה אחת")
    if len(out) > MAX_TABLE_COLS:
        raise ValueError(f"יותר מדי עמודות (עד {MAX_TABLE_COLS})")
    return out


def _schema_from_names(names: list[str], previous: dict | None = None) -> dict:
    previous = previous or {}
    return {name: previous.get(name, "text") for name in unique_columns(names)}


def _coerce_value(value, col_type: str):
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    if col_type == "number":
        try:
            num = float(str(value).replace(",", ""))
            return int(num) if num.is_integer() else num
        except (TypeError, ValueError):
            return value
    return value


def _clean_row(row: dict, columns: dict) -> dict:
    return {key: _coerce_value(row.get(key), col_type) for key, col_type in columns.items()}


def _insert_rows(db: Session, table: DataTable, rows_data: list[dict]) -> None:
    if len(rows_data) > MAX_TABLE_ROWS:
        raise ValueError(
            f"יותר מדי שורות (עד {MAX_TABLE_ROWS}). "
            "פצל לכמה טבלאות או קצר את ה-CSV והעלה מחדש."
        )
    db.execute(sql_delete(DataRow).where(DataRow.table_id == table.id))
    db.flush()
    if not rows_data:
        table.row_count = 0
        return
    texts = [_row_to_text(r) for r in rows_data]
    embs = embeddings.get_embeddings_batch(texts)
    for row_data, emb in zip(rows_data, embs):
        db.add(DataRow(table_id=table.id, data=row_data, embedding=emb))
    table.row_count = len(rows_data)


def get_detail(db: Session, agent_id: int, table_id: int) -> dict | None:
    table = get_for_agent(db, agent_id, table_id)
    if not table:
        return None
    rows = list(db.scalars(
        select(DataRow).where(DataRow.table_id == table.id).order_by(DataRow.id)
    ))
    item = to_list_item(table)
    item["rows"] = [row.data for row in rows]
    return item


def create_blank(db: Session, agent_id: int, name: str, column_names: list[str]) -> DataTable:
    name = (name or "").strip()
    if not name:
        raise ValueError("חובה לתת שם לטבלה")
    columns = _schema_from_names(column_names)
    table = DataTable(
        agent_id=agent_id,
        name=name,
        columns=columns,
        row_count=0,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    log_upload("table", name, "blank")
    return table


def replace_data(
    db: Session,
    agent_id: int,
    table_id: int,
    column_names: list[str],
    rows: list[dict],
    name: str | None = None,
) -> DataTable | None:
    table = get_for_agent(db, agent_id, table_id)
    if not table:
        return None
    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("חובה לתת שם לטבלה")
        table.name = name
    columns = _schema_from_names(column_names, table.columns)
    cleaned = [_clean_row(row if isinstance(row, dict) else {}, columns) for row in rows]
    table.columns = columns
    _insert_rows(db, table, cleaned)
    db.commit()
    db.refresh(table)
    return table


def get_by_agent(db: Session, agent_id: int) -> list[DataTable]:
    """Get all tables for an agent."""
    return list(db.scalars(
        select(DataTable)
        .where(DataTable.agent_id == agent_id, DataTable.is_active == True)
        .order_by(DataTable.name)
    ))


def _search_rows_lexical(db: Session, table_id: int, query: str, limit: int) -> list[dict]:
    if len(query.strip()) < 2:
        return []
    rows = db.scalars(
        select(DataRow).where(
            DataRow.table_id == table_id,
            cast(DataRow.data, Text).ilike(like_contains(query), escape="\\"),
        ).limit(limit)
    )
    return [row.data for row in rows]


def _search_rows_semantic(db: Session, table_id: int, query: str, limit: int) -> list[dict]:
    if not query.strip():
        return []
    query_embedding = embeddings.get_embedding(query)
    distance = DataRow.embedding.cosine_distance(query_embedding)
    fetch = max(limit * CANDIDATE_MULTIPLIER, 15)
    rows = db.execute(
        select(DataRow, distance.label("distance"))
        .where(DataRow.table_id == table_id, DataRow.embedding.isnot(None))
        .order_by(distance)
        .limit(fetch)
    ).all()
    return [
        row.data
        for row, dist in rows
        if dist is not None and dist <= MAX_COSINE_DISTANCE
    ][:limit]


def search_rows(db: Session, table_id: int, query: str, limit: int = 10) -> list[dict]:
    """Literal cell match first; semantic only if nothing contains the text."""
    found = _search_rows_lexical(db, table_id, query, limit)
    if found:
        return found
    return _search_rows_semantic(db, table_id, query, limit)


def query_table(db: Session, table_id: int, filters: dict | None = None) -> list[dict]:
    """Query table with optional filters."""
    query = select(DataRow).where(DataRow.table_id == table_id)
    
    results = list(db.scalars(query))
    rows = [r.data for r in results]
    
    if filters:
        for key, value in filters.items():
            if isinstance(value, dict):
                op = value.get("op", "eq")
                val = value.get("value")
                if op == "gt":
                    rows = [r for r in rows if r.get(key) is not None and r[key] > val]
                elif op == "lt":
                    rows = [r for r in rows if r.get(key) is not None and r[key] < val]
                elif op == "gte":
                    rows = [r for r in rows if r.get(key) is not None and r[key] >= val]
                elif op == "lte":
                    rows = [r for r in rows if r.get(key) is not None and r[key] <= val]
                elif op == "contains":
                    rows = [r for r in rows if r.get(key) and str(val).lower() in str(r[key]).lower()]
            else:
                rows = [r for r in rows if r.get(key) == value]
    
    return rows


def aggregate_table(db: Session, table_id: int, column: str, operation: str) -> float | int | None:
    """Perform aggregation on a column."""
    table = db.get(DataTable, table_id)
    if not table or column not in table.columns:
        return None
    
    rows = list(db.scalars(select(DataRow).where(DataRow.table_id == table_id)))
    values = [r.data.get(column) for r in rows if r.data.get(column) is not None]
    
    if not values:
        return None
    
    numeric_values = [v for v in values if isinstance(v, (int, float))]
    
    if operation == "count":
        return len(values)
    elif operation == "sum" and numeric_values:
        return sum(numeric_values)
    elif operation == "avg" and numeric_values:
        return sum(numeric_values) / len(numeric_values)
    elif operation == "min" and numeric_values:
        return min(numeric_values)
    elif operation == "max" and numeric_values:
        return max(numeric_values)
    
    return None
