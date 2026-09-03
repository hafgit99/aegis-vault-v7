# Incident Response Runbook

This document is the internal operating procedure for handling reported vulnerabilities and active security incidents affecting Aegis Vault 7. It follows the recommendations in the [OSTIF/Least Authority Security Best Practices Guide, Chapter 3](https://github.com/ostif-org/best-practices-guide/blob/main/03-response.md) and the public disclosure SLAs defined in [SECURITY.md](../SECURITY.md).

> **Maintainer note:** This is a living document. Re-read it at every release and after every real incident. Solo-maintainer reality: every "team" role below defaults to you; document any external helper (e.g. a triaging contributor) explicitly.

## 1. Scope & Activation Triggers

This runbook activates on any of the following:

- A private vulnerability report (GitHub Private Vulnerability Reporting or `admin@aegisvault.xyz`)
- A public disclosure of an unpatched Aegis Vault 7 vulnerability
- A vulnerability disclosure in a dependency (npm, crates.io, Tauri, GTK stack) with plausible reach into this codebase
- A supply-chain event: suspicious dependency update, typosquatting, compromised CI action, malicious commit in a pinned upstream
- A maintainer-account or release-integrity compromise (unexpected release, altered assets, anomalous `latest.json`)
- A compromise of the project's internet-facing infrastructure (VPS hosting `aegisvault.xyz`)

Out of scope: user-side misuse, issues in downstream forks, findings in third-party extensions not published under this repository's release pipeline.

## 2. Roles

| Role | Holder | Responsibility |
| --- | --- | --- |
| Handler (default) | Project maintainer | All triage, communication, remediation, disclosure |
| Verifier | Any trusted contributor, or the original reporter | Independent reproduction and post-fix verification |

There is currently no external escalation party. If the maintainer is unavailable and a Critical incident is active, users should be notified via the release page and repository README as soon as the maintainer is reachable.

## 3. Vulnerability Report Triage Flow

For every inbound report, work through these steps in order:

1. **Acknowledge (≤ 48h).** Confirm receipt to the reporter, state the SLA expectations from SECURITY.md, and ask for anything missing (affected component/version, reproduction steps, PoC).
2. **Register.** Open a private GitHub Security Advisory (or private issue) as the single tracking record. Every subsequent step is documented there — this produces the step-by-step documentation auditors expect.
3. **Reproduce & confirm.** Attempt independent reproduction on an affected platform. Record the exact version/commit, platform, and steps.
4. **Impact analysis & severity triage** (see §4). Assign severity, decide accepted / rejected / needs-more-info.
5. **Communicate the triage decision to the reporter (≤ 7 days from report)** — including rationale if rejected.
6. **Plan remediation** by severity SLA (§5). Identify affected versions/commits (git history + released SBOMs help here), and whether any released artifact is affected.
7. **Status updates to the reporter at least every 14 days** until a fix ships, even if the status is "no change".
8. **Coordinate third-party communication** if the fix requires it (e.g. an upstream dependency needs to ship first; other projects sharing the vulnerable dependency should be flagged privately to their maintainers).
9. **Ship the fix**, release, and ask the reporter to verify the remediation on the patched build before public disclosure.
10. **Disclose publicly** (coordinated disclosure, ≤ 90 days): security advisory on GitHub, credit for the reporter (if desired), release notes entry, and an updated `latest.json` push so auto-updaters pick the fix up.

## 4. Severity Classification

Password-manager-specific anchors; adjust per finding:

| Severity | Definition | Examples |
| --- | --- | --- |
| **Critical** | Vault confidentiality/integrity breaks without user interaction | Vault unlock bypass, master-key or vault plaintext exposure, crypto primitive misuse (e.g. nonce reuse in AES-GCM), leakage of decrypted vault to disk/logs |
| **High** | Attacker gains meaningful capability with elevated prerequisites | Extension-to-app IPC injection, malicious vault import parsing leading to code execution, phishing-able updater flow, Android keystore misuse |
| **Medium** | Limited data exposure or defense-in-depth weakening | Password-hint key material readable beyond intended scope, missing TLS verification in sync (WebDAV/S3), rate-limit absence |
| **Low** | Hardening gap, no direct exploit path | Missing security headers in web surfaces, verbose error messages, outdated-but-not-vulnerable dependencies |

Critical and High findings trigger the expedited track: acknowledge ≤ 48h, user-facing fixed release targeted ≤ 7 days, all other steps compressed accordingly.

## 5. Incident Scenarios

### 5.1 Supply-chain compromise (malicious dependency / CI)

1. **Detect/confirm:** Diff released SBOMs (`npm-sbom.json`, `cargo-sbom.json`) against a clean build from a known-good commit; check audit gate output; inspect the offending package's diff and provenance.
2. **Contain:** Freeze releases (do not re-tag while contaminated). Rotate any credentials the CI had access to. Revoke GitHub App / personal tokens in scope.
3. **Warn first:** If any published release is affected, mark the release page with a prominent warning **before** anything else, stating which SHA256 hashes should NOT be trusted.
4. **Rebuild clean:** Rebuild from a pinned, verified commit (all actions are SHA-pinned; rebuilds run via `release-desktop.yml`) and re-verify `SHA256SUMS.txt` + cosign signatures.
5. **Notify:** Release page announcement + README banner; state clearly which versions are affected, what users should do (re-install from the new release, verify signatures), and what was compromised.
6. **Learn:** Post-mortem written into this repo as an addendum to this file, including which detection gate missed it and what gate will catch it next time.

### 5.2 Release-integrity / maintainer-account compromise

1. Verify all published releases against `SHA256SUMS.txt` + Sigstore (cosign) signatures; check `latest.json` URLs point to assets that exist and match.
2. If an unauthorized release exists: delete it, rotate GitHub account credentials, review recent commits on `main`, force-push correction only with clear user communication.
3. Note: the cosign keyless model means signatures verify against the repository's OIDC identity — a compromised repo produces "valid" signatures; therefore commit-history review and user-visible release announcements are part of containment, not just signature checks.

### 5.3 Infrastructure compromise (VPS / domain)

1. Take the affected host offline if credentials are suspected compromised; do not patch-in-place a live compromised host.
2. Rotate VPS/SSH/DNS credentials; review server logs for attacker dwell time.
3. Verify what was served. The domain hosts documentation and `security.txt` only — the app is local-first and does not depend on this host at runtime, which bounds the blast radius.
4. Publish a user notice if the domain was used for any phishing-relevant content.

### 5.4 Unpatched vulnerability disclosed publicly

1. Assess whether a fix can ship faster than the reporter's disclosure window.
2. Ship an advisory immediately (even without a fix) with mitigations (e.g. "disable X feature") if a full fix needs longer; users must never be silently exposed.
3. Follow §3 steps 5–10.

## 6. Verification & Closure

- Every remediation is verified by the reporter or an independent reproducer before the advisory is published.
- The tracking record is updated with: final severity, affected versions, fix commit, advisory link, disclosure date.
- Disclosure artifacts: GitHub Security Advisory, release notes entry, updated SECURITY.md supported-versions table if needed.

## 7. References

- [CISA Cyber Incident Guide](https://www.cisa.gov/resources-tools/resources/cyber-incident-guide)
- [BSI incident response checklist](https://www.bsi.bund.de/EN/IT-Sicherheitsvorfall/Unternehmen/unternehmen.html)
- [CSA SingCERT incident response checklist](https://www.csa.gov.sg/Tips-Resource/Resources/singcert/incident-response-checklist)
- [OSTIF Best Practices Guide](https://github.com/ostif-org/best-practices-guide) (collaboration with Least Authority)

