# Acceptance record

This page summarizes evidence for the public preview. It is not a certification.

## Versions verified

| Item | Value |
|---|---|
| Plugin | 0.1.1 package (core logic carried unchanged into 0.1.2) |
| DSH | 0.2.2-rc.1 |
| Cordis | 4.1.0 |
| Node | 26.3.1 on Windows; reviewer also ran 20/20 on Node 22.16.0 / Linux |
| Install acceptance | Isolated `DSH_HOME` on Windows, 2026-11-10 |

`src/index.js` SHA-256 `1c7a1846e33406c120c2c8951186397e5a780d9fd2baaa0427f6bb066ca1ec94` and `src/receipt.js` SHA-256 `969b22e3fe6ddf20298f438da009e2314a8948550ec4c030e884e10cac580ad9` are unchanged between accepted 0.1.1 and this 0.1.2 release.

## Unit and real-tool tests

- **20/20 unit tests**, no skips. Covers normal task, non-zero exit, no test execution, no file change, missing events, sensitive sentinel, task isolation, and the file-evidence matrix.
- **Real `dsh-tool-fs` + `dsh-fs-local`**: create, update with same text, update with different text, edit, and an over-limit update (`before=null`). The last must remain **unknown** and mint no file alias.
- Host smoke: real Cordis, Session events, native tool pipeline, actual Node child exit 0 and exit 7, plugin unload removes the tool.

The real file-tool test replaces the Windows DACL-copy and atomic-replace primitives because the DSH sandbox rejects `SetFileSecurityW`/`ReplaceFileW`. Path resolution, reads, diff-basis size checks, edit matching, and canonical operation/before/after remain the real backend. This is not a full production filesystem acceptance.

## Isolated profile acceptance (0.2.2-rc.1)

A local launcher of exactly 0.2.2-rc.1 was installed under a disposable directory. PATH's older `dsh` (0.2.1-rc.5) was not used. `DSH_HOME` and `PNPM_HOME` were disposable directories; the Web app bound `127.0.0.1` with `--port 0 --no-open`.

Results:

1. **Initialization** — `--from-default-profile web --dump-config` produced bundles `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`, no plugin node.
2. **Install** — `dsh plugin --profile receipt-accept add <tgz>` exit 0; version 0.1.1; the manager automatically added `dsh-task-receipt` to the profile bundles; `--dump-config` contained a `task-receipt` node.
3. **Cold start** — launch URL announced; authenticated root answered 303 + cookie, then HTTP 200 HTML; process stopped and port closed.
4. **Host loaded** — a temporary `--patch` probe waited for `loader.await()` and observed `ctx.tools.get('task_receipt')` present.
5. **Tool callable in host** — the probe used the real `ctx.tools.execute` to call `begin` and `end`; both succeeded and the returned Markdown had the expected header.
6. **Uninstall** — dependency, bundle entry, and `node_modules/dsh-task-receipt` disappeared; Web restarted with 200; probe observed no `task_receipt`.
7. **Repeat install/uninstall** — no duplicate bundle; two uninstall results had identical profile manifest and lockfile hashes.

Real `~/.dsh` was not used: critical settings, desktop profile manifest, lockfile, and profile tree hashes were identical before and after. The full home aggregate changed because the active Desktop session continued writing logs externally.

## What is not verified

- **Agent autonomy**: whether a model chooses `task_receipt` without an explicit instruction is **not tested**.
- The preview was not installed into the user's daily Desktop profile.
- Only DSH 0.2.2-rc.1 is claimed; other versions are untested.
- No signature, trusted timestamp, hash chain, or tamper-evidence.
- No full working-tree tracking; shell/apply_patch/sub-session/external edits remain unknown.
- Background jobs remain unknown; a later `job_output` success does not upgrade the original process.
- v0.1.2 changes documentation, packaging, and CI only; it was not re-installed as a separate profile acceptance run. Its `src/` hashes match accepted v0.1.1.

## Reproduce

```sh
npm test
npm run test:host -- /path/to/unpacked-dsh-runtime
npm run test:real-fs -- /path/to/unpacked-dsh-runtime /tmp/receipt-fixture /tmp/receipt-out
```

See [AUDIT-FIX.md](AUDIT-FIX.md) for the file-evidence fix and [ISOLATED-PROFILE-PLAN.md](ISOLATED-PROFILE-PLAN.md) for the install procedure.
