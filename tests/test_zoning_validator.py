import pytest
from spatial.zoning_validator import ZoningValidator

def test_validate_densification_quota_compliant():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    result = validator.validate_densification_quota(high_rise_area_m2=400.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is True
    assert result["high_rise_ratio"] == pytest.approx(0.4)
    assert result["target_ratio"] == pytest.approx(0.4)
    assert result["status"] == "APPROVED"

def test_validate_densification_quota_non_compliant():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    result = validator.validate_densification_quota(high_rise_area_m2=399.9, total_residential_area_m2=1000.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == pytest.approx(0.3999)
    assert result["target_ratio"] == pytest.approx(0.4)
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

def test_validate_densification_quota_zero_total_area():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    result = validator.validate_densification_quota(high_rise_area_m2=0.0, total_residential_area_m2=0.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == pytest.approx(0.0)
    assert result["target_ratio"] == pytest.approx(0.4)
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

def test_validate_densification_quota_custom_ratio():
    validator = ZoningValidator(high_rise_min_ratio=0.50)
    result = validator.validate_densification_quota(high_rise_area_m2=450.0, total_residential_area_m2=1000.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == pytest.approx(0.45)
    assert result["target_ratio"] == pytest.approx(0.5)
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
