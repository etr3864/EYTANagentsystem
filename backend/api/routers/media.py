"""Media management API routes."""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Optional

from backend.core.database import get_db
from backend.services import agent_media
from backend.auth.models import AuthUser, UserRole
from backend.auth.dependencies import get_current_user, require_role
from backend.auth import service as auth_service

router = APIRouter(prefix="/agents/{agent_id}/media", tags=["media"])


def require_agent_access(agent_id: int, user: AuthUser, db: Session):
    """Check agent access or raise 403."""
    if not auth_service.can_access_agent(db, user, agent_id):
        raise HTTPException(status_code=403, detail="Access denied to this agent")


class MediaUpdate(BaseModel):
    """Schema for updating media metadata."""
    name: Optional[str] = None
    description: Optional[str] = None
    default_caption: Optional[str] = None
    filename: Optional[str] = None
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
    
    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v):
        if v is not None and len(v) > 255:
            raise ValueError("Filename too long (max 255 chars)")
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
    result = {
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
    if m.media_type == "document":
        result["filename"] = m.filename
    return result


VALID_MEDIA_TYPES = {"image", "video", "document"}


@router.get("")
def list_media(
    agent_id: int,
    media_type: Optional[str] = None,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all media for an agent.
    
    Query params:
        media_type: Filter by 'image', 'video', or 'document'
    """
    require_agent_access(agent_id, current_user, db)
    if media_type and media_type not in VALID_MEDIA_TYPES:
        raise HTTPException(400, "media_type must be 'image', 'video', or 'document'")
    
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
    display_filename: Optional[str] = Form(None),
    original_size: Optional[int] = Form(None),
    auto_analyze: bool = Form(True),
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Upload a media file. Super Admin only.
    
    Form fields:
        file: The media file (image/video/document)
        name: Display name (optional for images - will be auto-generated)
        media_type: 'image', 'video', or 'document' (required)
        description: Optional description for search (auto-generated for images)
        default_caption: Default caption when sending (auto-generated for images)
        display_filename: For documents - filename shown to recipient in WhatsApp
        original_size: Original file size before compression (optional)
        auto_analyze: Whether to auto-analyze images (default True)
    """
    if media_type not in VALID_MEDIA_TYPES:
        raise HTTPException(400, "media_type must be 'image', 'video', or 'document'")
    
    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    
    final_name = name.strip() if name else None
    final_description = description
    final_caption = default_caption
    final_display_filename = display_filename
    
    # Auto-analyze images
    if media_type == "image" and auto_analyze:
        from backend.services import ai
        import base64
        
        image_base64 = base64.b64encode(content).decode("utf-8")
        mime = content_type if content_type in ("image/jpeg", "image/png") else "image/jpeg"
        
        analysis = await ai.analyze_media_image(image_base64, mime)
        
        if not final_name:
            final_name = analysis.get("name", "תמונה")
        if not final_description:
            final_description = analysis.get("description")
        if not final_caption:
            final_caption = analysis.get("caption")
    
    # Auto-analyze documents
    if media_type == "document" and auto_analyze:
        from backend.services import ai, document_extraction
        
        extracted_text = document_extraction.extract_text(content, content_type)
        if extracted_text:
            analysis = await ai.analyze_document(extracted_text)
            
            if not final_name:
                final_name = analysis.get("name", "קובץ")
            if not final_description:
                final_description = analysis.get("description")
            if not final_caption:
                final_caption = analysis.get("caption")
    
    # For documents, use original filename as display_filename if not provided
    if media_type == "document" and not final_display_filename:
        final_display_filename = file.filename
    
    # Fallback for videos/documents or if no name
    if not final_name:
        filename = file.filename or "file"
        final_name = filename.rsplit(".", 1)[0] if "." in filename else filename
    
    if len(final_name) < 2:
        final_name = "מדיה" if media_type != "document" else "קובץ"
    
    from io import BytesIO
    file_data = BytesIO(content)
    
    try:
        media = agent_media.upload(
            db=db,
            agent_id=agent_id,
            file_data=file_data,
            upload_filename=file.filename or "file",
            content_type=content_type,
            file_size=len(content),
            original_size=original_size,
            media_type=media_type,
            name=final_name,
            description=final_description,
            default_caption=final_caption,
            display_filename=final_display_filename
        )
        return _media_to_dict(media)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(500, f"Upload failed: {e}")


@router.get("/{media_id}")
def get_media(
    agent_id: int, 
    media_id: int, 
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single media item."""
    require_agent_access(agent_id, current_user, db)
    media = agent_media.get_by_id(db, media_id)
    if not media or media.agent_id != agent_id:
        raise HTTPException(404, "Media not found")
    return _media_to_dict(media)


@router.put("/{media_id}")
def update_media(
    agent_id: int,
    media_id: int,
    data: MediaUpdate,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update media metadata. Admin can update for their agents."""
    require_agent_access(agent_id, current_user, db)
    media = agent_media.get_by_id(db, media_id)
    if not media or media.agent_id != agent_id:
        raise HTTPException(404, "Media not found")
    
    updated = agent_media.update(
        db=db,
        media_id=media_id,
        name=data.name,
        description=data.description,
        default_caption=data.default_caption,
        filename=data.filename,
        is_active=data.is_active
    )
    return _media_to_dict(updated)


@router.delete("/{media_id}")
def delete_media(
    agent_id: int, 
    media_id: int, 
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete media (from R2 and database). Admin can delete for their agents."""
    require_agent_access(agent_id, current_user, db)
    media = agent_media.get_by_id(db, media_id)
    if not media or media.agent_id != agent_id:
        raise HTTPException(404, "Media not found")
    
    agent_media.delete(db, media_id)
    return {"message": "deleted"}


@router.post("/search")
def search_media(
    agent_id: int, 
    data: SearchQuery, 
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Semantic search for media items."""
    require_agent_access(agent_id, current_user, db)
    results = agent_media.search(db, agent_id, data.query, data.limit)
    return [_media_to_dict(m) for m in results]
