import json
import time
import unittest
from types import SimpleNamespace

from backend.services.agent_functions import breaker, errors, wrap
from backend.services.agent_functions.budget import TurnBudget
from backend.services.agent_functions.constants import MIN_HTTP_MS, UNTRUSTED_PREFIX
from backend.services.agent_functions.idempotency import make_key
from backend.services.agent_functions.names import RESERVED_NAMES, validate_name, FunctionNameError
from backend.services.agent_functions.outputs import mapped_outputs, payload_for_llm
from backend.services.agent_functions.tool_adapter import to_llm_tool
from backend.services.agent_functions.template import render, MissingVariableError


class WrapTests(unittest.TestCase):
    def test_success_marks_untrusted(self):
        text = wrap.success({"crm_id": "1"}, "תגיד תודה")
        self.assertIn(UNTRUSTED_PREFIX, text)
        self.assertIn("crm_id", text)
        self.assertIn("איך לענות", text)

    def test_strips_control_chars(self):
        text = wrap.success({"x": "a\x00b"}, "")
        self.assertNotIn("\x00", text)

    def test_error_is_json_contract(self):
        payload = json.loads(wrap.error(errors.tool_error("timeout", "לא ענה")))
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["code"], "timeout")


class HttpContractTests(unittest.TestCase):
    def test_write_timeout_is_indeterminate(self):
        contract = errors.from_http(None, True, "write", "timeout")
        self.assertEqual(contract["code"], "indeterminate")

    def test_read_timeout_is_timeout(self):
        contract = errors.from_http(None, True, "read", "timeout")
        self.assertEqual(contract["code"], "timeout")

    def test_redirect_denied(self):
        contract = errors.from_http(302, False, "read", None)
        self.assertEqual(contract["code"], "denied")


class BudgetTests(unittest.TestCase):
    def test_exhausted_blocks_http(self):
        budget = TurnBudget(seconds=0)
        self.assertFalse(budget.can_http())
        self.assertLess(budget.remaining_ms(), MIN_HTTP_MS)


class BreakerTests(unittest.TestCase):
    def test_opens_after_threshold(self):
        fid = 9_000_001
        breaker.record_success(fid)
        for _ in range(5):
            breaker.record_failure(fid)
        self.assertFalse(breaker.allow(fid))
        breaker.record_success(fid)
        self.assertTrue(breaker.allow(fid))


class IdempotencyKeyTests(unittest.TestCase):
    def test_stable_for_same_args(self):
        a = make_key(1, 2, {"phone": "1", "name": "a"})
        b = make_key(1, 2, {"name": "a", "phone": "1"})
        self.assertEqual(a, b)

    def test_changes_with_args(self):
        self.assertNotEqual(make_key(1, 2, {"x": 1}), make_key(1, 2, {"x": 2}))


class AdapterTests(unittest.TestCase):
    def test_only_ask_params_in_schema(self):
        row = SimpleNamespace(
            name="create_lead",
            when_to_use="כשרוצים ליד",
            when_not_to_use="אם כבר יש",
            response_instructions="",
            params=[
                {"name": "city", "type": "string", "required": True, "source": "ask", "description": "עיר"},
                {"name": "phone", "type": "string", "required": True, "source": "user.phone"},
            ],
        )
        tool = to_llm_tool(row)
        self.assertEqual(tool["name"], "create_lead")
        self.assertIn("city", tool["input_schema"]["properties"])
        self.assertNotIn("phone", tool["input_schema"]["properties"])
        self.assertIn("לא להשתמש", tool["description"])


class NamesTests(unittest.TestCase):
    def test_reserved_native_blocked(self):
        self.assertIn("book_appointment", RESERVED_NAMES)
        with self.assertRaises(FunctionNameError):
            validate_name("book_appointment")

    def test_valid_english_name(self):
        self.assertEqual(validate_name("create_lead"), "create_lead")


class OutputsTests(unittest.TestCase):
    def test_named_paths_only(self):
        mapped = mapped_outputs(
            {"data": {"id": "99"}, "noise": "ignore"},
            [{"json_path": "$.data.id", "save_as": "crm_id", "scope": "user"}],
        )
        self.assertEqual(mapped, {"crm_id": "99"})

    def test_llm_gets_body_when_unmapped(self):
        body = {"current": {"temperature_2m": 22.4}}
        self.assertEqual(payload_for_llm({}, body), body)

    def test_llm_prefers_mapped(self):
        body = {"current": {"temperature_2m": 22.4}, "noise": "x"}
        mapped = {"temp": 22.4}
        self.assertEqual(payload_for_llm(mapped, body), mapped)


class TemplateTests(unittest.TestCase):
    def test_json_escape(self):
        rendered = render('{"q":"{{q}}"}', {"q": 'a"b'}, "json")
        json.loads(rendered)

    def test_missing_var(self):
        with self.assertRaises(MissingVariableError):
            render("{{missing}}", {}, "plain")


class ResolveTests(unittest.TestCase):
    def test_fills_phone_and_asks(self):
        from backend.services.agent_functions.resolve import resolve_params

        row = SimpleNamespace(
            name="create_lead",
            agent_id=1,
            params=[
                {"name": "phone", "source": "user.phone", "required": True, "type": "string"},
                {"name": "city", "source": "ask", "required": True, "type": "string"},
            ],
        )
        user = SimpleNamespace(phone="97250", name="דן", metadata_=None)
        conv = SimpleNamespace(function_state=None)
        values, err = resolve_params(row, {"city": "TLV"}, user, conv, "")
        self.assertIsNone(err)
        self.assertEqual(values["phone"], "97250")
        self.assertEqual(values["city"], "TLV")

    def test_missing_required_ask(self):
        from backend.services.agent_functions.resolve import resolve_params

        row = SimpleNamespace(
            name="create_lead",
            agent_id=1,
            params=[{"name": "city", "source": "ask", "required": True, "type": "string"}],
        )
        user = SimpleNamespace(phone="1", name=None, metadata_=None)
        conv = SimpleNamespace(function_state=None)
        values, err = resolve_params(row, {}, user, conv, "")
        self.assertIsNone(values)
        self.assertEqual(err["code"], "invalid_input")


if __name__ == "__main__":
    unittest.main()
