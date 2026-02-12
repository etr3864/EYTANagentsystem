"""AI service - Multi-provider LLM integration.

Supports:
- Anthropic Claude (default, includes image understanding)
- Google Gemini (text only, no image input)
"""
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from backend.core.logger import log_error
from backend.core.ai_config import SYSTEM_SUFFIX
from backend.services.llm import get_provider
from backend.services.llm.types import LLMResponse

if TYPE_CHECKING:
    from backend.services.message_buffer import PendingMessage

# Max media items to inject directly into prompt (above this, use search_media tool)
MAX_MEDIA_IN_PROMPT = 15


def build_media_context(db: Session, agent_id: int, media_config: dict | None) -> str:
    """Build media context for system prompt.
    
    If agent has <= 15 media items: returns list of all media
    If agent has > 15 media items: returns instruction to use search_media
    If media is disabled or no media: returns empty string
    """
    if not media_config or not media_config.get("enabled"):
        return ""
    
    from backend.services import agent_media
    
    media_count = agent_media.count_by_agent(db, agent_id)
    
    if media_count == 0:
        return ""
    
    custom_instructions = media_config.get("instructions", "")
    
    if media_count <= MAX_MEDIA_IN_PROMPT:
        media_items = agent_media.get_media_for_prompt(db, agent_id)
        
        media_lines = []
        type_labels = {"image": "תמונה", "video": "וידאו", "document": "קובץ"}
        for m in media_items:
            type_label = type_labels.get(m['type'], m['type'])
            desc = f" - {m['description']}" if m['description'] else ""
            caption_hint = ""
            if m['caption']:
                caption_hint = f" (כיתוב: {m['caption'][:30]}...)" if len(m['caption']) > 30 else f" (כיתוב: {m['caption']})"
            filename_hint = f" [קובץ: {m['filename']}]" if m.get('filename') else ""
            media_lines.append(f"• ID:{m['id']} [{type_label}] {m['name']}{filename_hint}{desc}{caption_hint}")
        
        context = f"מדיה וקבצים זמינים לשליחה ({media_count} פריטים):\n" + "\n".join(media_lines)
        context += "\n\nלשליחה השתמש בכלי send_media עם ה-ID המתאים."
    else:
        context = f"יש מאגר מדיה וקבצים עם {media_count} פריטים."
        context += "\nלמציאת מדיה/קבצים רלוונטיים השתמש בכלי search_media עם תיאור מה שאתה מחפש."
        context += "\nלאחר מכן השתמש ב-send_media עם ה-ID שנמצא."
    
    if custom_instructions:
        context += f"\n\nהנחיות שימוש במדיה:\n{custom_instructions}"
    
    return context


def build_system_prompt(
    base_prompt: str, 
    user_info: dict, 
    knowledge_context: str = "",
    media_context: str = ""
) -> list[dict]:
    """Build system prompt blocks with caching."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    
    blocks = []
    tz = ZoneInfo("Asia/Jerusalem")
    now = datetime.now(tz)
    
    days_hebrew = ['שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'ראשון']
    day_name = days_hebrew[now.weekday()]
    date_str = f"היום: יום {day_name}, {now.strftime('%d/%m/%Y')}, שעה {now.strftime('%H:%M')}"
    
    # Block 1: Base prompt + knowledge + media (CACHED - stable per agent)
    cached_content = f"{date_str}\n\n{base_prompt}{SYSTEM_SUFFIX}"
    if knowledge_context:
        cached_content += f"\n\n---\nמאגר מידע עסקי:\n{knowledge_context}"
    if media_context:
        cached_content += f"\n\n---\n{media_context}"
    
    blocks.append({
        "type": "text",
        "text": cached_content,
        "cache_control": {"type": "ephemeral"}
    })
    
    # Block 2: User info (NOT CACHED - changes per user)
    info_parts = []
    if user_info.get("name"):
        info_parts.append(f"שם: {user_info['name']}")
    if user_info.get("gender") and user_info["gender"] != "unknown":
        gender_text = "זכר" if user_info["gender"] == "male" else "נקבה"
        info_parts.append(f"מגדר: {gender_text}")
    if user_info.get("metadata"):
        meta = user_info["metadata"]
        if meta.get("business_type"):
            info_parts.append(f"תחום עסק: {meta['business_type']}")
        if meta.get("notes"):
            info_parts.append(f"הערות: {meta['notes']}")
    
    if info_parts:
        blocks.append({
            "type": "text",
            "text": "---\nמידע על המשתמש:\n" + "\n".join(info_parts)
        })
    
    return blocks


async def describe_image(image_base64: str, media_type: str = "image/jpeg") -> str:
    """Get short Hebrew description of image for DB storage.
    
    Always uses Claude (Anthropic) for image understanding.
    """
    try:
        provider = get_provider("claude")  # Force Claude for images
        return await provider.describe_image(image_base64, media_type)
    except Exception as e:
        log_error("image_describe", str(e)[:50])
        return "תמונה"


async def analyze_media_image(image_base64: str, media_type: str = "image/jpeg") -> dict:
    """Analyze image and generate name, description, and caption for media library.
    
    Always uses Claude (Anthropic) for image understanding.
    
    Returns dict with:
        - name: Short name (2-4 words) for the image
        - description: Detailed description for semantic search
        - caption: Short natural caption for WhatsApp
    """
    try:
        provider = get_provider("claude")
        return await provider.analyze_media_image(image_base64, media_type)
    except Exception as e:
        log_error("image_analyze", str(e)[:50])
        return {"name": "תמונה", "description": "", "caption": ""}


async def analyze_document(text_content: str) -> dict:
    """Analyze document text and generate name, description, and caption.
    
    Args:
        text_content: Extracted text from the document
        
    Returns dict with:
        - name: Short name for the document
        - description: Detailed description for semantic search
        - caption: Short caption for WhatsApp
    """
    if not text_content or len(text_content.strip()) < 10:
        return {"name": "קובץ", "description": "", "caption": ""}
    
    try:
        provider = get_provider("claude")
        return await provider.analyze_document(text_content)
    except Exception as e:
        log_error("document_analyze", str(e)[:50])
        return {"name": "קובץ", "description": "", "caption": ""}


def build_user_content(pending_messages: list["PendingMessage"]) -> list[dict]:
    """Build content blocks from pending messages (Anthropic format)."""
    content_blocks = []
    
    for msg in pending_messages:
        if msg.msg_type == "image" and msg.image_base64:
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": msg.media_type or "image/jpeg",
                    "data": msg.image_base64
                }
            })
            if msg.text:
                content_blocks.append({
                    "type": "text",
                    "text": msg.text
                })
        else:
            content_blocks.append({
                "type": "text",
                "text": msg.text
            })
    
    return content_blocks


def _contains_images(pending_messages: list["PendingMessage"] | None) -> bool:
    """Check if pending messages contain images."""
    if not pending_messages:
        return False
    return any(msg.msg_type == "image" and msg.image_base64 for msg in pending_messages)


async def get_response(
    model: str, 
    system_prompt: str, 
    history: list[dict], 
    user_message: str,
    user_info: dict | None = None,
    pending_messages: list["PendingMessage"] | None = None,
    knowledge_context: str = "",
    media_context: str = "",
    tool_handler: callable = None,
    appointment_prompt: str = None,
    calendar_config: dict | None = None,
    user_appointments: list = None
) -> tuple[str, list[dict], dict, list[dict]]:
    """Get AI response with tool support.
    
    Automatically selects the appropriate provider based on model name.
    Forces Claude for image inputs (Gemini image support not implemented).
    
    Returns:
        tuple: (response_text, tool_calls, usage_data, media_actions)
        - media_actions: List of dicts with action='send_media' for media to send
    """
    # Force Claude if input contains images
    actual_model = model
    if _contains_images(pending_messages) and model.startswith("gemini"):
        actual_model = "claude-sonnet-4-20250514"  # Fallback to Claude for images
    
    # Build user content
    if pending_messages:
        user_content = build_user_content(pending_messages)
    else:
        user_content = user_message
    
    # Build full system prompt with calendar context
    full_prompt = system_prompt
    if calendar_config and calendar_config.get("google_tokens"):
        working_hours = calendar_config.get("working_hours", {})
        days_hebrew = {'0': 'ראשון', '1': 'שני', '2': 'שלישי', '3': 'רביעי', '4': 'חמישי', '5': 'שישי', '6': 'שבת'}
        hours_text = []
        for day_num, day_name in days_hebrew.items():
            hours = working_hours.get(day_num)
            if hours:
                hours_text.append(f"- {day_name}: {hours['start']}-{hours['end']}")
            else:
                hours_text.append(f"- {day_name}: סגור")
        
        full_prompt += f"\n\n---\nשעות פעילות לתיאום פגישות:\n" + "\n".join(hours_text)
    
    if appointment_prompt:
        full_prompt += f"\n\nהנחיות נוספות לתיאום פגישות:\n{appointment_prompt}"
    
    # Add user's existing appointments to context
    if user_appointments:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(calendar_config.get("timezone", "Asia/Jerusalem") if calendar_config else "Asia/Jerusalem")
        apt_texts = []
        for apt in user_appointments:
            start_local = apt.start_time
            if start_local.tzinfo is None:
                start_local = start_local.replace(tzinfo=ZoneInfo("UTC"))
            start_local = start_local.astimezone(tz)
            apt_texts.append(f"- {apt.title}: {start_local.strftime('%d/%m/%Y')} בשעה {start_local.strftime('%H:%M')} (מזהה: {apt.id})")
        
        full_prompt += f"\n\n---\nפגישות קיימות של המשתמש:\n" + "\n".join(apt_texts)
        full_prompt += "\nאם המשתמש רוצה לשנות או לבטל פגישה קיימת, השתמש בכלי reschedule_appointment או cancel_appointment עם המזהה המתאים."
    
    # Build system blocks (Anthropic format, converted by Gemini provider if needed)
    system_blocks = build_system_prompt(full_prompt, user_info or {}, knowledge_context, media_context)
    
    # Get the appropriate provider
    provider = get_provider(actual_model)
    
    # Get response from provider
    response: LLMResponse = await provider.get_response(
        model=actual_model,
        system_blocks=system_blocks,
        history=history,
        user_content=user_content,
        tool_handler=tool_handler
    )
    
    return response.text, response.tool_calls, response.usage, response.media_actions


async def generate_simple_response(prompt: str) -> str:
    """Generate a simple text response without conversation history.
    
    Async function for simple AI generation tasks like reminders.
    Always uses Claude for consistency.
    """
    try:
        provider = get_provider("claude")
        return await provider.generate_simple_response(prompt)
    except Exception as e:
        log_error("ai_simple", str(e)[:50])
        raise
