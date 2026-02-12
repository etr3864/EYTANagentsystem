"""Meta WhatsApp Business API webhook handler."""
import asyncio
from fastapi import APIRouter, Request, HTTPException, Query

from backend.core.database import SessionLocal
from backend.core.logger import log_audio, log_image, log_error
from backend.api.webhook import extract_message
from backend.api.schemas import WebhookPayload
from backend.services import agents, whatsapp, message_buffer, transcription, media
from backend.services.message_buffer import PendingMessage
from backend.services.message_processing import process_batched_messages, is_duplicate

router = APIRouter(tags=["webhook"])


async def handle_incoming_message(
    phone_number_id: str, 
    user_phone: str, 
    content: str, 
    user_name: str | None = None,
    msg_type: str = "text",
    mime_type: str | None = None
):
    """Handle incoming message - transcribe audio, download images, add to buffer."""
    db = SessionLocal()
    try:
        agent = agents.get_by_phone_number_id(db, phone_number_id)
        if not agent:
            return
        
        text = content
        image_base64 = None
        final_msg_type = msg_type
        final_mime_type = None
        
        if msg_type == "audio":
            log_audio("received", provider="meta", agent=agent.name)
            transcript = await transcription.transcribe_whatsapp_audio(content, agent.access_token)
            
            if transcript:
                text = f"[הודעה קולית]: {transcript}"
                final_msg_type = "voice"
            else:
                text = "[הודעה קולית - לא הצלחתי לתמלל]"
                final_msg_type = "voice"
                log_error("audio", "transcription failed")
        
        elif msg_type == "image":
            log_image("received", provider="meta", agent=agent.name)
            image_base64 = await media.download_image_as_base64(content, agent.access_token)
            
            if image_base64:
                text = "[תמונה]"
                final_msg_type = "image"
                final_mime_type = media.get_media_type_from_mime(mime_type or "image/jpeg")
            else:
                text = "[תמונה - לא הצלחתי להוריד]"
                final_msg_type = "text"
                log_error("image", "download failed")
        
        agent_id = agent.id
        phone_number_id_for_send = agent.phone_number_id
        access_token = agent.access_token
        batching_config = agent.get_batching_config()
        debounce = batching_config.get("debounce_seconds", 3)
        max_batch = batching_config.get("max_batch_messages", 10)
        
        pending = PendingMessage(
            text=text,
            msg_type=final_msg_type,
            image_base64=image_base64,
            media_type=final_mime_type
        )
        
        # Create send functions for this agent
        async def send_fn(to: str, text: str) -> bool:
            return await whatsapp.send_message(phone_number_id_for_send, access_token, to, text)
        
        async def send_media_fn(to: str, url: str, media_type: str, caption: str | None, filename: str | None = None) -> bool:
            if media_type == "document":
                return await whatsapp.send_document(phone_number_id_for_send, access_token, to, url, filename or "file", caption)
            return await whatsapp.send_media(phone_number_id_for_send, access_token, to, url, media_type, caption)
        
        if debounce == 0:
            await process_batched_messages(agent_id, user_phone, user_name, [pending], send_fn, "meta", send_media_fn)
            return
        
        async def process_callback(pending_msgs: list[PendingMessage]):
            await process_batched_messages(agent_id, user_phone, user_name, pending_msgs, send_fn, "meta", send_media_fn)
        
        await message_buffer.add_message(
            agent_id=agent_id,
            user_phone=user_phone,
            text=text,
            debounce_seconds=debounce,
            max_messages=max_batch,
            process_callback=process_callback,
            msg_type=final_msg_type,
            image_base64=image_base64,
            media_type=final_mime_type
        )
    finally:
        db.close()


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    """Verify webhook for Meta WhatsApp Business API."""
    db = SessionLocal()
    try:
        all_agents = agents.get_all(db)
        for agent in all_agents:
            if agent.verify_token == hub_verify_token:
                return int(hub_challenge)
    finally:
        db.close()
    raise HTTPException(status_code=403, detail="Invalid verify token")


@router.post("/webhook")
async def receive_webhook(request: Request):
    """Receive webhook from Meta WhatsApp Business API."""
    body = await request.body()
    try:
        payload = WebhookPayload.model_validate_json(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    result = extract_message(payload)
    if result:
        phone_number_id, user_phone, content, user_name, msg_type, mime_type = result
        
        # Use message ID for deduplication (if available in content for text messages)
        message_id = f"{phone_number_id}:{user_phone}:{hash(content)}"
        if is_duplicate(message_id):
            return {"status": "ok", "duplicate": True}
        
        asyncio.create_task(handle_incoming_message(
            phone_number_id, user_phone, content, user_name, msg_type, mime_type
        ))

    return {"status": "ok"}
