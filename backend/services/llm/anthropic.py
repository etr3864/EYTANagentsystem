"""Anthropic (Claude) provider implementation."""
import anthropic
import asyncio
from typing import TYPE_CHECKING

from .types import LLMResponse, ToolHandler
from backend.core.ai_config import USER_TOOLS

if TYPE_CHECKING:
    from backend.services.message_buffer import PendingMessage


class AnthropicProvider:
    """Claude API provider with tool support and caching."""
    
    def __init__(self, api_key: str):
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
    
    def build_user_content(self, pending_messages: list["PendingMessage"]) -> list[dict]:
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
        self,
        model: str,
        system_blocks: list,
        history: list[dict],
        user_content: str | list,
        tool_handler: ToolHandler = None
    ) -> LLMResponse:
        """Get response from Claude with tool support.
        
        Args:
            model: Model name (e.g., 'claude-sonnet-4-20250514')
            system_blocks: System prompt blocks with caching
            history: Conversation history
            user_content: User message (string or content blocks)
            tool_handler: Async function to handle tool calls
        
        Returns:
            LLMResponse with text, tool_calls, usage, media_actions
        """
        clean_history = [{"role": m["role"], "content": m["content"]} for m in history]
        messages = clean_history + [{"role": "user", "content": user_content}]
        
        response = await self._client.messages.create(
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
        media_actions = []
        
        for block in response.content:
            if block.type == "text":
                text_response = block.text
            elif block.type == "tool_use":
                tool_calls.append({"id": block.id, "name": block.name, "input": block.input})
        
        # Tool execution loop
        max_tool_rounds = 5
        current_response = response
        
        while current_response.stop_reason == "tool_use" and tool_handler and max_tool_rounds > 0:
            max_tool_rounds -= 1
            
            current_tool_calls = []
            for block in current_response.content:
                if block.type == "tool_use":
                    current_tool_calls.append({"id": block.id, "name": block.name, "input": block.input})
            
            if not current_tool_calls:
                break
            
            messages.append({"role": "assistant", "content": current_response.content})
            
            # Execute tools
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
            
            current_response = await self._client.messages.create(
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
        
        # Extract final text
        for block in current_response.content:
            if block.type == "text":
                text_response = block.text
                break
        
        return LLMResponse(
            text=text_response,
            tool_calls=tool_calls,
            usage=usage_data,
            media_actions=media_actions
        )
    
    async def describe_image(self, image_base64: str, media_type: str = "image/jpeg") -> str:
        """Get short Hebrew description of image."""
        try:
            response = await self._client.messages.create(
                model="claude-3-5-haiku-20241022",
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
        except Exception:
            return "תמונה"
    
    async def analyze_media_image(self, image_base64: str, media_type: str = "image/jpeg") -> dict:
        """Analyze image and generate name, description, caption for media library."""
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
            response = await self._client.messages.create(
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
                    if text.startswith("```"):
                        text = text.split("```")[1]
                        if text.startswith("json"):
                            text = text[4:]
                        text = text.strip()
                    return json.loads(text)
            
            return {"name": "תמונה", "description": "", "caption": ""}
        except Exception:
            return {"name": "תמונה", "description": "", "caption": ""}
    
    async def analyze_document(self, text_content: str) -> dict:
        """Analyze document text and generate name, description, caption."""
        prompt = f"""אתה מנתח מסמכים עבור ספריית קבצים של עסק.
נתח את תוכן המסמך וצור:

1. **name** - שם קצר וממוקד (2-4 מילים בעברית)
   דוגמאות: "מחירון 2026", "הסכם שירות", "קטלוג מוצרים"

2. **description** - תיאור מפורט לחיפוש (30-60 מילים בעברית)
   כלול: סוג המסמך, תוכן עיקרי, למי מיועד, נושאים מרכזיים
   התיאור ישמש סוכן AI למצוא את הקובץ הנכון לשלוח ללקוח

3. **caption** - כיתוב קצר וטבעי לשליחה בWhatsApp (עד 15 מילים)
   משהו שסוכן ישלח עם הקובץ, למשל: "הנה המחירון המעודכן" או "מצורף ההסכם לעיון"

החזר תשובה בפורמט JSON בלבד:
{{"name": "...", "description": "...", "caption": "..."}}

תוכן המסמך:
{text_content}"""

        try:
            response = await self._client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )
            
            for block in response.content:
                if block.type == "text":
                    import json
                    text = block.text.strip()
                    if text.startswith("```"):
                        text = text.split("```")[1]
                        if text.startswith("json"):
                            text = text[4:]
                        text = text.strip()
                    return json.loads(text)
            
            return {"name": "קובץ", "description": "", "caption": ""}
        except Exception:
            return {"name": "קובץ", "description": "", "caption": ""}
    
    async def generate_simple_response(self, prompt: str) -> str:
        """Generate a simple text response (for reminders etc.)."""
        response = await self._client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        
        for block in response.content:
            if block.type == "text":
                return block.text.strip()
        
        return ""
