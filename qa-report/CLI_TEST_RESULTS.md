# CLI command and option verification

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

| Command surface    | Actual supported options                                         |
| ------------------ | ---------------------------------------------------------------- |
| Global             | --workspace, --format json/text, --help, --version               |
| capture            | --name, --dataset, --key, --completeness, --dry-run              |
| diff               | --key, --after-key, --fail-on-change, --out                      |
| investigate        | --key, --metric, --metrics, --currency, --currency-column, --out |
| replay             | --out                                                            |
| capsule create     | --out, --reviewed, --synthetic                                   |
| capsule regression | --out                                                            |
| schema history     | --dataset                                                        |
| validate           | --column, --currency, --currency-column, --expected, --tolerance |

Help was invoked for root, init, capture, snapshots/list/inspect, diff, investigate, replay, capsule/create/inspect/replay/regression, doctor, schema/history/compare and validate. Positive installed workflows cover each leaf command. Remaining-option audit covers mapped key flags, dry-run, completeness rejection, metrics-file loading and diff/investigation/replay output. Financial tolerance/currency cases are also checked through the SDK; not every cross-product of CLI options is separately exercised.

Exit 0 succeeds; exit 1 is a financial/assertion/diff/doctor gate; exit 2 reports malformed inputs/configuration, missing files and unknown commands/options. Negative paths assert nonempty stderr and empty stdout. JSON stdout parses, text reports render, report collisions and duplicate capture names preserve prior bytes. --json/--verbose/--quiet are not supported; tests do not advertise them. --dry-run is a stat/size preview, not full data/config validation.

Actual commands, help output and error text: [commands-v22.22.0.json](evidence/commands-v22.22.0.json). CLI workflows under networking denial use a Node preload guard, not an OS network firewall. Actual npx invocation is included in the independent install check. POSIX shell/bin execution still needs the remote matrix.
