# Security and privacy

Offline by default: SDK/CLI core starts no server, makes no network calls, and
requires no database, cloud service or Domo credentials. There are no production
writes, arbitrary SQL, imported executable code, telemetry or automatic uploads.
Dependency installation and explicitly invoked npm audit require registry access.

The store uses immutable, integrity-checked files, exclusive name locks and an
atomic directory commit. Import bounds: 64 MiB input, 128 MiB normalized evidence,
100,000 rows and 256 columns. Invalid UTF-8, unsafe JSON integers, reserved object
keys, nested cells, duplicate CSV headers and unsupported formats fail. Readers
reject symlink snapshot directories/evidence files and invalid UUID metadata.
Root directories and ancestors must be trusted; hostile local-user replacement
and OS-level filesystem races are outside this package's security boundary.

Replay definitions are validated against a strict allowlist with bounded rows,
steps and cooperative time/cancellation checks. They cannot specify SQL, files,
extensions or network calls. These checks are not an OS resource sandbox.
Financial validation fails rather than approving a partial sum when values or
currency data are invalid. Investigations distinguish observations from hypotheses.

Capsules are plain JSON with checksums and no archive extraction or bundled code
execution. Export previews all referenced rows and requires deliberate `--reviewed`.
There is no automatic anonymization or minimization. Prefer synthetic reproduction
data; unique identifiers and combinations of fields may permit re-identification.
Generated regression code is a separate export for explicit review and execution.

No encryption, signatures or authenticated provenance are claimed. File permission
hints are subject to OS/Windows ACL policy. Stop writers before backing up or
retiring an entire workspace. Retention has no individual snapshot deletion API;
use OS tools for whole-workspace retention. SSD/backups/filesystem snapshots prevent
any universal secure-deletion guarantee. Doctor reports stale locks and temporary
directories without automatically deleting them.

No automatic npm publishing workflow exists. Review the tarball, advisory audit,
test results, supported platforms and package-name ownership, then obtain explicit
publication authorization. See docs/DEVELOPMENT_REPORT.md for actual verification.
Avoid public issues containing credentials, real datasets or sensitive capsules.
