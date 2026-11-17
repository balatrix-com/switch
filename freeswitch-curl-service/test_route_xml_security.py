import importlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from xml.etree import ElementTree


SERVICE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVICE_DIR))
os.environ.setdefault("DATABASE_URL", "postgresql://unused:unused@127.0.0.1/unused")

linux_modules = {name: MagicMock() for name in ("grp", "pwd")} if os.name == "nt" else {}
with patch.dict(sys.modules, linux_modules), patch("psycopg2.pool.ThreadedConnectionPool"):
    route_server = importlib.import_module("route_server")


class RouteXmlSecurityTests(unittest.TestCase):
    def test_action_escapes_attribute_breakout(self):
        hostile = 'effective_caller_id_number=x"/><action application="hangup" data="x'
        action = route_server.xml_action("set", hostile)
        root = ElementTree.fromstring(action)

        self.assertEqual(root.tag, "action")
        self.assertEqual(root.attrib["application"], "set")
        self.assertEqual(root.attrib["data"], hostile)
        self.assertEqual(list(root), [])

    def test_outbound_number_policy_rejects_xml_and_sip_metacharacters(self):
        self.assertIsNotNone(
            route_server.DIALABLE_NUMBER_PATTERN.fullmatch("+14155550123")
        )
        self.assertIsNone(
            route_server.DIALABLE_NUMBER_PATTERN.fullmatch(
                '1415"/><action application="hangup"/>'
            )
        )

    def test_insufficient_balance_returns_valid_dialplan_with_reason(self):
        xml = route_server.build_billing_denied_xml(
            "CALL_REJECTED", "INSUFFICIENT_BALANCE", "482692", "INBOUND",
            "session-123", "number-1", "carrier-1",
        )
        root = ElementTree.fromstring(xml)
        actions = [action.attrib["data"] for action in root.findall(".//action")]
        self.assertIn("billing_rejection_reason=INSUFFICIENT_BALANCE", actions)
        self.assertIn("billing_customer_id=482692", actions)
        self.assertIn("proto_specific_hangup_cause=sip:402", actions)
        self.assertEqual(actions[-1], "CALL_REJECTED")

    def test_rejected_call_is_recorded_without_b_leg(self):
        pool = MagicMock()
        connection = pool.getconn.return_value
        cursor = connection.cursor.return_value.__enter__.return_value
        route_server.record_admission_rejection(
            pool, session_id="session-123", customer_id="482692",
            direction="INBOUND", reason="INSUFFICIENT_BALANCE",
            source_ip="51.79.127.122", source_port=5060,
            caller_number="2154697019", destination_number="8000777777",
            route_id="route-1", number_id="number-1", carrier_id="carrier-1",
        )
        query, params = cursor.execute.call_args.args
        self.assertIn("ON CONFLICT (session_uuid) DO NOTHING", query)
        self.assertIn("'RATED'", query)
        self.assertEqual(params[-2:], ("INSUFFICIENT_BALANCE", "CALL_REJECTED"))
        pool.putconn.assert_called_once_with(connection)


if __name__ == "__main__":
    unittest.main()
