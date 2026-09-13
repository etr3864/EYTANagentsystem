from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from backend.services.playground.constants import CLOSED_MESSAGE


@dataclass(frozen=True)
class GateResult:
    open: bool
    reason: Optional[str]
    first_visit: bool

    def http_gone(self) -> bool:
        return not self.open and self.first_visit

    def lock_composer(self) -> bool:
        return not self.open and not self.first_visit


def evaluate(*, link, agent, message_count: int, now: datetime | None = None) -> GateResult:
    """Single access decision. first_visit = no message yet (cookie does not count)."""
    had_session = int(message_count or 0) >= 1
    reason = closed_reason(link, agent, now=now)
    if reason is None:
        return GateResult(open=True, reason=None, first_visit=not had_session)
    return GateResult(open=False, reason=reason, first_visit=not had_session)


def closed_reason(link, agent, now: datetime | None = None) -> str | None:
    moment = now or datetime.utcnow()
    if getattr(link, "deleted_at", None):
        return "deleted"
    if getattr(link, "stopped_at", None):
        return "stopped"
    expires = getattr(link, "expires_at", None)
    if expires is not None and expires <= moment:
        return "expired"
    if agent is None:
        return "agent_gone"
    if not getattr(agent, "is_active", True):
        return "agent_inactive"
    used = int(getattr(link, "tokens_used", 0) or 0)
    limit = int(getattr(link, "token_limit", 0) or 0)
    if limit and used >= limit:
        return "quota"
    return None


def public_message(_result: GateResult) -> str:
    return CLOSED_MESSAGE
