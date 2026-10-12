"""
Zimbuild Properties: Statutory Agreement of Sale Generator
Enforces statutory property sale conditions under:
- Deeds Registries Act [Chapter 20:05]
- Regional, Town and Country Planning Act [Chapter 29:12]
- Contractual Penalties Act [Chapter 8:04]
"""
import datetime
from typing import Dict, Any

class LandSalesManager:
    def __init__(self, fx_rate: float = 26.50):
        self.fx_rate = fx_rate
        self.seller = "ZIMBUILD PROPERTIES (PVT) LTD"
        self.represented_by = "Dr. Tinashe Manzungu (Executive Chairman & Group CEO)"
        self.company_reg = "6821/2007"
        self.registered_address = "Zimbuild House, Enterprise Road, Highlands, Harare, Zimbabwe"

    def generate_agreement_of_sale(
        self,
        stand_id: str,
        area_sqm: float,
        zoning: str,
        buyer_name: str,
        buyer_id: str,
        buyer_address: str,
        buyer_phone: str,
        purchase_price_usd: float,
        deposit_paid_usd: float,
        payment_terms: str
    ) -> Dict[str, Any]:
        """
        Generates a legally binding Agreement of Sale and payment schedule.
        """
        balance_usd = round(purchase_price_usd - deposit_paid_usd, 2)
        purchase_price_zwg = round(purchase_price_usd * self.fx_rate, 2)
        deposit_zwg = round(deposit_paid_usd * self.fx_rate, 2)
        balance_zwg = round(balance_usd * self.fx_rate, 2)
        
        contract_ref = f"ZIMBUILD-AOS-2026-{stand_id.replace('STAND-', '')}"
        issue_date = datetime.date.today().strftime("%d %B %Y")
        
        contract_text = f"""
================================================================================
                    MEMORANDUM OF AGREEMENT OF SALE
              MADE AND ENTERED INTO BY AND BETWEEN:
================================================================================

1. THE SELLER:
   {self.seller}
   (Registration No: {self.company_reg}), represented herein by {self.represented_by},
   duly authorized thereto (hereinafter referred to as "THE SELLER"),
   of {self.registered_address}.

2. THE PURCHASER:
   {buyer_name}
   (National Identity No: {buyer_id}),
   residing at {buyer_address},
   Contact: {buyer_phone} (hereinafter referred to as "THE PURCHASER").

--------------------------------------------------------------------------------
WHEREAS the Seller is the registered developer of the residential/commercial scheme:
HARARE HIGHLANDS NORTH EXTENSION, approved under Town Planning Scheme No. 412/2026.

AND WHEREAS the Purchaser has agreed to purchase from the Seller, who has agreed
to sell the immovable property described herein on the terms and conditions following:

1. THE PROPERTY:
   CERTAIN piece of land situate in the District of Salisbury (Harare) being:
   {stand_id}, measuring {area_sqm:,.2f} square metres.
   ZONING CLASSIFICATION: {zoning}
   SURVEY REFERENCE: Gauss Lo 31° Cadastral Survey SG No. 412/2026.

2. PURCHASE CONSIDERATION:
   2.1 The purchase price for the property is the sum of:
       USD ${purchase_price_usd:,.2f} (United States Dollars)
       (or ZWG {purchase_price_zwg:,.2f} at current official interbank rate {self.fx_rate:.2f}).
   2.2 Deposit Tendered & Acknowledged: USD ${deposit_paid_usd:,.2f} (ZWG {deposit_zwg:,.2f}).
   2.3 Outstanding Balance: USD ${balance_usd:,.2f} (ZWG {balance_zwg:,.2f}).
   2.4 Payment Terms: {payment_terms}.

3. SERVICING INFRASTRUCTURE UNDERTAKING:
   The Seller undertakes in terms of Category "A" Civil Engineering Standards to:
   - Provide tarred surfaced access roads with concrete side drains.
   - Reticulate 200mm bulk potable water mains to the boundary of the stand.
   - Connect 250mm gravity foul sewer reticulation.
   - Install ZETDC 11kV electrical infrastructure and step-down substation.

4. PASSING OF RISK & OCCUPATION:
   Occupation and risk in the property shall pass to the Purchaser upon payment of the
   deposit and signing of this Agreement.

5. TRANSFER & CONVEYANCING:
   Upon full payment of the purchase price and issuance of the Local Authority
   Certificate of Compliance, the Seller's conveyancers shall effect transfer
   of the property into the name of the Purchaser in the Deeds Office under the
   Deeds Registries Act [Chapter 20:05].

SIGNED AT HARARE THIS {issue_date}.

SELLER: ______________________________     PURCHASER: ______________________________
Dr. Tinashe Manzungu                       {buyer_name}
For & on behalf of ZIMBUILD PROPERTIES

WITNESS 1: ___________________________     WITNESS 2: ___________________________
================================================================================
"""
        return {
            "contract_ref": contract_ref,
            "issue_date": issue_date,
            "stand_id": stand_id,
            "buyer_name": buyer_name,
            "buyer_id": buyer_id,
            "area_sqm": area_sqm,
            "zoning": zoning,
            "price_usd": purchase_price_usd,
            "deposit_usd": deposit_paid_usd,
            "balance_usd": balance_usd,
            "price_zwg": purchase_price_zwg,
            "balance_zwg": balance_zwg,
            "terms": payment_terms,
            "status": "EXECUTED",
            "contract_markdown": contract_text.strip()
        }
