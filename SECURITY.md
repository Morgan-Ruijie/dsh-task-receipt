# Security and trust boundary

`dsh-task-receipt` is a local, read-only observer plugin. It has no network requests, subprocesses, file writes, environment reads, install scripts, or runtime dependencies. Its only Node import is `node:crypto`.

## Data minimization

- Event fields are read only long enough to classify a call; raw events, messages, commands, outputs, paths, and before/after content are not cached.
- The receipt renders fixed labels, allow-listed tool names, call references, event sequence numbers, counts, integer exit codes, and per-task file aliases.
- Unknown tool names become `other-tool`, so a custom tool name cannot leak a secret.
- Call ids and file paths are SHA-256 hashed in memory only for pairing; hashes are never rendered.
- One task retains at most 500 calls; overflow is reported as unknown. Session state is held in a `WeakMap` and released on `end`, `session/disposed`, or plugin unload.
- The plugin does not copy raw text into a redaction buffer. Disallowed text never enters the receipt.

## What the host can still see

The host and other installed plugins can already read the raw session. The receipt becomes a normal DSH tool result and may be persisted, routed to a configured model, or processed by telemetry. This plugin cannot make the host's raw session anonymous.

Sequence numbers, call counts, tool categories, exit codes, and file aliases are still behavioral metadata. Decide whether they are appropriate to share. Saving a receipt to a file is a separate caller action with its own permissions.

## Evidence limits

`tools/result` is the host's final observation point, not an independent operating-system proof. A malicious or incorrect tool can report a false exit code or fabricated before/after text; this plugin reports the tool's claim and cannot detect every forgery. There is no signature, trusted timestamp, hash chain, or remote witness.

Exit code 0 does not prove that tests ran, that none were skipped, that assertions are sufficient, or that the business result is correct. Command labels are hints only. Only structured shell termination states are used; text such as “passed” or a printed exit code is ignored. A background job handle is not a final process result.

File aliases are minted only for a `write` reported as `create`, or for `write`/`edit` whose before and after are both readable strings and differ. `update` with `before=null` stays unknown. An alias means a change was observed, not that it is the final net diff. Shell, apply_patch, unsupported tools, sub-sessions, and external edits remain unknown.

Continuous sequence numbers mean no gap was detected in this listener interval; they do not prove that everything outside the host was recorded. History before `begin`, during reloads, after a crash, or before a restored Session is not backfilled.

## Installation boundary

The package contains no dependency and no install hook. Review the tarball before installing. A DSH profile install modifies that profile's dependency manifest, lockfile, bundle list, and `node_modules`; use a disposable `DSH_HOME` when testing.

## Reporting a vulnerability

Do not open a public issue containing tokens, cookies, session logs, or user paths. Report privately to the maintainer with a minimal reproduction using synthetic data. Once a public repository is available, prefer its private security advisory channel. Include the affected version and DSH version, but never a live credential.
