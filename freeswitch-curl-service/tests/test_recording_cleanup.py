import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_DIR))

from recording_cleanup import cleanup, delete_recording, postgres_dsn, validated_name


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params):
        self.connection.queries.append((sql, params))
        if sql.lstrip().startswith("SELECT"):
            self.rows = self.connection.batches.pop(0) if self.connection.batches else []

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, batches):
        self.batches = list(batches)
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return FakeCursor(self)

    def rollback(self):
        return None


class RecordingCleanupTests(unittest.TestCase):
    def test_rejects_traversal_and_wrong_customer(self):
        for customer, path in [
            ("123456", "../other/file.mp3"),
            ("123456", "654321/abc.mp3"),
            ("123456", "123456/nested/abc.mp3"),
            ("123456", "123456/abc.wav"),
            ("123456", "123456/abc\\file.mp3"),
        ]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                validated_name(customer, path)
        self.assertEqual(validated_name("123456", "123456/abc-123.mp3"), ("123456", "abc-123.mp3"))
        self.assertEqual(
            validated_name("752800", "752800/test-TEST_100-20881ce3-06f3-4848-ad54-f1c8991cadaf.mp3"),
            ("752800", "test-TEST_100-20881ce3-06f3-4848-ad54-f1c8991cadaf.mp3"),
        )

    def test_removes_only_prisma_schema_parameter(self):
        self.assertEqual(
            postgres_dsn("postgresql://host/db?schema=public&sslmode=require"),
            "postgresql://host/db?sslmode=require",
        )

    def test_bounded_batch_marks_results_and_does_not_count_bytes_as_files(self):
        with tempfile.TemporaryDirectory() as temp:
            conn = FakeConnection([
                [(1, "123456", "123456/one.mp3"), (2, "123456", "123456/two.mp3")],
                [],
            ])
            with patch("recording_cleanup.delete_recording", side_effect=[("DELETED", 1000000), ("MISSING", 0)]):
                result = cleanup(conn, Path(temp), max_files=2)
        self.assertEqual(result["DELETED"], 1)
        self.assertEqual(result["MISSING"], 1)
        self.assertEqual(result["bytes_freed"], 1000000)
        updates = [params for sql, params in conn.queries if sql.lstrip().startswith("UPDATE")]
        self.assertEqual([params[0] for params in updates], ["DELETED", "MISSING"])

    def test_failed_deletion_is_marked_for_retry(self):
        with tempfile.TemporaryDirectory() as temp:
            conn = FakeConnection([[(3, "123456", "123456/bad.mp3")], []])
            with patch("recording_cleanup.delete_recording", side_effect=OSError("permission denied")):
                result = cleanup(conn, Path(temp), max_files=1)
        self.assertEqual(result["ERROR"], 1)
        update = next(params for sql, params in conn.queries if sql.lstrip().startswith("UPDATE"))
        self.assertEqual(update[0], "ERROR")
        self.assertIn("permission denied", update[3])

    def test_dry_run_does_not_unlink_or_update(self):
        with tempfile.TemporaryDirectory() as temp:
            conn = FakeConnection([[(4, "123456", "123456/preview.mp3", "2026-11-01")]])
            with patch("recording_cleanup.delete_recording") as delete:
                result = cleanup(conn, Path(temp), dry_run=True)
        self.assertEqual(result["SAMPLED"], 1)
        delete.assert_not_called()
        self.assertFalse(any(sql.lstrip().startswith("UPDATE") for sql, _ in conn.queries))

    @unittest.skipUnless(os.name == "posix", "dir_fd safety requires POSIX")
    def test_unlinks_recording_but_not_other_files_or_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            customer = root / "123456"
            customer.mkdir()
            target = customer / "uuid-123.mp3"
            target.write_bytes(b"recording")
            other = customer / "other.mp3"
            other.write_bytes(b"keep")
            self.assertEqual(delete_recording(root, "123456", "123456/uuid-123.mp3"), ("DELETED", 9))
            self.assertFalse(target.exists())
            self.assertTrue(other.exists())
            self.assertEqual(delete_recording(root, "123456", "123456/uuid-123.mp3"), ("MISSING", 0))
            link = customer / "link.mp3"
            link.symlink_to(other)
            with self.assertRaises(ValueError):
                delete_recording(root, "123456", "123456/link.mp3")
            self.assertTrue(other.exists())


if __name__ == "__main__":
    unittest.main()
