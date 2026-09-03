# Audit Application Package — Aegis Vault 7

**Prepared for:** OSTIF "Get an Audit" program · OpenSSF Alpha-Omega (Alpha / seasonal grant)
**Date:** September 2026 · **Version:** 1.0.0 · **Maintainer:** Hafiz (@hafgit99) · admin@aegisvault.xyz

---

## 1. Project Summary

**Aegis Vault 7** is a local-first, zero-knowledge password manager for Windows, macOS, Linux, Android, and Chromium/Firefox/Safari browsers. All cryptography runs client-side (Argon2id + AES-256-GCM via WebCrypto/WASM); no server ever receives plaintext secrets. The desktop stack is Rust/Tauri; mobile is Tauri Android with hardware-backed KeyStore wrapping; the browser extension is Manifest V3 with full Public Suffix List phishing detection.

- **Repository:** https://github.com/hafgit99/aegis-vault-v7
- **License:** MIT (OSI-approved, Alpha-Omega eligible)
- **Website:** https://aegisvault.xyz
- **Threat model:** `THREAT_MODEL.md` (English)
- **Audit scope document (English):** `docs/EXTERNAL_AUDIT_SCOPE_EN.md`

---

## 2. Security Posture Evidence (verifiable, current)

| Control | Evidence |
|---|---|
| **OpenSSF Scorecard** | Automated weekly runs (GitHub Action, published SARIF); alerts triaged — 1 open alert only (Maintained, closes automatically) with 22 documented dismissals each carrying a written rationale |
| **CII Best Practices Badge** | **passing** — https://www.bestpractices.dev/en/projects/14390 |
| **SAST** | CodeQL (javascript-typescript), SHA-pinned workflow, clean: 1 finding dismissed with documented intentional-design rationale; all remaining alerts resolved |
| **Dependencies** | Dependabot at 100% coverage: 19/19 update PRs merged across npm + Cargo; `npm audit` production-clean; `cargo audit` reviewed (all findings are Tauri-ecosystem "unmaintained" warnings, documented) |
| **CI gates on every PR** | Typecheck, 1803 unit tests across 217 files, Rust check+tests, CodeQL; required status checks + up-to-date branch rule + linear history on `main` (classic protection + ruleset) |
| **Release signing** | Every release artifact (desktop installers, APKs, extension zips/xpi, SBOMs, checksums) is cosign Sigstore **keyless**-signed (OIDC-bound, Rekor transparency log); Tauri updater bundles additionally minisign-signed; `SHA256SUMS.txt` signed |
| **SBOM** | Per-release CycloneDX: npm 1.6 (~589 components) + Cargo 1.5 (~510 components incl. all target triples), signed and published as release assets |
| **Release pipeline** | Fully automated tag-triggered workflow, SHA-pinned actions, per-job least-privilege tokens, idempotent publish, tag↔version guard |
| **Internal reviews** | Three completed self-audit rounds (84→91/100), documented in `docs/` |
| **Runtime hardening gates** | Release-hardening script blocks non-minified output, missing integrity manifest, CSP violations, `Math.random` usage, inline-JS master-key strings |

---

## 3. Attack Surface Proposed for Audit

1. **Cryptographic core** (`src/lib/`): Argon2id parameters, AES-256-GCM usage, HKDF per-item key isolation, secret key format, memory zeroization (WASM arena + Rust `zeroize`).
2. **Local IPC bridge** (Rust `native_messaging.rs`): pairing token model, ACL fail-closed behavior, loopback binding, credential lease window — the highest-value target (local attacker boundary).
3. **Browser extension** (`src-extension/`): domain-matching gate, Shadow DOM autofill, IDN/punycode handling, draft memory lifecycle.
4. **Android** (KeyStore wrapping, FLAG_SECURE, FileProvider scoping).
5. **Release/supply chain pipeline** (workflows, signing chain, SBOM completeness).

Full detail: `docs/EXTERNAL_AUDIT_SCOPE_EN.md` §2.

---

## 4. User Base and Impact (honest current state)

- **Release downloads:** 18+ across v7.0.2–v7.0.4 release assets (self-distributed, no store listings yet)
- **Community:** 1 star, early stage; issue traffic nascent
- **Context:** single-maintainer security-critical project, ~5 months public development, 50+ releases-quality commits, fully transparent history

We state this candidly: the user base is small but the project's security engineering investment is disproportionate to its size — precisely the profile where an external audit yields the highest marginal safety gain.

---

## 5. Maintainer Availability Commitment

- The maintainer commits to **being available for the full audit engagement**: weekly (or more frequent) calls, same-day answers to auditor questions, and repository access including build/run walkthroughs.
- **Remediation capacity:** dedicated time budget for the engagement duration; findings will be triaged by severity with target timelines (critical: 48h fix, high: 1 week, medium/high+: published remediation plan).
- **Transparency:** the final report will be published openly (repository + website), including remediation status per finding.

---

## 6. Existing Security Artifacts (links)

| Artifact | Location |
|---|---|
| Threat model | `THREAT_MODEL.md` |
| Audit scope (EN) | `docs/EXTERNAL_AUDIT_SCOPE_EN.md` |
| Security policy | `SECURITY.md` (admin@aegisvault.xyz) |
| Hardening plan | `docs/OSTIF_ALPHA_OMEGA_HAZIRLIK_PLANI.md` (TR) |
| Threat/prep docs | `docs/ANDROID_READINESS.md`, `docs/RELEASE_PLAN.md` |
| Audit package index | `SECURITY_AUDIT_PACKAGE/README.md` |
| Latest signed release | https://github.com/hafgit99/aegis-vault-v7/releases/tag/v7.0.4 |
| SBOM (npm / Cargo) | release assets `npm-sbom.json` / `cargo-sbom.json` (v7.0.4+) |
| CII badge | https://www.bestpractices.dev/en/projects/14390 |

---

## 7. Requested Engagement Shape (proposal)

- **Type:** source-code security audit (white-box), 2–4 auditor-weeks proposed
- **Priority order:** Layer 2 (IPC bridge) → Layer 1 (crypto core) → Layer 3 (extension) → Layer 5 (supply chain) → Layer 4 (Android)
- **Deliverables:** findings report + remediation verification + published summary

*Contact: admin@aegisvault.xyz · GitHub: @hafgit99*
