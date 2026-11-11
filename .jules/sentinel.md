
## 2025-02-21 - Remove Hardcoded Default Secret in server.ts
**Vulnerability:** JWT token was signed with an implicitly available hardcoded secret (or an in-memory random bytes generator during startup when  wasn't set) in an insecure manner.
**Learning:** Generating the JWT payload manually without a strong verifiable signature validation mechanism by relying on a rotating random variable (if JWT_SECRET was missing) or an easily predictable secret can compromise token security.
**Prevention:** Utilize standard crypto modules effectively and ensure secrets are securely provided via environment variables, with explicit secure algorithms.

## 2025-02-21 - Remove Hardcoded Default Secret in server.ts
**Vulnerability:** JWT token was manually constructed by appending '.sig' without valid HMAC signing.
**Learning:** Constructing JWTs securely requires cryptographic signing rather than string manipulation.
**Prevention:** Utilize standard crypto modules and enforce strong verifiable signature validation mechanism by using HMAC SHA-256.
