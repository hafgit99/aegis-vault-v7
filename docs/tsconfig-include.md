# Why tsconfig.json lists an explicit `include`

`tsconfig.json` has to stay strict JSON. Vite's oxc transform reads it with a
parser that rejects comments, and when it cannot, every test fails on the spot
with `TSCONFIG_ERROR ... key must be a string`. So the reasoning lives here.

There was no `include` before, and tsc fell back to "every `.ts`, `.tsx`, `.js`
and `.cjs` under the repository root". With `allowJs: true` that swept in the
marketing site's build scripts, the release scripts and the stryker configs. Two
things followed:

- `npm run typecheck` took minutes and had nothing to say about any of them,
  because those files are CommonJS run by Node and never had types to check.
- `kalderashield-website/scripts/audit-contrast.cjs` crashed the compiler
  outright — `Error: Debug Failure. No error for last overload signature`, inside
  `checkArrayLiteral -> checkCallExpression -> resolveCall`. It is a TypeScript
  5.8.3 bug reached through the `Array.prototype.sort` overloads, and because it
  is a crash rather than a diagnostic, the CI typecheck job failed on every run
  with no file, line or message naming a cause.

The site's scripts are still linted (`eslint` covers `scripts/**/*.cjs`) and
still gated by their own audits in the website job. They are simply not
TypeScript's business, and keeping them out of the program is also what makes the
gate usable again: a real type error in `src/` is now the only thing it can
report.