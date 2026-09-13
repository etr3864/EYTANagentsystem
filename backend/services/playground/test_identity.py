import unittest

from backend.services.playground.identity import normalize_phone, storage_phone


class IdentityTests(unittest.TestCase):
    def test_local_and_e164_same_key(self):
        a = normalize_phone("050-1234567")
        b = normalize_phone("+972501234567")
        self.assertEqual(a, b)
        self.assertEqual(a, "972501234567")

    def test_storage_never_uses_raw_msisdn(self):
        phone = normalize_phone("0501234567")
        stored = storage_phone(12, phone)
        self.assertTrue(stored.startswith("pg:12:"))
        self.assertNotEqual(stored, phone)

    def test_rejects_short(self):
        with self.assertRaises(ValueError):
            normalize_phone("123")

    def test_display_phone_local_format(self):
        from backend.services.playground.identity import display_phone
        self.assertEqual(display_phone("972501234567"), "050-1234567")
