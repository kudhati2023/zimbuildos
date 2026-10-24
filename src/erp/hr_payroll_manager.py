"""
Zimbuild ERP - Human Resources, Recruitment, Site Muster Roll & Localized Zimbabwean Payroll Engine
Compliant with Zimbabwean Labour Act, NSSA (POBS & APWCS), ZIMRA PAYE progressive tax,
NEC Construction Industry Collective Bargaining Agreements, ZIMDEF, and SDF.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Any
from datetime import datetime, date
import hashlib
import hmac
import os

try:
    HMAC_SECRET = os.environ["ZIMBUILD_HMAC_SECRET"].encode()
except KeyError:
    raise ValueError("ZIMBUILD_HMAC_SECRET environment variable is required")


class EmployeeStatus(str, Enum):
    ACTIVE = "Active"
    PROBATION = "Probation"
    ON_LEAVE = "On Leave"
    SUSPENDED = "Suspended"
    TERMINATED = "Terminated"
    RETIRED = "Retired"


class ContractType(str, Enum):
    PERMANENT = "Permanent"
    FIXED_TERM = "Fixed-Term Contract"
    NEC_ARTISAN = "NEC Construction Site Artisan"
    CASUAL = "Casual / Muster Roll Worker"
    APPRENTICE = "Registered Apprentice"


class NECGrade(str, Enum):
    GRADE_1 = "Grade 1: General Site Laborer"
    GRADE_2 = "Grade 2: Semi-Skilled / Builder Assistant"
    GRADE_3 = "Grade 3: Skilled Hand / Formwork Stripper"
    GRADE_4 = "Grade 4: Class 4 Artisan (Bricklayer/Carpenter/Plumber)"
    GRADE_5 = "Grade 5: Class 3 Artisan (Junior Tradesman)"
    GRADE_6 = "Grade 6: Class 2 Artisan (Intermediate Tradesman)"
    GRADE_7 = "Grade 7: Class 1 Artisan (Journeyman Builder/Plant Operator)"
    GRADE_8 = "Grade 8: Master Artisan / Chargehand"
    GRADE_9 = "Grade 9: Site Foreman / Section Leader"
    GRADE_10 = "Grade 10: General Foreman / Construction Superintendent"


@dataclass
class EmployeeProfile:
    employee_id: str
    national_id: str
    full_name: str
    job_title: str
    department: str
    nec_grade: str
    contract_type: str
    date_joined: str
    base_salary_usd: float
    site_assigned: str
    status: str = EmployeeStatus.ACTIVE.value
    leave_balances: Dict[str, int] = field(default_factory=lambda: {
        "annual": 21,
        "sick": 14,
        "compassionate": 5,
        "casual": 3
    })
    performance_rating: float = 4.2
    bank_name: str = "Stanbic Bank Zimbabwe"
    bank_account: str = "914000382910"
    ecocash_number: str = "+263 772 100 200"
    history: List[Dict[str, Any]] = field(default_factory=list)

    def promote(self, new_title: str, new_grade: str, new_salary_usd: float, notes: str = ""):
        """Records promotion, update title, NEC grade and remuneration."""
        prev = {
            "action": "PROMOTION",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "old_title": self.job_title,
            "new_title": new_title,
            "old_grade": self.nec_grade,
            "new_grade": new_grade,
            "old_salary_usd": self.base_salary_usd,
            "new_salary_usd": new_salary_usd,
            "notes": notes
        }
        self.history.append(prev)
        self.job_title = new_title
        self.nec_grade = new_grade
        self.base_salary_usd = new_salary_usd

    def apply_leave(self, leave_type: str, days: int) -> bool:
        """Deducts leave days if sufficient balance exists."""
        key = leave_type.lower()
        if key in self.leave_balances and self.leave_balances[key] >= days:
            self.leave_balances[key] -= days
            self.history.append({
                "action": "LEAVE_TAKEN",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "leave_type": leave_type,
                "days": days,
                "balance_remaining": self.leave_balances[key]
            })
            return True
        return False

    def terminate_employment(self, reason: str, notice_days: int = 30):
        """Processes offboarding / end of employee contract."""
        self.status = EmployeeStatus.TERMINATED.value
        self.history.append({
            "action": "TERMINATION",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "reason": reason,
            "notice_days": notice_days
        })


@dataclass
class JobRequisition:
    req_id: str
    title: str
    department: str
    openings: int
    target_nec_grade: str
    budget_salary_usd: float
    date_posted: str
    status: str = "Open"  # Open, Shortlisting, Interviewing, Filled, Closed
    applicants_count: int = 0


@dataclass
class CandidateApplication:
    candidate_id: str
    req_id: str
    full_name: str
    national_id: str
    trade_qualification: str
    experience_years: float
    phone: str
    email: str
    interview_score: float = 0.0
    status: str = "Applied"  # Applied, Shortlisted, Interviewed, Offered, Hired, Rejected
    screening_notes: str = ""

    def evaluate_interview(self, technical_score: float, safety_score: float, trade_test_score: float) -> float:
        """Calculates weighted interview score out of 100."""
        # 50% technical skills, 25% safety compliance, 25% practical trade test
        self.interview_score = round((technical_score * 0.50) + (safety_score * 0.25) + (trade_test_score * 0.25), 1)
        if self.interview_score >= 85.0:
            self.status = "Offered"
        elif self.interview_score >= 75.0:
            self.status = "Shortlisted"
        else:
            self.status = "Rejected"
        return self.interview_score


@dataclass
class SiteAttendanceRecord:
    record_id: str
    employee_id: str
    employee_name: str
    site_id: str
    site_name: str
    attendance_date: str
    clock_in_time: str
    clock_out_time: Optional[str] = None
    shift_type: str = "Day Shift"  # Day Shift, Night Shift, Weekend Shift
    regular_hours: float = 8.0
    overtime_1_5x_hours: float = 0.0  # Standard weekday / Saturday overtime (1.5x)
    overtime_2_0x_hours: float = 0.0  # Sunday / Statutory Holiday double-time (2.0x)
    gps_coordinates: str = "-17.8292, 31.0522"
    biometric_or_pin_hash: str = ""
    foreman_approved: bool = False
    approved_by_foreman: Optional[str] = None

    @property
    def total_hours_worked(self) -> float:
        return round(self.regular_hours + self.overtime_1_5x_hours + self.overtime_2_0x_hours, 2)


@dataclass
class LocalizedPayrollSlip:
    payslip_id: str
    employee_id: str
    employee_name: str
    national_id: str
    nec_grade: str
    period: str  # e.g., 2026-10
    base_salary_usd: float
    site_hardship_allowance_usd: float = 0.0
    housing_allowance_usd: float = 0.0
    transport_allowance_usd: float = 0.0
    overtime_earnings_usd: float = 0.0
    gross_earnings_usd: float = 0.0

    # Statutory Employee Deductions
    nssa_pobs_employee_usd: float = 0.0  # 4.5% up to statutory cap
    zimra_paye_tax_usd: float = 0.0      # Progressive PAYE tax
    aids_levy_usd: float = 0.0           # 3% on PAYE tax
    nec_levy_employee_usd: float = 0.0   # 1.25% of basic
    total_deductions_usd: float = 0.0
    net_salary_usd: float = 0.0

    # Employer Statutory Contributions
    nssa_pobs_employer_usd: float = 0.0  # 4.5% matching
    nssa_apwcs_employer_usd: float = 0.0 # 1.5% Workers Compensation
    nec_levy_employer_usd: float = 0.0   # 1.25% matching
    zimdef_levy_employer_usd: float = 0.0 # 1.0% Manpower Development Fund
    sdf_levy_employer_usd: float = 0.0   # 0.5% Standards Development Fund
    total_employer_cost_usd: float = 0.0

    # Multi-currency conversion
    rbz_zwg_rate: float = 26.50
    net_salary_zwg: float = 0.0
    cryptographic_hmac_hash: str = ""


class HRPayrollManager:
    """Enterprise Human Capital & Localized Zimbabwean Payroll System."""

    def __init__(self, rbz_zwg_rate: float = 26.50):
        self.rbz_zwg_rate = rbz_zwg_rate
        self.employees: Dict[str, EmployeeProfile] = {}
        self.requisitions: Dict[str, JobRequisition] = {}
        self.candidates: Dict[str, CandidateApplication] = {}
        self.attendance_records: Dict[str, SiteAttendanceRecord] = {}
        self.payroll_history: List[LocalizedPayrollSlip] = []
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Employees (Zimbuild Category A Contractors Construction Personnel)
        emp1 = EmployeeProfile(
            employee_id="EMP-2026-001",
            national_id="63-198274-P-12",
            full_name="Tapiwa Zhou",
            job_title="General Foreman & Site Superintendent",
            department="Civil & Building",
            nec_grade=NECGrade.GRADE_10.value,
            contract_type=ContractType.PERMANENT.value,
            date_joined="2022-04-15",
            base_salary_usd=2800.0,
            site_assigned="Parkview Heights High-Rise (Stand #001)",
            performance_rating=4.8
        )
        emp2 = EmployeeProfile(
            employee_id="EMP-2026-002",
            national_id="08-284910-K-44",
            full_name="Farai Shumba",
            job_title="Heavy Plant Operator (Excavators & Rollers)",
            department="Plant & Machinery",
            nec_grade=NECGrade.GRADE_7.value,
            contract_type=ContractType.NEC_ARTISAN.value,
            date_joined="2023-08-01",
            base_salary_usd=1650.0,
            site_assigned="Kadoma Phase 2 Civil Works",
            performance_rating=4.5
        )
        emp3 = EmployeeProfile(
            employee_id="EMP-2026-003",
            national_id="42-381920-R-19",
            full_name="Chipo Marume",
            job_title="Senior Structural Drafter & Site Engineer",
            department="Site Engineering",
            nec_grade=NECGrade.GRADE_9.value,
            contract_type=ContractType.PERMANENT.value,
            date_joined="2024-01-10",
            base_salary_usd=2200.0,
            site_assigned="Norton Gated Estate (Stand #002)",
            performance_rating=4.6
        )
        emp4 = EmployeeProfile(
            employee_id="EMP-2026-004",
            national_id="59-102934-M-02",
            full_name="Simbarashe Moyo",
            job_title="Class 1 Journeyman Bricklayer",
            department="Civil & Building",
            nec_grade=NECGrade.GRADE_7.value,
            contract_type=ContractType.NEC_ARTISAN.value,
            date_joined="2024-05-20",
            base_salary_usd=1400.0,
            site_assigned="Parkview Heights High-Rise (Stand #001)",
            performance_rating=4.1
        )
        self.employees[emp1.employee_id] = emp1
        self.employees[emp2.employee_id] = emp2
        self.employees[emp3.employee_id] = emp3
        self.employees[emp4.employee_id] = emp4

        # 2. Recruitment Requisitions
        req1 = JobRequisition(
            req_id="REQ-2026-01",
            title="Class 1 Diesel Plant Fitter (Heavy Machinery)",
            department="Plant & Machinery",
            openings=2,
            target_nec_grade=NECGrade.GRADE_7.value,
            budget_salary_usd=1750.0,
            date_posted="2026-09-28",
            status="Interviewing",
            applicants_count=6
        )
        req2 = JobRequisition(
            req_id="REQ-2026-02",
            title="Civil Project Surveyor (Total Station & GNSS)",
            department="Site Engineering",
            openings=1,
            target_nec_grade=NECGrade.GRADE_8.value,
            budget_salary_usd=2100.0,
            date_posted="2026-10-02",
            status="Open",
            applicants_count=4
        )
        self.requisitions[req1.req_id] = req1
        self.requisitions[req2.req_id] = req2

        # 3. Candidate Applications
        cand1 = CandidateApplication(
            candidate_id="CAND-901",
            req_id=req1.req_id,
            full_name="Tendai Chiweshe",
            national_id="63-918234-A-12",
            trade_qualification="Class 1 Journeyman Diesel Plant Fitter (HEXCO)",
            experience_years=7.5,
            phone="+263 774 819 203",
            email="t.chiweshe@outlook.com",
            interview_score=88.5,
            status="Offered",
            screening_notes="Excellent knowledge of CAT C-series engines and hydraulic pumps."
        )
        cand2 = CandidateApplication(
            candidate_id="CAND-902",
            req_id=req1.req_id,
            full_name="Blessing Sibanda",
            national_id="08-204918-B-67",
            trade_qualification="Class 2 Motor Mechanic",
            experience_years=4.0,
            phone="+263 712 903 847",
            email="bsibanda@gmail.com",
            interview_score=72.0,
            status="Shortlisted",
            screening_notes="Competent with light vehicles, needs mentorship on heavy excavators."
        )
        self.candidates[cand1.candidate_id] = cand1
        self.candidates[cand2.candidate_id] = cand2

        # 4. Site Muster Roll Attendance
        today_str = datetime.now().strftime("%Y-%m-%d")
        att1 = SiteAttendanceRecord(
            record_id="ATT-001",
            employee_id="EMP-2026-001",
            employee_name="Tapiwa Zhou",
            site_id="SITE-001",
            site_name="Parkview Heights High-Rise",
            attendance_date=today_str,
            clock_in_time="06:45",
            clock_out_time="17:15",
            regular_hours=8.0,
            overtime_1_5x_hours=2.5,
            gps_coordinates="-17.8292, 31.0522",
            biometric_or_pin_hash="BIO_FINGERPRINT_VERIFIED_9881",
            foreman_approved=True,
            approved_by_foreman="Director of Works"
        )
        att2 = SiteAttendanceRecord(
            record_id="ATT-002",
            employee_id="EMP-2026-002",
            employee_name="Farai Shumba",
            site_id="SITE-002",
            site_name="Kadoma Phase 2 Civil Works",
            attendance_date=today_str,
            clock_in_time="07:00",
            clock_out_time="16:00",
            regular_hours=8.0,
            overtime_1_5x_hours=1.0,
            gps_coordinates="-18.3333, 29.9167",
            biometric_or_pin_hash="BIO_PIN_VERIFIED_7712",
            foreman_approved=True,
            approved_by_foreman="Tapiwa Zhou"
        )
        self.attendance_records[att1.record_id] = att1
        self.attendance_records[att2.record_id] = att2

    # --- EMPLOYEE LIFECYCLE MANAGEMENT ---
    def onboard_employee(
        self,
        full_name: str,
        national_id: str,
        job_title: str,
        department: str,
        nec_grade: str,
        contract_type: str,
        base_salary_usd: float,
        site_assigned: str,
        bank_name: str = "Stanbic Bank",
        bank_account: str = "0000000000",
        ecocash_number: str = "+263 770 000000"
    ) -> EmployeeProfile:
        emp_id = f"EMP-2026-{len(self.employees) + 1:03d}"
        profile = EmployeeProfile(
            employee_id=emp_id,
            national_id=national_id,
            full_name=full_name,
            job_title=job_title,
            department=department,
            nec_grade=nec_grade,
            contract_type=contract_type,
            date_joined=datetime.now().strftime("%Y-%m-%d"),
            base_salary_usd=base_salary_usd,
            site_assigned=site_assigned,
            bank_name=bank_name,
            bank_account=bank_account,
            ecocash_number=ecocash_number
        )
        self.employees[emp_id] = profile
        return profile

    def promote_employee(self, employee_id: str, new_title: str, new_grade: str, new_salary_usd: float, notes: str = "") -> Optional[EmployeeProfile]:
        emp = self.employees.get(employee_id)
        if emp:
            emp.promote(new_title, new_grade, new_salary_usd, notes)
            return emp
        return None

    def request_leave(self, employee_id: str, leave_type: str, days: int) -> Dict[str, Any]:
        emp = self.employees.get(employee_id)
        if not emp:
            return {"success": False, "error": "Employee not found"}
        ok = emp.apply_leave(leave_type, days)
        return {
            "success": ok,
            "employee_id": employee_id,
            "leave_type": leave_type,
            "days_requested": days,
            "remaining_balance": emp.leave_balances.get(leave_type.lower(), 0),
            "error": None if ok else f"Insufficient {leave_type} leave balance."
        }

    # --- RECRUITMENT ---
    def create_job_requisition(self, title: str, department: str, openings: int, nec_grade: str, budget_salary_usd: float) -> JobRequisition:
        req_id = f"REQ-2026-{len(self.requisitions) + 1:02d}"
        req = JobRequisition(
            req_id=req_id,
            title=title,
            department=department,
            openings=openings,
            target_nec_grade=nec_grade,
            budget_salary_usd=budget_salary_usd,
            date_posted=datetime.now().strftime("%Y-%m-%d")
        )
        self.requisitions[req_id] = req
        return req

    def apply_candidate(self, req_id: str, full_name: str, national_id: str, qualification: str, experience_years: float, phone: str, email: str) -> CandidateApplication:
        cand_id = f"CAND-{len(self.candidates) + 901}"
        cand = CandidateApplication(
            candidate_id=cand_id,
            req_id=req_id,
            full_name=full_name,
            national_id=national_id,
            trade_qualification=qualification,
            experience_years=experience_years,
            phone=phone,
            email=email
        )
        self.candidates[cand_id] = cand
        if req_id in self.requisitions:
            self.requisitions[req_id].applicants_count += 1
        return cand

    def hire_candidate(self, candidate_id: str, site_assigned: str) -> Optional[EmployeeProfile]:
        cand = self.candidates.get(candidate_id)
        if not cand:
            return None
        req = self.requisitions.get(cand.req_id)
        nec_grade = req.target_nec_grade if req else NECGrade.GRADE_7.value
        salary = req.budget_salary_usd if req else 1500.0
        dept = req.department if req else "Civil & Building"
        title = req.title if req else "Site Technician"

        emp = self.onboard_employee(
            full_name=cand.full_name,
            national_id=cand.national_id,
            job_title=title,
            department=dept,
            nec_grade=nec_grade,
            contract_type=ContractType.NEC_ARTISAN.value,
            base_salary_usd=salary,
            site_assigned=site_assigned,
            ecocash_number=cand.phone
        )
        cand.status = "Hired"
        return emp

    # --- SITE ATTENDANCE & MUSTER ROLL ---
    def log_site_attendance(
        self,
        employee_id: str,
        site_id: str,
        site_name: str,
        clock_in: str = "07:00",
        clock_out: str = "17:00",
        shift_type: str = "Day Shift",
        regular_hours: float = 8.0,
        ot_1_5x: float = 0.0,
        ot_2_0x: float = 0.0,
        gps_coords: str = "-17.8292, 31.0522"
    ) -> SiteAttendanceRecord:
        emp = self.employees.get(employee_id)
        emp_name = emp.full_name if emp else "Artisan Worker"
        rec_id = f"ATT-{datetime.now().strftime('%Y%m%d')}-{len(self.attendance_records) + 1:03d}"
        
        # Biometric or GPS tamper-evident hash
        bio_hash = hashlib.sha256(f"{employee_id}:{site_id}:{datetime.now().isoformat()}:{gps_coords}".encode()).hexdigest()[:16]

        rec = SiteAttendanceRecord(
            record_id=rec_id,
            employee_id=employee_id,
            employee_name=emp_name,
            site_id=site_id,
            site_name=site_name,
            attendance_date=datetime.now().strftime("%Y-%m-%d"),
            clock_in_time=clock_in,
            clock_out_time=clock_out,
            shift_type=shift_type,
            regular_hours=regular_hours,
            overtime_1_5x_hours=ot_1_5x,
            overtime_2_0x_hours=ot_2_0x,
            gps_coordinates=gps_coords,
            biometric_or_pin_hash=f"BIO_GPS_{bio_hash}",
            foreman_approved=False
        )
        self.attendance_records[rec_id] = rec
        return rec

    def approve_muster_roll(self, record_id: str, foreman_name: str) -> bool:
        rec = self.attendance_records.get(record_id)
        if rec:
            rec.foreman_approved = True
            rec.approved_by_foreman = foreman_name
            return True
        return False

    # --- LOCALIZED ZIMBABWEAN PAYROLL PROCESSING ---
    @staticmethod
    def calculate_zimra_paye_usd(taxable_income_usd: float) -> float:
        """
        ZIMRA progressive tax bands (USD statutory monthly tables):
        0 - $100: 0%
        $100.01 - $300: 20%
        $300.01 - $1,000: 25%
        $1,000.01 - $2,000: 30%
        $2,000.01 - $3,000: 35%
        Above $3,000: 40%
        """
        tax = 0.0
        income = taxable_income_usd

        if income > 3000.0:
            tax += (income - 3000.0) * 0.40
            income = 3000.0
        if income > 2000.0:
            tax += (income - 2000.0) * 0.35
            income = 2000.0
        if income > 1000.0:
            tax += (income - 1000.0) * 0.30
            income = 1000.0
        if income > 300.0:
            tax += (income - 300.0) * 0.25
            income = 300.0
        if income > 100.0:
            tax += (income - 100.0) * 0.20

        return round(tax, 2)

    def calculate_employee_payroll(
        self,
        employee_id: str,
        period: str = "2026-10",
        site_hardship_allowance: float = 0.0,
        housing_allowance: float = 0.0,
        transport_allowance: float = 0.0,
        ot_1_5x_hours: float = 0.0,
        ot_2_0x_hours: float = 0.0
    ) -> LocalizedPayrollSlip:
        emp = self.employees.get(employee_id)
        if not emp:
            raise ValueError(f"Employee {employee_id} not found")

        base_salary = emp.base_salary_usd
        hourly_rate = base_salary / 173.33  # Standard 40hr week monthly equivalent
        ot_earnings = round((ot_1_5x_hours * hourly_rate * 1.5) + (ot_2_0x_hours * hourly_rate * 2.0), 2)
        gross_earnings = round(base_salary + site_hardship_allowance + housing_allowance + transport_allowance + ot_earnings, 2)

        # 1. NSSA POBS Pension (4.5% employee subject to statutory ceiling, e.g. $700)
        nssa_ceiling_usd = 700.0
        insurable_earnings = min(gross_earnings, nssa_ceiling_usd)
        nssa_employee = round(insurable_earnings * 0.045, 2)
        nssa_employer_pobs = nssa_employee
        nssa_employer_apwcs = round(gross_earnings * 0.015, 2)  # 1.5% Accident Prevention scheme

        # 2. NEC Construction Levy (1.25% of base wage for both employee & employer)
        nec_employee = round(base_salary * 0.0125, 2)
        nec_employer = nec_employee

        # 3. Taxable Income for ZIMRA PAYE (Gross less allowable pension deduction)
        taxable_income = max(0.0, gross_earnings - nssa_employee)
        paye_base = self.calculate_zimra_paye_usd(taxable_income)
        aids_levy = round(paye_base * 0.03, 2)  # 3% AIDS Levy
        total_paye = round(paye_base + aids_levy, 2)

        # 4. Total Employee Deductions & Net Pay
        total_deductions = round(nssa_employee + total_paye + nec_employee, 2)
        net_usd = round(gross_earnings - total_deductions, 2)
        net_zwg = round(net_usd * self.rbz_zwg_rate, 2)

        # 5. Employer Levies
        zimdef_levy = round(gross_earnings * 0.010, 2)  # 1% ZIMDEF
        sdf_levy = round(gross_earnings * 0.005, 2)     # 0.5% Standards Development Fund
        total_employer_cost = round(gross_earnings + nssa_employer_pobs + nssa_employer_apwcs + nec_employer + zimdef_levy + sdf_levy, 2)

        # 6. Tamper-proof HMAC signature
        slip_id = f"PAY-{period}-{emp.employee_id}"
        payload_to_sign = f"{slip_id}:{emp.national_id}:{gross_earnings}:{net_usd}:{period}"
        hmac_sig = hmac.new(HMAC_SECRET, payload_to_sign.encode(), hashlib.sha256).hexdigest()

        slip = LocalizedPayrollSlip(
            payslip_id=slip_id,
            employee_id=emp.employee_id,
            employee_name=emp.full_name,
            national_id=emp.national_id,
            nec_grade=emp.nec_grade,
            period=period,
            base_salary_usd=base_salary,
            site_hardship_allowance_usd=site_hardship_allowance,
            housing_allowance_usd=housing_allowance,
            transport_allowance_usd=transport_allowance,
            overtime_earnings_usd=ot_earnings,
            gross_earnings_usd=gross_earnings,
            nssa_pobs_employee_usd=nssa_employee,
            zimra_paye_tax_usd=paye_base,
            aids_levy_usd=aids_levy,
            nec_levy_employee_usd=nec_employee,
            total_deductions_usd=total_deductions,
            net_salary_usd=net_usd,
            nssa_pobs_employer_usd=nssa_employer_pobs,
            nssa_apwcs_employer_usd=nssa_employer_apwcs,
            nec_levy_employer_usd=nec_employer,
            zimdef_levy_employer_usd=zimdef_levy,
            sdf_levy_employer_usd=sdf_levy,
            total_employer_cost_usd=total_employer_cost,
            rbz_zwg_rate=self.rbz_zwg_rate,
            net_salary_zwg=net_zwg,
            cryptographic_hmac_hash=hmac_sig
        )
        self.payroll_history.append(slip)
        return slip

    def run_company_payroll_batch(self, period: str = "2026-10") -> Dict[str, Any]:
        """Processes payroll for all active employees and computes statutory batch aggregates."""
        slips: List[LocalizedPayrollSlip] = []
        for emp_id, emp in self.employees.items():
            if emp.status == EmployeeStatus.ACTIVE.value:
                # Add sample site allowances based on grade
                hardship = 150.0 if "Kadoma" in emp.site_assigned else 0.0
                housing = 200.0 if emp.base_salary_usd >= 2000 else 100.0
                transport = 80.0
                slip = self.calculate_employee_payroll(
                    employee_id=emp_id,
                    period=period,
                    site_hardship_allowance=hardship,
                    housing_allowance=housing,
                    transport_allowance=transport
                )
                slips.append(slip)

        total_gross = sum(s.gross_earnings_usd for s in slips)
        total_net_usd = sum(s.net_salary_usd for s in slips)
        total_paye = sum(s.zimra_paye_tax_usd + s.aids_levy_usd for s in slips)
        total_nssa_remittance = sum(s.nssa_pobs_employee_usd + s.nssa_pobs_employer_usd + s.nssa_apwcs_employer_usd for s in slips)
        total_nec_remittance = sum(s.nec_levy_employee_usd + s.nec_levy_employer_usd for s in slips)
        total_zimdef = sum(s.zimdef_levy_employer_usd for s in slips)
        total_sdf = sum(s.sdf_levy_employer_usd for s in slips)

        return {
            "period": period,
            "headcount": len(slips),
            "total_gross_payroll_usd": round(total_gross, 2),
            "total_net_payable_usd": round(total_net_usd, 2),
            "total_net_payable_zwg": round(total_net_usd * self.rbz_zwg_rate, 2),
            "statutory_remittances": {
                "zimra_paye_and_aids_levy_usd": round(total_paye, 2),
                "nssa_pension_and_apwcs_usd": round(total_nssa_remittance, 2),
                "nec_construction_levy_usd": round(total_nec_remittance, 2),
                "zimdef_manpower_levy_usd": round(total_zimdef, 2),
                "sdf_standards_levy_usd": round(total_sdf, 2),
            },
            "double_entry_journal": {
                "dr_payroll_salaries_expense_usd": round(total_gross, 2),
                "dr_statutory_levies_expense_usd": round(sum(s.total_employer_cost_usd - s.gross_earnings_usd for s in slips), 2),
                "cr_bank_cash_clearing_usd": round(total_net_usd, 2),
                "cr_zimra_payable_usd": round(total_paye, 2),
                "cr_nssa_payable_usd": round(total_nssa_remittance, 2),
                "cr_nec_payable_usd": round(total_nec_remittance, 2),
                "cr_zimdef_sdf_payable_usd": round(total_zimdef + total_sdf, 2)
            },
            "payslips": [
                {
                    "slip_id": s.payslip_id,
                    "employee": s.employee_name,
                    "grade": s.nec_grade,
                    "gross_usd": s.gross_earnings_usd,
                    "deductions_usd": s.total_deductions_usd,
                    "net_usd": s.net_salary_usd,
                    "net_zwg": s.net_salary_zwg,
                    "signature": s.cryptographic_hmac_hash
                }
                for s in slips
            ]
        }

    def get_hr_summary(self) -> Dict[str, Any]:
        """Provides executive HR dashboard metrics."""
        active_count = sum(1 for e in self.employees.values() if e.status == EmployeeStatus.ACTIVE.value)
        total_monthly_base = sum(e.base_salary_usd for e in self.employees.values() if e.status == EmployeeStatus.ACTIVE.value)
        
        return {
            "total_workforce_count": len(self.employees),
            "active_headcount": active_count,
            "monthly_payroll_base_usd": round(total_monthly_base, 2),
            "open_job_requisitions": len(self.requisitions),
            "active_candidates_in_pipeline": len(self.candidates),
            "today_attendance_clockins": len(self.attendance_records),
            "employees": [
                {
                    "id": e.employee_id,
                    "name": e.full_name,
                    "title": e.job_title,
                    "department": e.department,
                    "grade": e.nec_grade,
                    "contract": e.contract_type,
                    "base_salary_usd": e.base_salary_usd,
                    "site": e.site_assigned,
                    "status": e.status,
                    "annual_leave_days": e.leave_balances.get("annual", 0)
                }
                for e in self.employees.values()
            ],
            "requisitions": [
                {
                    "id": r.req_id,
                    "title": r.title,
                    "dept": r.department,
                    "openings": r.openings,
                    "grade": r.target_nec_grade,
                    "salary_usd": r.budget_salary_usd,
                    "status": r.status,
                    "applicants": r.applicants_count
                }
                for r in self.requisitions.values()
            ]
        }
