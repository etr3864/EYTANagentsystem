import unittest
from types import SimpleNamespace

from backend.services.messaging.split.config import DEFAULT_INSTRUCTION, for_agent, sanitize


class SanitizeTests(unittest.TestCase):
    def test_defaults(self):
        cfg = sanitize(None)
        self.assertFalse(cfg["enabled"])
        self.assertEqual(cfg["max_parts"], 2)
        self.assertEqual(cfg["delay_seconds"], 2.0)
        self.assertEqual(cfg["instruction"], "")

    def test_clamps_max_and_delay(self):
        cfg = sanitize({"enabled": True, "max_parts": 99, "delay_seconds": 0.2})
        self.assertEqual(cfg["max_parts"], 10)
        self.assertEqual(cfg["delay_seconds"], 1.0)

    def test_invalid_numbers_fall_back(self):
        cfg = sanitize({"max_parts": "x", "delay_seconds": None})
        self.assertEqual(cfg["max_parts"], 1)
        self.assertEqual(cfg["delay_seconds"], 1.0)


class ForAgentTests(unittest.TestCase):
    def test_missing_config_is_off(self):
        cfg = for_agent(SimpleNamespace())
        self.assertFalse(cfg.enabled)
        self.assertEqual(cfg.max_parts, 2)
        self.assertEqual(cfg.instruction, DEFAULT_INSTRUCTION)

    def test_max_one_disables_even_if_toggled(self):
        agent = SimpleNamespace(split_config={"enabled": True, "max_parts": 1})
        cfg = for_agent(agent)
        self.assertFalse(cfg.enabled)
        self.assertEqual(cfg.max_parts, 1)

    def test_empty_instruction_uses_default(self):
        agent = SimpleNamespace(
            split_config={"enabled": True, "max_parts": 3, "instruction": "  "}
        )
        cfg = for_agent(agent)
        self.assertTrue(cfg.enabled)
        self.assertEqual(cfg.instruction, DEFAULT_INSTRUCTION)


if __name__ == "__main__":
    unittest.main()
