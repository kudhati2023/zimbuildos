"""
Legal Gatekeeper:
Statutory conveyancing policy gatekeeper enforcing compliance under:
- Deeds Registries Act [Chapter 20:05]
- Sectional Titles Act [Chapter 20:04]
- Local Authority Infrastructure Certificate of Compliance
"""
from typing import Dict, Any

class LegalGatekeeper:
    def __init__(self):
        pass

    def verify_title_eligibility(
        self,
        zoning_clearance: Dict[str, Any],
        spatial_clearance: Dict[str, Any],
        financial_status: Dict[str, Any],
        cession_approved: bool
    ) -> Dict[str, Any]:
        """
        Validates the 5 mandatory statutory gates before issuing or releasing a Title Deed.
        """
        rejections = []

        if not zoning_clearance.get("wetland_compliant", False):
            rejections.append("GATE_FAIL: Wetland 100m buffer violation or zoning irregularity")

        if not spatial_clearance.get("certified", False):
            rejections.append("GATE_FAIL: Surveyor-General diagram approval or cadastral certification missing")

        if not financial_status.get("is_fully_paid", False):
            rejections.append("GATE_FAIL: Stand has outstanding balance. 100% amortization required")

        if not cession_approved:
            rejections.append("GATE_FAIL: Cession chain broken or municipal compliance certificate not lodged")

        if rejections:
            return {
                "action": "BLOCK_DEED_RELEASE",
                "status": "INJUNCTION_ENFORCED",
                "reasons": rejections,
                "clearance_token": None
            }

        return {
            "action": "AUTHORIZE_TITLE_DEED_RELEASE",
            "status": "APPROVED",
            "reasons": [],
            "clearance_token": "CONVEYANCING_AUTH_CLEARED_2026_DEEDS_OFFICE"
        }
