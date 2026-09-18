import unittest
from unittest.mock import AsyncMock, patch

from backend.services.messaging.split import leftover
from backend.services.messaging.split.leftover import prompt_block


class LeftoverPromptTests(unittest.TestCase):
    def test_empty_is_silent(self):
        self.assertEqual(prompt_block([]), "")

    def test_asks_to_reuse_verbatim(self):
        block = prompt_block(["היי", "מה שלומך?"])
        self.assertIn("היי", block)
        self.assertIn("מה שלומך?", block)
        self.assertIn("כלשונו", block)
        self.assertIn("אל תספר ללקוח", block)


class LeftoverStoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_memory_roundtrip_does_not_drop_on_peek(self):
        leftover._memory.clear()
        with patch(
            "backend.services.messaging.split.leftover.buffer.redis",
            new=AsyncMock(return_value=None),
        ):
            await leftover.save(9, "050", ["א", "ב"])
            self.assertEqual(await leftover.peek(9, "050"), ["א", "ב"])
            self.assertEqual(await leftover.peek(9, "050"), ["א", "ב"])
            self.assertEqual(await leftover.take(9, "050"), ["א", "ב"])
            self.assertEqual(await leftover.peek(9, "050"), [])


if __name__ == "__main__":
    unittest.main()
