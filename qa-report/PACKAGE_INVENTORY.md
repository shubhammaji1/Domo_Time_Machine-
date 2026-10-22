# Package inventory and actual capabilities

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

Registry metadata: [registry.json](evidence/registry.json). Integrity: sha512-KzDtHixaKp1BdkGnHld4m/IZoNbkNlUnZMCZtnHGpaW09oKYx1szMUzR8n4v4c746qJjKOaE1IZscad7eMkoOw==. Latest tag 0.1.1; engines >=22.13.0; MIT; five runtime dependencies; no declared peer dependencies, workspaces or optional runtime dependencies. Repository/homepage metadata is absent. Registry signature presence does not prove verified provenance.

Bin: domo-time-machine → dist/cli/index.js. Root ESM export has import and types conditions; direct require is not advertised. No subpath/browser export. Runtime import reads package version metadata, creates no workspace and makes no network request. No install/postinstall lifecycle hooks; source build/prepack/prepublish gates are development/release scripts, not consumer install hooks.

| Feature                                | Advertised            | Implemented             | Exported                     | Testable / status                        |
| -------------------------------------- | --------------------- | ----------------------- | ---------------------------- | ---------------------------------------- |
| CSV / JSON / NDJSON capture            | Yes                   | Yes                     | Workspace.capture            | PASS; exact types and originals          |
| Immutable retrieval / metadata history | Yes                   | Yes                     | Workspace.get/list/doctor    | PASS with documented limits              |
| Typed/multiset dataset diff            | Yes                   | Yes                     | compare                      | PASS; duplicate ambiguity explicit       |
| Schema comparison/history              | Yes                   | Yes                     | compareSchemas/schemaHistory | PASS                                     |
| Financial validation                   | Yes                   | Yes                     | validateFinancial/metric     | PASS; decimal strings and currency gates |
| Replay and what-if scenarios           | Experimental          | Allowlisted DSL         | replay/scenarioSchema        | PASS for tested DSL; no native Magic ETL |
| Investigation                          | Experimental          | Evidence and hypotheses | investigate                  | PASS; no causal proof claim              |
| Incident capsules                      | Experimental          | Reviewed plain JSON     | capsule APIs                 | PASS; no automatic anonymization         |
| Domo connector                         | Design/types only     | No transport            | Types only                   | NOT IMPLEMENTED; live BLOCKED            |
| Production restore, retention deletion | No                    | No API                  | No                           | Unsupported                              |
| AI investigation                       | Future optional       | No                      | No                           | Not applicable                           |
| UI/server/database                     | Explicitly prohibited | None required           | No                           | Architecture compliant                   |

All 32 runtime exports are enumerated in [audit JSON](evidence/audit-v22.22.0.json). Utility/schema exports are supporting APIs; installed workflows exercise the documented evaluation surface rather than claiming every possible argument combination. Declarations ship with JS, README, LICENSE, docs and fixtures; no source maps, caches, secrets files, QA output, databases or original captured customer files are included. See [artifact comparison](evidence/artifact-comparison.json).
