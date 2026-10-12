#!/usr/bin/env python3
"""
Adds Project Schedule, Quality HSE, Mortgage Calculator, and Municipal Permits
endpoints to server.py.
"""

import sys

def main():
    with open("server.py", "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Imports and engine initialization
    import_target = "from src.erp.field_service_manager import FieldServiceManager"
    new_imports = """from src.erp.field_service_manager import FieldServiceManager
from src.erp.project_engineering_suite import (
    ProjectScheduleManager,
    QualityHSEManager,
    MortgageFinancingEngine,
    MunicipalPermitManager
)"""
    if "ProjectScheduleManager" not in content:
        content = content.replace(import_target, new_imports, 1)

    init_target = "field_service_mgr = FieldServiceManager()"
    new_inits = """field_service_mgr = FieldServiceManager()
schedule_mgr = ProjectScheduleManager()
quality_mgr = QualityHSEManager()
mortgage_engine = MortgageFinancingEngine(rbz_zwg_rate=26.50)
permit_mgr = MunicipalPermitManager()"""
    if "schedule_mgr" not in content:
        content = content.replace(init_target, new_inits, 1)

    # 2. Add GET endpoints
    get_target = "super().do_GET()"
    new_get_routes = """            # =========================================================
            # PROJECT SCHEDULE, QUALITY & PERMITS (GET)
            # =========================================================
            if path == "/api/project/schedule":
                if not self._check_rbac("view_schedule"):
                    return
                self._send_json(200, schedule_mgr.get_schedule_summary())
                return

            if path == "/api/quality/summary":
                if not self._check_rbac("view_quality"):
                    return
                self._send_json(200, quality_mgr.get_quality_summary())
                return

            if path == "/api/permits/overview":
                if not self._check_rbac("view_permits"):
                    return
                self._send_json(200, permit_mgr.get_permit_overview())
                return

            super().do_GET()"""
    if "/api/project/schedule" not in content:
        content = content.replace("        super().do_GET()", new_get_routes, 1)

    # 3. Add POST endpoints
    post_target = '        self._send_json(404, {"error": "API Endpoint Not Found"})'
    new_post_routes = """        # =========================================================
        # 32. Project Engineering: Update Schedule Task
        # =========================================================
        if path == "/api/project/task/update":
            if not self._check_rbac("update_task"):
                return
            t_id = security_guard.sanitize(body.get("task_id", "TSK-08"))
            prog = int(body.get("progress_pct", 50))
            stat = security_guard.sanitize(body.get("status", "")) or None
            try:
                task = schedule_mgr.update_task_progress(t_id, prog, stat)
                sig = security_guard.sign_transaction(task.to_dict())
                security_guard.log_security_event(user_role, "UPDATE_TASK", f"Task {t_id} updated to {prog}%")
                resp = task.to_dict()
                resp["hmac_signature"] = sig
                self._send_json(200, resp)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        # 33. Quality: Record Concrete Cube Crush Test
        if path == "/api/quality/cube-test":
            if not self._check_rbac("log_cube_test"):
                return
            loc = security_guard.sanitize(body.get("pour_location", "First Floor Columns"))
            elem = security_guard.sanitize(body.get("structural_element", "Column"))
            mix = security_guard.sanitize(body.get("mix_designation", "C30"))
            slump = int(body.get("slump_mm", 90))
            s7 = float(body.get("strength_7day_mpa", 22.0))
            s28 = float(body.get("strength_28day_mpa", 33.5))
            tester = security_guard.sanitize(body.get("tested_by", "SAZ Materials Testing"))

            cube = quality_mgr.record_cube_test(loc, elem, mix, slump, s7, s28, tester)
            sig = security_guard.sign_transaction(cube.to_dict())
            security_guard.log_security_event(user_role, "LOG_CUBE_TEST", f"Cube test {cube.test_id} logged: {s28} MPa ({'PASSED' if cube.passed else 'FAILED'})")
            resp = cube.to_dict()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 34. Quality: Log Construction Snag
        if path == "/api/quality/snag/log":
            if not self._check_rbac("manage_snags"):
                return
            loc = security_guard.sanitize(body.get("location", "Stand 001 Bedroom 2"))
            trade = security_guard.sanitize(body.get("trade", "Carpentry"))
            desc = security_guard.sanitize(body.get("description", "Door hinge loose"))
            sev = security_guard.sanitize(body.get("severity", "MINOR"))
            photo = security_guard.sanitize(body.get("photo_hash", "hash_snag_photo"))
            sub = security_guard.sanitize(body.get("assigned_subcontractor", "Apex Joinery"))

            snag = quality_mgr.log_snag(loc, trade, desc, sev, photo, sub)
            sig = security_guard.sign_transaction(snag.to_dict())
            security_guard.log_security_event(user_role, "LOG_SNAG", f"Snag {snag.snag_id} logged for {loc}")
            resp = snag.to_dict()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 35. Quality: Resolve Construction Snag
        if path == "/api/quality/snag/resolve":
            if not self._check_rbac("manage_snags"):
                return
            snag_id = security_guard.sanitize(body.get("snag_id", ""))
            try:
                snag = quality_mgr.resolve_snag(snag_id)
                security_guard.log_security_event(user_role, "RESOLVE_SNAG", f"Snag {snag_id} resolved")
                self._send_json(200, snag.to_dict())
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        # 36. Mortgage: Dual-Currency Installment Calculation
        if path == "/api/mortgage/calculate":
            if not self._check_rbac("calculate_mortgage"):
                return
            price = float(body.get("property_price_usd", 45000.0))
            dep_pct = float(body.get("deposit_pct", 20.0))
            years = int(body.get("loan_term_years", 5))
            rate = float(body.get("annual_interest_rate_pct", 12.0))

            calc = mortgage_engine.calculate_mortgage(price, dep_pct, years, rate)
            sig = security_guard.sign_transaction({"price": price, "monthly_usd": calc["monthly_installment_usd"]})
            calc["hmac_signature"] = sig
            self._send_json(200, calc)
            return

        # 37. Municipal Permits: Signoff Inspection Stage
        if path == "/api/permits/signoff":
            if not self._check_rbac("signoff_permit"):
                return
            stage_id = int(body.get("stage_id", 5))
            inspector = security_guard.sanitize(body.get("inspector_name", "City Building Inspector Moyo"))
            cert_hash = security_guard.sanitize(body.get("certificate_hash", "hash_cert_auto"))

            try:
                stg = permit_mgr.signoff_stage(stage_id, inspector, cert_hash)
                sig = security_guard.sign_transaction(stg.to_dict())
                security_guard.log_security_event(user_role, "SIGNOFF_PERMIT", f"Statutory stage {stage_id} signed off by {inspector}")
                resp = stg.to_dict()
                resp["hmac_signature"] = sig
                self._send_json(200, resp)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        self._send_json(404, {"error": "API Endpoint Not Found"})"""

    if "/api/mortgage/calculate" not in content:
        content = content.replace(post_target, new_post_routes, 1)

    with open("server.py", "w", encoding="utf-8") as f:
        f.write(content)

    print("Successfully updated server.py with project schedule, quality, mortgage, and municipal permit routes!")

if __name__ == "__main__":
    main()
