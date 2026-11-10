# Changelog

## 0.1.2 — 2026-11-10

Documentation and release preparation only. Core plugin logic is unchanged from v0.1.1.

- Fix the isolated-profile instructions: initialize a custom profile from the shipped Web template with `--from-default-profile web` **before** installing; a trailing `web` does not switch templates.
- Reflect the completed DSH 0.2.2-rc.1 isolated acceptance: install, Web cold start, host-side registration and `begin`/`end`, uninstall, and repeated install/uninstall.
- Add English and Chinese READMEs, contributing guide, security boundary, release notes, `.gitignore`, and a minimal GitHub Actions test workflow.
- Make host/file-tool test scripts require explicit runtime and fixture paths.
- State clearly that agent autonomy (whether a model chooses the tool unprompted) is untested.

## 0.1.1 — 2026-11-10

- Fix P1: `write` with `operation="update"` and `before=null` is no longer reported as a content change. It is `unknown`, because the old text may exceed the diff basis, be binary, be non-UTF-8, or be unreadable.
- Distinguish `created`, `changed`, `unchanged`, and `unknown` file evidence; unknown evidence mints no `F` alias.
- Add regression coverage for create/update/unknown/malformed canonical results, and real `dsh-tool-fs` + `dsh-fs-local` checks.
- 20/20 unit tests; real host and file-tool checks; isolated profile acceptance in 0.1.1.

## 0.1.0 — 2026-11-07

- Initial experimental release: explicit `begin` / `render` / `end`, observed tool outcomes, Markdown receipt, privacy-minimal output.
