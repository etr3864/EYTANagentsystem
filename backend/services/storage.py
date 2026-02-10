"""Cloudflare R2 storage service.

Handles file uploads/downloads to R2 (S3-compatible).
Files are organized by: agents/{agent_id}/{media_type}s/{filename}
"""
import logging
from typing import BinaryIO
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from backend.core.config import settings

logger = logging.getLogger(__name__)

# Lazy-initialized client
_s3_client = None


def _get_client():
    """Get or create S3 client for R2."""
    global _s3_client
    
    if _s3_client is not None:
        return _s3_client
    
    if not settings.r2_configured:
        raise RuntimeError("R2 storage not configured. Check env variables.")
    
    _s3_client = boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"}
        )
    )
    return _s3_client


def generate_file_key(agent_id: int, media_type: str, original_filename: str) -> str:
    """Generate unique file path in R2.
    
    Format: agents/{agent_id}/{media_type}s/{uuid}_{sanitized_filename}
    Example: agents/5/images/a1b2c3d4_product.jpg
    """
    # Sanitize filename - keep only ASCII alphanumeric chars
    # This ensures URL compatibility with all providers (Meta, etc.)
    safe_name = "".join(c for c in original_filename if c.isascii() and (c.isalnum() or c in "._-"))
    if not safe_name or safe_name.startswith("."):
        safe_name = "file"
    
    # Ensure we have extension
    if "." not in safe_name:
        # Try to get extension from original
        if "." in original_filename:
            ext = original_filename.rsplit(".", 1)[-1].lower()
            if ext in ("jpg", "jpeg", "png", "mp4"):
                safe_name = f"{safe_name}.{ext}"
    
    # Limit filename length
    if len(safe_name) > 50:
        ext = safe_name.rsplit(".", 1)[-1] if "." in safe_name else ""
        safe_name = safe_name[:45] + ("." + ext if ext else "")
    
    unique_id = uuid4().hex[:8]
    folder = f"{media_type}s"  # 'image' -> 'images', 'video' -> 'videos'
    
    return f"agents/{agent_id}/{folder}/{unique_id}_{safe_name}"


def get_public_url(file_key: str) -> str:
    """Get public URL for a file."""
    if not settings.r2_public_url:
        raise RuntimeError("R2_PUBLIC_URL not configured")
    
    base = settings.r2_public_url.rstrip("/")
    return f"{base}/{file_key}"


def upload_file(
    file_data: BinaryIO,
    file_key: str,
    content_type: str,
    file_size: int
) -> str:
    """Upload file to R2.
    
    Args:
        file_data: File-like object to upload
        file_key: Path in bucket (from generate_file_key)
        content_type: MIME type (e.g., 'image/jpeg')
        file_size: Size in bytes (for validation logging)
    
    Returns:
        Public URL of uploaded file
    
    Raises:
        RuntimeError: If upload fails
    """
    client = _get_client()
    
    try:
        client.upload_fileobj(
            file_data,
            settings.r2_bucket_name,
            file_key,
            ExtraArgs={
                "ContentType": content_type,
                "CacheControl": "public, max-age=31536000"  # 1 year cache
            }
        )
        
        url = get_public_url(file_key)
        logger.info(f"storage upload_success key={file_key} size={file_size}")
        return url
        
    except ClientError as e:
        logger.error(f"storage upload_failed key={file_key} error={e}")
        raise RuntimeError(f"Failed to upload file: {e}") from e


def delete_file(file_key: str) -> bool:
    """Delete file from R2.
    
    Args:
        file_key: Path in bucket
    
    Returns:
        True if deleted (or didn't exist), False on error
    """
    client = _get_client()
    
    try:
        client.delete_object(
            Bucket=settings.r2_bucket_name,
            Key=file_key
        )
        logger.info(f"storage delete_success key={file_key}")
        return True
        
    except ClientError as e:
        logger.error(f"storage delete_failed key={file_key} error={e}")
        return False


def file_exists(file_key: str) -> bool:
    """Check if file exists in R2."""
    client = _get_client()
    
    try:
        client.head_object(
            Bucket=settings.r2_bucket_name,
            Key=file_key
        )
        return True
    except ClientError:
        return False


def generate_presigned_upload_url(file_key: str, content_type: str, expires_in: int = 3600) -> str:
    """Generate presigned URL for direct client upload.
    
    Used for large files to upload directly from browser to R2.
    
    Args:
        file_key: Path where file will be stored
        content_type: Expected MIME type
        expires_in: URL validity in seconds (default 1 hour)
    
    Returns:
        Presigned PUT URL
    """
    client = _get_client()
    
    url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": file_key,
            "ContentType": content_type
        },
        ExpiresIn=expires_in
    )
    return url
