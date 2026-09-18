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
from backend.core.logger import log, log_error
from backend.services.llm.catalog import (
    CHEAP_GEMINI,
    conversation_max_tokens,
    gemini_thinking_level,
    resolve_model,
)
from backend.services.llm.capacity import ThinkingDowngrade, is_capacity_error

if TYPE_CHECKING:
    from backend.models.agent import Agent

GEMINI_TOOL_SUFFIX = """

הנחיות ספציפיות לשימוש בכלים:
- חובה לקרוא לכלי בפורמט הנכון עם כל הפרמטרים הנדרשים
- אל תמציא פרמטרים שלא קיימים
- אם כלי נכשל, נסה שוב או דווח למשתמש על הבעיה
- בסיום שימוש בכלי - חובה להמשיך ולענות למשתמש!
"""

# HttpOptions.timeout is milliseconds (SDK converts to seconds for httpx).
GEMINI_HTTP_TIMEOUT_MS = 90_000
# Hard ceiling on the await — cancels the async httpx request (safe with aio).
GEMINI_CALL_TIMEOUT_SEC = 95.0

# We run tools ourselves; SDK AFC must stay off (FunctionDeclarations ≠ callables).
_DISABLE_AFC = types.AutomaticFunctionCallingConfig(disable=True)


def _build_client(api_key: str) -> genai.Client:
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=GEMINI_HTTP_TIMEOUT_MS),
    )


class GeminiProvider:
    """Google Gemini API provider with tool support and retry logic."""
    
    MAX_RETRIES = 4
    RETRY_DELAY = 1.0
    
    def __init__(self, api_key: str, provider_name: str = "google", agent: "Agent | None" = None):
        self._client = _build_client(api_key)
        self._api_key = api_key
        self._provider_name = provider_name
        self._agent = agent

    def _rebuild_client(self, new_key: str):
        self._client = _build_client(new_key)
        self._api_key = new_key

    async def _call_with_retry(self, *, rebuild_thinking=None, **kwargs):
        """Async generate_content with retry + key rotation on rate limit/auth errors."""
        from . import key_manager
        last_error = None
        
        for attempt in range(self.MAX_RETRIES):
            started = asyncio.get_running_loop().time()
            try:
                log("GEMINI_CALL", attempt=attempt + 1, model=kwargs.get("model"))
                response = await asyncio.wait_for(
                    self._client.aio.models.generate_content(**kwargs),
                    timeout=GEMINI_CALL_TIMEOUT_SEC,
                )
                log(
                    "GEMINI_OK",
                    attempt=attempt + 1,
                    ms=int((asyncio.get_running_loop().time() - started) * 1000),
                )
                return response
            except asyncio.TimeoutError as e:
                last_error = e
                log_error(
                    "gemini_timeout",
                    f"attempt {attempt + 1} exceeded {GEMINI_CALL_TIMEOUT_SEC:.0f}s",
                )
                # Timeout is usually network/API stall — retrying 4×95s is worse for the user.
                break
            except Exception as e:
                last_error = e
                error_str = str(e)
                log_error(
                    "gemini_err",
                    f"attempt {attempt + 1} after "
                    f"{int((asyncio.get_running_loop().time() - started) * 1000)}ms: "
                    f"{error_str[:80]}",
                )

                if is_capacity_error(e):
                    if rebuild_thinking:
                        rebuilt = rebuild_thinking(kwargs)
                        if rebuilt is not None:
                            kwargs = rebuilt
                            rebuild_thinking = None
                            continue
                    override = key_manager.is_override_key(self._provider_name, self._api_key, self._agent)
                    has_more = attempt < self.MAX_RETRIES - 1
                    delay = 3.0 * (2 ** attempt)
                    if override:
                        if has_more:
                            await asyncio.sleep(delay)
                        continue
                    if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                        key_manager.mark_rate_limited(self._provider_name, self._api_key)
                    new_key = key_manager.get_key(self._provider_name, self._agent)
                    if new_key != self._api_key:
                        self._rebuild_client(new_key)
                        continue
                    if has_more:
                        await asyncio.sleep(delay)
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
        tool_handler: ToolHandler = None,
        tools: list | None = None,
        max_tool_rounds: int = 5,
        thinking_level: str = "off",
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
        
        gemini_tools = anthropic_tools_to_gemini(tools if tools is not None else USER_TOOLS)
        rounds_left = max(1, min(8, max_tool_rounds or 5))
        model_id = resolve_model(model)
        downgrade = ThinkingDowngrade(model_id, thinking_level)

        def make_config():
            glevel = gemini_thinking_level(model_id, downgrade.level)
            config_kwargs = dict(
                system_instruction=system_text,
                tools=[gemini_tools],
                max_output_tokens=conversation_max_tokens(downgrade.level),
                automatic_function_calling=_DISABLE_AFC,
            )
            if glevel:
                config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=glevel)
            return types.GenerateContentConfig(**config_kwargs)

        def rebuild_thinking(kw):
            return downgrade.once(kw, lambda k, _lv: {**k, "config": make_config()})

        response = await self._call_with_retry(
            model=model_id,
            contents=gemini_contents,
            config=make_config(),
            rebuild_thinking=rebuild_thinking,
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
        while tool_calls and tool_handler and rounds_left > 0:
            rounds_left -= 1
            
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
                    cap = (result_data["result"].get("caption") or "").strip()
                    if cap:
                        result = (
                            f"מדיה '{result_data['result'].get('name', '')}' תישלח ללקוח "
                            f"עם הכיתוב שצוין. אל תשלח שוב את אותו כיתוב כהודעת טקסט נפרדת."
                        )
                    else:
                        result = (
                            f"מדיה '{result_data['result'].get('name', '')}' תישלח ללקוח. "
                            f"אם רצית כיתוב על הקובץ עצמו — העבר אותו ב-caption של send_media."
                        )
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
                model=model_id,
                contents=gemini_contents,
                config=make_config(),
                rebuild_thinking=rebuild_thinking,
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

    def _cheap_config(self, max_tokens: int, model: str):
        kwargs = dict(
            max_output_tokens=max_tokens,
            automatic_function_calling=_DISABLE_AFC,
        )
        level = gemini_thinking_level(model, "minimal")
        if level:
            kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=level)
        return types.GenerateContentConfig(**kwargs)

    async def generate_simple_response(
        self, prompt: str, model: str = CHEAP_GEMINI, max_tokens: int = 300
    ) -> str:
        """Generate a simple text response without tools (for follow-ups, reminders)."""
        model_id = resolve_model(model)
        response = await self._call_with_retry(
            model=model_id,
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
            config=self._cheap_config(max_tokens, model_id),
        )
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, "text") and part.text:
                    return part.text.strip()
        return ""

    async def generate_tracked_response(
        self, prompt: str, model: str = CHEAP_GEMINI, max_tokens: int = 300
    ) -> tuple[str, dict]:
        """Like generate_simple_response but also returns token usage."""
        model_id = resolve_model(model)
        response = await self._call_with_retry(
            model=model_id,
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
            config=self._cheap_config(max_tokens, model_id),
        )

        usage = {
            "input_tokens": (getattr(response.usage_metadata, 'prompt_token_count', 0) or 0) if response.usage_metadata else 0,
            "output_tokens": (getattr(response.usage_metadata, 'candidates_token_count', 0) or 0) if response.usage_metadata else 0,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 0,
        }

        text = ""
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, "text") and part.text:
                    text = part.text.strip()
                    break

        return text, usage
