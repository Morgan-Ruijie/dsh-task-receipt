# dsh-task-receipt

**Experimental / Preview.** A small, local-only DeepSeek Harness plugin that turns an explicitly bounded task into a short Markdown receipt of observed tool outcomes.

[中文说明](README.zh-CN.md) · [Acceptance](docs/ACCEPTANCE.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## What it is

Call `task_receipt` before a task, then ask for a snapshot or close it:

```json
{ "action": "begin" }
{ "action": "render" }
{ "action": "end" }
```

The receipt lists observed tool calls with a status and evidence reason:

- **succeeded** — the tool completed; for supported shells, a full foreground result with integer exit code 0;
- **failed** — a tool error, or a non-zero structured process exit;
- **unknown** — missing final result, background/promoted process, timeout/cancellation, missing call start, schema gap, or sandbox refusal.

It also separates file evidence:

| Canonical `write` / `edit` shape | Receipt claim |
|---|---|
| `write` + `operation="create"` + `before=null` | new file; **not** a content-change claim |
| `write` + `operation="update"` + string before/after | changed / unchanged |
| `write` + `operation="update"` + `before=null` | **unknown**; old text may be over the diff limit, binary, non-UTF-8 or unreadable |
| missing/unknown operation, missing path or after | **unknown** |
| no confirmed write/edit change | “not observed”; shell/apply_patch/sub-session changes remain unknown |

A receipt is **not** proof that tests actually ran, that assertions are sufficient, that the business result is correct, or that the record is tamper-evident. Exit code 0 only means the process ended normally. Agent self-report and text such as “passed” are not upgraded to evidence.

## Install

Requires **DeepSeek Harness 0.2.2-rc.1** and **Node.js >= 22.19**. Other DSH versions are untested; the plugin declares `engines.dsh = 0.2.2-rc.1`.

This preview is distributed as a GitHub Release `.tgz`; it is not published to npm. Download `dsh-task-receipt-0.1.2.tgz` from the Release page, or use a locally built tarball.

### Existing web profile

```sh
dsh plugin --profile web add /absolute/path/dsh-task-receipt-0.1.2.tgz
dsh --profile web --dump-config   # should contain a task-receipt node
```

Restart or reload the Web app, then call `task_receipt` from a session.

### Disposable test profile

A custom profile must first be created from the shipped **Web** template. Installing a plugin into a fresh custom profile only creates a base-backed profile, and a trailing `web` argument does not change the template.

```sh
export DSH_HOME=/absolute/path/to/disposable-dsh-home
export PNPM_HOME=/absolute/path/to/disposable-pnpm-home

dsh --version   # must be exactly 0.2.2-rc.1
dsh --profile receipt-test --from-default-profile web --dump-config
dsh plugin --profile receipt-test add /absolute/path/dsh-task-receipt-0.1.2.tgz
dsh --profile receipt-test --host 127.0.0.1 --port 0 --no-open
```

`--from-default-profile` **replaces** the named profile. Use it only for the first initialization, never after installing plugins. See [the isolated acceptance plan](docs/ISOLATED-PROFILE-PLAN.md) for the full procedure.

### Uninstall

```sh
dsh plugin --profile web remove dsh-task-receipt
```

Check that `dsh.profile.bundles` no longer contains `dsh-task-receipt`; the plugin manager removes it on 0.2.2-rc.1. Restart/reload and confirm `task_receipt` is gone.

## Usage

Start a task:

```text
Call task_receipt(action="begin"), then do the work.
At the end call task_receipt(action="end") and show the Markdown receipt.
```

`begin` and `end` may span turns. One live Session has at most one active task; a second `begin` is refused rather than overwriting the first. Work done before `begin` is not backfilled. `render` is a snapshot; `end` returns the receipt and releases the task state.

The tool is registered through `ctx.tools.register`. Whether a model chooses to call it is model behavior, not guaranteed by the plugin.

## Evidence and privacy

- Only selected fields are retained: allow-listed tool names, fixed labels, counts, session event `seq`, integer exit codes, and per-task file aliases (`F1`, `F2`, …).
- Raw commands, arguments, outputs, error messages, file contents, absolute paths, and Session IDs are not copied into the receipt.
- File paths and call ids are hashed in memory only for pairing; hashes are not rendered.
- The plugin performs no network requests, starts no subprocesses, writes no files, and has no runtime dependencies or install scripts.
- The returned receipt still becomes a normal DSH tool result: the host's existing persistence, model routing, or telemetry may process it. The plugin cannot make the host's raw session anonymous.
- At most 500 calls are retained per task; overflow is reported as unknown rather than silently claiming completeness.

See [SECURITY.md](SECURITY.md) for the full trust boundary.

## Compatibility and verification

- Verified against **DSH 0.2.2-rc.1**, Cordis 4.1.0, Node 26.3.1 on Windows.
- Unit tests: **20/20** on Node 26.3.1; the independent reviewer also ran 20/20 on Node 22.16.0/Linux.
- Real `dsh-tool-fs` + `dsh-fs-local` canonical tests cover create, update-same, update-different, edit, and an over-limit update that must stay unknown.
- Isolated 0.2.2-rc.1 profile acceptance: install, Web cold start (`127.0.0.1`, HTTP 200), host-side `task_receipt` registration and `begin/end` calls, uninstall, and repeated install/uninstall passed.
- **Agent autonomy — whether a model chooses this tool without being asked — has not been tested.**

Details: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md), [docs/AUDIT-FIX.md](docs/AUDIT-FIX.md), [docs/RESEARCH.md](docs/RESEARCH.md).

## Development

No dependencies are required for the unit tests:

```sh
npm test                  # default, multi-process Node test runner
npm run test:sandbox      # single process, for Windows DSH sandbox
npm run test:host -- /path/to/unpacked-dsh-runtime
npm run test:real-fs -- /path/to/unpacked-dsh-runtime /tmp/receipt-fixture /tmp/receipt-out
```

`test:host` composes the plugin with a real Cordis/Session/native tool pipeline. `test:real-fs` mounts the real file tools and checks canonical write/edit evidence. Neither installs a profile or calls a model.

## Status

- **Experimental / Preview**, version 0.1.2.
- Core plugin logic (`src/`) is unchanged from accepted v0.1.1; 0.1.2 updates documentation, packaging, and CI.
- No UI, no network, no signature/attestation, no full working-tree tracking, no cross-subagent aggregation.
- If you only need to inspect a session, use DSH Trajectory or existing session-audit plugins. This project is intentionally narrower.

## License

MIT. See [LICENSE](LICENSE).
