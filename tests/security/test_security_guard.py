"""
Unit tests for Zimbuild Security Shield: RBAC, XSS Sanitization, HMAC Transaction Signing,
and Tamper-Evident Audit Logging.
"""

import pytest
from src.security.security_guard import security_guard, SecurityGuard, ROLE_PERMISSIONS
from src.inventory.materials_inventory import MaterialsInventoryManager
from src.erp.dlap_registry_engine import DLAPRegistryEngine


def test_xss_sanitization():
    raw_xss = "<script>alert('pwned');</script><strong>Clean Text</strong>"
    clean = SecurityGuard.sanitize(raw_xss)
    assert "<script>" not in clean
    assert "&lt;script&gt;" in clean
    assert "&lt;/script&gt;" in clean
    
    dirty_protocol = "javascript:stealCookies()"
    clean_proto = SecurityGuard.sanitize(dirty_protocol)
    assert "javascript:" not in clean_proto


def test_rbac_authorization_matrix():
    # CEO has full access (*)
    assert SecurityGuard.check_permission("ceo", "any_random_action") is True
    assert SecurityGuard.check_permission("ceo", "dispatch_material") is True
    
    # Stores Inventory Manager can dispatch material and receive GRN, but cannot sell stand or certify payments
    assert SecurityGuard.check_permission("inventory", "dispatch_material") is True
    assert SecurityGuard.check_permission("inventory", "receive_grn") is True
    assert SecurityGuard.check_permission("inventory", "sell_stand") is False
    assert SecurityGuard.check_permission("inventory", "certify_payment") is False
    
    # Stand Buyer can view portal and download statement, but cannot dispatch material or register caveat
    assert SecurityGuard.check_permission("buyer", "view_buyer_portal") is True
    assert SecurityGuard.check_permission("buyer", "dispatch_material") is False
    assert SecurityGuard.check_permission("buyer", "register_caveat") is False
    
    # Legal Counsel can register and clear caveat
    assert SecurityGuard.check_permission("dlap", "register_caveat") is True
    assert SecurityGuard.check_permission("dlap", "clear_caveat") is True


def test_hmac_transaction_signing_and_tamper_detection():
    tx_data = {
        "stand_id": "STAND-001",
        "buyer": "Takudzwa Kunaka",
        "deposit_usd": 2000.0,
        "contract_ref": "AOS-2026-001"
    }
    
    # Sign transaction
    sig = SecurityGuard.sign_transaction(tx_data)
    assert len(sig) == 64  # SHA-256 hex string
    
    # Valid verification
    assert SecurityGuard.verify_transaction_signature(tx_data, sig) is True
    
    # Tampered verification (maliciously altering deposit amount)
    tampered_tx = tx_data.copy()
    tampered_tx["deposit_usd"] = 500.0  # Fraudulent change
    assert SecurityGuard.verify_transaction_signature(tampered_tx, sig) is False


def test_tamper_evident_audit_log_chain():
    initial_len = len(security_guard.audit_log)
    
    evt1 = security_guard.log_security_event(
        user_role="builder",
        action="SIGNOFF_INSPECTION",
        details="Certified 25MPa concrete slab for Stand 002"
    )
    assert evt1["index"] == initial_len + 1
    assert "event_hash" in evt1
    assert len(evt1["event_hash"]) == 64
    
    evt2 = security_guard.log_security_event(
        user_role="inventory",
        action="DISPATCH_MATERIAL",
        details="Dispatched 250 bags PPC cement to Stand 001"
    )
    assert evt2["prev_hash"] == evt1["event_hash"]  # Blockchain-style cryptographic linking
    
    trail = security_guard.get_audit_trail(10)
    assert len(trail) >= 2


def test_dlap_caveat_security_lock():
    dlap = DLAPRegistryEngine()
    deed_no = "TD-4982/2021"
    
    # Initial status clear
    init_check = dlap.verify_title_for_transfer(deed_no)
    assert init_check["can_transfer_or_finance"] is True
    
    # Register caveat
    deed = dlap.registry[deed_no]
    cav_ref = deed.register_electronic_caveat("Standard Chartered Bank", "High Court Freezing Order")
    
    # Verify locked
    locked_check = dlap.verify_title_for_transfer(deed_no)
    assert locked_check["can_transfer_or_finance"] is False
    assert locked_check["has_active_caveats"] is True
    
    # Clear caveat restores clearance
    deed.clear_caveat(cav_ref)
    cleared_check = dlap.verify_title_for_transfer(deed_no)
    assert cleared_check["can_transfer_or_finance"] is True


def test_rate_limiting_enforcement():
    test_ip = "192.168.1.105"
    # Ensure client passes within limit
    for _ in range(5):
        assert security_guard.check_rate_limit(test_ip, limit=5, window_seconds=10) is True

    # 6th request within window must be throttled
    assert security_guard.check_rate_limit(test_ip, limit=5, window_seconds=10) is False


def test_audit_chain_tamper_detection():
    # Verify currently valid ledger
    res = security_guard.verify_audit_log_integrity()
    assert res["valid"] is True
    assert len(res["tampered_indices"]) == 0

    # Simulate malicious database modification on an audit entry
    tampered_entry = security_guard.audit_log[-1]
    original_details = tampered_entry["details"]
    tampered_entry["details"] = "FRAUDULENT_TAMPERED_EVENT_DETAILS"

    # Integrity verification must immediately detect tampering
    tampered_res = security_guard.verify_audit_log_integrity()
    assert tampered_res["valid"] is False
    assert tampered_entry["index"] in tampered_res["tampered_indices"]

    # Revert to maintain pristine state
    tampered_entry["details"] = original_details
    reverted_res = security_guard.verify_audit_log_integrity()
    assert reverted_res["valid"] is True


def test_iso_27001_audit_logging_pseudonymization_and_jsonl_persistence(tmp_path):
    """ISO A.8.16 / A.8.12: Security events must pseudonymize actor IDs and persist to audit_events.jsonl."""
    import os
    import json
    from src.security.security_guard import SecurityGuard

    test_log_file = tmp_path / "test_audit.jsonl"
    guard = SecurityGuard(log_file_path=str(test_log_file))

    raw_actor_id = "user-takudzwa-national-id-63-123456-A-24"
    evt = guard.log_security_event(
        user_role="leasecrm",
        action="TENANT_BACKGROUND_CHECK",
        details="Credit score vetted",
        actor_id=raw_actor_id
    )

    # Actor identity must NOT be logged in plaintext
    assert "actor_pseudonym" in evt
    assert raw_actor_id not in str(evt)
    assert len(evt["actor_pseudonym"]) == 64  # SHA-256 hash length

    # JSONL persistence check
    assert os.path.exists(str(test_log_file))
    with open(str(test_log_file), "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]
        assert len(lines) >= 1
        last_logged = json.loads(lines[-1])
        assert last_logged["event_hash"] == evt["event_hash"]
        assert last_logged["actor_pseudonym"] == evt["actor_pseudonym"]


def test_iso_27001_cryptographic_secret_enforcement_in_production(monkeypatch):
    """ISO A.8.24: Production environment must refuse weak or missing HMAC secrets."""
    import os
    from src.security.security_guard import get_hmac_secret

    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.delenv("ZIMBUILD_HMAC_SECRET", raising=False)

    with pytest.raises(ValueError, match="ISO 27001 A.8.24"):
        get_hmac_secret()

    # Weak secret (< 32 chars) must also be rejected in production
    monkeypatch.setenv("ZIMBUILD_HMAC_SECRET", "short_secret_123")
    with pytest.raises(ValueError, match="ISO 27001 A.8.24"):
        get_hmac_secret()

    # Sufficient secret (>= 32 chars) must succeed
    valid_key = "a_very_strong_cryptographic_secret_key_exceeding_32_chars!"
    monkeypatch.setenv("ZIMBUILD_HMAC_SECRET", valid_key)
    assert get_hmac_secret() == valid_key.encode("utf-8")


def test_iso_27001_fintech_ledger_secret_enforcement_in_production(monkeypatch):
    """ISO A.8.24: Fintech DualCurrencyLedger must mandate strong secret in production."""
    from src.fintech.ledger import DualCurrencyLedger

    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.delenv("FINTECH_LEDGER_SECRET", raising=False)

    with pytest.raises(ValueError, match="ISO 27001 A.8.24"):
        DualCurrencyLedger()

    # Weak secret rejected
    with pytest.raises(ValueError, match="ISO 27001 A.8.24"):
        DualCurrencyLedger(secret_key="too_short")

    # Valid secret succeeds
    strong_key = "enterprise_fintech_production_secret_key_minimum_32_chars_ok"
    ledger = DualCurrencyLedger(secret_key=strong_key)
    assert ledger.secret_key == strong_key.encode("utf-8")

