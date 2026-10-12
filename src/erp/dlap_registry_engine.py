"""
Zimbuild ERP - Document Management & Digital Registry Compliance
Integration with Zimbabwe Digital Land Administration Platform (DLAP) under Statutory Instrument 76 of 2025.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
import hashlib
from datetime import datetime

@dataclass
class ComplianceDocument:
    doc_id: str
    doc_type: str        # Lease, Inspection Report, Tax Clearance (ITF263), Building Permit, DLAP Certificate
    title: str
    property_or_stand_id: str
    file_format: str     # PDF, DWG, DXF, PNG
    issued_by: str       # ZIMRA, City Council, Deeds Office, Structural Engineer
    valid_until: str     # YYYY-MM-DD
    sha256_hash: str
    status: str = "Verified"  # Verified, Expired, Pending Validation

@dataclass
class DLAPTitleVerification:
    deed_number: str
    property_description: str
    registered_owner: str
    survey_diagram_no: str
    dlap_token_id: str
    statutory_instrument_basis: str = "SI 76 of 2025 (Digital Land Administration)"
    validation_status: str = "VALIDATED"  # VALIDATED, ELECTRONIC CAVEAT ACTIVE, ENCUMBERED
    mortgage_bonds: List[Dict[str, str]] = field(default_factory=list)
    caveats_registered: List[Dict[str, str]] = field(default_factory=list)
    qr_verification_code: str = ""

    def register_electronic_caveat(self, caveator: str, legal_cause: str) -> str:
        caveat_ref = f"CAV-{hashlib.md5(f'{self.deed_number}:{caveator}'.encode()).hexdigest()[:8].upper()}"
        self.caveats_registered.append({
            "caveat_ref": caveat_ref,
            "caveator": caveator,
            "cause": legal_cause,
            "date_lodged": datetime.now().strftime("%Y-%m-%d")
        })
        self.validation_status = "ELECTRONIC CAVEAT ACTIVE"
        return caveat_ref

    def clear_caveat(self, caveat_ref: str):
        self.caveats_registered = [c for c in self.caveats_registered if c.get("caveat_ref") != caveat_ref]
        if not self.caveats_registered and not self.mortgage_bonds:
            self.validation_status = "VALIDATED"


class DLAPRegistryEngine:
    """Document repository and Statutory Instrument 76 of 2025 DLAP registry controller."""

    def __init__(self):
        self.documents: Dict[str, ComplianceDocument] = {}
        self.registry: Dict[str, DLAPTitleVerification] = {}
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Registered DLAP Deeds
        deed1 = DLAPTitleVerification(
            deed_number="TD-4982/2021",
            property_description="Stand 412 Parkview Heights Township, Harare",
            registered_owner="Zimbuild Property Investments (Pvt) Ltd",
            survey_diagram_no="SG-D-1029/2021",
            dlap_token_id="DLAP-ZW-2025-HRE-984210",
            validation_status="VALIDATED",
            qr_verification_code="https://dlap.gov.zw/verify/TD-4982-2021"
        )
        deed2 = DLAPTitleVerification(
            deed_number="TD-1049/2023",
            property_description="Stand 104 Kadoma Industrial Estate, Kadoma",
            registered_owner="Zimbuild Civil Engineering (Pvt) Ltd",
            survey_diagram_no="SG-D-4890/2023",
            dlap_token_id="DLAP-ZW-2025-KAD-551029",
            validation_status="ENCUMBERED",
            mortgage_bonds=[
                {"bond_number": "B-4819/2023", "mortgagee": "CBZ Bank Limited", "sum_secured_usd": "$450,000"}
            ],
            qr_verification_code="https://dlap.gov.zw/verify/TD-1049-2023"
        )
        self.registry[deed1.deed_number] = deed1
        self.registry[deed2.deed_number] = deed2

        # 2. Compliance Documents
        docs = [
            ComplianceDocument("DOC-ITF-01", "Tax Clearance (ITF263)", "ZIMRA Corporate Tax Clearance 2026", "CORP-ZIMBUILD", "PDF", "Zimbabwe Revenue Authority (ZIMRA)", "2026-12-31", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
            ComplianceDocument("DOC-EMA-02", "Inspection Report", "EMA Wetland EIA Certificate [Chapter 20:27]", "SITE-KADOMA-01", "PDF", "Environmental Management Agency", "2027-06-30", "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35"),
            ComplianceDocument("DOC-ZBCA-03", "Building Code Permit", "ZBCA Category A Contractor License 2026", "CORP-ZIMBUILD", "PDF", "Zimbabwe Building Contractors Assoc.", "2026-12-31", "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a")
        ]
        for d in docs:
            self.documents[d.doc_id] = d

    def verify_title_for_transfer(self, deed_number: str) -> Dict:
        """Automated due diligence check against DLAP registry under SI 76 of 2025."""
        record = self.registry.get(deed_number)
        if not record:
            return {
                "deed_number": deed_number,
                "can_transfer_or_finance": False,
                "rejection_reason": "Deed number not registered in national DLAP database"
            }
        
        has_caveat = len(record.caveats_registered) > 0
        has_bond = len(record.mortgage_bonds) > 0
        can_proceed = (not has_caveat) and (not has_bond)

        return {
            "deed_number": record.deed_number,
            "property": record.property_description,
            "owner": record.registered_owner,
            "dlap_token": record.dlap_token_id,
            "status": record.validation_status,
            "can_transfer_or_finance": can_proceed,
            "has_active_caveats": has_caveat,
            "caveats": record.caveats_registered,
            "mortgage_bonds": record.mortgage_bonds,
            "statutory_note": "Governed by Statutory Instrument 76 of 2025 & Deeds Registries Act [Ch 20:05]"
        }
