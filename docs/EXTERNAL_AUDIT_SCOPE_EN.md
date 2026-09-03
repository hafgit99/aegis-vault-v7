# Aegis Vault 7 — Independent Security Audit Scope and Preparation Document

**Document Version:** 2.0.0 · **Date:** September 2026 · **Target Version:** Aegis Vault 7.0.4+

---

## 1. Introduction and Purpose

Aegis Vault 7 is a modern password manager with a local-first and zero-knowledge architecture. This document is the official audit scope guide prepared for independent third-party cybersecurity and code audit firms (e.g., Cure53, Trail of Bits, NCC Group, Doyensec, OSTIF-affiliated auditors).

**Distribution channels in scope:** Windows/macOS/Linux desktop apps (Tauri), Android app (Tauri), and Chromium/Firefox/Safari browser extension — all produced by a single reproducible CI release pipeline with Sigstore (cosign) keyless signatures, Tauri minisign updater signatures, and per-release CycloneDX SBOMs.

---

## 2. Audit Scope and Architectural Layers

### Layer 1: Cryptographic Core (`src/lib/`)
* **Key Derivation (KDF):**
  * `argon2id.ts`: RFC 9106 compliant parameters (32–64 MiB RAM, 3–4 iterations). WASM memory management and degradation protection.
  * `secretKey.ts`: 160-bit A3-format two-factor account secret key derivation and normalization.
* **Encryption Primitives:**
  * `webcrypto.ts`: AES-256-GCM (12-byte CSPRNG IV, 128-bit auth tag), HKDF-SHA256 per-item key isolation (`derivePerItemKey`), non-extractable CryptoKey caching with LFU eviction.
  * `random.ts`: CSPRNG entropy (`crypto.getRandomValues`) + rejection sampling; `Math.random` is banned by lint gate.
  * `wasmZeroizer.ts` & `vaultSession.ts`: Memory zeroization discipline, CryptoKey cache teardown on lock, lazy-unmount.
* **Secure Sharing:**
  * `share.ts`: Password-derived HKDF-SHA256 + AES-256-GCM key architecture. No key material in URL fragments.
* **Database and Integrity:**
  * `vaultDatabaseFormat.ts` & `sqliteOpfsPersistence.ts`: Monotonic version counter (`versionCounter`), canonical-state HMAC-SHA256 integrity verification (`computeStateIntegrityHmac`), row deletion and rollback protection.

### Layer 2: Rust / Tauri Desktop and IPC Bridge (`src-tauri/`)
* **Native Messaging & IPC:**
  * `src-tauri/src/native_messaging.rs`: 256-bit CSPRNG pairing token, constant-time token validation, restrictive ACL (Windows CreateFile/icacls fail-closed, Unix 0o600), dynamic loopback TCP binding, full Public Suffix List eTLD+1 domain matching (multi-part ccTLDs and wildcard rules included), 5-minute active credential lease window.
* **System Hardening:**
  * `src-tauri/src/lib.rs`: Screen capture blocking (`WDA_EXCLUDEFROMCAPTURE`), protected clipboard writes, minisign-signed `tauri-plugin-updater` update verification.

### Layer 3: Browser Extension (`src-extension/`)
* **Isolation and Permission Model:**
  * Manifest V3 least privilege (no `host_permissions`, no remote scripts).
  * Closed Shadow DOM autofill UI.
  * `psl-utils.ts`: Full Public Suffix List phishing detection (10k+ rules, multi-part ccTLD and hosting domain coverage, wildcard/exception handling).
  * `background.ts`: Mandatory domain-matching gate, origin-bound transient draft memory, schema validation.
  * `content.ts`: Form-bound refill leak protection, safe IDN/punycode exemption logic.

### Layer 4: Android / Mobile Security (`gen/android/` & `src/lib/android*`)
* **Android KeyStore Integration:**
  * AndroidKeyStore AES-256-GCM wrapping, `unlockedDeviceRequired(true)`, `FLAG_SECURE` window protection, scoped FileProvider.

### Layer 5: Supply Chain and Release Integrity (new in v7.0.3+)
* All GitHub Actions are SHA-pinned; minimum-privilege `GITHUB_TOKEN` scopes per job.
* Release pipeline: build gates (typecheck, unit tests, hardening checks) → Tauri updater bundles → `latest.json` manifest → **cosign Sigstore keyless signatures** (OIDC-bound) for every artifact → global `SHA256SUMS.txt` → GitHub Release.
* **CycloneDX SBOM** per release: npm (CycloneDX 1.6) + Cargo (CycloneDX 1.5), signed and published as release assets.
* Dependency discipline: 100% Dependabot coverage (19/19 update PRs merged), CodeQL SAST clean, Scorecard automated checks.

---

## 3. Threat Model and Security Boundaries

| Threat | Expected Defense |
|---|---|
| **Stolen/leaked database (offline attack)** | 32–64 MiB Argon2id + 160-bit secret key combination (infeasible to attack even with a weak user password). |
| **Malicious webpage / phishing** | Extension-side full-PSL eTLD+1 matching, mandatory domain-mismatch user confirmation, Shadow DOM isolation, textContent-only rendering. |
| **Malicious process on the same device (local IPC)** | Hardened 0o600 / Windows ACL token file, fail-closed validation, one-shot dynamic port binding. |
| **Supply chain / malicious update** | Minisign-signed updater packages (Tauri), cosign Sigstore keyless-signed release artifacts, SRI asset manifest, SHA-pinned CI. |
| **Memory dump** | zeroize/ZeroizeOnDrop traits, WASM zeroizer arena, React unmount on lock. |
| **Malicious dependency** | SBOM + lockfile-only builds + npm/cargo audit gates + Dependabot; tamper-evident releases via transparency log (Sigstore Rekor). |

---

## 4. Recommended Audit Methodology

1. **White-box source code review:** Key derivation, IV management, memory zeroization, IPC handshake logic, and the new release/signing pipeline.
2. **Static and dynamic analysis:** Fuzzing of extension messaging flows, verification of WebAuthn PRF and Android KeyStore bridges.
3. **Penetration testing (local IPC & extension bridge):** Privilege escalation attempts from browser content contexts and native host manipulation.
4. **Build/reproducibility review (supply chain):** CI workflow audit, SBOM completeness, signature verification chain end-to-end.

---

## 5. Reporting and Transparency Commitment

Upon audit completion:
- Findings will be remediated by severity, with transparent progress tracking.
- The executive summary and technical findings will be published openly in the repository and on the official website.
