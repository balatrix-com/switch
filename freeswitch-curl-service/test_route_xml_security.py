import importlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree


SERVICE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVICE_DIR))
os.environ.setdefault("DATABASE_URL", "postgresql://unused:unused@127.0.0.1/unused")

with patch("psycopg2.pool.ThreadedConnectionPool"):
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


if __name__ == "__main__":
    unittest.main()
