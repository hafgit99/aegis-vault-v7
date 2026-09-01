# Contributing to Aegis Vault 7

Thank you for your interest in contributing! Aegis Vault 7 is a local-first, zero-knowledge password manager, so contributions here are held to a **high security bar**. This document explains how to get started and what we expect.

## Security Issues — Do NOT Open a Public Issue

**Never report security vulnerabilities through public GitHub issues.**

See [SECURITY.md](SECURITY.md) for the responsible disclosure policy and the acknowledgment / fix timelines (acknowledged within 48h, triaged within 7 days, remediated within 90 days depending on severity).

## Getting Started

Prerequisites: Node.js v20+ (v22 recommended), npm v10+, Rust stable toolchain (for the Tauri backend).

```bash
git clone https://github.com/hafgit99/aegis-vault-v7.git
cd aegis-vault-v7
npm ci
```

## Verification Checklist — All Gates Must Pass

Before opening a pull request, run the relevant gates locally:

```bash
# ── Typecheck ──
npm run typecheck

# ── Unit tests + coverage ──
npm run test:unit
npm run test:coverage

# ── Property-based fuzz testing ──
npm run test:fuzz

# ── Mutation testing for the module you touched ──
npm run test:mutation:security     # crypto / security modules
npm run test:mutation:storage      # storage layers

# ── End-to-end browser tests ──
npm run test:e2e

# ── Native Rust backend tests (if src-tauri changed) ──
cd src-tauri && cargo test && cd ..
```

Security-sensitive changes (crypto, storage, IPC, native messaging) additionally require the security mutation suites to stay within the configured score bands.

## Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short imperative summary>

Examples:
fix(cli): enforce Argon2id parameter floor
docs(security): document hardware-bound unlock coverage
chore(deps): refresh Rust lockfile
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `chore`.

## Pull Requests

- Keep PRs focused; one logical change per PR.
- CI runs typecheck, tests and CodeQL — all checks must pass before merge.
- Changes to ownership-sensitive paths are reviewed per [CODEOWNERS](.github/CODEOWNERS).

## Security Review Guidance

When touching anything related to:

- master password handling or key derivation (Argon2id),
- AEAD encryption (AES-256-GCM / XChaCha20),
- vault storage (SQLite/OPFS), IPC, or native messaging,
- release hardening and signing,

please explain the threat-model impact of your change in the PR description and reference the relevant section of `docs/THREAT_MODEL.md` / `docs/EXTERNAL_AUDIT_SCOPE.md`.

## Licensing

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
