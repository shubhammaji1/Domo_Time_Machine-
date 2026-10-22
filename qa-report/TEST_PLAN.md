# Executed plan, boundaries and reproduction

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

1. Query current npm metadata, dry-run/pack the registry release, verify integrity and inspect the actual tarball.
2. Create an OS temporary consumer outside the source tree. Install default/latest, exact version and downloaded tarball; uninstall/reinstall; invoke npm exec and actual npx.
3. Execute CLI help/error/option checks, strict installed TypeScript, JavaScript ESM and CJS dynamic import; block standard Node networking entry points during dataset workflows.
4. Verify a five-version oracle, captured-time ties (source test with Date-only fake clock), out-of-order UTC source timestamps, schema/type changes, exact original bytes and row-order semantics.
5. Use independent writers/readers; pause a writer before rename and kill it; inject ENOSPC at commit and a UUID collision; verify doctor/recovery and unrelated UUID reads after corruption.
6. Run safe malicious-input fixtures and advisory audits; trace source controls with the security-scan workflow. No real credentials, Domo tenant writes or undocumented endpoints.
7. Measure three repetitions at 100/1,000/10,000/100,000 rows. Instrument source coverage; compare published/current build/local tarball; add non-publishing CI evidence collection.

Reproduce from a source checkout: npm ci; npm run test:coverage; npm run qa:checks; npm run qa:audit; npm run qa:artifacts; npm run qa:report. Registry checks need network for npm installation/audit; core dataset operations remain offline. qa:audit deliberately returns nonzero while the published README probes fail. Do not weaken those probes to hide failures.

Tests use synthetic data only. Fault preload is test-only and explicit, not a production environment variable API. It intercepts the local commit operation; it does not simulate real hardware failure. Failed consumers remain at the path recorded in audit evidence. Test command outputs contain no authorization headers or credentials. No package publication is part of this plan.
