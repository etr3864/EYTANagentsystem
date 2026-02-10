"""Agent media service - CRUD, embeddings, semantic search.

Manages images/videos that agents can send during conversations.
"""
import logging
from io import BytesIO
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.agent_media import AgentMedia, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE
from backend.services import embeddings, storage

logger = logging.getLogger(__name__)


def _validate_file(content_type: str, file_size: int, media_type: str) -> None:
    """Validate file type and size."""
    if media_type == "image":
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise ValueError(f"Invalid image type: {content_type}. Allowed: {ALLOWED_IMAGE_TYPES}")
        if file_size > MAX_IMAGE_SIZE:
            raise ValueError(f"Image too large: {file_size} bytes. Max: {MAX_IMAGE_SIZE}")
    elif media_type == "video":
        if content_type not in ALLOWED_VIDEO_TYPES:
            raise ValueError(f"Invalid video type: {content_type}. Allowed: {ALLOWED_VIDEO_TYPES}")
        if file_size > MAX_VIDEO_SIZE:
            raise ValueError(f"Video too large: {file_size} bytes. Max: {MAX_VIDEO_SIZE}")
    else:
        raise ValueError(f"Invalid media type: {media_type}")


def _generate_embedding(name: str, description: str | None) -> list[float] | None:
    """Generate embedding from name + description."""
    text = name
    if description:
        text = f"{name}: {description}"
    
    if len(text) < 3:
        return None
    
    return embeddings.get_embedding(text)


def upload(
    db: Session,
    agent_id: int,
    file_data: BinaryIO,
    filename: str,
    content_type: str,
    file_size: int,
    original_size: int | None,
    media_type: str,
    name: str,
    description: str | None = None,
    default_caption: str | None = None
) -> AgentMedia:
    """Upload media file and create DB record.
    
    Args:
        db: Database session
        agent_id: Agent ID
        file_data: File content (already compressed if needed)
        filename: Original filename
        content_type: MIME type
        file_size: Size after compression
        original_size: Size before compression (None if not compressed)
        media_type: 'image' or 'video'
        name: Display name
        description: Optional description for semantic search
        default_caption: Default caption when sending
    
    Returns:
        Created AgentMedia record
    """
    _validate_file(content_type, file_size, media_type)
    
    # Upload to R2
    file_key = storage.generate_file_key(agent_id, media_type, filename)
    file_url = storage.upload_file(file_data, file_key, content_type, file_size)
    
    # Generate embedding for semantic search
    embedding = _generate_embedding(name, description)
    
    media = AgentMedia(
        agent_id=agent_id,
        media_type=media_type,
        name=name,
        description=description,
        default_caption=default_caption,
        file_url=file_url,
        file_key=file_key,
        file_size=file_size,
        original_size=original_size,
        mime_type=content_type,
        embedding=embedding,
        is_active=True
    )
    
    db.add(media)
    db.commit()
    db.refresh(media)
    
    logger.info(f"media upload agent={agent_id} id={media.id} type={media_type}")
    return media


def get_by_agent(
    db: Session,
    agent_id: int,
    media_type: str | None = None,
    active_only: bool = True
) -> list[AgentMedia]:
    """Get media items for an agent."""
    query = select(AgentMedia).where(AgentMedia.agent_id == agent_id)
    
    if media_type:
        query = query.where(AgentMedia.media_type == media_type)
    
    if active_only:
        query = query.where(AgentMedia.is_active == True)
    
    query = query.order_by(AgentMedia.created_at.desc())
    return list(db.scalars(query))


def get_by_id(db: Session, media_id: int) -> AgentMedia | None:
    """Get single media item by ID."""
    return db.get(AgentMedia, media_id)


def update(
    db: Session,
    media_id: int,
    name: str | None = None,
    description: str | None = None,
    default_caption: str | None = None,
    is_active: bool | None = None
) -> AgentMedia | None:
    """Update media metadata."""
    media = db.get(AgentMedia, media_id)
    if not media:
        return None
    
    update_embedding = False
    
    if name is not None:
        media.name = name
        update_embedding = True
    
    if description is not None:
        media.description = description
        update_embedding = True
    
    if default_caption is not None:
        media.default_caption = default_caption
    
    if is_active is not None:
        media.is_active = is_active
    
    # Regenerate embedding if name/description changed
    if update_embedding:
        media.embedding = _generate_embedding(media.name, media.description)
    
    db.commit()
    db.refresh(media)
    return media


def delete(db: Session, media_id: int) -> bool:
    """Delete media from R2 and database."""
    media = db.get(AgentMedia, media_id)
    if not media:
        return False
    
    # Delete from R2
    storage.delete_file(media.file_key)
    
    # Delete from DB
    db.delete(media)
    db.commit()
    
    logger.info(f"media delete id={media_id}")
    return True


def search(db: Session, agent_id: int, query: str, limit: int = 5) -> list[AgentMedia]:
    """Semantic search for media items."""
    query_embedding = embeddings.get_embedding(query)
    
    results = db.scalars(
        select(AgentMedia)
        .where(
            AgentMedia.agent_id == agent_id,
            AgentMedia.is_active == True,
            AgentMedia.embedding.isnot(None)
        )
        .order_by(AgentMedia.embedding.cosine_distance(query_embedding))
        .limit(limit)
    ).all()
    
    return list(results)


def get_media_for_prompt(db: Session, agent_id: int) -> list[dict]:
    """Get media list for injecting into system prompt.
    
    Returns simplified list for AI context.
    Used when agent has <= 15 media items.
    """
    media_items = get_by_agent(db, agent_id, active_only=True)
    
    return [
        {
            "id": m.id,
            "type": m.media_type,
            "name": m.name,
            "description": m.description or "",
            "caption": m.default_caption or ""
        }
        for m in media_items
    ]


def count_by_agent(db: Session, agent_id: int) -> int:
    """Count active media items for an agent."""
    return db.query(AgentMedia).filter(
        AgentMedia.agent_id == agent_id,
        AgentMedia.is_active == True
    ).count()
