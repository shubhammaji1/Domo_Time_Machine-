# Contributing

Use Node 22.13+ and npm. This is one package, not a workspace/monorepo. Run
`npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`,
`npm run build`, `npm run demo`, and `npm run test:package`.

Keep CLI parsing separate from public SDK APIs. No SDK module may call process.exit,
start a server or perform network requests on import. Reading package metadata for
the SDK version is permitted. Add meaningful fixtures and
independent expected results for every advertised capability. Preserve the versioned
canonicalization and replay semantics; document incompatible changes.

Prefer decimal strings for financial values. Test totals and preservation of
legitimate records. Never add speculative Domo endpoints, implicit authentication,
production mutations, automatic data uploads or arbitrary SQL execution. Optional
AI must remain outside the core processing dependency path.

Use the src/ domain directories and tests/unit, integration, security and fixtures.
CI uses synthetic data without live credentials. No publication without explicit
owner authorization after completing the recorded release gates.
Run `npm run test:e2e` against the candidate package before release. The separate
`npm run test:e2e:published` checks the registry's latest version and does not
publish or modify it. Keep published-release failures distinct from fixed local
candidate results. Public releases are immutable; fixes require a new version.

Keep generated work under `.artifacts` using `scripts/artifacts.mjs`; tests use
the shared `tmp` directory and must remove their own work. `npm pack` and package
smoke tests place archives in `.artifacts/packages`. Demonstrations intentionally
retain useful reports under `.artifacts/demos`. `npm run clean` removes only build,
temporary and archive outputs, preserving saved evidence and dependency caches.
Registry E2E consumers use OS temporary directories outside the source tree to
prevent ancestor dependencies from hiding packaging defects. Extended QA evidence
and coverage are retained under `qa-report/evidence`; synthetic failed consumers
are preserved for diagnosis. Run `npm run test:coverage` and `npm run qa:audit`
to reproduce the extended audit. The latter downloads the latest published package
and never publishes or requires Domo credentials.
