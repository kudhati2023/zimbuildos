"""
Zimbuild ERP - Fleet & Asset Appraisals Engine
Corporate vehicles, construction machinery telematics, fuel burn & siphoning anomaly detection,
and IFRS IAS 16 equipment appraisal & revaluation compliance.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Any
from datetime import datetime
import hashlib
import hmac
import os

HMAC_SECRET_ENV = os.environ.get("ZIMBUILD_HMAC_SECRET")
if not HMAC_SECRET_ENV:
    raise ValueError("CRITICAL: ZIMBUILD_HMAC_SECRET environment variable is missing. Refusing to start.")
HMAC_SECRET = HMAC_SECRET_ENV.encode()


class AssetCategory(str, Enum):
    HEAVY_EARTHMOVING = "Heavy Earthmoving Machinery"  # Excavators, Bulldozers, TLBs
    HAULAGE_COMMERCIAL = "Haulage & Commercial Transport"  # 15m3 Tippers, Lowbeds
    COMPACTION_ROADWORKS = "Compaction & Roadworks"        # Vibratory Rollers, Graders
    CORPORATE_FLEET = "Corporate & Executive Fleet"        # Executive Sedans, 4x4 Double Cabs
    SITE_AUXILIARY = "Site Auxiliary Equipment"            # Diesel Generators, Mobile Compressors


class AssetStatus(str, Enum):
    OPERATIONAL = "Operational"
    UNDER_MAINTENANCE = "Under Scheduled Maintenance"
    BREAKDOWN_GROUNDED = "Breakdown Grounded"
    STANDBY = "Standby"
    DECOMMISSIONED = "Decommissioned"


class ConditionGrade(str, Enum):
    GRADE_A = "Grade A: Pristine / Like-New"
    GRADE_B = "Grade B: Good / Minor Wear"
    GRADE_C = "Grade C: Fair / Operable with Maintenance"
    GRADE_D = "Grade D: Poor / Major Overhaul Needed"
    GRADE_E = "Grade E: Scrap / Salvage Only"


@dataclass
class FleetAsset:
    asset_id: str
    asset_name: str
    category: str
    reg_or_fleet_no: str
    vin_or_engine_no: str
    year: int
    acquisition_cost_usd: float
    salvage_value_usd: float
    useful_life_years: int
    rated_life_hours: float
    current_operating_hours: float
    current_odometer_km: float
    current_site_location: str
    assigned_operator: str
    status: str = AssetStatus.OPERATIONAL.value
    hourly_chargeout_rate_usd: float = 85.0
    benchmark_fuel_burn_rate: float = 18.5  # Liters/hr (Machinery) or L/100km (Vehicles)
    last_service_hours: float = 3500.0
    service_interval_hours: float = 250.0

    @property
    def hours_until_next_service(self) -> float:
        next_service = self.last_service_hours + self.service_interval_hours
        return max(0.0, round(next_service - self.current_operating_hours, 1))

    @property
    def is_service_due(self) -> bool:
        return self.hours_until_next_service <= 20.0

    def calculate_straight_line_depreciation(self, current_year: int = 2026) -> Dict[str, float]:
        """Calculates straight-line accumulated depreciation and Net Book Value (NBV)."""
        age_years = max(0, current_year - self.year)
        annual_depr = (self.acquisition_cost_usd - self.salvage_value_usd) / max(1, self.useful_life_years)
        accum_depr = min(self.acquisition_cost_usd - self.salvage_value_usd, annual_depr * age_years)
        nbv = max(self.salvage_value_usd, self.acquisition_cost_usd - accum_depr)
        return {
            "annual_depreciation_usd": round(annual_depr, 2),
            "accumulated_depreciation_usd": round(accum_depr, 2),
            "net_book_value_usd": round(nbv, 2)
        }

    def calculate_machine_hour_depreciation(self) -> Dict[str, float]:
        """Calculates depreciation based on machine operating hours utilized."""
        depreciable_base = self.acquisition_cost_usd - self.salvage_value_usd
        rate_per_hour = depreciable_base / max(1.0, self.rated_life_hours)
        accum_depr = min(depreciable_base, rate_per_hour * self.current_operating_hours)
        nbv = max(self.salvage_value_usd, self.acquisition_cost_usd - accum_depr)
        return {
            "depreciation_rate_per_hour_usd": round(rate_per_hour, 2),
            "accumulated_depreciation_usd": round(accum_depr, 2),
            "net_book_value_usd": round(nbv, 2)
        }


@dataclass
class ShiftTelematicsLog:
    log_id: str
    asset_id: str
    shift_date: str
    operator_name: str
    site_location: str
    engine_run_hours: float
    idle_downtime_hours: float
    breakdown_hours: float
    project_cost_code: str
    chargeout_rate_usd: float
    total_cost_recovered_usd: float = 0.0

    @property
    def total_shift_duration_hours(self) -> float:
        return round(self.engine_run_hours + self.idle_downtime_hours + self.breakdown_hours, 2)

    @property
    def utilization_percentage(self) -> float:
        tot = self.total_shift_duration_hours
        if tot <= 0:
            return 0.0
        return round((self.engine_run_hours / tot) * 100.0, 1)


@dataclass
class FuelDispenseRecord:
    voucher_id: str
    asset_id: str
    dispense_date: str
    fuel_type: str  # Diesel 50ppm, Unleaded Petrol
    liters_dispensed: float
    unit_price_usd: float
    total_cost_usd: float
    bowser_or_station: str
    meter_reading_at_fill: float  # hours or km
    hours_or_km_delta_since_last_fill: float
    actual_burn_rate: float
    benchmark_rate: float
    burn_variance_pct: float
    is_anomaly_flagged: bool = False
    anomaly_reason: Optional[str] = None


@dataclass
class EquipmentAppraisalRecord:
    appraisal_id: str
    asset_id: str
    asset_name: str
    appraisal_date: str
    certified_appraiser: str
    condition_grade: str
    engine_health_pct: float
    hydraulics_health_pct: float
    undercarriage_tires_pct: float
    chassis_structural_pct: float
    electrical_system_pct: float
    overall_health_score_pct: float
    replacement_cost_new_usd: float
    appraised_fair_market_value_usd: float
    historical_net_book_value_usd: float
    revaluation_surplus_or_deficit_usd: float
    appraisal_notes: str
    certification_hmac_hash: str = ""


class FleetAppraisalManager:
    """Enterprise Fleet, Heavy Plant Telematics, Fuel Monitor & Equipment Appraisal Engine."""

    def __init__(self):
        self.fleet: Dict[str, FleetAsset] = {}
        self.shift_logs: List[ShiftTelematicsLog] = []
        self.fuel_records: List[FuelDispenseRecord] = []
        self.appraisals: Dict[str, EquipmentAppraisalRecord] = {}
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Fleet Assets (Zimbuild Category A Plant & Machinery)
        eq1 = FleetAsset(
            asset_id="EQ-CAT-320D",
            asset_name="Caterpillar 320D Tracked Hydraulic Excavator",
            category=AssetCategory.HEAVY_EARTHMOVING.value,
            reg_or_fleet_no="PLANT-CAT-01",
            vin_or_engine_no="CAT-0320D-981249",
            year=2021,
            acquisition_cost_usd=195000.0,
            salvage_value_usd=25000.0,
            useful_life_years=10,
            rated_life_hours=15000.0,
            current_operating_hours=4120.5,
            current_odometer_km=0.0,
            current_site_location="Parkview Heights High-Rise (Stand #001)",
            assigned_operator="Farai Shumba (Plant Operator Class 1)",
            status=AssetStatus.OPERATIONAL.value,
            hourly_chargeout_rate_usd=85.0,
            benchmark_fuel_burn_rate=18.5,
            last_service_hours=4000.0
        )

        eq2 = FleetAsset(
            asset_id="EQ-DYNA-CA250",
            asset_name="Dynapac CA250D 12-Ton Vibratory Smooth Drum Roller",
            category=AssetCategory.COMPACTION_ROADWORKS.value,
            reg_or_fleet_no="PLANT-DYN-02",
            vin_or_engine_no="DYN-CA250-771822",
            year=2022,
            acquisition_cost_usd=110000.0,
            salvage_value_usd=15000.0,
            useful_life_years=10,
            rated_life_hours=12000.0,
            current_operating_hours=2450.0,
            current_odometer_km=0.0,
            current_site_location="Kadoma Phase 2 Road Servicing",
            assigned_operator="Kudzi Matare",
            status=AssetStatus.OPERATIONAL.value,
            hourly_chargeout_rate_usd=65.0,
            benchmark_fuel_burn_rate=12.0,
            last_service_hours=2250.0
        )

        eq3 = FleetAsset(
            asset_id="EQ-ACTROS-15M",
            asset_name="Mercedes-Benz 2628 Actros 15m³ Heavy Tipper Truck",
            category=AssetCategory.HAULAGE_COMMERCIAL.value,
            reg_or_fleet_no="AFG-9021 (TIP-03)",
            vin_or_engine_no="WDB-934032-1K8921",
            year=2020,
            acquisition_cost_usd=135000.0,
            salvage_value_usd=18000.0,
            useful_life_years=8,
            rated_life_hours=14000.0,
            current_operating_hours=5120.0,
            current_odometer_km=148500.0,
            current_site_location="Parkview Heights High-Rise",
            assigned_operator="Tendai Gumbo (Heavy Driver Class 2)",
            status=AssetStatus.OPERATIONAL.value,
            hourly_chargeout_rate_usd=55.0,
            benchmark_fuel_burn_rate=36.0,  # L/100km or 16L/hr
            last_service_hours=5000.0
        )

        eq4 = FleetAsset(
            asset_id="EQ-HILUX-4X4",
            asset_name="Toyota Hilux 2.8 GD-6 4x4 Double Cab (Project Field Van)",
            category=AssetCategory.CORPORATE_FLEET.value,
            reg_or_fleet_no="AFK-3319 (FLEET-04)",
            vin_or_engine_no="AHT-FR22-998124",
            year=2023,
            acquisition_cost_usd=48000.0,
            salvage_value_usd=12000.0,
            useful_life_years=5,
            rated_life_hours=8000.0,
            current_operating_hours=1150.0,
            current_odometer_km=42300.0,
            current_site_location="Harare Head Office / Field Dispatch",
            assigned_operator="Eng. Chipo Marume (Project Manager)",
            status=AssetStatus.OPERATIONAL.value,
            hourly_chargeout_rate_usd=30.0,
            benchmark_fuel_burn_rate=9.5,   # L/100km
            last_service_hours=40000.0,
            service_interval_hours=5000.0
        )

        self.fleet[eq1.asset_id] = eq1
        self.fleet[eq2.asset_id] = eq2
        self.fleet[eq3.asset_id] = eq3
        self.fleet[eq4.asset_id] = eq4

        # 2. Shift Telematics Logs
        log1 = ShiftTelematicsLog(
            log_id="LOG-2026-101",
            asset_id="EQ-CAT-320D",
            shift_date="2026-10-08",
            operator_name="Farai Shumba",
            site_location="Parkview Heights Stand #001",
            engine_run_hours=7.5,
            idle_downtime_hours=1.0,
            breakdown_hours=0.0,
            project_cost_code="JOB-CIV-FOUND-01",
            chargeout_rate_usd=85.0,
            total_cost_recovered_usd=637.50
        )
        log2 = ShiftTelematicsLog(
            log_id="LOG-2026-102",
            asset_id="EQ-DYNA-CA250",
            shift_date="2026-10-08",
            operator_name="Kudzi Matare",
            site_location="Kadoma Phase 2",
            engine_run_hours=6.0,
            idle_downtime_hours=1.5,
            breakdown_hours=0.5,
            project_cost_code="JOB-RD-SUBGRADE-02",
            chargeout_rate_usd=65.0,
            total_cost_recovered_usd=390.00
        )
        self.shift_logs.append(log1)
        self.shift_logs.append(log2)

        # 3. Fuel Dispense Records
        f1 = FuelDispenseRecord(
            voucher_id="FV-2026-001",
            asset_id="EQ-CAT-320D",
            dispense_date="2026-10-08",
            fuel_type="Diesel 50ppm",
            liters_dispensed=138.0,
            unit_price_usd=1.62,
            total_cost_usd=223.56,
            bowser_or_station="Parkview Site Bowser #01",
            meter_reading_at_fill=4120.5,
            hours_or_km_delta_since_last_fill=7.5,
            actual_burn_rate=18.4,
            benchmark_rate=18.5,
            burn_variance_pct=-0.54,
            is_anomaly_flagged=False
        )
        # Anomaly example: Tipper truck showing high burn rate
        f2 = FuelDispenseRecord(
            voucher_id="FV-2026-002",
            asset_id="EQ-ACTROS-15M",
            dispense_date="2026-10-08",
            fuel_type="Diesel 50ppm",
            liters_dispensed=190.0,
            unit_price_usd=1.62,
            total_cost_usd=307.80,
            bowser_or_station="Bulk Depot Bowser",
            meter_reading_at_fill=148500.0,
            hours_or_km_delta_since_last_fill=380.0,  # 380 km
            actual_burn_rate=50.0,  # 50.0 L/100km vs 36.0 benchmark
            benchmark_rate=36.0,
            burn_variance_pct=38.89,
            is_anomaly_flagged=True,
            anomaly_reason="Abnormal Fuel Consumption: 38.9% above benchmark. Suspected siphoning, fuel leak, or excessive low-gear idling."
        )
        self.fuel_records.append(f1)
        self.fuel_records.append(f2)

        # 4. Equipment Appraisal Record (CAT 320D)
        self.appraise_equipment(
            asset_id="EQ-CAT-320D",
            certified_appraiser="Eng. Kudakwashe Marufu, Pr.Eng (Chartered Plant Valuer)",
            condition_grade=ConditionGrade.GRADE_B.value,
            engine_health_pct=88.0,
            hydraulics_health_pct=85.0,
            undercarriage_tires_pct=78.0,
            chassis_structural_pct=92.0,
            electrical_system_pct=86.0,
            appraised_fmv_usd=145000.0,
            replacement_cost_new_usd=215000.0,
            notes="Hydraulic cycle times within factory tolerances; slewing ring wear minimal; undercarriage tracks at 78% remaining wear life."
        )

    # --- FLEET MANAGEMENT ---
    def register_fleet_asset(
        self,
        asset_name: str,
        category: str,
        reg_or_fleet_no: str,
        vin_or_engine_no: str,
        year: int,
        acquisition_cost_usd: float,
        salvage_value_usd: float,
        useful_life_years: int,
        rated_life_hours: float,
        current_site_location: str,
        assigned_operator: str,
        hourly_chargeout_rate_usd: float = 75.0,
        benchmark_fuel_burn_rate: float = 15.0
    ) -> FleetAsset:
        asset_id = f"EQ-{category[:3].upper()}-{len(self.fleet) + 1:03d}"
        asset = FleetAsset(
            asset_id=asset_id,
            asset_name=asset_name,
            category=category,
            reg_or_fleet_no=reg_or_fleet_no,
            vin_or_engine_no=vin_or_engine_no,
            year=year,
            acquisition_cost_usd=acquisition_cost_usd,
            salvage_value_usd=salvage_value_usd,
            useful_life_years=useful_life_years,
            rated_life_hours=rated_life_hours,
            current_operating_hours=0.0,
            current_odometer_km=0.0,
            current_site_location=current_site_location,
            assigned_operator=assigned_operator,
            hourly_chargeout_rate_usd=hourly_chargeout_rate_usd,
            benchmark_fuel_burn_rate=benchmark_fuel_burn_rate
        )
        self.fleet[asset_id] = asset
        return asset

    # --- TELEMATICS & UTILIZATION ---
    def log_shift_telematics(
        self,
        asset_id: str,
        operator_name: str,
        site_location: str,
        engine_hours: float,
        idle_hours: float,
        breakdown_hours: float,
        project_cost_code: str
    ) -> ShiftTelematicsLog:
        asset = self.fleet.get(asset_id)
        if not asset:
            raise ValueError(f"Asset {asset_id} not found in fleet register")

        # Update cumulative asset hours
        asset.current_operating_hours += engine_hours
        chargeout = asset.hourly_chargeout_rate_usd
        recovered_usd = round(engine_hours * chargeout, 2)

        log_id = f"LOG-{datetime.now().strftime('%Y%m%d')}-{len(self.shift_logs) + 1:03d}"
        log = ShiftTelematicsLog(
            log_id=log_id,
            asset_id=asset_id,
            shift_date=datetime.now().strftime("%Y-%m-%d"),
            operator_name=operator_name,
            site_location=site_location,
            engine_run_hours=engine_hours,
            idle_downtime_hours=idle_hours,
            breakdown_hours=breakdown_hours,
            project_cost_code=project_cost_code,
            chargeout_rate_usd=chargeout,
            total_cost_recovered_usd=recovered_usd
        )
        self.shift_logs.append(log)
        return log

    # --- FUEL CONSUMPTION & ANOMALY DETECTION ---
    def record_fuel_dispense(
        self,
        asset_id: str,
        fuel_type: str,
        liters: float,
        unit_price_usd: float,
        bowser_or_station: str,
        meter_reading: float,
        hours_or_km_delta: float
    ) -> FuelDispenseRecord:
        asset = self.fleet.get(asset_id)
        if not asset:
            raise ValueError(f"Asset {asset_id} not found in fleet register")

        total_cost = round(liters * unit_price_usd, 2)
        benchmark = asset.benchmark_fuel_burn_rate

        # Burn rate calculation
        if hours_or_km_delta > 0:
            if asset.category == AssetCategory.CORPORATE_FLEET.value or "Tipper" in asset.asset_name:
                # Liters per 100km
                actual_burn = round((liters / hours_or_km_delta) * 100.0, 2)
            else:
                # Liters per machine operating hour
                actual_burn = round(liters / hours_or_km_delta, 2)
        else:
            actual_burn = benchmark

        variance_pct = round(((actual_burn - benchmark) / benchmark) * 100.0, 2) if benchmark > 0 else 0.0

        # Flag anomaly if actual burn exceeds benchmark by more than 20%
        is_anomaly = variance_pct > 20.0
        reason = None
        if is_anomaly:
            reason = f"FUEL ANOMALY ALERT: Consumption {variance_pct}% above standard benchmark ({actual_burn} vs {benchmark}). Possible fuel siphoning, fuel line leakage, or engine injector fault."

        voucher_id = f"FV-{datetime.now().strftime('%Y%m%d')}-{len(self.fuel_records) + 1:03d}"
        rec = FuelDispenseRecord(
            voucher_id=voucher_id,
            asset_id=asset_id,
            dispense_date=datetime.now().strftime("%Y-%m-%d"),
            fuel_type=fuel_type,
            liters_dispensed=liters,
            unit_price_usd=unit_price_usd,
            total_cost_usd=total_cost,
            bowser_or_station=bowser_or_station,
            meter_reading_at_fill=meter_reading,
            hours_or_km_delta_since_last_fill=hours_or_km_delta,
            actual_burn_rate=actual_burn,
            benchmark_rate=benchmark,
            burn_variance_pct=variance_pct,
            is_anomaly_flagged=is_anomaly,
            anomaly_reason=reason
        )
        self.fuel_records.append(rec)
        return rec

    # --- EQUIPMENT APPRAISAL & IAS 16 REVALUATION ---
    def appraise_equipment(
        self,
        asset_id: str,
        certified_appraiser: str,
        condition_grade: str,
        engine_health_pct: float,
        hydraulics_health_pct: float,
        undercarriage_tires_pct: float,
        chassis_structural_pct: float,
        electrical_system_pct: float,
        appraised_fmv_usd: float,
        replacement_cost_new_usd: float,
        notes: str = ""
    ) -> EquipmentAppraisalRecord:
        asset = self.fleet.get(asset_id)
        if not asset:
            raise ValueError(f"Asset {asset_id} not found in fleet register")

        overall_health = round((
            engine_health_pct * 0.30 +
            hydraulics_health_pct * 0.25 +
            undercarriage_tires_pct * 0.20 +
            chassis_structural_pct * 0.15 +
            electrical_system_pct * 0.10
        ), 1)

        depr_info = asset.calculate_machine_hour_depreciation()
        book_value = depr_info["net_book_value_usd"]
        revaluation_delta = round(appraised_fmv_usd - book_value, 2)

        app_id = f"APP-{datetime.now().year}-{asset.asset_id}"
        # HMAC certification seal
        seal_payload = f"{app_id}:{asset_id}:{appraised_fmv_usd}:{condition_grade}:{certified_appraiser}"
        hmac_seal = hmac.new(HMAC_SECRET, seal_payload.encode(), hashlib.sha256).hexdigest()

        rec = EquipmentAppraisalRecord(
            appraisal_id=app_id,
            asset_id=asset_id,
            asset_name=asset.asset_name,
            appraisal_date=datetime.now().strftime("%Y-%m-%d"),
            certified_appraiser=certified_appraiser,
            condition_grade=condition_grade,
            engine_health_pct=engine_health_pct,
            hydraulics_health_pct=hydraulics_health_pct,
            undercarriage_tires_pct=undercarriage_tires_pct,
            chassis_structural_pct=chassis_structural_pct,
            electrical_system_pct=electrical_system_pct,
            overall_health_score_pct=overall_health,
            replacement_cost_new_usd=replacement_cost_new_usd,
            appraised_fair_market_value_usd=appraised_fmv_usd,
            historical_net_book_value_usd=book_value,
            revaluation_surplus_or_deficit_usd=revaluation_delta,
            appraisal_notes=notes,
            certification_hmac_hash=hmac_seal
        )
        self.appraisals[asset_id] = rec
        return rec

    def get_fleet_summary(self) -> Dict[str, Any]:
        """Provides executive fleet operations and equipment appraisal KPIs."""
        total_assets = len(self.fleet)
        operational_count = sum(1 for a in self.fleet.values() if a.status == AssetStatus.OPERATIONAL.value)
        total_acquisition_cost = sum(a.acquisition_cost_usd for a in self.fleet.values())
        
        # Total Book Value vs Appraised Fair Market Value
        total_nbv = sum(a.calculate_machine_hour_depreciation()["net_book_value_usd"] for a in self.fleet.values())
        total_appraised_fmv = sum(self.appraisals[k].appraised_fair_market_value_usd for k in self.appraisals if k in self.fleet)
        
        # Telematics hours & fuel burn
        total_engine_hours = sum(l.engine_run_hours for l in self.shift_logs)
        total_fuel_liters = sum(f.liters_dispensed for f in self.fuel_records)
        total_fuel_cost = sum(f.total_cost_usd for f in self.fuel_records)
        anomalies_count = sum(1 for f in self.fuel_records if f.is_anomaly_flagged)

        return {
            "total_fleet_assets": total_assets,
            "operational_fleet_count": operational_count,
            "total_acquisition_cost_usd": round(total_acquisition_cost, 2),
            "total_net_book_value_usd": round(total_nbv, 2),
            "total_appraised_valuation_usd": round(total_appraised_fmv, 2),
            "total_engine_run_hours_logged": round(total_engine_hours, 1),
            "total_fuel_consumed_liters": round(total_fuel_liters, 1),
            "total_fuel_expenditure_usd": round(total_fuel_cost, 2),
            "fuel_siphoning_anomalies_detected": anomalies_count,
            "assets": [
                {
                    "asset_id": a.asset_id,
                    "name": a.asset_name,
                    "category": a.category,
                    "reg": a.reg_or_fleet_no,
                    "site": a.current_site_location,
                    "operator": a.assigned_operator,
                    "status": a.status,
                    "hours": a.current_operating_hours,
                    "chargeout_rate": a.hourly_chargeout_rate_usd,
                    "nbv_usd": a.calculate_machine_hour_depreciation()["net_book_value_usd"],
                    "appraised_fmv_usd": self.appraisals[a.asset_id].appraised_fair_market_value_usd if a.asset_id in self.appraisals else None,
                    "service_due": a.is_service_due
                }
                for a in self.fleet.values()
            ],
            "fuel_anomalies": [
                {
                    "voucher": f.voucher_id,
                    "asset": f.asset_id,
                    "date": f.dispense_date,
                    "liters": f.liters_dispensed,
                    "variance_pct": f.burn_variance_pct,
                    "reason": f.anomaly_reason
                }
                for f in self.fuel_records if f.is_anomaly_flagged
            ]
        }
