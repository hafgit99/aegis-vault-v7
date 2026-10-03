# Why `security:dependencies` audits production dependencies only

`npm run security:dependencies` runs `npm audit --audit-level=high --omit=dev`.
That flag is a decision, and this is the reasoning behind it.

## The chain

`npm audit` without `--omit=dev` reports six high-severity findings on this tree,
all from one chain:

```
@cyclonedx/cyclonedx-npm
  └─ @cyclonedx/cyclonedx-library
       └─ libxmljs2
            └─ node-gyp
                 └─ make-fetch-happen
                      └─ http-cache-semantics   ← GHSA-ch52-4w7c-c8xp
```

The advisory is *max-stale handling can disclose cross-user cached responses*.

## It cannot be cleared

`http-cache-semantics` has no patched release. 4.2.0 is the latest version
published under any tag, the advisory's vulnerable range is `<= 4.2.0`, and
`first_patched_version` is `null`. Pinning it in `overrides` was tried and
changed nothing, because `package-lock.json` already resolves 4.2.0 — the
installed version *is* the newest one that exists.

The other five findings are `effects`, not separate problems: npm reports a
package as vulnerable when a dependency it pulls is. Upgrading
`@cyclonedx/cyclonedx-npm` or `libxmljs2` does not help either — the current
`libxmljs2` still depends on `node-gyp@^11`.

## None of it reaches a user

The chain is the native XML parser behind a build-time SBOM generator. It runs
while `scripts/generate-npm-sbom.cjs` produces an audit package on a
maintainer's machine. It is not in the desktop bundle, not in the Android
build, and not in the browser extension. `npm audit --audit-level=high
--omit=dev` — production only — reports zero findings.

## Why a permanently red gate is worse than a scoped one

A gate that cannot pass is a gate nobody reads. The failure mode is familiar:
it goes red, everyone learns to ignore the job, and the day it catches something
real nobody looks either. The same reasoning already applies in
`.github/workflows/ci.yml`, where `check-placeholders` is deliberately absent
with a note rather than failing on a known, documented state.

## What still covers the dev side

Nothing here is abandoned:

- **gitleaks** scans the full 988-commit history, not a range.
- **The release pipeline** installs dev dependencies explicitly and runs
  `cargo deny` alongside the npm audit.
- **`scripts/security-release-hardening.cjs`** gates what actually ships.
- **`security:asset-integrity`** covers the bundled asset manifest.

The guarantee is narrower and stated precisely: *no vulnerable package in this
tree can reach a user's hands through a build*. If a production advisory
appears, this gate fails — which is the entire point of it.

## Seeing the full picture

```
npm audit --audit-level=high              # production + dev
npm audit --audit-level=high --omit=dev   # what CI enforces
```

Until upstream publishes a fix for GHSA-ch52-4w7c-c8xp, expect the chain above
in the first. When one lands, the `--omit=dev` can come off and this file can
go with it.