"""AI service - Claude API integration."""
import anthropic
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.logger import log_error
from backend.core.ai_config import USER_TOOLS, SYSTEM_SUFFIX

if TYPE_CHECKING:
    from backend.services.message_buffer import PendingMessage

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

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
    
    # Custom instructions from agent config
    custom_instructions = media_config.get("instructions", "")
    
    if media_count <= MAX_MEDIA_IN_PROMPT:
        # List all media in prompt
        media_items = agent_media.get_media_for_prompt(db, agent_id)
        
        media_lines = []
        for m in media_items:
            desc = f" - {m['description']}" if m['description'] else ""
            caption_hint = f" (כיתוב: {m['caption'][:30]}...)" if m['caption'] and len(m['caption']) > 30 else (f" (כיתוב: {m['caption']})" if m['caption'] else "")
            media_lines.append(f"• ID:{m['id']} [{m['type']}] {m['name']}{desc}{caption_hint}")
        
        context = f"מדיה זמינה לשליחה ({media_count} פריטים):\n" + "\n".join(media_lines)
        context += "\n\nלשליחת מדיה השתמש בכלי send_media עם ה-ID המתאים."
    else:
        # Too many items - use search
        context = f"יש מאגר מדיה עם {media_count} תמונות/וידאו."
        context += "\nלמציאת מדיה רלוונטית השתמש בכלי search_media עם תיאור מה שאתה מחפש."
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
    """Get short Hebrew description of image for DB storage."""
    try:
        response = await _client.messages.create(
            model="claude-3-5-haiku-20241022",  # Fast and cheap for descriptions
            max_tokens=150,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_base64
                        }
                    },
                    {
                        "type": "text",
                        "text": "תאר את התמונה הזו בקצרה במשפט אחד בעברית."
                    }
                ]
            }]
        )
        
        for block in response.content:
            if block.type == "text":
                return block.text.strip()
        
        return "תמונה"
    except Exception as e:
        log_error("image_describe", str(e)[:50])
        return "תמונה"


async def analyze_media_image(image_base64: str, media_type: str = "image/jpeg") -> dict:
    """Analyze image and generate name, description, and caption for media library.
    
    Returns dict with:
        - name: Short name (2-4 words) for the image
        - description: Detailed description for semantic search
        - caption: Short natural caption for WhatsApp
    """
    prompt = """אתה מנתח תמונות עבור ספריית מדיה של עסק.
נתח את התמונה וצור:

1. **name** - שם קצר וממוקד (2-4 מילים בעברית)
   דוגמאות: "לוגו החברה", "תמונת מוצר אדום", "צוות העובדים"

2. **description** - תיאור מפורט לחיפוש (30-60 מילים בעברית)
   כלול: מה בתמונה, צבעים, אובייקטים, טקסט שמופיע, סגנון, מיקום
   התיאור ישמש סוכן AI למצוא את התמונה הנכונה לשלוח ללקוח

3. **caption** - כיתוב קצר וטבעי לשליחה בWhatsApp (עד 15 מילים)
   משהו שסוכן ישלח עם התמונה, למשל: "הנה הלוגו שלנו!" או "צפה במוצר החדש"

החזר תשובה בפורמט JSON בלבד:
{"name": "...", "description": "...", "caption": "..."}"""

    try:
        response = await _client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_base64
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }]
        )
        
        for block in response.content:
            if block.type == "text":
                import json
                text = block.text.strip()
                # Handle potential markdown code blocks
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()
                return json.loads(text)
        
        return {"name": "תמונה", "description": "", "caption": ""}
    except Exception as e:
        log_error("image_analyze", str(e)[:50])
        return {"name": "תמונה", "description": "", "caption": ""}


def build_user_content(pending_messages: list["PendingMessage"]) -> list[dict]:
    """Build Claude API content blocks from pending messages."""
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
    
    Returns:
        tuple: (response_text, tool_calls, usage_data, media_actions)
        - media_actions: List of dicts with action='send_media' for media to send
    """
    import asyncio
    
    clean_history = [{"role": m["role"], "content": m["content"]} for m in history]
    
    if pending_messages:
        user_content = build_user_content(pending_messages)
    else:
        user_content = user_message
    
    messages = clean_history + [{"role": "user", "content": user_content}]
    
    # Add appointment context if calendar is configured
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
    
    system_blocks = build_system_prompt(full_prompt, user_info or {}, knowledge_context, media_context)
    
    response = await _client.messages.create(
        model=model,
        max_tokens=1024,
        system=system_blocks,
        messages=messages,
        tools=USER_TOOLS,
        extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"}
    )
    
    cache_read = getattr(response.usage, 'cache_read_input_tokens', 0)
    cache_create = getattr(response.usage, 'cache_creation_input_tokens', 0)
    
    usage_data = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_read_tokens": cache_read,
        "cache_creation_tokens": cache_create
    }
    
    tool_calls = []
    text_response = ""
    
    for block in response.content:
        if block.type == "text":
            text_response = block.text
        elif block.type == "tool_use":
            tool_calls.append({"id": block.id, "name": block.name, "input": block.input})
    
    media_actions = []
    
    # Loop to handle multiple tool calls until AI returns text
    max_tool_rounds = 5  # Safety limit
    current_response = response
    
    while current_response.stop_reason == "tool_use" and tool_handler and max_tool_rounds > 0:
        max_tool_rounds -= 1
        
        # Extract tool calls from current response
        current_tool_calls = []
        for block in current_response.content:
            if block.type == "tool_use":
                current_tool_calls.append({"id": block.id, "name": block.name, "input": block.input})
        
        if not current_tool_calls:
            break
        
        messages.append({"role": "assistant", "content": current_response.content})
        
        # Execute tools - support both sync and async handlers
        if asyncio.iscoroutinefunction(tool_handler):
            tool_results_data = await tool_handler(current_tool_calls)
        else:
            tool_results_data = tool_handler(current_tool_calls)
        
        tool_results = []
        for call in current_tool_calls:
            result_data = next((r for r in tool_results_data if r["name"] == call["name"]), None)
            if not result_data:
                result = "לא נמצא"
            elif isinstance(result_data.get("result"), dict) and result_data["result"].get("action") == "send_media":
                # Collect media action for later sending
                media_actions.append(result_data["result"])
                result = f"מדיה '{result_data['result'].get('name', '')}' תישלח ללקוח."
            else:
                result = result_data["result"]
            
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": call["id"],
                "content": result
            })
        
        messages.append({"role": "user", "content": tool_results})
        
        # Get next response
        current_response = await _client.messages.create(
            model=model,
            max_tokens=1024,
            system=system_blocks,
            messages=messages,
            tools=USER_TOOLS,
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"}
        )
        
        usage_data["input_tokens"] += current_response.usage.input_tokens
        usage_data["output_tokens"] += current_response.usage.output_tokens
        usage_data["cache_read_tokens"] += getattr(current_response.usage, 'cache_read_input_tokens', 0)
        usage_data["cache_creation_tokens"] += getattr(current_response.usage, 'cache_creation_input_tokens', 0)
    
    # Extract final text response
    for block in current_response.content:
        if block.type == "text":
            text_response = block.text
            break
    
    return text_response, tool_calls, usage_data, media_actions


async def generate_simple_response(prompt: str) -> str:
    """Generate a simple text response without conversation history.
    
    Async function for simple AI generation tasks like reminders.
    Uses a smaller, faster model for efficiency.
    """
    try:
        response = await _client.messages.create(
            model="claude-3-5-haiku-20241022",  # Fast and cheap
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        
        for block in response.content:
            if block.type == "text":
                return block.text.strip()
        
        return ""
    except Exception as e:
        log_error("ai_simple", str(e)[:50])
        raise
