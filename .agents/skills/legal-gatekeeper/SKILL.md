---
name: legal-gatekeeper
description: Enforces gatekeeping policies and title clearance rules before permitting automated title deed releases via policy hooks.
---

# Legal Gatekeeper & Statutory Conveyancing Policy Subagent

## 1. Domain Context & Statutory Framework
This skill acts as an automated conveyancing gatekeeper enforcing statutory compliance under:
- **Deeds Registries Act [Chapter 20:05]**: Mandates title deed formats, registration of cessions, and deeds office lodgement standards.
- **Sectional Titles Act [Chapter 20:04]**: Regulates sectional plans and undivided shares in multi-storey walk-up apartments.
- **Regional, Town and Country Planning Act [Chapter 29:12] Section 26(3)**: Strictly forbids registration of title transfer unless a valid **Local Authority Certificate of Compliance** is lodged.
- **Land Survey Act [Chapter 20:12]**: Requires an approved Surveyor-General (SG) diagram number.

---

## 2. The Five Statutory Clearance Gates

```text
[Incoming Action: issue_title_deed]
       │
       ├── Gate 1: Financial Clearance (100% Capital Paid)?
       ├── Gate 2: Infrastructure Compliance Cert (Roads/Water/Sewer)?
       ├── Gate 3: Cadastral Survey Endorsed (SG Diagram Approved)?
       ├── Gate 4: Cession History & Chain of Title Clear?
       └── Gate 5: Encumbrance & Caveat Free (Zero Lis Pendens)?
       │
       ▼
[ALL PASSED] ──> Generate Conveyancing Clearance Token
[ANY FAILED] ──> Hard Injunction (Block Tool Use)
```

---

## 3. Step-by-Step Execution Checklist

1. **Policy Hook Interception**:
   - Intercept tool calls for `issue_title_deed` or `register_cession`.
2. **Sequential Gate Validation**:
   - **Gate 1**: Ensure remaining balance is `$0.00` in `fintech-gateway`.
   - **Gate 2**: Confirm municipal Certificate of Compliance signed by City Engineer.
   - **Gate 3**: Confirm SG diagram approval number from Surveyor-General.
   - **Gate 4**: Verify unbroken chain of municipal/ministerial cessions.
   - **Gate 5**: Verify zero caveats or pending High Court litigation on stand.
3. **Decision & Cryptographic Clearance**:
   - If all pass: Issue signed conveyancing clearance token.
   - If any fail: Enforce non-bypassable statutory injunction report.

---

## 4. Output Specification

```json
{
  "gatekeeper_decision": "ALLOW_DEED_REGISTRATION | BLOCK_DEED_REGISTRATION",
  "stand_id": "STAND-4091-HARARE",
  "beneficiary_id": "NAT-ID-63-199482-B-42",
  "statutory_checks": {
    "financial_clearance_100pct": true,
    "infrastructure_compliance_cert": true,
    "sg_diagram_approved": true,
    "cession_history_valid": true,
    "caveat_free": true
  },
  "conveyancer_dossier": {
    "registered_owner": "TENDAI MOYO",
    "deed_type": "DEED_OF_TRANSFER",
    "purchase_price_usd": 12500.00,
    "clearance_token": "CONVEYANCING_AUTH_CLEARED_2026_DEEDS_OFFICE"
  }
}
```
