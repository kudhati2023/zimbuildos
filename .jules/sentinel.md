
## 2026-11-07 - Remove Hardcoded Cryptographic Secrets
**Vulnerability:** Found hardcoded fallback values for HMAC_SECRET and mock tokens in multiple files.
**Learning:** Relying on 'development' fallback defaults poses a risk where systems could initialize securely with a known key.
**Prevention:** Fail securely at initialization by raising errors if critical environment secrets are not provided.
