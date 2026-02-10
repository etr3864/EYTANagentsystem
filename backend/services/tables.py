"""Data tables service - CSV parsing and querying."""
import io
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.models.knowledge import DataTable, DataRow
from backend.services import embeddings
from backend.core.logger import log_upload


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


def delete(db: Session, table_id: int) -> bool:
    table = db.get(DataTable, table_id)
    if not table:
        return False
    db.delete(table)
    db.commit()
    return True


def get_by_agent(db: Session, agent_id: int) -> list[DataTable]:
    """Get all tables for an agent."""
    return list(db.scalars(
        select(DataTable)
        .where(DataTable.agent_id == agent_id, DataTable.is_active == True)
        .order_by(DataTable.name)
    ))


def search_rows(db: Session, table_id: int, query: str, limit: int = 10) -> list[dict]:
    """Semantic search in table rows."""
    query_embedding = embeddings.get_embedding(query)
    
    results = db.scalars(
        select(DataRow)
        .where(DataRow.table_id == table_id)
        .order_by(DataRow.embedding.cosine_distance(query_embedding))
        .limit(limit)
    )
    return [row.data for row in results]


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
