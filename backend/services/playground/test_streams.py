import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("JWT_SECRET", "unit-test-secret")

from backend.services.playground import streams


class ReadSinceTimeoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_socket_timeout_is_empty_not_crash(self):
        r = AsyncMock()
        r.xread.side_effect = TimeoutError("Timeout reading from redis")
        with patch.object(streams, "_redis", AsyncMock(return_value=r)):
            out = await streams.read_since(1, "0-0", 100)
        self.assertEqual(out, [])

    async def test_connection_error_is_empty_not_crash(self):
        r = AsyncMock()
        r.xread.side_effect = OSError("broken")
        with patch.object(streams, "_redis", AsyncMock(return_value=r)):
            out = await streams.read_since(1, "0-0", 100)
        self.assertEqual(out, [])


class LiveCursorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        streams._memory.clear()

    async def test_dollar_skips_existing_events(self):
        with patch.object(streams, "_redis", AsyncMock(return_value=None)):
            await streams.publish(7, {"type": "status", "status": "חושב"})
            await streams.publish(7, {"type": "message", "message": {"id": 1}})
            cursor = await streams.live_cursor(7, "$")
            self.assertEqual(streams._mem_since(7, cursor), [])

    async def test_resume_from_id_keeps_later_events(self):
        with patch.object(streams, "_redis", AsyncMock(return_value=None)):
            first = await streams.publish(8, {"type": "status", "status": "חושב"})
            await streams.publish(8, {"type": "message", "message": {"id": 1}})
            cursor = await streams.live_cursor(8, first)
            later = streams._mem_since(8, cursor)
        self.assertEqual(len(later), 1)
        self.assertEqual(later[0][1]["type"], "message")


if __name__ == "__main__":
    unittest.main()
