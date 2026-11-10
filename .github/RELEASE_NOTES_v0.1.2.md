# dsh-task-receipt v0.1.2 — Experimental Preview

This is the first public, GitHub-ready preview of `dsh-task-receipt`: a small, local-only DeepSeek Harness plugin that produces a Markdown receipt for an explicitly bounded task.

**Status: Experimental / Preview. Not published to npm. Not a correctness or tamper-evidence guarantee.**

## What changed

- Documentation and release packaging only. The core plugin logic is unchanged from accepted v0.1.1.
- Corrected the isolated-profile instructions: initialize a custom profile from the shipped **Web** template with `--from-default-profile web` **before** installing. A trailing `web` argument does not switch templates.
- Added English and Chinese READMEs, acceptance record, audit-fix explanation, isolated-profile plan, contributing guide, security boundary, changelog, `.gitignore`, and a minimal GitHub Actions workflow.
- Host/file-tool test scripts now require explicit runtime and fixture paths.
- Clearly marks **agent autonomy as untested**.

## Install

Requires DSH **0.2.2-rc.1** and Node.js **>= 22.19**.

```sh
dsh plugin --profile web add /absolute/path/dsh-task-receipt-0.1.2.tgz
dsh --profile web --dump-config
```

Restart/reload the Web app, then call `task_receipt` with `begin` / `render` / `end`. For a disposable profile, see `docs/ISOLATED-PROFILE-PLAN.md`; initialize with `--from-default-profile web` exactly once, before installation.

Uninstall:

```sh
dsh plugin --profile web remove dsh-task-receipt
```

## Verification

- 20/20 unit tests; independent review also ran 20/20 on Node 22.16.0/Linux.
- Real `dsh-tool-fs` + `dsh-fs-local` canonical checks: create, update-same, update-different, edit, and an over-limit update that stays **unknown**.
- Isolated DSH 0.2.2-rc.1 profile: install, Web cold start (`127.0.0.1`, HTTP 200), host-side `task_receipt` registration and `begin`/`end`, uninstall, repeated install/uninstall.
- Real user DSH home and Desktop profile were not modified.

Not verified: whether a model chooses this tool unprompted; other DSH versions/platforms; production file-system DACL behavior; full working-tree change tracking.

## Evidence limits

A receipt records observed tool outcomes, not business correctness. Exit code 0 only means normal process termination. `update + before=null` is **unknown**, not “changed”. Command labels are lexical hints. Background jobs remain unknown. Shell/apply_patch/sub-session/external edits are not tracked. The receipt is not signed or tamper-evident.

## Assets

- `dsh-task-receipt-0.1.2.tgz`
- SHA-256: `cf2e35b41b853279a879ded3c40d5397b4caef021a015bdcbe29db9b168d832a`

## License

MIT.
