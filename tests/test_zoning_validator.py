import pytest
from spatial.zoning_validator import ZoningValidator

def test_validate_densification_quota_compliant():
    validator = ZoningValidator()
    # 40% high rise ratio, exactly compliant
    result = validator.validate_densification_quota(high_rise_area_m2=400.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is True
    assert result["high_rise_ratio"] == 0.4
    assert result["target_ratio"] == 0.4
    assert result["status"] == "APPROVED"

    # 50% high rise ratio, compliant
    result2 = validator.validate_densification_quota(high_rise_area_m2=500.0, total_residential_area_m2=1000.0)
    assert result2["compliant"] is True
    assert result2["high_rise_ratio"] == 0.5
    assert result2["target_ratio"] == 0.4
    assert result2["status"] == "APPROVED"

def test_validate_densification_quota_non_compliant():
    validator = ZoningValidator()
    # 39% high rise ratio, not compliant
    result = validator.validate_densification_quota(high_rise_area_m2=390.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.39
    assert result["target_ratio"] == 0.4
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

def test_validate_densification_quota_zero_total_area():
    validator = ZoningValidator()
    # Zero total residential area, avoids division by zero, returns 0.0 ratio, non compliant
    result = validator.validate_densification_quota(high_rise_area_m2=0.0, total_residential_area_m2=0.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.0
    assert result["target_ratio"] == 0.4
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

def test_validate_densification_quota_custom_ratio():
    validator = ZoningValidator(high_rise_min_ratio=0.50)
    # 40% high rise ratio, not compliant against 50% minimum
    result = validator.validate_densification_quota(high_rise_area_m2=400.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.4
    assert result["target_ratio"] == 0.5
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

    # 50% high rise ratio, exactly compliant
    result2 = validator.validate_densification_quota(high_rise_area_m2=500.0, total_residential_area_m2=1000.0)
    assert result2["compliant"] is True
    assert result2["high_rise_ratio"] == 0.5
    assert result2["target_ratio"] == 0.5
    assert result2["status"] == "APPROVED"
