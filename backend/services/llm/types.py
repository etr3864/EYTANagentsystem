"""Shared types for LLM providers."""
from dataclasses import dataclass, field
from typing import Callable, Awaitable


@dataclass
class LLMResponse:
    """Unified response from any LLM provider.
    
    Attributes:
        text: The text response from the model
        tool_calls: List of tool calls made by the model
        usage: Token usage statistics
        media_actions: List of media actions to execute (send_media)
    """
    text: str
    tool_calls: list[dict] = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    media_actions: list[dict] = field(default_factory=list)


# Type alias for tool handler function
# Takes list of tool calls, returns list of results
ToolHandler = Callable[[list[dict]], Awaitable[list[dict]]]
