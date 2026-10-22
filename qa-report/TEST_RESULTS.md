# Results and measured coverage

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

| Suite / artifact           | Passed | Failed | Evidence                                  |
| -------------------------- | ------ | ------ | ----------------------------------------- |
| Source Vitest (49 cases)   | 49     | 0      | evidence/vitest.json                      |
| Published v22.13.0         | 20     | 0      | evidence/user-e2e-published-v22.13.0.json |
| Published v22.22.0         | 20     | 0      | evidence/user-e2e-published-v22.22.0.json |
| Published v24.22.0         | 20     | 0      | evidence/user-e2e-published-v24.22.0.json |
| Local tarball Node 22.22.0 | 20     | 0      | evidence/user-e2e-local-v22.22.0.json     |
| Extended independent audit | 11     | 2      | evidence/audit-v22.22.0.json              |
| Total check cases/groups   | 140    | 2      | evidence/summary.json                     |

These counts do not double-count individual CLI calls, the 100 fast-check property iterations or 12 benchmark samples. No automated case was marked skipped in Vitest; blocked/skipped/unverified planned groups are enumerated separately below.

| Validation group | Status     | Reason                                                                                                             |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| B-DOMO           | BLOCKED    | REAL DOMO VALIDATION NOT PERFORMED; no implemented transport or authorized tenant.                                 |
| B-LINUX          | BLOCKED    | Linux execution environment unavailable; CI definition is not a completed run.                                     |
| B-MAC            | BLOCKED    | macOS execution environment unavailable.                                                                           |
| S-NODE20         | SKIPPED    | Outside package engines >=22.13.0.                                                                                 |
| S-1M             | SKIPPED    | 1,000,000 rows exceed the explicit 100,000-row limit.                                                              |
| S-WRITES         | SKIPPED    | Production rollback/restore writes are unsupported and prohibited.                                                 |
| S-AI             | SKIPPED    | Optional AI is future scope, not a core dependency.                                                                |
| U-CI             | UNVERIFIED | New GitHub Actions jobs were not run remotely.                                                                     |
| U-PROVENANCE     | UNVERIFIED | Registry signatures exist; signature/provenance cryptographic verification not performed; repository field absent. |
| U-POWER          | UNVERIFIED | No physical power-loss, OS full disk, ACL denial or hostile local race testing; ENOSPC was injected before rename. |
| U-LOAD           | UNVERIFIED | No sustained soak, million-file history, OS cold-cache or isolated peak-memory benchmark.                          |
| U-INDEPENDENT    | UNVERIFIED | Security review was sequential; no independent second reviewer or exhaustive dependency-source audit.              |

| Source coverage      | Statements | Branches | Functions | Lines  |
| -------------------- | ---------- | -------- | --------- | ------ |
| TOTAL                | 82.53%     | 75.11%   | 81.02%    | 83.2%  |
| capsules\index.ts    | 75.75%     | 40%      | 72.72%    | 75%    |
| cli\index.ts         | 0%         | 0%       | 0%        | 0%     |
| cli\reporters.ts     | 80%        | 66.66%   | 83.33%    | 87.5%  |
| core\model.ts        | 100%       | 96.29%   | 100%      | 100%   |
| diff\index.ts        | 98.68%     | 95.23%   | 100%      | 98.61% |
| metrics\financial.ts | 100%       | 100%     | 100%      | 100%   |
| metrics\index.ts     | 98.52%     | 93.65%   | 100%      | 100%   |
| replay\index.ts      | 95.4%      | 76.41%   | 100%      | 95.09% |
| storage\workspace.ts | 97.29%     | 84.84%   | 100%      | 98.13% |

Coverage includes source modules; CLI execution in spawned tsx processes is not merged into the parent Vitest V8 measurement. Do not describe 0% measured CLI coverage as absent CLI execution, or black-box CLI execution as instrumented branch coverage. Core/diff/metrics exceed 90% branches individually, while replay/storage/capsules do not. Review [HTML coverage](evidence/coverage/index.html) and [raw summary](evidence/coverage/coverage-summary.json).

Quality gate command logs are retained separately and are not additional unit cases: [quality-gates.json](evidence/quality-gates.json).

| Gate             | Exit status |
| ---------------- | ----------- |
| typecheck        | 0           |
| lint             | 0           |
| format           | 0           |
| build            | 0           |
| audit-production | 0           |
| audit-all        | 0           |
| dependency-tree  | 0           |
| published-e2e    | 0           |
| package-smoke    | 0           |
| local-e2e        | 0           |

Initial audit-harness lint errors and Node-24 inherited npm selector errors were corrected and rerun; they are harness defects, not published runtime defects.
