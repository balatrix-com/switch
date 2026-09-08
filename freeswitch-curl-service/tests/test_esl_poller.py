import json
import unittest

from esl_poller import DATA_KEY, WAKE_KEY, poll_once


class FakeRedis:
    def __init__(self, awake):
        self.awake = awake
        self.writes = []

    def exists(self, key):
        return self.awake and key == WAKE_KEY

    def set(self, key, value, ex):
        self.writes.append((key, value, ex))


class FakeEsl:
    def __init__(self):
        self.calls = 0

    def live_calls(self):
        self.calls += 1
        return {"ok": True, "calls": [], "summary": {"activeCalls": 0}}


class EslPollerTests(unittest.TestCase):
    def test_sleeps_without_wake_key(self):
        redis = FakeRedis(False)
        esl = FakeEsl()
        self.assertFalse(poll_once(redis, esl))
        self.assertEqual(esl.calls, 0)
        self.assertEqual(redis.writes, [])

    def test_writes_snapshot_with_ten_second_ttl(self):
        redis = FakeRedis(True)
        esl = FakeEsl()
        self.assertTrue(poll_once(redis, esl))
        key, value, ttl = redis.writes[0]
        self.assertEqual(key, DATA_KEY)
        self.assertEqual(ttl, 10)
        self.assertEqual(json.loads(value)["calls"], [])


if __name__ == "__main__":
    unittest.main()
