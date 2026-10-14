"""
Phase 0 regression tests (docs/INTEGRATION_PLAN.md): the deployment must not drift back to
- the React client being replaced by the prototype page,
- the unauthenticated prototype ERP being published or listening on every interface,
- committed fallback secrets in docker-compose.yml,
- runtime logs being downloadable,
- the prototype generator overwriting maintained files.
"""
import re
import urllib.error
import urllib.request
from pathlib import Path

import server

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = "http://127.0.0.1:8000"


def _get(path: str):
    req = urllib.request.Request(BASE_URL + path)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


# ---------------------------------------------------------------- React entry vs prototype page

def test_index_html_is_the_react_vite_entry():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert '<div id="root"></div>' in html
    assert 'src="/src/main.tsx"' in html
    assert "cdn.tailwindcss.com" not in html, "the React entry must not load CDN assets"


def test_prototype_page_is_served_at_root_and_legacy_paths():
    for path in ("/", "/index.html", "/erp.html"):
        status, body = _get(path)
        assert status == 200, path
        assert "Zimbuild Real Estate &amp; Construction ERP Platform" in body or "Zimbuild Real Estate & Construction ERP Platform" in body, path


def test_generator_never_overwrites_maintained_pages_or_python_files():
    src = (ROOT / "build_full_enterprise_erp.py").read_text(encoding="utf-8")
    writes = re.findall(r'open\(\s*"([^"]+)"\s*,\s*"w"', src)
    assert writes == ["erp.generated.html"], writes


# ---------------------------------------------------------------- prototype ERP not exposed

def test_prototype_server_binds_localhost_by_default(monkeypatch):
    seen = {}

    class FakeServer:
        def __init__(self, address, handler):
            seen["address"] = address

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def serve_forever(self):
            pass

    monkeypatch.delenv("HOST", raising=False)
    monkeypatch.setattr(server, "ThreadedTCPServer", FakeServer)
    server.run_server(8123)
    assert seen["address"] == ("127.0.0.1", 8123)

    monkeypatch.setenv("HOST", "0.0.0.0")
    server.run_server(8124)
    assert seen["address"] == ("0.0.0.0", 8124)


def test_nginx_does_not_proxy_the_prototype_erp():
    conf = (ROOT / "nginx" / "nginx.conf").read_text(encoding="utf-8")
    assert not re.search(r"proxy_pass\s+https?://zhms-erp-python", conf), "the prototype ERP must not be proxied"
    block = re.search(r"location /api/erp/ \{(.*?)\}", conf, re.S)
    assert block and "return 404" in block.group(1)


def _location_blocks(conf: str):
    return re.findall(r"location\s+[^{]+\{(.*?)\}", conf, re.S)


def test_nginx_security_headers_are_not_dropped_by_location_blocks():
    """An add_header inside a location discards all server-level add_header directives (HSTS, CSP...)."""
    conf = (ROOT / "nginx" / "nginx.conf").read_text(encoding="utf-8")
    for header in ("Strict-Transport-Security", "Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options"):
        assert f"add_header {header}" in conf, header
    offenders = [b.strip().splitlines()[0] for b in _location_blocks(conf) if "add_header" in b]
    assert not offenders, f"add_header inside a location block drops the security headers: {offenders}"


def test_nginx_re_resolves_the_api_container():
    """proxy_pass to a literal hostname is resolved once; a restarted container then gives 502."""
    conf = (ROOT / "nginx" / "nginx.conf").read_text(encoding="utf-8")
    assert re.search(r"resolver\s+127\.0\.0\.11\b", conf)
    passes = re.findall(r"^\s*proxy_pass\s+([^;\s]+)", conf, re.M)
    assert passes and all("$" in p for p in passes), f"proxy_pass must use a variable: {passes}"


def test_nginx_waits_for_a_healthy_api():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    nginx = compose.split("  nginx:")[1]
    assert re.search(r"zhms-api:\s*\n\s*condition:\s*service_healthy", nginx)
    api = compose.split("  zhms-api:")[1].split("  zhms-erp-python:")[0]
    assert "healthcheck:" in api and "/healthz" in api


# ---------------------------------------------------------------- secrets and logs

def test_compose_has_no_committed_fallback_secrets():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    for var in ("POSTGRES_PASSWORD", "JWT_SECRET", "ZIMBUILD_HMAC_SECRET"):
        assert re.search(r"\$\{%s:\?" % var, compose), f"{var} must be required (${{{var}:?...}})"
        assert not re.search(r"\$\{%s:-[^}]" % var, compose), f"{var} must not have a default value"
    for var in ("WEBHOOK_SECRET_ECOCASH", "WEBHOOK_SECRET_BANK_TRANSFER", "WEBHOOK_SECRET_OMARI", "WEBHOOK_SECRET_DEBIT_ORDER"):
        assert "${%s:-}" % var in compose, f"{var} may be empty but must not have a committed value"


def test_compose_writes_the_security_log_outside_the_served_directory():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "AUDIT_LOG_FILE: /var/log/zhms/" in compose
    assert "SECURITY_AUDIT_LOG" not in compose, "the code reads AUDIT_LOG_FILE, not SECURITY_AUDIT_LOG"


def test_runtime_logs_and_backups_are_not_downloadable():
    for path in ("/audit_events.jsonl", "/server.log", "/backups/zhms.dump"):
        status, body = _get(path)
        assert status in (403, 404), f"{path} returned {status}"
        assert '"event' not in body
