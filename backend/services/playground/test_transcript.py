import unittest
from datetime import datetime
from types import SimpleNamespace

from backend.services.playground.identity import display_phone, normalize_phone, tester_label
from backend.services.playground.transcript import _boundary, _turn, filename, tester_filename


def _msg(**kwargs):
    defaults = dict(
        role="user",
        content="שלום",
        message_type="text",
        media_url=None,
        reply_to_text=None,
        created_at=datetime(2026, 9, 14, 10, 0, 0),
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class DisplayPhoneTests(unittest.TestCase):
    def test_il_mobile(self):
        self.assertEqual(display_phone(normalize_phone("050-1234567")), "050-1234567")

    def test_empty(self):
        self.assertEqual(display_phone(""), "")


class TesterLabelTests(unittest.TestCase):
    def test_name_and_claimed_phone_not_storage_key(self):
        user = SimpleNamespace(
            name="נועה",
            metadata_={"claimed_phone": "972501234567", "claimed_name": "נועה"},
        )
        self.assertEqual(tester_label(user), "נועה · 050-1234567")
        self.assertNotIn("pg:", tester_label(user))


class TranscriptTests(unittest.TestCase):
    def test_text_turn_has_no_id(self):
        turn = _turn(_msg())
        self.assertNotIn("id", turn)
        self.assertEqual(turn["role"], "user")
        self.assertEqual(turn["content"], "שלום")
        self.assertEqual(turn["tool_calls"], [])

    def test_media_is_url_not_base64(self):
        turn = _turn(_msg(role="assistant", content="", message_type="image", media_url="https://cdn/x.jpg"))
        self.assertEqual(turn["media"], {"type": "image", "url": "https://cdn/x.jpg"})
        self.assertNotIn("base64", str(turn))

    def test_function_note_becomes_tool_call(self):
        payload = '{"name":"lookup_crm","status":"ok","ms":120,"body":{"id":"ext"}}'
        turn = _turn(_msg(role="assistant", content=payload, message_type="function"))
        self.assertIsNone(turn["content"])
        self.assertEqual(turn["tool_calls"][0]["name"], "lookup_crm")
        self.assertEqual(turn["latency_ms"], 120)

    def test_archived_boundary(self):
        conv = SimpleNamespace(archived_at=datetime(2026, 9, 14, 12, 0, 0))
        self.assertEqual(_boundary(conv)["reason"], "reset")
        self.assertIsNone(_boundary(SimpleNamespace(archived_at=None)))

    def test_filename_ascii(self):
        name = filename(
            SimpleNamespace(agent_name_snapshot="סוכן דמו"),
            SimpleNamespace(name="נועה", metadata_={"claimed_phone": "972501234567"}),
            SimpleNamespace(created_at=datetime(2026, 9, 1), updated_at=None),
        )
        self.assertEqual(name, "playground-0501234567-20260901.json")

    def test_tester_filename_covers_all_sessions(self):
        name = tester_filename(
            SimpleNamespace(name="נועה", metadata_={"claimed_phone": "972501234567"}),
        )
        self.assertEqual(name, "playground-0501234567-all.json")


if __name__ == "__main__":
    unittest.main()
