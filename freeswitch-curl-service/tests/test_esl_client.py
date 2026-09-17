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


    def test_eavesdrop_originates_to_custom_monitor_sip_endpoint(self):
        client = EslClient("127.0.0.1", 8021, "secret")
        commands = []
        client._api = lambda command: commands.append(command) or "+OK job"

        result = client.eavesdrop(
            "1004",
            "477cfebe-4e8f-49ab-8fe2-9db08be193b2",
            "10.30.0.58:5070",
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["sipEndpoint"], "10.30.0.58:5070")
        self.assertIn("sofia/internal/1004@10.30.0.58:5070", commands[0])
        self.assertIn("&eavesdrop(477cfebe-4e8f-49ab-8fe2-9db08be193b2)", commands[0])

    def test_eavesdrop_supports_kamailio_host_kwarg(self):
        client = EslClient("127.0.0.1", 8021, "secret")
        commands = []
        client._api = lambda command: commands.append(command) or "+OK job"

        result = client.eavesdrop(
            "1004",
            "477cfebe-4e8f-49ab-8fe2-9db08be193b2",
            kamailio_host="10.30.0.58:5070",
        )

        self.assertTrue(result["ok"])
        self.assertIn("sofia/internal/1004@10.30.0.58:5070", commands[0])

    def test_resolve_monitor_sip_endpoint(self):
        import os
        from route_server import resolve_monitor_sip_endpoint

        # Test override
        self.assertEqual(
            resolve_monitor_sip_endpoint("10.30.0.58:5070"),
            "10.30.0.58:5070",
        )

        # Test MONITOR_SIP_HOST + MONITOR_SIP_PORT
        old_host = os.environ.get("MONITOR_SIP_HOST")
        old_port = os.environ.get("MONITOR_SIP_PORT")
        old_kam = os.environ.get("KAMAILIO_HOST")
        try:
            os.environ["MONITOR_SIP_HOST"] = "10.30.0.58"
            os.environ["MONITOR_SIP_PORT"] = "5070"
            self.assertEqual(resolve_monitor_sip_endpoint(), "10.30.0.58:5070")

            os.environ.pop("MONITOR_SIP_PORT", None)
            self.assertEqual(resolve_monitor_sip_endpoint(), "10.30.0.58")

            os.environ.pop("MONITOR_SIP_HOST", None)
            os.environ["KAMAILIO_HOST"] = "10.30.0.58:5070"
            self.assertEqual(resolve_monitor_sip_endpoint(), "10.30.0.58:5070")

            os.environ.pop("KAMAILIO_HOST", None)
            self.assertEqual(resolve_monitor_sip_endpoint(), "127.0.0.1:5060")
        finally:
            if old_host:
                os.environ["MONITOR_SIP_HOST"] = old_host
            else:
                os.environ.pop("MONITOR_SIP_HOST", None)
            if old_port:
                os.environ["MONITOR_SIP_PORT"] = old_port
            else:
                os.environ.pop("MONITOR_SIP_PORT", None)
            if old_kam:
                os.environ["KAMAILIO_HOST"] = old_kam
            else:
                os.environ.pop("KAMAILIO_HOST", None)


if __name__ == "__main__":
    unittest.main()
