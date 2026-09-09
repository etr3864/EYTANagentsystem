"""Convert browser recordings to WhatsApp-friendly OGG/Opus."""
import os
import subprocess
import tempfile

from backend.core.logger import log_error

FFMPEG_TIMEOUT = 30


class VoiceConvertError(Exception):
    pass


def to_ogg_opus(data: bytes) -> bytes:
    """Convert any audio bytes to OGG Opus. Raises VoiceConvertError on failure."""
    if len(data) < 32:
        raise VoiceConvertError("הקלטה ריקה")
    if data[:4] == b"OggS":
        return data

    src_path = dst_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as src:
            src.write(data)
            src_path = src.name
        dst_path = src_path + ".ogg"
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", src_path,
                "-c:a", "libopus", "-b:a", "32k",
                "-f", "ogg", dst_path,
            ],
            capture_output=True,
            timeout=FFMPEG_TIMEOUT,
        )
        if result.returncode != 0:
            stderr_msg = result.stderr[:200].decode(errors="replace")
            log_error("voice", f"ffmpeg rc={result.returncode}: {stderr_msg}")
            raise VoiceConvertError("לא ניתן להמיר את ההקלטה")
        with open(dst_path, "rb") as f:
            out = f.read()
        if not out:
            raise VoiceConvertError("לא ניתן להמיר את ההקלטה")
        return out
    except FileNotFoundError:
        log_error("voice", "ffmpeg not installed")
        raise VoiceConvertError("לא ניתן להמיר את ההקלטה")
    except subprocess.TimeoutExpired:
        log_error("voice", "ffmpeg timeout")
        raise VoiceConvertError("המרת ההקלטה ארכה יותר מדי")
    finally:
        for p in (src_path, dst_path):
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass
