import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from backend.services.playground.calendar_sim import book, check_availability


class CalendarSimTests(unittest.TestCase):
    def test_book_echoes_slot(self):
        tz = ZoneInfo("Asia/Jerusalem")
        text = book({"datetime": "2026-09-20T11:30", "title": "ייעוץ"}, tz)
        self.assertIn("11:30", text)
        self.assertIn("20/09/2026", text)
        self.assertIn("ייעוץ", text)

    def test_availability_uses_hours(self):
        tz = ZoneInfo("Asia/Jerusalem")
        start = datetime.now(tz).date()
        end = start + timedelta(days=3)
        text = check_availability(
            {"start_date": start.isoformat(), "end_date": end.isoformat(), "duration_minutes": 30},
            {"working_hours": {"0": {"start": "09:00", "end": "12:00"}}},
            tz,
        )
        self.assertTrue("זמנים פנויים" in text or "אין זמנים" in text)


if __name__ == "__main__":
    unittest.main()
