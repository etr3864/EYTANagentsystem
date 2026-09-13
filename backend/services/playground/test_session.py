import os
import unittest

from backend.services.playground.session import sign, verify


class SessionCookieTests(unittest.TestCase):
    def setUp(self):
        os.environ["JWT_SECRET"] = "unit-test-secret"

    def test_roundtrip(self):
        token = sign(9, 44)
        self.assertEqual(verify(token), (9, 44))

    def test_tamper(self):
        token = sign(9, 44)
        self.assertIsNone(verify(token[:-1] + "0"))
        self.assertIsNone(verify(None))


if __name__ == "__main__":
    unittest.main()
