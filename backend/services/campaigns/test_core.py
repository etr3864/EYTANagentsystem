import unittest
from datetime import datetime
from types import SimpleNamespace

from backend.services.campaigns import guard, records, schedule
from backend.services.campaigns.constants import SENDING, UNCERTAIN


class ScheduleTests(unittest.TestCase):
    def test_interval_spreads_the_hour(self):
        self.assertEqual(schedule.interval_seconds(60), 60)
        self.assertEqual(schedule.interval_seconds(720), 5)

    def test_jitter_never_shortens(self):
        gap = schedule.with_jitter(60, 0)
        self.assertEqual(gap, 60)
        self.assertGreater(schedule.with_jitter(60, 1), 60)

    def test_window_crosses_midnight(self):
        late = datetime(2026, 1, 1, 23, 30)
        early = datetime(2026, 1, 2, 1, 0)
        noon = datetime(2026, 1, 1, 12, 0)
        self.assertTrue(schedule.in_window(late, "22:00", "06:00", "UTC"))
        self.assertTrue(schedule.in_window(early, "22:00", "06:00", "UTC"))
        self.assertFalse(schedule.in_window(noon, "22:00", "06:00", "UTC"))

    def test_daily_key_uses_the_given_zone(self):
        stamp = datetime(2026, 1, 1, 22, 30)
        self.assertEqual(schedule.day_key(stamp, "UTC"), "2026-01-01")
        self.assertEqual(schedule.day_key(stamp, "Asia/Jerusalem"), "2026-01-02")


class GuardTests(unittest.TestCase):
    def test_hidden_url_is_removed(self):
        text = "היי https://evil.example/a"
        self.assertNotIn("evil.example", guard.sanitize(text, "רק מה שכתוב"))

    def test_shortener_is_removed(self):
        self.assertNotIn("bit.ly", guard.sanitize("תראה bit.ly/abc", ""))

    def test_url_without_scheme(self):
        self.assertNotIn("shop.example", guard.sanitize("shop.example/deal", "אין קישור"))

    def test_prompt_link_stays(self):
        body = "האתר https://shop.example"
        self.assertIn("shop.example", guard.sanitize(body, body))


class RecordTests(unittest.TestCase):
    def test_expired_lease_is_uncertain(self):
        send = SimpleNamespace(
            status=SENDING,
            locked_until=datetime(2026, 1, 1, 0, 0),
            provider_msg_id=None,
            fail_reason=None,
        )
        self.assertTrue(records.expire_if_due(send, datetime(2026, 1, 1, 0, 5)))
        self.assertEqual(send.status, UNCERTAIN)

    def test_known_message_is_not_resent(self):
        send = SimpleNamespace(
            status=SENDING,
            locked_until=datetime(2026, 1, 1, 0, 0),
            provider_msg_id="99",
            fail_reason=None,
        )
        self.assertFalse(records.expire_if_due(send, datetime(2026, 1, 1, 0, 5)))
        self.assertEqual(send.status, SENDING)

    def test_delivery_does_not_go_backwards(self):
        send = SimpleNamespace(delivery="read")
        self.assertFalse(records.apply_delivery(send, "delivered"))
        self.assertEqual(send.delivery, "read")


if __name__ == "__main__":
    unittest.main()
