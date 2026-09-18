import unittest

from backend.services.messaging.split.parts import MARKER, parse, prompt_block


class ParseTests(unittest.TestCase):
    def test_no_marker_is_one_bubble(self):
        self.assertEqual(parse("שלום, מה נשמע?", 3), ["שלום, מה נשמע?"])

    def test_splits_on_marker(self):
        text = f"היי{MARKER}איך אפשר לעזור?"
        self.assertEqual(parse(text, 3), ["היי", "איך אפשר לעזור?"])

    def test_overflow_merges_into_last(self):
        text = MARKER.join(["א", "ב", "ג", "ד"])
        self.assertEqual(parse(text, 2), ["א", "ב\nג\nד"])

    def test_empty_chunks_dropped(self):
        text = f"{MARKER}שלום{MARKER}{MARKER}עוד"
        self.assertEqual(parse(text, 5), ["שלום", "עוד"])

    def test_blank_input(self):
        self.assertEqual(parse("   ", 3), [])

    def test_max_one_never_splits(self):
        text = MARKER.join(["א", "ב", "ג"])
        self.assertEqual(parse(text, 1), ["א\nב\nג"])


class PromptBlockTests(unittest.TestCase):
    def test_injects_numeric_max_only(self):
        block = prompt_block(4, "פצל ברכה")
        self.assertIn("עד 4", block)
        self.assertIn(MARKER, block)
        self.assertIn("פצל ברכה", block)
        self.assertNotIn("10", block)


if __name__ == "__main__":
    unittest.main()
