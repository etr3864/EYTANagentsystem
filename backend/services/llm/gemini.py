"""Google Gemini provider implementation."""
import asyncio
from typing import TYPE_CHECKING

from google import genai
from google.genai import types

from .types import LLMResponse, ToolHandler
from .converters import (
    anthropic_tools_to_gemini,
    anthropic_system_to_gemini,
    gemini_function_call_to_standard
)
from backend.core.ai_config import USER_TOOLS
from backend.core.logger import log_error

if TYPE_CHECKING:
    from backend.models.agent import Agent

GEMINI_TOOL_SUFFIX = """

הנחיות ספציפיות לשימוש בכלים:
- חובה לקרוא לכלי בפורמט הנכון עם כל הפרמטרים הנדרשים
- אל תמציא פרמטרים שלא קיימים
- אם כלי נכשל, נסה שוב או דווח למשתמש על הבעיה
- בסיום שימוש בכלי - חובה להמשיך ולענות למשתמש!
"""


class GeminiProvider:
    """Google Gemini API provider with tool support and retry logic."""
    
    MAX_RETRIES = 3
    RETRY_DELAY = 1.0
    
    def __init__(self, api_key: str, provider_name: str = "google", agent: "Agent | None" = None):
        self._client = genai.Client(api_key=api_key)
        self._api_key = api_key
        self._provider_name = provider_name
        self._agent = agent
        self._gemini_tools = anthropic_tools_to_gemini(USER_TOOLS)

    def _rebuild_client(self, new_key: str):
        self._client = genai.Client(api_key=new_key)
        self._api_key = new_key

    async def _call_with_retry(self, method_name: str, *args, **kwargs):
        """Execute function with retry logic, key rotation on rate limit/auth errors.

        Uses method_name (e.g. 'generate_content') to always resolve from the
        current self._client, so key rotation takes effect on retry.
        """
        from . import key_manager
        last_error = None
        
        for attempt in range(self.MAX_RETRIES):
            try:
                func = getattr(self._client.models, method_name)
                return await asyncio.to_thread(func, *args, **kwargs)
            except Exception as e:
                last_error = e
                error_str = str(e)

                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    override = key_manager.is_override_key(self._provider_name, self._api_key, self._agent)
                    if override:
                        await asyncio.sleep(self.RETRY_DELAY * (2 ** attempt))
                        continue
                    key_manager.mark_rate_limited(self._provider_name, self._api_key)
                    new_key = key_manager.get_key(self._provider_name, self._agent)
                    if new_key != self._api_key:
                        self._rebuild_client(new_key)
                        continue
                    await asyncio.sleep(self.RETRY_DELAY * (2 ** attempt))
                    continue

                if "API key" in error_str or "PERMISSION_DENIED" in error_str:
                    override = key_manager.is_override_key(self._provider_name, self._api_key, self._agent)
                    if override:
                        log_error("gemini", "Agent override key failed, falling back to pool")
                        key_manager.mark_dead(self._provider_name, self._api_key)
                        new_key = key_manager.get_key(self._provider_name)
                        self._rebuild_client(new_key)
                        continue
                    key_manager.mark_dead(self._provider_name, self._api_key)
                    new_key = key_manager.get_key(self._provider_name, self._agent)
                    self._rebuild_client(new_key)
                    continue
                
                if attempt < self.MAX_RETRIES - 1:
                    delay = self.RETRY_DELAY * (2 ** attempt)
                    log_error("gemini_retry", f"Attempt {attempt+1} failed: {error_str[:50]}")
                    await asyncio.sleep(delay)
        
        log_error("gemini_failed", f"All {self.MAX_RETRIES} attempts failed")
        raise last_error
    
    async def get_response(
        self,
        model: str,
        system_blocks: list,
        history: list[dict],
        user_content: str | list,
        tool_handler: ToolHandler = None
    ) -> LLMResponse:
        """Get response from Gemini with tool support.
        
        Args:
            model: Model name (e.g., 'gemini-2.0-flash')
            system_blocks: Anthropic-format system blocks (will be converted)
            history: Conversation history
            user_content: User message (string or content blocks)
            tool_handler: Async function to handle tool calls
        
        Returns:
            LLMResponse with text, tool_calls, usage, media_actions
        """
        # Build system instruction from Anthropic blocks
        system_text = anthropic_system_to_gemini(system_blocks)
        system_text += GEMINI_TOOL_SUFFIX
        
        # Build conversation history for Gemini
        gemini_contents = []
        
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            content = msg.get("content", "")
            
            if isinstance(content, str):
                gemini_contents.append(types.Content(
                    role=role,
                    parts=[types.Part(text=content)]
                ))
            elif isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, str):
                        parts.append(types.Part(text=block))
                    elif isinstance(block, dict) and block.get("type") == "text":
                        parts.append(types.Part(text=block["text"]))
                    # Skip images - they stay with Claude
                if parts:
                    gemini_contents.append(types.Content(role=role, parts=parts))
        
        # Add current user message
        if isinstance(user_content, str):
            gemini_contents.append(types.Content(
                role="user",
                parts=[types.Part(text=user_content)]
            ))
        elif isinstance(user_content, list):
            parts = []
            for block in user_content:
                if isinstance(block, str):
                    parts.append(types.Part(text=block))
                elif isinstance(block, dict) and block.get("type") == "text":
                    parts.append(types.Part(text=block["text"]))
            if parts:
                gemini_contents.append(types.Content(role="user", parts=parts))
        
        # Configure generation
        config = types.GenerateContentConfig(
            system_instruction=system_text,
            tools=[self._gemini_tools],
            max_output_tokens=4096,
            temperature=0.7
        )
        
        response = await self._call_with_retry(
            "generate_content",
            model=model,
            contents=gemini_contents,
            config=config
        )
        
        # Track token usage (handle None values)
        usage_data = {
            "input_tokens": (getattr(response.usage_metadata, 'prompt_token_count', 0) or 0) if response.usage_metadata else 0,
            "output_tokens": (getattr(response.usage_metadata, 'candidates_token_count', 0) or 0) if response.usage_metadata else 0,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 0
        }
        
        # Parse response
        text_response = ""
        tool_calls = []
        media_actions = []
        
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'text') and part.text:
                    text_response = part.text
                elif hasattr(part, 'function_call') and part.function_call:
                    tool_calls.append(gemini_function_call_to_standard(part.function_call))
        
        # Tool execution loop
        max_tool_rounds = 5
        
        while tool_calls and tool_handler and max_tool_rounds > 0:
            max_tool_rounds -= 1
            
            # Add assistant response to history
            gemini_contents.append(response.candidates[0].content)
            
            # Execute tools
            if asyncio.iscoroutinefunction(tool_handler):
                tool_results_data = await tool_handler(tool_calls)
            else:
                tool_results_data = tool_handler(tool_calls)
            
            # Build function responses
            response_parts = []
            for i, call in enumerate(tool_calls):
                result_data = tool_results_data[i] if i < len(tool_results_data) else None
                if not result_data:
                    result = "לא נמצא"
                elif isinstance(result_data.get("result"), dict) and result_data["result"].get("action") == "send_media":
                    media_actions.append(result_data["result"])
                    result = f"מדיה '{result_data['result'].get('name', '')}' תישלח ללקוח."
                else:
                    result = str(result_data["result"]) if not isinstance(result_data["result"], str) else result_data["result"]
                
                response_parts.append(types.Part(
                    function_response=types.FunctionResponse(
                        name=call["name"],
                        response={"result": result}
                    )
                ))
            
            gemini_contents.append(types.Content(role="user", parts=response_parts))
            
            response = await self._call_with_retry(
                "generate_content",
                model=model,
                contents=gemini_contents,
                config=config
            )
            
            # Update usage (handle None values)
            if response.usage_metadata:
                usage_data["input_tokens"] += getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
                usage_data["output_tokens"] += getattr(response.usage_metadata, 'candidates_token_count', 0) or 0
            
            # Parse new response
            tool_calls = []
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'text') and part.text:
                        text_response = part.text
                    elif hasattr(part, 'function_call') and part.function_call:
                        tool_calls.append(gemini_function_call_to_standard(part.function_call))
        
        return LLMResponse(
            text=text_response,
            tool_calls=[],  # All calls were handled in the loop
            usage=usage_data,
            media_actions=media_actions
        )

    async def generate_simple_response(
        self, prompt: str, model: str = "gemini-2.0-flash", max_tokens: int = 300
    ) -> str:
        """Generate a simple text response without tools (for follow-ups, reminders)."""
        config = types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=0.7,
        )
        response = await self._call_with_retry(
            "generate_content",
            model=model,
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
            config=config,
        )
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, "text") and part.text:
                    return part.text.strip()
        return ""
