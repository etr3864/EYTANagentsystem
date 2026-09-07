from typing import Any, Optional


def tool_error(
    code: str,
    message_for_model: str,
    customer_hint: str = "",
) -> dict[str, Any]:
    return {
        "ok": False,
        "code": code,
        "message_for_model": message_for_model,
        "customer_hint": customer_hint,
    }


def from_http(
    status_code: Optional[int],
    timed_out: bool,
    side_effect: str,
    error: Optional[str],
) -> Optional[dict[str, Any]]:
    if timed_out or error == "timeout":
        if side_effect == "write":
            return tool_error(
                "indeterminate",
                "הכתיבה לא אושרה. אסור לנסות שוב. אל תגיד ללקוח שהצליח.",
                "אנחנו בודקים את זה.",
            )
        return tool_error("timeout", "השירות לא ענה בזמן. אל תמציא תוצאה.")
    if error:
        return tool_error("unavailable", "השירות לא זמין כרגע.")
    if status_code is None:
        return tool_error("unavailable", "השירות לא זמין כרגע.")
    if 300 <= status_code < 400:
        return tool_error("denied", "הפניה נחסמה.")
    if status_code == 404:
        return tool_error("not_found", "הרשומה לא נמצאה.")
    if 400 <= status_code < 500:
        return tool_error("invalid_input", "הבקשה נדחתה. בדוק את הפרמטרים.")
    if status_code >= 500:
        return tool_error("unavailable", "השירות לא זמין כרגע.")
    return None
