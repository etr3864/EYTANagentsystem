"""Validate Meta WhatsApp credentials against the Graph API."""
import httpx

_API_URL = "https://graph.facebook.com/v22.0"

# Meta error code → (title, message, tip) in Hebrew
_ERROR_MAP: dict[int, tuple[str, str, str]] = {
    190: (
        "Access Token לא תקין",
        "הטוקן פג תוקף או שהוזן לא נכון",
        "יש לייצר Token חדש ב-Meta → WhatsApp → API Setup",
    ),
    100: (
        "מזהה לא נמצא",
        "המזהה שהוזן לא קיים ב-Meta",
        "יש לוודא שהועתק נכון מממשק Meta → API Setup",
    ),
    10: (
        "אין הרשאה",
        "לטוקן אין הרשאה לגשת למשאב הזה",
        "יש לוודא שהטוקן שייך לאותו App ו-Business Account",
    ),
    200: (
        "אין הרשאה",
        "אין הרשאת גישה מספקת",
        "יש לבדוק הרשאות ה-App ב-Meta Business Manager",
    ),
}

_DEFAULT_ERROR = (
    "שגיאה לא ידועה",
    "לא ניתן לאמת את הפרטים",
    "יש לבדוק שכל השדות הוזנו נכון ולנסות שוב",
)


def _map_meta_error(response: httpx.Response, resource: str) -> str:
    """Extract Meta error and return a formatted Hebrew message."""
    try:
        err = response.json().get("error", {})
        code = err.get("code", 0)
    except Exception:
        code = 0

    title, message, tip = _ERROR_MAP.get(code, _DEFAULT_ERROR)
    return f"{title}: {message}. {tip}"


async def validate_meta_credentials(
    phone_number_id: str, waba_id: str, access_token: str
) -> dict:
    """Validate phone number and WABA against Meta API.

    Returns dict with meta info on success.
    Raises ValueError with Hebrew message on failure.
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=15) as client:
        # Validate Phone Number
        phone_resp = await client.get(
            f"{_API_URL}/{phone_number_id}",
            params={"fields": "display_phone_number,verified_name,quality_rating"},
            headers=headers,
        )
        if phone_resp.status_code != 200:
            raise ValueError(_map_meta_error(phone_resp, "phone"))

        phone_data = phone_resp.json()

        # Validate WABA
        waba_resp = await client.get(
            f"{_API_URL}/{waba_id}",
            params={"fields": "id,name"},
            headers=headers,
        )
        if waba_resp.status_code != 200:
            raise ValueError(_map_meta_error(waba_resp, "waba"))

        waba_data = waba_resp.json()

    display_phone = phone_data.get("display_phone_number", "")
    is_test = display_phone.startswith("+1555") or display_phone.startswith("1555")

    return {
        "verified_name": phone_data.get("verified_name", ""),
        "display_phone": display_phone,
        "quality": phone_data.get("quality_rating", ""),
        "waba_name": waba_data.get("name", ""),
        "is_test": is_test,
    }
