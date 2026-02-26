"""Context summary configuration per agent."""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.models.agent import Agent

DEFAULT_CONTEXT_SUMMARY_CONFIG = {
    "enabled": False,
    "message_threshold": 20,
    "messages_after_summary": 20,
    "full_summary_every": 5,
}


def get_context_summary_config(agent: "Agent") -> dict:
    config = DEFAULT_CONTEXT_SUMMARY_CONFIG.copy()
    if agent.context_summary_config:
        config.update(agent.context_summary_config)
    return config
