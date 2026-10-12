import pytest
from spatial.zoning_validator import ZoningValidator

def test_validate_densification_quota_compliant_exact():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    # Exactly 40%
    result = validator.validate_densification_quota(high_rise_area_m2=400.0, total_residential_area_m2=1000.0)

    assert result["compliant"] is True
    assert result["high_rise_ratio"] == 0.4
    assert result["target_ratio"] == 0.4
    assert result["status"] == "APPROVED"

def test_validate_densification_quota_compliant_above():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    # 50%
    result = validator.validate_densification_quota(high_rise_area_m2=500.0, total_residential_area_m2=1000.0)

    assert result["compliant"] is True
    assert result["high_rise_ratio"] == 0.5
    assert result["target_ratio"] == 0.4
    assert result["status"] == "APPROVED"

def test_validate_densification_quota_non_compliant():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    # 39%
    result = validator.validate_densification_quota(high_rise_area_m2=390.0, total_residential_area_m2=1000.0)

    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.39
    assert result["target_ratio"] == 0.4
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

def test_validate_densification_quota_zero_total_area():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    # Total area is 0
    result = validator.validate_densification_quota(high_rise_area_m2=0.0, total_residential_area_m2=0.0)

    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.0
    assert result["target_ratio"] == 0.4
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
