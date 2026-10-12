"""
Zimbuild ERP - Financial Management, Local Tax & Multi-Currency Accounting
ZIMRA Tax localization (VAT 15%, WHT 5%, IMTT 2%), CAM Reconciliations, and IFRS Financial Statements.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime

@dataclass
class CAMReconciliation:
    property_id: str
    property_name: str
    year: int
    total_common_area_sqft: float
    actual_maintenance_expenses_usd: float
    actual_security_expenses_usd: float
    actual_utilities_common_usd: float
    actual_management_fees_usd: float
    
    @property
    def total_cam_pool_usd(self) -> float:
        return round(
            self.actual_maintenance_expenses_usd +
            self.actual_security_expenses_usd +
            self.actual_utilities_common_usd +
            self.actual_management_fees_usd,
            2
        )

    def calculate_tenant_cam_share(self, tenant_sqft: float, cam_advance_paid_usd: float) -> Dict[str, float]:
        """Pro-rata CAM allocation based on leasable area percentage."""
        if self.total_common_area_sqft <= 0:
            return {"proportion_pct": 0.0, "actual_share_usd": 0.0, "adjustment_due_usd": 0.0}
        
        proportion_pct = (tenant_sqft / self.total_common_area_sqft) * 100.0
        actual_share = (proportion_pct / 100.0) * self.total_cam_pool_usd
        variance_adjustment = actual_share - cam_advance_paid_usd
        
        return {
            "tenant_sqft": tenant_sqft,
            "proportion_pct": round(proportion_pct, 2),
            "total_pool_usd": self.total_cam_pool_usd,
            "actual_share_usd": round(actual_share, 2),
            "advance_paid_usd": round(cam_advance_paid_usd, 2),
            "adjustment_due_usd": round(variance_adjustment, 2)  # Positive = tenant owes, Negative = refund
        }

@dataclass
class TaxAssessment:
    transaction_ref: str
    gross_amount_usd: float
    has_valid_itf263_clearance: bool = True
    is_electronic_transfer: bool = True
    vat_standard_rate_pct: float = 15.0      # Zimbabwe VAT standard rate
    withholding_tax_rate_pct: float = 5.0    # 5% WHT if contractor lacks ITF263
    imtt_rate_pct: float = 2.0               # Intermediated Money Transfer Tax

    @property
    def vat_payable_usd(self) -> float:
        return round((self.vat_standard_rate_pct / 100.0) * self.gross_amount_usd, 2)

    @property
    def withholding_tax_usd(self) -> float:
        if self.has_valid_itf263_clearance:
            return 0.0
        return round((self.withholding_tax_rate_pct / 100.0) * self.gross_amount_usd, 2)

    @property
    def imtt_tax_usd(self) -> float:
        if not self.is_electronic_transfer:
            return 0.0
        return round((self.imtt_rate_pct / 100.0) * self.gross_amount_usd, 2)

    @property
    def net_disbursement_usd(self) -> float:
        return round(self.gross_amount_usd - self.withholding_tax_usd, 2)


class FinancialTaxEngine:
    """Multi-currency GAAP/IFRS accounting controller with Zimbabwean tax localization."""

    def __init__(self, rbz_zwg_rate: float = 26.50):
        self.rbz_zwg_rate = rbz_zwg_rate  # 1 USD = 26.50 ZWG
        self.cam_pools: Dict[str, CAMReconciliation] = {}
        self._seed_default_data()

    def _seed_default_data(self):
        # Harare Parkview Heights CAM Pool
        cam = CAMReconciliation(
            property_id="PROP-HRE-001",
            property_name="Zimbuild Parkview Heights",
            year=2026,
            total_common_area_sqft=8750.0,
            actual_maintenance_expenses_usd=12400.0,
            actual_security_expenses_usd=9600.0,
            actual_utilities_common_usd=6800.0,
            actual_management_fees_usd=4500.0
        )
        self.cam_pools[cam.property_id] = cam

    def compute_local_tax(self, ref: str, amount_usd: float, has_itf263: bool, is_transfer: bool) -> TaxAssessment:
        return TaxAssessment(
            transaction_ref=ref,
            gross_amount_usd=amount_usd,
            has_valid_itf263_clearance=has_itf263,
            is_electronic_transfer=is_transfer
        )

    def convert_currency(self, amount: float, from_curr: str, to_curr: str) -> float:
        if from_curr == to_curr:
            return amount
        if from_curr == "USD" and to_curr == "ZWG":
            return round(amount * self.rbz_zwg_rate, 2)
        if from_curr == "ZWG" and to_curr == "USD":
            return round(amount / self.rbz_zwg_rate, 2)
        return amount

    def generate_ifrs_statement_of_profit_or_loss(self, rental_revenue: float, construction_revenue: float, cost_of_sales: float, opex: float) -> Dict:
        """Produces standard IFRS Statement of Profit or Loss."""
        total_revenue = rental_revenue + construction_revenue
        gross_profit = total_revenue - cost_of_sales
        operating_profit_ebit = gross_profit - opex
        finance_costs = 12000.0
        profit_before_tax = operating_profit_ebit - finance_costs
        corporate_tax_25_pct = max(0, profit_before_tax * 0.25)
        net_profit_after_tax = profit_before_tax - corporate_tax_25_pct

        return {
            "period": "Year Ended 31 December 2026",
            "reporting_standard": "IFRS (International Financial Reporting Standards)",
            "currency": "USD (with ZWG note)",
            "revenue": {
                "rental_and_portfolio_income": rental_revenue,
                "construction_and_land_sales": construction_revenue,
                "total_revenue": total_revenue,
                "total_revenue_zwg": self.convert_currency(total_revenue, "USD", "ZWG")
            },
            "cost_of_sales": cost_of_sales,
            "gross_profit": round(gross_profit, 2),
            "gross_margin_pct": round((gross_profit / total_revenue * 100), 2) if total_revenue else 0.0,
            "operating_expenses": opex,
            "operating_profit_ebit": round(operating_profit_ebit, 2),
            "finance_costs": finance_costs,
            "profit_before_tax": round(profit_before_tax, 2),
            "income_tax_expense": round(corporate_tax_25_pct, 2),
            "net_profit_for_period": round(net_profit_after_tax, 2)
        }
