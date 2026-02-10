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


def _sync_transcribe(audio_bytes: bytes, creds_path: str, language_code: str) -> Optional[str]:
    """Synchronous transcription - runs in thread pool to avoid blocking."""
    try:
        from google.cloud import speech
        from google.oauth2 import service_account
        
        credentials = service_account.Credentials.from_service_account_file(creds_path)
        client = speech.SpeechClient(credentials=credentials)
        
        audio = speech.RecognitionAudio(content=audio_bytes)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.OGG_OPUS,
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
        
    except ImportError:
        return None
    except Exception:
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
