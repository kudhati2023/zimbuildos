import http.server
import os
import socketserver
import threading
import time
import urllib.request
import pytest

# Ensure critical environment variables are set before importing any app modules
os.environ["ZIMBUILD_HMAC_SECRET"] = "test_hmac_secret_key"
os.environ["ZIMBUILD_LEDGER_SECRET"] = "test_ledger_secret_key"
os.environ["PAYMENT_GATEWAY_API_KEY"] = "test_payment_gateway_api_key"

from server import SecureERPRequestHandler

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

@pytest.fixture(scope="session", autouse=True)
def ensure_erp_server():
    """Ensures the Zimbuild Secure ERP backend server is active on port 8000 for test suites."""
    # Test if server is already answering
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=0.5) as resp:
            if resp.status == 200:
                yield
                return
    except Exception:
        pass

    server = ThreadedTCPServer(("127.0.0.1", 8000), SecureERPRequestHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    # Wait for server readiness
    started = False
    deadline = time.time() + 5.0
    while time.time() < deadline:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=0.5) as resp:
                if resp.status == 200:
                    started = True
                    break
        except Exception:
            time.sleep(0.05)

    if not started:
        raise RuntimeError("Failed to start embedded test ERP server on 127.0.0.1:8000")

    yield

    try:
        server.shutdown()
        server.server_close()
    except Exception:
        pass
