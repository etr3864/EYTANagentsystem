"""Google Gemini provider implementation."""
import asyncio
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


# Gemini-specific tool instructions (appended to system prompt)
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
    RETRY_DELAY = 1.0  # seconds
    
    def __init__(self, api_key: str):
        self._client = genai.Client(api_key=api_key)
        self._gemini_tools = anthropic_tools_to_gemini(USER_TOOLS)
    
    async def _call_with_retry(self, func, *args, **kwargs):
        """Execute function with retry logic.
        
        Retries up to MAX_RETRIES times with exponential backoff.
        """
        last_error = None
        
        for attempt in range(self.MAX_RETRIES):
            try:
                return await asyncio.to_thread(func, *args, **kwargs)
            except Exception as e:
                last_error = e
                error_str = str(e)
                
                # Don't retry on auth errors or invalid requests
                if "API key" in error_str or "Invalid" in error_str:
                    raise
                
                if attempt < self.MAX_RETRIES - 1:
                    delay = self.RETRY_DELAY * (2 ** attempt)
                    log_error("gemini_retry", f"Attempt {attempt+1} failed: {error_str[:50]}. Retrying in {delay}s")
                    await asyncio.sleep(delay)
        
        log_error("gemini_failed", f"All {self.MAX_RETRIES} attempts failed: {str(last_error)[:100]}")
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
                    parts=[types.Part.from_text(content)]
                ))
            elif isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, str):
                        parts.append(types.Part.from_text(block))
                    elif isinstance(block, dict) and block.get("type") == "text":
                        parts.append(types.Part.from_text(block["text"]))
                    # Skip images - they stay with Claude
                if parts:
                    gemini_contents.append(types.Content(role=role, parts=parts))
        
        # Add current user message
        if isinstance(user_content, str):
            gemini_contents.append(types.Content(
                role="user",
                parts=[types.Part.from_text(user_content)]
            ))
        elif isinstance(user_content, list):
            parts = []
            for block in user_content:
                if isinstance(block, str):
                    parts.append(types.Part.from_text(block))
                elif isinstance(block, dict) and block.get("type") == "text":
                    parts.append(types.Part.from_text(block["text"]))
            if parts:
                gemini_contents.append(types.Content(role="user", parts=parts))
        
        # Configure generation
        config = types.GenerateContentConfig(
            system_instruction=system_text,
            tools=[self._gemini_tools],
            max_output_tokens=1024,
            temperature=0.7
        )
        
        # Make API call with retry
        response = await self._call_with_retry(
            self._client.models.generate_content,
            model=model,
            contents=gemini_contents,
            config=config
        )
        
        # Track token usage
        usage_data = {
            "input_tokens": getattr(response.usage_metadata, 'prompt_token_count', 0) if response.usage_metadata else 0,
            "output_tokens": getattr(response.usage_metadata, 'candidates_token_count', 0) if response.usage_metadata else 0,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 0
        }
        
        # Parse response
        text_response = ""
        tool_calls = []
        media_actions = []
        
        if response.candidates and response.candidates[0].content:
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
            for call in tool_calls:
                result_data = next((r for r in tool_results_data if r["name"] == call["name"]), None)
                if not result_data:
                    result = "לא נמצא"
                elif isinstance(result_data.get("result"), dict) and result_data["result"].get("action") == "send_media":
                    media_actions.append(result_data["result"])
                    result = f"מדיה '{result_data['result'].get('name', '')}' תישלח ללקוח."
                else:
                    result = str(result_data["result"]) if not isinstance(result_data["result"], str) else result_data["result"]
                
                response_parts.append(types.Part.from_function_response(
                    name=call["name"],
                    response={"result": result}
                ))
            
            gemini_contents.append(types.Content(role="user", parts=response_parts))
            
            # Get next response
            response = await self._call_with_retry(
                self._client.models.generate_content,
                model=model,
                contents=gemini_contents,
                config=config
            )
            
            # Update usage
            if response.usage_metadata:
                usage_data["input_tokens"] += getattr(response.usage_metadata, 'prompt_token_count', 0)
                usage_data["output_tokens"] += getattr(response.usage_metadata, 'candidates_token_count', 0)
            
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
