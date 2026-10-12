import pytest
from spatial.zoning_validator import ZoningValidator

def test_validate_densification_quota_compliant_exactly_at_ratio():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    res = validator.validate_densification_quota(high_rise_area_m2=400, total_residential_area_m2=1000)
    assert res["compliant"] is True
    assert res["status"] == "APPROVED"
    assert res["high_rise_ratio"] == 0.4
    assert res["target_ratio"] == 0.4

def test_validate_densification_quota_compliant_above_ratio():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    res = validator.validate_densification_quota(high_rise_area_m2=500, total_residential_area_m2=1000)
    assert res["compliant"] is True
    assert res["status"] == "APPROVED"
    assert res["high_rise_ratio"] == 0.5
    assert res["target_ratio"] == 0.4

def test_validate_densification_quota_non_compliant_below_ratio():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    res = validator.validate_densification_quota(high_rise_area_m2=390, total_residential_area_m2=1000)
    assert res["compliant"] is False
    assert res["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert res["high_rise_ratio"] == 0.39
    assert res["target_ratio"] == 0.4

def test_validate_densification_quota_zero_total_area():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    res = validator.validate_densification_quota(high_rise_area_m2=0, total_residential_area_m2=0)
    assert res["compliant"] is False
    assert res["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert res["high_rise_ratio"] == 0.0
    assert res["target_ratio"] == 0.4

def test_validate_densification_quota_zero_high_rise_area():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    res = validator.validate_densification_quota(high_rise_area_m2=0, total_residential_area_m2=1000)
    assert res["compliant"] is False
    assert res["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert res["high_rise_ratio"] == 0.0
    assert res["target_ratio"] == 0.4

def test_validate_densification_quota_high_rise_greater_than_total():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    # Even if this is an invalid physical state, the math ratio check should just return compliant
    # based on ratio=1.2 >= 0.40
    res = validator.validate_densification_quota(high_rise_area_m2=1200, total_residential_area_m2=1000)
    assert res["compliant"] is True
    assert res["status"] == "APPROVED"
    assert res["high_rise_ratio"] == 1.2
    assert res["target_ratio"] == 0.4
