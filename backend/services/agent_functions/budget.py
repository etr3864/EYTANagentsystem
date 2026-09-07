import time

from backend.services.agent_functions.constants import MIN_HTTP_MS, TURN_BUDGET_SECONDS


class TurnBudget:
    def __init__(self, seconds: int = TURN_BUDGET_SECONDS):
        self._deadline = time.monotonic() + seconds

    def remaining_ms(self) -> int:
        return max(0, int((self._deadline - time.monotonic()) * 1000))

    def can_http(self) -> bool:
        return self.remaining_ms() >= MIN_HTTP_MS

    def timeout_ms(self, configured_ms: int) -> int:
        return min(configured_ms, self.remaining_ms())
