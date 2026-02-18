"""OpenAI provider implementation."""
import asyncio
import json
from typing import TYPE_CHECKING

import openai
from openai import AsyncOpenAI

from .types import LLMResponse, ToolHandler
from backend.core.ai_config import USER_TOOLS
from backend.core.logger import log_error

if TYPE_CHECKING:
    from backend.models.agent import Agent

MAX_RETRIES = 3
RETRY_DELAY = 1.0


def _convert_tools_to_openai(anthropic_tools: list) -> list:
    """Convert Anthropic tool format to OpenAI format.
    
    Anthropic: {"name", "description", "input_schema"}
    OpenAI: {"type": "function", "function": {"name", "description", "parameters"}}
    """
    return [{
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t.get("input_schema", {})
        }
    } for t in anthropic_tools]


def _build_system_text(system_blocks: list) -> str:
    """Convert Anthropic system blocks to single string."""
    texts = []
    for block in system_blocks:
        if isinstance(block, dict) and "text" in block:
            texts.append(block["text"])
        elif isinstance(block, str):
            texts.append(block)
    return "\n\n".join(texts)


class OpenAIProvider:
    """OpenAI API provider with tool support and retry logic."""
    
    def __init__(self, api_key: str, provider_name: str = "openai", agent: "Agent | None" = None):
        self._client = AsyncOpenAI(api_key=api_key)
        self._api_key = api_key
        self._provider_name = provider_name
        self._agent = agent
        self._tools = _convert_tools_to_openai(USER_TOOLS)

    def _rebuild_client(self, new_key: str):
        self._client = AsyncOpenAI(api_key=new_key)
        self._api_key = new_key

    async def _call_with_retry(self, **kwargs):
        """Execute API call with retry logic, key rotation on 429, and auth fallback."""
        from . import key_manager
        last_error = None
        
        for attempt in range(MAX_RETRIES):
            try:
                return await self._client.chat.completions.create(**kwargs)
            except openai.RateLimitError as e:
                last_error = e
                override = key_manager.is_override_key(self._provider_name, self._api_key, self._agent)
                if override:
                    await asyncio.sleep(RETRY_DELAY * (2 ** attempt))
                    continue
                retry_after = float(e.response.headers.get("retry-after", 0)) if e.response else None
                key_manager.mark_rate_limited(self._provider_name, self._api_key, retry_after or None)
                new_key = key_manager.get_key(self._provider_name, self._agent)
                if new_key != self._api_key:
                    self._rebuild_client(new_key)
                    continue
                await asyncio.sleep(RETRY_DELAY * (2 ** attempt))
            except openai.AuthenticationError as e:
                last_error = e
                override = key_manager.is_override_key(self._provider_name, self._api_key, self._agent)
                if override:
                    log_error("openai", "Agent override key failed, falling back to pool")
                    key_manager.mark_dead(self._provider_name, self._api_key)
                    new_key = key_manager.get_key(self._provider_name)
                    self._rebuild_client(new_key)
                    continue
                key_manager.mark_dead(self._provider_name, self._api_key)
                new_key = key_manager.get_key(self._provider_name, self._agent)
                self._rebuild_client(new_key)
                continue
            except Exception as e:
                last_error = e
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAY * (2 ** attempt)
                    log_error("openai_retry", f"Attempt {attempt+1} failed: {str(e)[:50]}")
                    await asyncio.sleep(delay)
        
        log_error("openai_failed", f"All {MAX_RETRIES} attempts failed")
        raise last_error
    
    async def get_response(
        self,
        model: str,
        system_blocks: list,
        history: list[dict],
        user_content: str | list,
        tool_handler: ToolHandler = None
    ) -> LLMResponse:
        """Get response from OpenAI with tool support."""
        
        # Build messages
        messages = [{"role": "system", "content": _build_system_text(system_blocks)}]
        
        # Add history
        for msg in history:
            content = msg.get("content", "")
            if isinstance(content, list):
                # Extract text from blocks
                text_parts = [b["text"] for b in content if isinstance(b, dict) and b.get("type") == "text"]
                content = " ".join(text_parts) if text_parts else str(content)
            messages.append({"role": msg["role"], "content": content})
        
        # Add user message
        if isinstance(user_content, list):
            text_parts = [b["text"] for b in user_content if isinstance(b, dict) and b.get("type") == "text"]
            user_text = " ".join(text_parts) if text_parts else str(user_content)
        else:
            user_text = user_content
        messages.append({"role": "user", "content": user_text})
        
        # Call API
        response = await self._call_with_retry(
            model=model,
            messages=messages,
            tools=self._tools,
            max_completion_tokens=4096
        )
        
        # Track usage
        usage_data = {
            "input_tokens": response.usage.prompt_tokens or 0 if response.usage else 0,
            "output_tokens": response.usage.completion_tokens or 0 if response.usage else 0,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 0
        }
        
        # Parse response
        message = response.choices[0].message
        text_response = message.content or ""
        tool_calls = []
        media_actions = []
        
        # Extract tool calls
        if message.tool_calls:
            for tc in message.tool_calls:
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": json.loads(tc.function.arguments) if tc.function.arguments else {}
                })
        
        # Tool execution loop
        max_rounds = 5
        while tool_calls and tool_handler and max_rounds > 0:
            max_rounds -= 1
            
            # Add assistant message with tool calls
            messages.append({
                "role": "assistant",
                "content": text_response,
                "tool_calls": [{"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": json.dumps(tc["input"])}} for tc in tool_calls]
            })
            
            # Execute tools
            if asyncio.iscoroutinefunction(tool_handler):
                results = await tool_handler(tool_calls)
            else:
                results = tool_handler(tool_calls)
            
            # Add tool results
            for i, tc in enumerate(tool_calls):
                result_data = results[i] if i < len(results) else None
                if not result_data:
                    result = "לא נמצא"
                elif isinstance(result_data.get("result"), dict) and result_data["result"].get("action") == "send_media":
                    media_actions.append(result_data["result"])
                    result = f"מדיה '{result_data['result'].get('name', '')}' תישלח ללקוח."
                else:
                    result = str(result_data["result"]) if not isinstance(result_data["result"], str) else result_data["result"]
                
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result
                })
            
            # Get next response
            response = await self._call_with_retry(
                model=model,
                messages=messages,
                tools=self._tools,
                max_completion_tokens=4096
            )
            
            # Update usage
            if response.usage:
                usage_data["input_tokens"] += response.usage.prompt_tokens or 0
                usage_data["output_tokens"] += response.usage.completion_tokens or 0
            
            # Parse new response
            message = response.choices[0].message
            text_response = message.content or ""
            tool_calls = []
            
            if message.tool_calls:
                for tc in message.tool_calls:
                    tool_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "input": json.loads(tc.function.arguments) if tc.function.arguments else {}
                    })
        
        return LLMResponse(
            text=text_response,
            tool_calls=[],
            usage=usage_data,
            media_actions=media_actions
        )

    async def generate_simple_response(self, prompt: str) -> str:
        """Generate a simple text response without tools (for follow-ups, reminders)."""
        response = await self._call_with_retry(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=300,
        )
        return (response.choices[0].message.content or "").strip()
