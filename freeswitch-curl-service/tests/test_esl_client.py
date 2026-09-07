import time
import unittest

from esl_client import EslClient


class EslClientTests(unittest.TestCase):
    def test_summarizes_calls_and_channels(self):
        result = EslClient._summarize(
            [
                {
                    "uuid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    "direction": "inbound",
                    "accountcode": "178254",
                    "cid_num": "14165550100",
                    "dest": "18007244244",
                    "created_epoch": str(int(time.time()) - 5),
                    "callstate": "ACTIVE",
                }
            ],
            [
                {"uuid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
                {"uuid": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},
            ],
        )

        self.assertEqual(result["summary"]["activeCalls"], 1)
        self.assertEqual(result["summary"]["activeChannels"], 2)
        self.assertEqual(result["summary"]["activeTenants"], 1)
        self.assertEqual(result["calls"][0]["accountcode"], "178254")
        self.assertGreaterEqual(result["calls"][0]["durationSeconds"], 5)


if __name__ == "__main__":
    unittest.main()
