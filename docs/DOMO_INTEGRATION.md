# Optional read-only Domo integration design

Status: **design and SDK types only**. Offline functionality has no authentication
dependency and no network transport is shipped. Verification date: 2026-10-19.

Official evidence:

- [Domo's API documentation source](https://github.com/DomoApps/domo-documentation-hub/blob/main/portal/API-Reference/overview.mdx)
  distinguishes App Framework APIs from Platform OAuth APIs and describes OAuth
  clients, scopes and access tokens.
- [Domo's maintained Python SDK DataSet client](https://github.com/domoinc/domo-python-sdk/blob/master/pydomo/datasets/DataSetClient.py)
  defines dataset metadata reads at `/v1/datasets/{datasetId}` and CSV exports at
  `/v1/datasets/{datasetId}/data`. This provides an official implementation reference
  for these reads; it does not prove historical value access or tenant permissions.
- [Official API Explorer](https://developer.beta.domo.com/explorer) describes
  client-credentials OAuth and the `data` scope for imports/exports. A scope permitting
  both read and write is not itself a read-only security boundary.
- [Official Domo CLI documentation](https://domo.com/docs/s/article/360043437733?language=en_US)
  documents exports and PDP behavior for its query/export workflow. We do not assume
  that all API clients or users receive identical rows.

The future connector will implement `DomoReadOnlySource`: `describeDataset` and
`exportCsv` only. It must have explicit user authorization, an injected token
provider, fixed allowlisted official HTTPS host, bounded streamed exports, validated
dataset identifiers, cancellation/timeouts, bounded retries for rate limiting,
and no token persistence or request-body logging. Redirects to other origins must
be rejected. No query execution, cookie extraction, permissions changes, restores,
dataset writes or arbitrary endpoint configuration belongs in this interface.

Capture context must include authenticated subject, dataset ID, completeness and
permission limitations. Unless access scope is independently established, record
completeness as unknown or filtered. Future metadata versioning must retain this
context rather than describing a live API export as an anonymous local import.

Before implementation is advertised: validate the current official export contract
against an authorized test tenant, check PDP/filtered versus complete captures,
validate file size/UTF-8/schema/integrity, mock HTTP contract tests and separately
opted-in tenant tests, and prove no production mutations are possible through the
implemented transport. No such tenant test has been run here.

Until then, import permitted CSV exports manually. Historical analysis is limited
to accessible captures or prior exports; DataFlow configuration history does not
establish historical dataset values. AI remains an optional future consumer of
sanitized evidence, never a dependency or source of authoritative findings.
