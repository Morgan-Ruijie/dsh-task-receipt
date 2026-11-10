# Contributing

Thanks for considering a contribution. This project is deliberately small; correctness and evidence quality matter more than feature count.

## Before you start

- Supported target: **DSH 0.2.2-rc.1**, Node.js **>=22.19**.
- Read [SECURITY.md](SECURITY.md) and [docs/AUDIT-FIX.md](docs/AUDIT-FIX.md).
- For a behavior change, open an issue describing the evidence the receipt should show and the case where it must stay **unknown**.

## Ground rules

- Never upgrade an unverified state to success or changed. “Unknown” is a valid outcome.
- Do not add network calls, telemetry, subprocesses, file writes, or install hooks without an explicit design discussion.
- Do not copy raw commands, arguments, outputs, paths, file contents, Session IDs, cookies, or credentials into a receipt.
- Keep the core `src/` logic free of DSH-internal imports; the plugin is loaded as a plain ESM package.
- Do not add a UI or broaden version claims without acceptance evidence.

## Tests

```sh
npm test
npm run test:sandbox      # Windows DSH sandbox
node --test --test-isolation=none test/receipt.test.js
```

For host/file-tool checks, pass an unpacked DSH 0.2.2-rc.1 runtime:

```sh
npm run test:host -- /path/to/unpacked-dsh-runtime
npm run test:real-fs -- /path/to/unpacked-dsh-runtime /tmp/receipt-fixture /tmp/receipt-out
```

## Pull requests

- Keep changes focused; explain the evidence semantics before the code.
- Add or update a regression test for every behavior change.
- Run `npm test` and `npm pack --dry-run`.
- Do not include generated tarballs, local profiles, caches, logs, credentials, or absolute user paths.
- By contributing, you agree your work is licensed under the MIT License.
