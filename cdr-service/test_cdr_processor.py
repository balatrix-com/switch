import unittest

from cdr_processor import parse_cdr


class CdrProcessorTest(unittest.TestCase):
    def test_outbound_b_leg_uses_originating_uuid_and_explicit_direction(self) -> None:
        payload = {
            "core-uuid": "core-1",
            "switchname": "wlabel",
            "channel_data": {"direction": "outbound"},
            "variables": {
                "uuid": "b-leg",
                "originating_leg_uuid": "a-leg",
                "sip_h_X-Call-Direction": "outbound",
                "sip_h_X-Source-IP": "51.79.127.124",
                "sip_to_user": "%2B18885604944",
                "sip_call_id": "b-call-id@switch",
                "billsec": "37",
                "answer_epoch": "1787750612",
            },
        }

        leg = parse_cdr(payload)

        self.assertEqual(leg.leg_role, "B")
        self.assertEqual(leg.session_uuid, "a-leg")
        self.assertEqual(leg.direction, "OUTBOUND")
        self.assertEqual(leg.direction_source, "X-Call-Direction")
        self.assertEqual(leg.destination_number, "+18885604944")
        self.assertEqual(leg.sip_call_id, "b-call-id@switch")
        self.assertTrue(leg.answered)

    def test_a_leg_is_the_session_and_carries_customer(self) -> None:
        payload = {
            "channel_data": {"direction": "inbound"},
            "variables": {
                "uuid": "a-leg",
                "billing_customer_id": "customer-1",
                "billing_carrier_id": "carrier-1",
                "billing_carrier_endpoint_id": "carrier-endpoint-1",
                "billing_recording_requested": "true",
                "sip_call_id": "a-call-id@customer",
                "sip_h_X-Call-Direction": "inbound",
                "duration": "45",
                "billsec": "0",
                "hangup_cause": "NO_ANSWER",
            },
            "callflow": [
                {
                    "caller_profile": {
                        "uuid": "a-leg",
                        "caller_id_number": "18005550100",
                        "destination_number": "18005550101",
                    }
                }
            ],
        }

        leg = parse_cdr(payload)

        self.assertEqual(leg.leg_role, "A")
        self.assertEqual(leg.session_uuid, "a-leg")
        self.assertEqual(leg.direction, "INBOUND")
        self.assertEqual(leg.customer_id, "customer-1")
        self.assertEqual(leg.carrier_id, "carrier-1")
        self.assertEqual(leg.carrier_endpoint_id, "carrier-endpoint-1")
        self.assertEqual(leg.sip_call_id, "a-call-id@customer")
        self.assertEqual(leg.caller_number, "18005550100")
        self.assertTrue(leg.recording_requested)
        self.assertFalse(leg.answered)

    def test_freeswitch_leg_direction_is_not_used_as_business_direction(self) -> None:
        payload = {
            "channel_data": {"direction": "inbound"},
            "variables": {"uuid": "a-leg"},
        }

        leg = parse_cdr(payload)

        self.assertIsNone(leg.direction)

    def test_query_uuid_is_used_when_payload_uuid_is_missing(self) -> None:
        leg = parse_cdr({"variables": {}}, query_uuid="query-leg")
        self.assertEqual(leg.leg_uuid, "query-leg")
        self.assertFalse(leg.recording_requested)


if __name__ == "__main__":
    unittest.main()
