from backend.mcp.tools.agents import register as register_agents
from backend.mcp.tools.automations import register as register_automations
from backend.mcp.tools.clients import register as register_clients
from backend.mcp.tools.dashboard import register as register_dashboard
from backend.mcp.tools.inbox import register as register_inbox

INSTRUCTIONS = """\
Optive MCP: super-admin only. Build and operate WhatsApp AI agents.

Create/update agents (model must be a key from list_models — same as the UI dropdown), create client accounts (not super-admins), create employees under a client (client_id required), set passwords, assign agents, and edit knowledge/functions/triggers/escalations/followups. Conversation webhook summaries (the Summaries tab): get_summaries, update_summaries, test_summaries_webhook, list_conversation_summaries. That is not context_summary_config (long-chat memory compression on the agent). Read costs and performance from the super-admin dashboard (get_system_costs, list_agent_costs, get_agent_performance).

Destructive actions, sending a customer message, and resetting a password require confirm=true. Never invent API keys, tokens, or passwords in logs. Do not upload binary media or complete OAuth — return the OAuth URL and tell the user to open it in a browser. Never return a password after it is set.
"""


def register(mcp) -> None:
    register_agents(mcp)
    register_clients(mcp)
    register_automations(mcp)
    register_inbox(mcp)
    register_dashboard(mcp)
