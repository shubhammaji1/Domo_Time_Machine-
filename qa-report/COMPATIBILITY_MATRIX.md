# Executed compatibility versus planned CI

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

| Package                 | OS          | Node     | Status                         | Evidence                                  |
| ----------------------- | ----------- | -------- | ------------------------------ | ----------------------------------------- |
| domo-time-machine@0.1.1 | Windows x64 | v22.13.0 | 20 passed / 0 failed           | evidence/user-e2e-published-v22.13.0.json |
| domo-time-machine@0.1.1 | Windows x64 | v22.22.0 | 20 passed / 0 failed           | evidence/user-e2e-published-v22.22.0.json |
| domo-time-machine@0.1.1 | Windows x64 | v24.22.0 | 20 passed / 0 failed           | evidence/user-e2e-published-v24.22.0.json |
| domo-time-machine@0.1.1 | Windows x64 | v22.22.0 | 20 passed / 0 failed           | evidence/user-e2e-local-v22.22.0.json     |
| Source tests / V8       | Windows x64 | 22.22.0  | 49 pass                        | evidence/vitest.json                      |
| Current package         | Linux       | 22 / 24  | BLOCKED locally; CI configured | No executed remote evidence               |
| Current package         | macOS       | 22 / 24  | BLOCKED locally; CI configured | No executed remote evidence               |
| Any                     | Any         | 20       | SKIPPED; outside engines       | No compatibility claim                    |

ESM and NodeNext TS supported; CJS dynamic import tested. Browser bundling and direct require are not advertised. Local NTFS is exercised; network shares, unusual filesystems, POSIX permission enforcement and other architectures are unverified. Tarballs carry CLI mode 0644 and a valid LF shebang. npm's inspected bin-links implementation chmods linked POSIX bins, so the archive mode alone is not evidence of a broken npm installation; actual Linux/macOS npx verification still needs CI.

The initial Node-24 harness inherited npm_config_package=node@24 from npm exec, causing a nested npm invocation to resolve node from a cold cache. Removing that test-runner selector from consumer environments produced a clean 20/20 rerun. This was a harness isolation failure, not a user package regression.
