"""Video frame extraction for AI context."""
import base64
import subprocess
import tempfile
from typing import Optional

from backend.core.logger import log_error

MAX_VIDEO_SIZE = 30 * 1024 * 1024  # 30MB
FFMPEG_TIMEOUT = 10


def extract_first_frame(video_bytes: bytes) -> Optional[str]:
    """Extract the first frame from video bytes, return as base64 JPEG.

    Returns None on failure (oversized, corrupt, ffmpeg error).
    """
    if len(video_bytes) > MAX_VIDEO_SIZE:
        log_error("video", f"skipped: {len(video_bytes) // 1024 // 1024}MB exceeds limit")
        return None

    src_path = dst_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as src:
            src.write(video_bytes)
            src_path = src.name

        dst_path = src_path + ".jpg"
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", src_path,
                "-vframes", "1", "-q:v", "3",
                "-f", "image2", dst_path,
            ],
            capture_output=True,
            timeout=FFMPEG_TIMEOUT,
        )
        if result.returncode != 0:
            stderr_msg = result.stderr[:200].decode(errors="replace")
            log_error("video", f"ffmpeg rc={result.returncode}: {stderr_msg}")
            return None

        with open(dst_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    except FileNotFoundError:
        log_error("video", "ffmpeg not installed")
        return None
    except subprocess.TimeoutExpired:
        log_error("video", "ffmpeg timeout")
        return None
    except Exception as e:
        log_error("video", f"extract error: {str(e)[:60]}")
        return None
    finally:
        import os
        for p in (src_path, dst_path):
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass
