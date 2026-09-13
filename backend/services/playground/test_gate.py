import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from backend.services.playground.gate import evaluate, public_message
from backend.services.playground.constants import CLOSED_MESSAGE


def _link(**kwargs):
    now = datetime(2026, 1, 15, 12, 0, 0)
    base = dict(
        deleted_at=None,
        stopped_at=None,
        expires_at=now + timedelta(days=1),
        tokens_used=0,
        token_limit=1_000_000,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def _agent(active=True):
    return SimpleNamespace(is_active=active, name="Demo")


class GateTests(unittest.TestCase):
    def test_open_when_healthy(self):
        now = datetime(2026, 1, 15, 12, 0, 0)
        r = evaluate(link=_link(), agent=_agent(), message_count=3, now=now)
        self.assertTrue(r.open)
        self.assertFalse(r.http_gone())
        self.assertFalse(r.lock_composer())

    def test_no_messages_is_first_visit(self):
        now = datetime(2026, 1, 15, 12, 0, 0)
        r = evaluate(link=_link(), agent=_agent(), message_count=0, now=now)
        self.assertTrue(r.open)
        self.assertTrue(r.first_visit)

    def test_expired_without_messages_is_http_gone(self):
        now = datetime(2026, 1, 15)
        r = evaluate(
            link=_link(expires_at=now - timedelta(hours=1)),
            agent=_agent(),
            message_count=0,
            now=now,
        )
        self.assertFalse(r.open)
        self.assertEqual(r.reason, "expired")
        self.assertTrue(r.http_gone())
        self.assertFalse(r.lock_composer())

    def test_expired_with_messages_locks_composer(self):
        now = datetime(2026, 1, 15)
        r = evaluate(
            link=_link(expires_at=now - timedelta(hours=1)),
            agent=_agent(),
            message_count=1,
            now=now,
        )
        self.assertTrue(r.lock_composer())
        self.assertFalse(r.http_gone())
        self.assertEqual(public_message(r), CLOSED_MESSAGE)

    def test_cookie_alone_does_not_count_as_session(self):
        now = datetime(2026, 1, 15)
        r = evaluate(
            link=_link(deleted_at=now),
            agent=_agent(),
            message_count=0,
            now=now,
        )
        self.assertTrue(r.first_visit)
        self.assertTrue(r.http_gone())

    def test_deleted_stopped_quota_agent(self):
        now = datetime(2026, 1, 15)
        cases = [
            (_link(deleted_at=now), _agent(), "deleted"),
            (_link(stopped_at=now), _agent(), "stopped"),
            (_link(tokens_used=10, token_limit=10), _agent(), "quota"),
            (_link(), None, "agent_gone"),
            (_link(), _agent(False), "agent_inactive"),
        ]
        for link, agent, reason in cases:
            r = evaluate(link=link, agent=agent, message_count=2, now=now)
            self.assertEqual(r.reason, reason, reason)
            self.assertTrue(r.lock_composer())
