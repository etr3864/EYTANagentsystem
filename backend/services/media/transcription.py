"""Voice message transcription using Google Cloud Speech-to-Text."""
import asyncio
import base64
import json
import tempfile
import os
from typing import Optional

from backend.core.config import settings
from backend.core.logger import log_audio, log_error
from backend.services.media import download_whatsapp_media


def _get_google_credentials():
    """Resolve credentials from path, base64, or JSON string."""
    creds_json = settings.google_credentials_json
    if not creds_json:
        return None
    
    if os.path.exists(creds_json):
        return creds_json
    
    try:
        decoded = base64.b64decode(creds_json)
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.json', delete=False) as f:
            f.write(decoded)
            return f.name
    except Exception:
        try:
            json.loads(creds_json)
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                f.write(creds_json)
                return f.name
        except Exception:
            return None


def _detect_suffix(audio_bytes: bytes) -> str:
    """Guess file extension from magic bytes for better ffmpeg detection."""
    if audio_bytes[:4] == b'OggS':
        return '.ogg'
    if audio_bytes[4:8] == b'ftyp':
        return '.m4a'
    if audio_bytes[:4] == b'RIFF':
        return '.wav'
    if audio_bytes[:3] == b'ID3' or audio_bytes[:2] == b'\xff\xfb':
        return '.mp3'
    return '.audio'


def _convert_to_wav(audio_bytes: bytes) -> Optional[bytes]:
    """Convert any audio format to 16kHz mono WAV using ffmpeg."""
    import subprocess
    src_path = dst_path = None
    try:
        suffix = _detect_suffix(audio_bytes)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as src:
            src.write(audio_bytes)
            src_path = src.name
        dst_path = src_path + '.wav'
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', src_path, '-ar', '16000', '-ac', '1', '-f', 'wav', dst_path],
            capture_output=True, timeout=15,
        )
        if result.returncode != 0:
            stderr_msg = result.stderr[:300].decode(errors='replace')
            log_error("audio", f"ffmpeg rc={result.returncode}: {stderr_msg}")
            return None
        with open(dst_path, 'rb') as f:
            return f.read()
    except FileNotFoundError:
        log_error("audio", "ffmpeg not installed")
        return None
    except Exception as e:
        log_error("audio", f"convert error: {e}")
        return None
    finally:
        for p in (src_path, dst_path):
            if p:
                try:
                    os.unlink(p)
                except Exception:
                    pass


def _sync_transcribe(audio_bytes: bytes, creds_path: str, language_code: str) -> Optional[str]:
    """Synchronous transcription - runs in thread pool to avoid blocking."""
    try:
        from google.cloud import speech
        from google.oauth2 import service_account

        wav_data = _convert_to_wav(audio_bytes)
        if not wav_data:
            log_error("audio", "ffmpeg conversion failed")
            return None
        encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16
        data = wav_data
        
        credentials = service_account.Credentials.from_service_account_file(creds_path)
        client = speech.SpeechClient(credentials=credentials)
        
        audio = speech.RecognitionAudio(content=data)
        config = speech.RecognitionConfig(
            encoding=encoding,
            sample_rate_hertz=16000,
            language_code=language_code,
            enable_automatic_punctuation=True,
        )
        
        response = client.recognize(config=config, audio=audio)
        
        transcript_parts = []
        for result in response.results:
            if result.alternatives:
                transcript_parts.append(result.alternatives[0].transcript)
        
        return " ".join(transcript_parts) if transcript_parts else None
        
    except ImportError as e:
        log_error("audio", f"import error: {e}")
        return None
    except Exception as e:
        log_error("audio", f"stt exception: {type(e).__name__}: {str(e)[:200]}")
        return None


async def transcribe_audio(audio_bytes: bytes, language_code: str = "he-IL") -> Optional[str]:
    """Transcribe OGG/Opus audio using Google Cloud Speech-to-Text.
    
    Runs in a thread pool to avoid blocking the event loop.
    """
    creds_path = _get_google_credentials()
    if not creds_path:
        log_error("audio", "no google credentials")
        return None
    
    try:
        # Run sync transcription in thread pool - doesn't block workers
        transcript = await asyncio.to_thread(
            _sync_transcribe, audio_bytes, creds_path, language_code
        )
        
        if transcript:
            log_audio("transcribed", chars=len(transcript))
            return transcript
        
        return None
            
    except Exception as e:
        log_error("audio", str(e)[:80])
        return None
    finally:
        if creds_path and creds_path.startswith(tempfile.gettempdir()):
            try:
                os.unlink(creds_path)
            except Exception:
                pass


async def transcribe_whatsapp_audio(media_id: str, access_token: str) -> Optional[str]:
    """Download and transcribe a WhatsApp voice message."""
    try:
        audio_bytes = await download_whatsapp_media(media_id, access_token)
        if not audio_bytes:
            return None
        
        return await transcribe_audio(audio_bytes)
        
    except Exception as e:
        log_error("audio", str(e)[:80])
        return None
