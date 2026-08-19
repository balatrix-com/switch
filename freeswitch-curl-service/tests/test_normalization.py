import unittest

from normalization import apply_steps, xml_file_name


class NormalizationTests(unittest.TestCase):
    def test_carrier_steps_produce_did_lookup_key(self):
        result = apply_steps(
            "+18005551234",
            [
                {"operation": "TRIM"},
                {"operation": "STRIP_PREFIX", "value": "+1"},
            ],
        )
        self.assertEqual(result, "8005551234")
        self.assertEqual(xml_file_name("inbound", result), "inbound_8005551234.xml")

    def test_invalid_file_key_is_rejected(self):
        with self.assertRaises(ValueError):
            xml_file_name("inbound", "../../route")


if __name__ == "__main__":
    unittest.main()
