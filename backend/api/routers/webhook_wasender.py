"""WA Sender webhook handler."""
import asyncio
from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional

from backend.core.database import SessionLocal
from backend.core.logger import log_error, log_audio, log_image
from backend.services import agents, message_buffer, transcription, media, wasender
from backend.services.message_buffer import PendingMessage
from backend.services.message_processing import process_batched_messages, is_duplicate

router = APIRouter(tags=["webhook-wasender"])


async def handle_wasender_message(agent_id: int, msg_data: dict):
    """Handle incoming WA Sender message."""
    db = SessionLocal()
    try:
        agent = agents.get_by_id(db, agent_id)
        if not agent or agent.provider != "wasender":
            log_error("wasender", f"agent_id={agent_id} invalid or not wasender")
            return
        
        phone = msg_data["phone"]
        name = msg_data.get("name")
        msg_type = msg_data["msg_type"]
        text = msg_data.get("text", "")
        
        config = agent.provider_config or {}
        api_key = config.get("api_key", "")
        
        final_text = text
        image_base64 = None
        final_msg_type = msg_type
        final_mime_type = None
        
        if msg_type == "audio":
            log_audio("received", agent=agent.name, provider="wasender")
            
            public_url = await wasender.decrypt_media(
                api_key,
                msg_data["message_key"],
                msg_data["message_data"]
            )
            
            if public_url:
                audio_bytes = await media.download_from_url(public_url)
                if audio_bytes:
                    transcript = await transcription.transcribe_audio(audio_bytes)
                    if transcript:
                        final_text = f"[הודעה קולית]: {transcript}"
                        final_msg_type = "voice"
                    else:
                        final_text = "[הודעה קולית - לא הצלחתי לתמלל]"
                        final_msg_type = "voice"
                        log_error("audio", "transcription failed")
                else:
                    final_text = "[הודעה קולית - לא הצלחתי להוריד]"
                    final_msg_type = "voice"
            else:
                final_text = "[הודעה קולית - לא הצלחתי לפענח]"
                final_msg_type = "voice"
        
        elif msg_type == "image":
            log_image("received", agent=agent.name, provider="wasender")
            
            public_url = await wasender.decrypt_media(
                api_key,
                msg_data["message_key"],
                msg_data["message_data"]
            )
            
            if public_url:
                image_base64 = await media.download_url_as_base64(public_url)
                if image_base64:
                    final_text = "[תמונה]"
                    final_msg_type = "image"
                    final_mime_type = media.get_media_type_from_mime(msg_data.get("mime_type", "image/jpeg"))
                else:
                    final_text = "[תמונה - לא הצלחתי להוריד]"
                    final_msg_type = "text"
                    log_error("image", "download failed")
            else:
                final_text = "[תמונה - לא הצלחתי לפענח]"
                final_msg_type = "text"
        
        agent_id_for_closure = agent.id
        batching_config = agent.get_batching_config()
        debounce = batching_config.get("debounce_seconds", 3)
        max_batch = batching_config.get("max_batch_messages", 10)
        
        # Save provider config for callbacks (agent won't be valid after db close)
        provider_api_key = config.get("api_key", "")
        provider_session = config.get("session", "default")
        
        pending = PendingMessage(
            text=final_text,
            msg_type=final_msg_type,
            image_base64=image_base64,
            media_type=final_mime_type
        )
        
        # Create send functions for this agent
        async def send_fn(to: str, text: str) -> bool:
            return await wasender.send_message(provider_api_key, provider_session, to, text)
        
        async def send_media_fn(to: str, url: str, media_type: str, caption: str | None) -> bool:
            return await wasender.send_media(provider_api_key, provider_session, to, url, media_type, caption)
        
        if debounce == 0:
            await process_batched_messages(agent_id_for_closure, phone, name, [pending], send_fn, "wasender", send_media_fn)
            return
        
        async def process_callback(pending_msgs: list[PendingMessage]):
            await process_batched_messages(agent_id_for_closure, phone, name, pending_msgs, send_fn, "wasender", send_media_fn)
        
        await message_buffer.add_message(
            agent_id=agent_id_for_closure,
            user_phone=phone,
            text=final_text,
            debounce_seconds=debounce,
            max_messages=max_batch,
            process_callback=process_callback,
            msg_type=final_msg_type,
            image_base64=image_base64,
            media_type=final_mime_type
        )
    finally:
        db.close()


@router.post("/webhook/wasender/{agent_id}")
async def receive_wasender_webhook(
    agent_id: int,
    request: Request,
    x_webhook_signature: Optional[str] = Header(None, alias="X-Webhook-Signature")
):
    """Receive webhook from WA Sender for a specific agent."""
    db = SessionLocal()
    try:
        agent = agents.get_by_id(db, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        if agent.provider != "wasender":
            raise HTTPException(status_code=400, detail="Agent is not configured for WA Sender")
        
        config = agent.provider_config or {}
        webhook_secret = config.get("webhook_secret", "")
        
        if webhook_secret and not wasender.verify_signature(x_webhook_signature, webhook_secret):
            raise HTTPException(status_code=403, detail="Invalid signature")
        
        body = await request.json()
        msg_data = wasender.extract_message_data(body)
        
        if msg_data:
            message_id = msg_data.get("message_key", {}).get("id", "")
            if is_duplicate(message_id):
                return {"status": "ok", "duplicate": True}
            
            asyncio.create_task(handle_wasender_message(agent_id, msg_data))
        
        return {"status": "ok"}
        
    finally:
        db.close()
