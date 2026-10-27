"""
Zimbuild Security Shield & Cryptographic Audit Guard
Role-Based Access Control (RBAC), XSS sanitization, HMAC-SHA256 transaction signing,
and tamper-evident audit logging.
"""

import hmac
import hashlib
import html
import os
import time
from typing import Dict, List, Optional, Set, Any
from datetime import datetime

# Server-side cryptographic secret for signing immutable transactions
hmac_secret_env = os.environ.get("ZIMBUILD_HMAC_SECRET")
if not hmac_secret_env:
    raise ValueError("CRITICAL: ZIMBUILD_HMAC_SECRET environment variable is missing. Failing securely.")
HMAC_SECRET = hmac_secret_env.encode()

# Role-Based Access Control (RBAC) Permissions Matrix
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "ceo": {"*"},  # Full governance access
    "portfolio": {
        "view_portfolio", "calc_depreciation", "view_leases", "cam_reconcile", "view_documents", "view_crm"
    },
    "leasecrm": {
        "view_leases", "screen_tenant", "generate_abstraction", "submit_ticket", "view_portfolio", "view_crm", "log_communication"
    },
    "qs": {
        "view_jobcosting", "certify_payment", "evaluate_tenders", "view_boq", "calc_estimates",
        "view_schedule", "update_task", "view_quality", "manage_snags", "calculate_mortgage"
    },
    "siteops": {
        "view_siteops", "dispatch_work_order", "three_way_match", "log_fleet_shift", "sync_offline", "dispatch_material", "view_supply_chain",
        "view_hr", "log_attendance", "approve_attendance", "view_fleet", "log_fuel", "appraise_equipment", "view_fieldservice", "mobile_log_service", "complete_work_order",
        "view_schedule", "update_task", "view_quality", "log_cube_test"
    },
    "fintax": {
        "view_financials", "process_tax", "cam_reconcile", "process_pos_receipt", "view_jobcosting", "three_way_match", "view_supply_chain",
        "view_hr", "process_payroll", "view_fleet", "appraise_equipment", "calculate_mortgage"
    },
    "hr": {
        "view_hr", "manage_employees", "manage_recruitment", "log_attendance", "approve_attendance", "process_payroll", "view_financials"
    },
    "fleet": {
        "view_fleet", "log_fleet_shift", "log_fuel", "appraise_equipment", "view_siteops"
    },
    "fieldservice": {
        "view_fieldservice", "dispatch_work_order", "mobile_log_service", "complete_work_order", "submit_ticket"
    },
    "dlap": {
        "dlap_verify", "register_caveat", "clear_caveat", "view_documents", "view_stands", "view_deeds",
        "view_permits", "signoff_permit"
    },
    "planner": {
        "view_cadastre", "peg_beacons", "toggle_infrastructure", "measure_area", "view_geodesy", "view_planning",
        "view_permits", "signoff_permit", "view_schedule"
    },
    "builder": {
        "view_construction", "issue_turnkey_contract", "signoff_inspection", "requisition_material", "view_inventory", "view_supply_chain",
        "view_schedule", "update_task", "view_quality", "log_cube_test", "manage_snags", "view_permits", "signoff_permit"
    },
    "inventory": {
        "view_inventory", "receive_grn", "dispatch_material", "audit_stock", "view_supply_chain", "manage_wms", "manage_purchasing", "manage_mrp"
    },
    "sales": {
        "view_stands", "sell_stand", "generate_agreement_of_sale", "view_deeds",
        "view_crm", "manage_inquiries", "manage_pipeline", "log_communication", "manage_customers",
        "calculate_mortgage", "view_allocations", "send_reminder"
    },
    "buyer": {
        "view_buyer_portal", "download_statement", "view_deed", "submit_ticket", "view_construction",
        "calculate_mortgage", "manage_snags", "youth_register", "view_allocations", "send_reminder"
    },
    "sysadmin": {
        "view_audit_trail", "verify_security_shield", "configure_rbac", "clear_audit_cache", "view_supply_chain",
        "view_allocations", "send_reminder"
    }
}

class SecurityGuard:
    """Enterprise security gateway enforcing RBAC, input sanitization, and cryptographic audits."""

    def __init__(self):
        self.audit_log: List[Dict] = []
        self.rate_limits: Dict[str, List[float]] = {}
        self._seed_initial_audit()

    def _seed_initial_audit(self):
        self.log_security_event(
            user_role="sysadmin",
            action="SYSTEM_INIT",
            details="Zimbuild Security Shield & Zero-Trust Architecture initialized.",
            status="SUCCESS"
        )

    @staticmethod
    def sanitize(text: str) -> str:
        """Sanitizes user input to prevent XSS (Cross-Site Scripting) injection."""
        if not text:
            return ""
        # HTML entity escape
        escaped = html.escape(str(text).strip())
        # Strip potential script or javascript pseudo-protocols
        escaped = escaped.replace("javascript:", "").replace("vbscript:", "")
        return escaped

    @staticmethod
    def check_permission(user_role: str, action: str) -> bool:
        """Enforces Role-Based Access Control (RBAC)."""
        if not user_role or user_role not in ROLE_PERMISSIONS:
            return False
        allowed = ROLE_PERMISSIONS[user_role]
        if "*" in allowed:
            return True
        return action in allowed

    @staticmethod
    def sign_transaction(data: Dict) -> str:
        """Generates an immutable HMAC-SHA256 signature for a transaction payload."""
        payload_str = "|".join(f"{k}:{v}" for k, v in sorted(data.items()))
        signature = hmac.new(HMAC_SECRET, payload_str.encode(), hashlib.sha256).hexdigest()
        return signature

    @staticmethod
    def verify_transaction_signature(data: Dict, signature: str) -> bool:
        """Verifies the integrity of a signed transaction to prevent tampering."""
        expected_sig = SecurityGuard.sign_transaction(data)
        return hmac.compare_digest(expected_sig, signature)

    def log_security_event(self, user_role: str, action: str, details: str, status: str = "SUCCESS", metadata: Optional[Dict] = None) -> Dict:
        """Appends an event to the tamper-evident audit ledger with cryptographic hash linking."""
        timestamp = datetime.now().isoformat()
        prev_hash = self.audit_log[-1]["event_hash"] if self.audit_log else "GENESIS_HASH_0000000000"
        
        event_payload = {
            "index": len(self.audit_log) + 1,
            "timestamp": timestamp,
            "user_role": user_role,
            "action": action,
            "status": status,
            "details": self.sanitize(details),
            "prev_hash": prev_hash,
            "metadata": metadata or {}
        }
        
        raw_to_hash = f"{event_payload['index']}:{timestamp}:{user_role}:{action}:{status}:{event_payload['details']}:{prev_hash}"
        event_hash = hashlib.sha256(raw_to_hash.encode()).hexdigest()
        event_payload["event_hash"] = event_hash

        self.audit_log.append(event_payload)
        return event_payload

    def get_audit_trail(self, limit: int = 50) -> List[Dict]:
        """Returns the most recent security and transaction audit entries."""
        return self.audit_log[-limit:]

    def check_rate_limit(self, client_id: str, limit: int = 120, window_seconds: int = 60) -> bool:
        """Enforces sliding-window rate limiting per client IP/ID to protect against DoS attacks."""
        now = time.time()
        timestamps = self.rate_limits.get(client_id, [])
        # Prune expired entries
        valid_timestamps = [t for t in timestamps if now - t < window_seconds]
        if len(valid_timestamps) >= limit:
            self.rate_limits[client_id] = valid_timestamps
            return False
        valid_timestamps.append(now)
        self.rate_limits[client_id] = valid_timestamps
        return True

    def verify_audit_log_integrity(self) -> Dict[str, Any]:
        """Cryptographically verifies the SHA-256 hash chain of the entire audit log."""
        if not self.audit_log:
            return {"valid": True, "tampered_indices": [], "total_blocks": 0}

        tampered = []
        for i, block in enumerate(self.audit_log):
            expected_prev = "GENESIS_HASH_0000000000" if i == 0 else self.audit_log[i - 1]["event_hash"]
            if block["prev_hash"] != expected_prev:
                tampered.append(block["index"])
                continue

            raw_str = f"{block['index']}:{block['timestamp']}:{block['user_role']}:{block['action']}:{block['status']}:{block['details']}:{block['prev_hash']}"
            computed_hash = hashlib.sha256(raw_str.encode()).hexdigest()
            if block["event_hash"] != computed_hash:
                tampered.append(block["index"])

        return {
            "valid": len(tampered) == 0,
            "tampered_indices": tampered,
            "total_blocks": len(self.audit_log)
        }


# Global singleton instance
security_guard = SecurityGuard()
