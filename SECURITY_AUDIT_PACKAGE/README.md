# Aegis Vault 7 - Security Audit Package

This directory contains key documentation and configuration artifacts prepared for third-party security audits. Aegis Vault 7 implements a local-first, zero-materialization security architecture designed to prevent the exposure of master credentials in runtime memory or application logs.

## Package Contents

1. **[README.md](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/SECURITY_AUDIT_PACKAGE/README.md)** (This document) - Overview of the package and security architecture.
2. **[SECURITY_NOTES.md](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/SECURITY_AUDIT_PACKAGE/SECURITY_NOTES.md)** - Curated list of verified security controls, cryptographic primitives, and security debt tracking.
3. **[THREAT_MODEL.md](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/SECURITY_AUDIT_PACKAGE/THREAT_MODEL.md)** - Threats scope, boundaries, attacker model, and residual risk registers.
4. **[QUALITY_GATES.md](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/SECURITY_AUDIT_PACKAGE/QUALITY_GATES.md)** - Unit test coverage baselines, test reports, and quality checks.
5. **[MASTER_STRING_CLASSIFICATION.md](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/SECURITY_AUDIT_PACKAGE/MASTER_STRING_CLASSIFICATION.md)** - Detailed audit classification and analysis of remaining plain-text master password string references.

---

## Key Control: No-JS-Master-String Final Gate

To guarantee that the plain-text master password string does not materialize during routine application flows (CRUD, settings panel dashboard, or attachment retrieval), Aegis Vault 7 uses an automated gate:

- **Scan Target**: Recursively scans all source files (`.ts`, `.tsx`, `.js`, `.jsx`) in the `src/` directory.
- **Forbidden Patterns**:
  - `withActiveMasterPassword`
  - `getActiveMasterPassword`
  - `masterPasswordPlain`
  - `passwordPlain`
  - `deriveEncryptionKey`
- **Allowlist Enforced**: Only specific, authorized boundaries (setup, password rotation, migration, and test suites) are allowlisted.
- **Strict Occurrence Bounds**: Every allowlisted file is restricted to an exact baseline count of occurrences. Any addition of master-string logic outside or exceeding these baselines triggers a build-time and test-time failure.

### Running the Scan

The security scan can be executed locally using the following command:

```bash
npm run security:no-js-master-string
```

It is also run automatically during unit tests:

```bash
npm run test:unit
```
