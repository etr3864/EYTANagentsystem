import unittest
from unittest.mock import MagicMock

try:
    from backend.models.conversation import Conversation
    from backend.models.playground_link import PlaygroundLink
    from backend.services.playground.detach import detach_from_agent
except ImportError:
    Conversation = None
    PlaygroundLink = None
    detach_from_agent = None


class _Query:
    def __init__(self):
        self.updated = None

    def filter(self, *args):
        self.filters = args
        return self

    def update(self, values, synchronize_session=None):
        self.updated = values
        return 1


@unittest.skipUnless(detach_from_agent, "sqlalchemy")
class DetachTests(unittest.TestCase):
    def test_nulls_link_and_playground_conversations(self):
        db = MagicMock()
        link_q, conv_q = _Query(), _Query()
        db.query.side_effect = [link_q, conv_q]
        detach_from_agent(db, 44)
        self.assertEqual(list(link_q.updated.values()), [None])
        self.assertEqual(list(conv_q.updated.values()), [None])
        self.assertIs(db.query.call_args_list[0].args[0], PlaygroundLink)
        self.assertIs(db.query.call_args_list[1].args[0], Conversation)
        self.assertTrue(any(
            getattr(expr, "left", None) is Conversation.playground_link_id
            or "playground_link_id" in str(expr)
            for expr in conv_q.filters
        ))
