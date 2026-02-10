"""Media management API routes."""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Optional

from backend.core.database import get_db
from backend.services import agent_media

router = APIRouter(prefix="/agents/{agent_id}/media", tags=["media"])


class MediaUpdate(BaseModel):
    """Schema for updating media metadata."""
    name: Optional[str] = None
    description: Optional[str] = None
    default_caption: Optional[str] = None
    is_active: Optional[bool] = None
    
    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if v is not None and len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v.strip() if v else v
    
    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        if v is not None and len(v) > 1000:
            raise ValueError("Description too long (max 1000 chars)")
        return v
    
    @field_validator("default_caption")
    @classmethod
    def validate_caption(cls, v):
        if v is not None and len(v) > 1024:
            raise ValueError("Caption too long (max 1024 chars)")
        return v


class SearchQuery(BaseModel):
    """Schema for semantic search."""
    query: str
    limit: int = 5
    
    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v):
        if v < 1 or v > 20:
            raise ValueError("Limit must be between 1 and 20")
        return v


def _media_to_dict(m) -> dict:
    """Convert AgentMedia to response dict."""
    return {
        "id": m.id,
        "agent_id": m.agent_id,
        "media_type": m.media_type,
        "name": m.name,
        "description": m.description,
        "default_caption": m.default_caption,
        "file_url": m.file_url,
        "file_size": m.file_size,
        "original_size": m.original_size,
        "mime_type": m.mime_type,
        "is_active": m.is_active,
        "created_at": m.created_at.isoformat() if m.created_at else None
    }


@router.get("")
def list_media(
    agent_id: int,
    media_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all media for an agent.
    
    Query params:
        media_type: Filter by 'image' or 'video'
    """
    if media_type and media_type not in ("image", "video"):
        raise HTTPException(400, "media_type must be 'image' or 'video'")
    
    items = agent_media.get_by_agent(db, agent_id, media_type)
    return [_media_to_dict(m) for m in items]


@router.post("")
async def upload_media(
    agent_id: int,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    media_type: str = Form(...),
    description: Optional[str] = Form(None),
    default_caption: Optional[str] = Form(None),
    original_size: Optional[int] = Form(None),
    auto_analyze: bool = Form(True),
    db: Session = Depends(get_db)
):
    """Upload a media file.
    
    Form fields:
        file: The media file (image/video)
        name: Display name (optional for images - will be auto-generated)
        media_type: 'image' or 'video' (required)
        description: Optional description for search (auto-generated for images)
        default_caption: Default caption when sending (auto-generated for images)
        original_size: Original file size before compression (optional)
        auto_analyze: Whether to auto-analyze images (default True)
    """
    if media_type not in ("image", "video"):
        raise HTTPException(400, "media_type must be 'image' or 'video'")
    
    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    
    final_name = name.strip() if name else None
    final_description = description
    final_caption = default_caption
    
    # Auto-analyze images if enabled and no metadata provided
    if media_type == "image" and auto_analyze:
        from backend.services import ai
        import base64
        
        # Convert to base64 for AI analysis
        image_base64 = base64.b64encode(content).decode("utf-8")
        mime = content_type if content_type in ("image/jpeg", "image/png") else "image/jpeg"
        
        analysis = await ai.analyze_media_image(image_base64, mime)
        
        # Use AI results as defaults (user-provided values take precedence)
        if not final_name:
            final_name = analysis.get("name", "תמונה")
        if not final_description:
            final_description = analysis.get("description")
        if not final_caption:
            final_caption = analysis.get("caption")
    
    # Fallback for videos or if no name
    if not final_name:
        # Use filename without extension
        filename = file.filename or "file"
        final_name = filename.rsplit(".", 1)[0] if "." in filename else filename
    
    if len(final_name) < 2:
        final_name = "מדיה"
    
    from io import BytesIO
    file_data = BytesIO(content)
    
    try:
        media = agent_media.upload(
            db=db,
            agent_id=agent_id,
            file_data=file_data,
            filename=file.filename or "file",
            content_type=content_type,
            file_size=len(content),
            original_size=original_size,
            media_type=media_type,
            name=final_name,
            description=final_description,
            default_caption=final_caption
        )
        return _media_to_dict(media)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(500, f"Upload failed: {e}")


@router.get("/{media_id}")
def get_media(agent_id: int, media_id: int, db: Session = Depends(get_db)):
    """Get single media item."""
    media = agent_media.get_by_id(db, media_id)
    if not media or media.agent_id != agent_id:
        raise HTTPException(404, "Media not found")
    return _media_to_dict(media)


@router.put("/{media_id}")
def update_media(
    agent_id: int,
    media_id: int,
    data: MediaUpdate,
    db: Session = Depends(get_db)
):
    """Update media metadata."""
    media = agent_media.get_by_id(db, media_id)
    if not media or media.agent_id != agent_id:
        raise HTTPException(404, "Media not found")
    
    updated = agent_media.update(
        db=db,
        media_id=media_id,
        name=data.name,
        description=data.description,
        default_caption=data.default_caption,
        is_active=data.is_active
    )
    return _media_to_dict(updated)


@router.delete("/{media_id}")
def delete_media(agent_id: int, media_id: int, db: Session = Depends(get_db)):
    """Delete media (from R2 and database)."""
    media = agent_media.get_by_id(db, media_id)
    if not media or media.agent_id != agent_id:
        raise HTTPException(404, "Media not found")
    
    agent_media.delete(db, media_id)
    return {"message": "deleted"}


@router.post("/search")
def search_media(agent_id: int, data: SearchQuery, db: Session = Depends(get_db)):
    """Semantic search for media items."""
    results = agent_media.search(db, agent_id, data.query, data.limit)
    return [_media_to_dict(m) for m in results]
