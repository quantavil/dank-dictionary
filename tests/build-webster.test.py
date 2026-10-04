#!/usr/bin/env python3
"""Offline regression tests for the pinned GCIDE archive downloader."""
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "build_webster", Path(__file__).resolve().parents[1] / "scripts/build-webster.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ArchiveDownloadTests(unittest.TestCase):
    payload = b"synthetic archive fixture; these tests never access the network"

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cache = Path(self.directory.name) / "gcide.zip"
        self.digest = hashlib.sha256(self.payload).hexdigest()
        self.expected = patch.object(builder, "GCIDE_ZIP_SHA256", self.digest,
                                     create=True)
        self.expected.start()
        self.addCleanup(self.expected.stop)
        self.silence = patch.object(builder, "log")
        self.silence.start()
        self.addCleanup(self.silence.stop)

    def assert_no_partial_files(self):
        self.assertEqual(sorted(Path(self.directory.name).iterdir()),
                         [self.cache] if self.cache.exists() else [])

    def test_official_download_url_uses_https(self):
        self.assertEqual(builder.GCIDE_ZIP_URL,
                         "https://www.ibiblio.org/webster/gcide_xml-0.53.zip")

    def test_valid_existing_cache_is_verified_without_network_or_rewrite(self):
        self.cache.write_bytes(self.payload)
        before = self.cache.stat().st_mtime_ns
        with patch.object(builder.urllib.request, "urlopen") as request:
            builder.ensure_zip(str(self.cache))
        request.assert_not_called()
        self.assertEqual(self.cache.read_bytes(), self.payload)
        self.assertEqual(self.cache.stat().st_mtime_ns, before)
        self.assert_no_partial_files()

    def test_existing_cache_mismatch_rejected_and_preserved(self):
        self.cache.write_bytes(b"corrupt cached archive")
        with patch.object(builder.urllib.request, "urlopen") as request:
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                builder.ensure_zip(str(self.cache))
        request.assert_not_called()
        self.assertEqual(self.cache.read_bytes(), b"corrupt cached archive")
        self.assert_no_partial_files()

    def test_download_uses_timeout_and_publishes_verified_file_atomically(self):
        original_replace = builder.os.replace
        replacements = []

        def checked_replace(source, destination):
            self.assertFalse(self.cache.exists(), "cache visible before verification")
            self.assertEqual(Path(source).parent, self.cache.parent)
            self.assertEqual(Path(source).read_bytes(), self.payload)
            replacements.append((source, destination))
            original_replace(source, destination)

        with patch.object(builder.urllib.request, "urlopen",
                          return_value=io.BytesIO(self.payload)) as request:
            with patch.object(builder.os, "replace", side_effect=checked_replace):
                builder.ensure_zip(str(self.cache))
        request.assert_called_once_with(builder.GCIDE_ZIP_URL,
                                        timeout=builder.DOWNLOAD_TIMEOUT_SECONDS)
        self.assertGreater(builder.DOWNLOAD_TIMEOUT_SECONDS, 0)
        self.assertLessEqual(builder.DOWNLOAD_TIMEOUT_SECONDS, 60)
        self.assertEqual(len(replacements), 1)
        self.assertEqual(self.cache.read_bytes(), self.payload)
        self.assert_no_partial_files()

    def test_timeout_leaves_no_cache_or_partial_file(self):
        with patch.object(builder.urllib.request, "urlopen",
                          side_effect=TimeoutError("connection timed out")):
            with self.assertRaises(TimeoutError):
                builder.ensure_zip(str(self.cache))
        self.assert_no_partial_files()

    def test_total_download_deadline_cleans_slow_partial_transfer(self):
        with patch.object(builder, "time", create=True) as clock:
            clock.monotonic.side_effect = [0, 0, 121]
            with patch.object(builder.urllib.request, "urlopen",
                              return_value=io.BytesIO(self.payload)):
                with self.assertRaisesRegex(TimeoutError, "deadline"):
                    builder.ensure_zip(str(self.cache))
        self.assert_no_partial_files()

    def test_download_hash_mismatch_leaves_no_cache_or_partial_file(self):
        with patch.object(builder.urllib.request, "urlopen",
                          return_value=io.BytesIO(b"tampered download")):
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                builder.ensure_zip(str(self.cache))
        self.assert_no_partial_files()

    def test_read_failure_cleans_partial_download(self):
        class InterruptedResponse(io.BytesIO):
            reads = 0

            def read1(self, size=-1):
                self.reads += 1
                if self.reads > 1:
                    raise TimeoutError("read timed out")
                return b"partial download"

        with patch.object(builder.urllib.request, "urlopen",
                          return_value=InterruptedResponse()):
            with self.assertRaises(TimeoutError):
                builder.ensure_zip(str(self.cache))
        self.assert_no_partial_files()

    def test_atomic_publish_failure_cleans_verified_temporary_file(self):
        with patch.object(builder.urllib.request, "urlopen",
                          return_value=io.BytesIO(self.payload)):
            with patch.object(builder.os, "replace", side_effect=OSError("disk error")):
                with self.assertRaises(OSError):
                    builder.ensure_zip(str(self.cache))
        self.assert_no_partial_files()

    def test_failed_fetch_preserves_valid_cache_created_concurrently(self):
        def interrupted_fetch(*args, **kwargs):
            self.cache.write_bytes(self.payload)
            raise TimeoutError("connection timed out")

        with patch.object(builder.urllib.request, "urlopen",
                          side_effect=interrupted_fetch):
            with self.assertRaises(TimeoutError):
                builder.ensure_zip(str(self.cache))
        self.assertEqual(self.cache.read_bytes(), self.payload)
        self.assert_no_partial_files()


if __name__ == "__main__":
    unittest.main()
