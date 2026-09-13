import os
import unittest
from types import SimpleNamespace

from backend.services.playground.isolation import is_playground_conversation, is_playground_user
from backend.services.playground.session import sign, verify


class IsolationHelpersTests(unittest.TestCase):
    def test_prod_row_is_not_playground(self):
        self.assertFalse(is_playground_conversation(SimpleNamespace(playground_link_id=None)))
        self.assertFalse(is_playground_user(SimpleNamespace(playground_link_id=None)))

    def test_tagged_row_is_playground(self):
        self.assertTrue(is_playground_conversation(SimpleNamespace(playground_link_id=7)))
        self.assertTrue(is_playground_user(SimpleNamespace(playground_link_id=7)))


class LeakContractTests(unittest.TestCase):
    """Inbox / reports / jobs SQL must exclude playground rows."""

    FILES = [
        "backend/api/routers/agents.py",
        "backend/api/routers/dashboard.py",
        "backend/api/routers/super_admin_dashboard.py",
        "backend/services/export_builder.py",
        "backend/mcp/tools/inbox.py",
        "backend/services/engagement/summaries.py",
        "backend/api/routers/conversations.py",
        "backend/auth/service.py",
        "backend/api/routers/users.py",
    ]

    def test_listed_modules_filter_playground(self):
        root = os.path.join(os.path.dirname(__file__), "..", "..", "..")
        for rel in self.FILES:
            path = os.path.normpath(os.path.join(root, rel))
            with open(path, encoding="utf-8") as fh:
                src = fh.read()
            self.assertIn(
                "playground_link_id",
                src,
                f"{rel} must exclude playground conversations",
            )


class CookieTests(unittest.TestCase):
    def setUp(self):
        os.environ["JWT_SECRET"] = "unit-test-secret"

    def test_roundtrip_user_id_not_phone(self):
        token = sign(9, 44)
        self.assertEqual(verify(token), (9, 44))
        self.assertNotIn("972", token)

    def test_tamper(self):
        token = sign(9, 44)
        self.assertIsNone(verify(token[:-1] + "0"))
        self.assertIsNone(verify(None))
        self.assertIsNone(verify("v1.9.972501234567.abcd"))

    def test_sign_requires_secret(self):
        os.environ.pop("JWT_SECRET", None)
        os.environ.pop("CREDENTIALS_ENCRYPTION_KEY", None)
        with self.assertRaises(RuntimeError):
            sign(1, 2)


if __name__ == "__main__":
    unittest.main()
