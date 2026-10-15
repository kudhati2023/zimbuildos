import pytest
from spatial.zoning_validator import ZoningValidator

def test_validate_densification_quota_compliant():
    validator = ZoningValidator()
    # 400 is exactly 40% of 1000
    result = validator.validate_densification_quota(high_rise_area_m2=400.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert result["high_rise_ratio"] == 0.4
    assert result["target_ratio"] == 0.4

def test_validate_densification_quota_compliant_above():
    validator = ZoningValidator()
    # 500 is 50% of 1000
    result = validator.validate_densification_quota(high_rise_area_m2=500.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert result["high_rise_ratio"] == 0.5
    assert result["target_ratio"] == 0.4

def test_validate_densification_quota_non_compliant():
    validator = ZoningValidator()
    # 399 is 39.9% of 1000, which is below 40%
    result = validator.validate_densification_quota(high_rise_area_m2=399.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is False
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert result["high_rise_ratio"] == 0.399
    assert result["target_ratio"] == 0.4

def test_validate_densification_quota_zero_total_area():
    validator = ZoningValidator()
    result = validator.validate_densification_quota(high_rise_area_m2=0.0, total_residential_area_m2=0.0)
    assert result["compliant"] is False
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert result["high_rise_ratio"] == 0.0
    assert result["target_ratio"] == 0.4

def test_validate_densification_quota_custom_ratio():
    validator = ZoningValidator(high_rise_min_ratio=0.50)
    # 450 is 45% of 1000, which is compliant for 40% but not for 50%
    result = validator.validate_densification_quota(high_rise_area_m2=450.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is False
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert result["high_rise_ratio"] == 0.45
    assert result["target_ratio"] == 0.5
