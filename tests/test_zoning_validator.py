import pytest
from spatial.zoning_validator import ZoningValidator

def test_validate_densification_quota_compliant():
    validator = ZoningValidator()
    # 500 / 1000 = 0.50, compliant
    result = validator.validate_densification_quota(500.0, 1000.0)
    assert result["compliant"] is True
    assert result["high_rise_ratio"] == 0.50
    assert result["target_ratio"] == 0.40
    assert result["status"] == "APPROVED"

def test_validate_densification_quota_exact_match():
    validator = ZoningValidator()
    # 400 / 1000 = 0.40, compliant
    result = validator.validate_densification_quota(400.0, 1000.0)
    assert result["compliant"] is True
    assert result["high_rise_ratio"] == 0.40
    assert result["target_ratio"] == 0.40
    assert result["status"] == "APPROVED"

def test_validate_densification_quota_non_compliant():
    validator = ZoningValidator()
    # 300 / 1000 = 0.30, non-compliant
    result = validator.validate_densification_quota(300.0, 1000.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.30
    assert result["target_ratio"] == 0.40
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

def test_validate_densification_quota_zero_total_area():
    validator = ZoningValidator()
    # Total area is 0, should handle gracefully and be non-compliant
    result = validator.validate_densification_quota(0.0, 0.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.0
    assert result["target_ratio"] == 0.40
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"

def test_validate_densification_quota_custom_ratio():
    # Test with a different ratio, e.g., 50%
    validator = ZoningValidator(high_rise_min_ratio=0.50)
    result = validator.validate_densification_quota(450.0, 1000.0)
    assert result["compliant"] is False
    assert result["high_rise_ratio"] == 0.45
    assert result["target_ratio"] == 0.50
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
