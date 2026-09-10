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

    def test_eavesdrop_uses_silent_listen_variables(self):
        client = EslClient("127.0.0.1", 8021, "secret")
        commands = []
        client._api = lambda command: commands.append(command) or "+OK job"

        result = client.eavesdrop(
            "900",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "kamailio.example:5060",
        )

        self.assertTrue(result["ok"])
        self.assertIn("sip_h_X-Dest-Type=SIP_USER", commands[0])
        self.assertIn("eavesdrop_whisper_aleg=false", commands[0])
        self.assertIn("sofia/internal/900@kamailio.example:5060", commands[0])
        self.assertIn("&eavesdrop(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)", commands[0])


if __name__ == "__main__":
    unittest.main()
