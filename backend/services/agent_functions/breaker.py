import time

from backend.services.agent_functions.constants import (
    BREAKER_FAILURE_THRESHOLD,
    BREAKER_OPEN_SECONDS,
)

_open_until: dict[int, float] = {}
_failures: dict[int, int] = {}


def allow(function_id: int) -> bool:
    until = _open_until.get(function_id, 0)
    return time.monotonic() >= until


def record_success(function_id: int) -> None:
    _failures[function_id] = 0
    _open_until.pop(function_id, None)


def record_failure(function_id: int) -> None:
    count = _failures.get(function_id, 0) + 1
    _failures[function_id] = count
    if count >= BREAKER_FAILURE_THRESHOLD:
        _open_until[function_id] = time.monotonic() + BREAKER_OPEN_SECONDS
