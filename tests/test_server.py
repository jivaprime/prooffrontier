"""Security-boundary tests for the local UI server."""
from __future__ import annotations

import unittest

from ui.server import is_loopback_name, request_origin_allowed


class TestServerBoundary(unittest.TestCase):
    def test_loopback_names(self) -> None:
        self.assertTrue(is_loopback_name("localhost"))
        self.assertTrue(is_loopback_name("127.0.0.1"))
        self.assertTrue(is_loopback_name("::1"))
        self.assertFalse(is_loopback_name("example.com"))
        self.assertFalse(is_loopback_name("0.0.0.0"))

    def test_local_same_origin_is_allowed(self) -> None:
        self.assertTrue(request_origin_allowed(
            "127.0.0.1:8766", "http://127.0.0.1:8766", 8766, False,
        ))
        self.assertTrue(request_origin_allowed(
            "localhost:8766", "http://localhost:8766", 8766, False,
        ))

    def test_command_line_client_without_origin_is_allowed(self) -> None:
        self.assertTrue(request_origin_allowed(
            "127.0.0.1:8766", None, 8766, False,
        ))

    def test_cross_origin_and_dns_rebinding_are_rejected(self) -> None:
        self.assertFalse(request_origin_allowed(
            "127.0.0.1:8766", "https://example.com", 8766, False,
        ))
        self.assertFalse(request_origin_allowed(
            "example.com:8766", "http://example.com:8766", 8766, False,
        ))

    def test_remote_mode_still_requires_same_origin(self) -> None:
        self.assertTrue(request_origin_allowed(
            "192.0.2.10:8766", "http://192.0.2.10:8766", 8766, True,
        ))
        self.assertFalse(request_origin_allowed(
            "192.0.2.10:8766", "http://192.0.2.11:8766", 8766, True,
        ))


if __name__ == "__main__":
    unittest.main()
