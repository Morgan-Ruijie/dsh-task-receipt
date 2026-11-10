# Isolated profile acceptance plan

Verified against DSH **0.2.2-rc.1**. The order below is important: a custom profile must be created from the shipped **Web** template before the plugin is installed.

## Why the order matters

- On first use, `dsh plugin --profile <custom> add …` initializes a **base-backed** profile from `DEFAULT_PROFILE_BUNDLES`; it does not copy the Web template.
- `dsh --profile <custom> web` treats `web` as an application argument; it does not change the profile template.
- `--from-default-profile web` replaces the named profile with a fresh Web template. Run it only during first initialization.
- `--dump-config` calls the same profile preparation first, so it can initialize the template without starting the Web app.

## 1. Prepare a disposable home

```sh
export DSH_HOME=/absolute/path/to/disposable-dsh-home
export PNPM_HOME=/absolute/path/to/disposable-pnpm-home
export DSH_TELEMETRY_DISABLED=1

dsh --version
```

`dsh --version` must be exactly `0.2.2-rc.1`; do not use an older PATH CLI for this profile.

## 2. Initialize the Web template once

```sh
mkdir -p /absolute/path/to/empty-work
cd /absolute/path/to/empty-work
dsh --profile receipt-accept --from-default-profile web --dump-config > init.txt
```

Expected profile files:

```text
$DSH_HOME/profiles/receipt-accept/package.json
$DSH_HOME/profiles/receipt-accept/cordis.patch.yml
$DSH_HOME/profiles/receipt-accept/pnpm-workspace.yaml
$DSH_HOME/profiles/receipt-accept/cordis.yml
```

Expected `package.json`:

```json
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
```

No `task-receipt` node yet.

## 3. Install the plugin

```sh
dsh plugin --profile receipt-accept add /absolute/path/dsh-task-receipt-0.1.2.tgz
dsh --profile receipt-accept --dump-config > installed.txt
```

On 0.2.2-rc.1 the plugin manager adds `dsh-task-receipt` to `dsh.profile.bundles` automatically. Verify:

- dependency `dsh-task-receipt` is present;
- `node_modules/dsh-task-receipt/package.json` reports 0.1.2;
- `dsh.profile.bundles` contains `dsh-task-receipt`;
- `installed.txt` contains a `task-receipt` node.

If the bundle entry is missing, add it manually to the disposable profile's `dsh.profile.bundles` and dump again. Do not run `--from-default-profile` again.

## 4. Cold start

```sh
dsh --profile receipt-accept --host 127.0.0.1 --port 0 --no-open
```

The app prints an authenticated URL. A browser or HTTP client receives `303` with `Set-Cookie`, then the root returns `200` HTML when the cookie is sent. `--port 0` chooses a free port; `--host` must be one concrete local address, not a wildcard.

Do not send a model prompt unless the acceptance explicitly allows model calls. Stop the process when the check is done.

## 5. Verify the tool in the running host

Options:

- `--dump-config` proves the node is composed; a successful cold start means the plugin's `apply` did not fail.
- A temporary `--patch` probe can wait for `loader.await()`, check `ctx.tools.get('task_receipt')`, and invoke `begin`/`end` through `ctx.tools.execute`. Keep the probe in a disposable directory; do not edit the profile.

Tool registration is not the same as agent autonomy. Whether a model picks the tool unprompted is a separate test.

## 6. Uninstall and restart

```sh
dsh plugin --profile receipt-accept remove dsh-task-receipt
dsh --profile receipt-accept --dump-config > removed.txt
dsh --profile receipt-accept --host 127.0.0.1 --port 0 --no-open
```

Expected: dependency, bundle entry, and `node_modules/dsh-task-receipt` disappear; `removed.txt` has no `task-receipt` node; Web still starts; the tool is absent. `.plugin-manager/logs` may remain as operation audit logs.

## 7. Repeat install/uninstall

Repeat steps 3 and 6 **without** `--from-default-profile`. Check that the bundle list does not gain duplicates and that the profile manifest/lockfile return to the same state after each uninstall.

## Rollback

- Stop the temporary Web process.
- Delete only the disposable `DSH_HOME`, `PNPM_HOME`, work directory, and probe directory.
- Do not delete or edit the user's daily DSH home or Desktop profile.

## What this does not prove

- That a model will choose the tool.
- That the receipt proves business correctness or test passage.
- That other DSH versions, platforms, or production sandbox/file backends behave the same.
