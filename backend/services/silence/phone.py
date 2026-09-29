"""Arm phone silence from a handset message. Dashboard sends never get here."""
from datetime import datetime, timedelta


def arm(conv, agent) -> None:
    minutes = agent.phone_silence_minutes
    if minutes is None:
        return
    if minutes == 0:
        conv.owner_silence_forever = True
        conv.owner_silence_until = None
        return
    conv.owner_silence_forever = False
    conv.owner_silence_until = datetime.utcnow() + timedelta(minutes=int(minutes))
