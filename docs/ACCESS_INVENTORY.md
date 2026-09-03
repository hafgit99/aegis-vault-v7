# Access Inventory

Per the [OSTIF/Least Authority Security Best Practices Guide, Chapter 6](https://github.com/ostif-org/best-practices-guide/blob/main/06-kb.md), this document records who and what has privileged access to Aegis Vault 7's release and security surfaces. Reviewed at each major release (latest review: v7.0.4).

> **Principle:** this is a public file. It deliberately documents *what* has access, never *where secrets live* or their values.

## 1. Repository & Code

| Surface | Access | Holder |
| --- | --- | --- |
| GitHub repository `hafgit99/aegis-vault-v7` | Admin (owner) | Project maintainer (solo) |
| Branch protection on `main` | Configuration | Classic protection: 1 approval, required checks, up-to-date branches, linear history; solo merges use the documented bypass checkbox |
| Code scanning / CodeQL, Dependabot, Private Vulnerability Reporting | Admin-only configuration | Project maintainer |

## 2. CI / Release Pipeline (`release-desktop.yml`)

| Credential | Type | Notes |
| --- | --- | --- |
| `GITHUB_TOKEN` | Ephemeral, per-job | Least-privilege `permissions:` blocks per job; `contents: write` only where required (release publish) |
| `ANDROID_KEYSTORE_BASE64`, `AEGIS_ANDROID_KEY_ALIAS`, `AEGIS_ANDROID_KEYSTORE_PASSWORD`, `AEGIS_ANDROID_KEY_PASSWORD` | GitHub Actions secrets | Used only by the Android build job; not printed in logs |
| Android signing keystore | Maintainer-local backup, **outside any cloud-synced folder** | Restorable by the maintainer only; GitHub secrets are the sole CI copy |
| Sigstore / cosign (keyless) | **No stored secret** | OIDC-based ephemeral certificates tied to the repository identity; nothing to rotate or leak |
| Tauri updater minisign key | If applicable, maintainer-held | Verifies auto-updates independently of the release pipeline |

## 3. Domains & Infrastructure

| Surface | Access | Notes |
| --- | --- | --- |
| `aegisvault.xyz` domain + DNS | Maintainer-controlled | Hosts documentation and `/.well-known/security.txt` (RFC 9116) only; the app is local-first and has no runtime dependency on this host |
| VPS hosting the domain | Maintainer-controlled (SSH) | No user data is stored; compromise is bounded to defacement/phishing risk (see INCIDENT_RESPONSE.md §5.3) |

## 4. Accounts & Distribution

| Surface | Access | Notes |
| --- | --- | --- |
| GitHub account (releases, advisories, CI) | Maintainer | Account-level compromise procedure: INCIDENT_RESPONSE.md §5.2 |
| Extension store accounts (Chrome Web Store, Firefox AMO, Edge Add-ons, Safari/App Store as applicable) | Maintainer | Publishing accounts for signed extension builds |
| `admin@aegisvault.xyz` mailbox | Maintainer | Private security reporting channel #2 (channel #1: GitHub Private Vulnerability Reporting) |

## 5. Review Checklist (per major release)

- [ ] No new secrets added to CI without a row in §2
- [ ] Removed secrets/dependencies removed from this inventory
- [ ] Keystore backup still offline and restorable
- [ ] GitHub secrets still minimal (no unused entries)
- [ ] Branch protection / required checks unchanged (or intentional change documented)
