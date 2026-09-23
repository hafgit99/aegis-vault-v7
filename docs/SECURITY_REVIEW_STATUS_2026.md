# Aegis Vault 7 — Security Review and External Audit Status

**Status date:** September 23, 2026

**Release context:** `v7.0.6.0`
**Purpose:** Clarify the difference between maintainer-led review material and independent third-party assurance.

## Current public status

The repository publishes security engineering documentation, including a threat model, security notes, quality gates, and an [external audit scope and preparation document](EXTERNAL_AUDIT_SCOPE_EN.md). The scope document describes work intended for an independent reviewer; it is not a completed assessment.

As of the date above, this repository does **not** publish a completed independent third-party security audit report. No independent auditor, engagement dates, assessed commit, final findings, or auditor-issued conclusion can therefore be cited from this repository as completed external assurance.

## Earlier review scores

Numerical scores and finding-closure counts previously shown in project material were maintainer-generated assessments of earlier code snapshots. They were not produced by an independent auditor, were not calibrated against an external scoring standard, and do not represent the current `v7.0.6.0` release. They should not be interpreted as a certification, guarantee, or independent security rating.

## KDF profiles in the current source

The source defines separate defaults by runtime:

| Runtime | Argon2id memory | Iterations | Parallelism |
|---|---:|---:|---:|
| Tauri native desktop/Android | 64 MiB | 4 | 2 lanes |
| Web/WASM and portable fallback | 32 MiB | 3 | 1 lane |

These are defaults for newly created vaults. KDF parameters are recorded with vault data, so an existing vault can continue using the parameters with which it was created. This summary describes source defaults; it is not a performance benchmark or an independent cryptographic validation.

## References

- [External audit scope and preparation (English)](EXTERNAL_AUDIT_SCOPE_EN.md)
- [External audit scope and preparation (Turkish)](EXTERNAL_AUDIT_SCOPE.md)
- [Threat model](THREAT_MODEL.md)
- [Security policy and vulnerability reporting](../SECURITY.md)
