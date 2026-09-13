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


if __name__ == "__main__":
    unittest.main()
