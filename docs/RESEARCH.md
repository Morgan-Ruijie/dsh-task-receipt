# Research and scope decision

Investigation date: 2026-11-07. The implementation was checked against the DSH 0.2.2-rc.1 packages; upstream `main` links are static references, not a pinned runtime proof.

## Plugin mechanism

A DSH profile is a directory under `$DSH_HOME/profiles/<name>` with a `package.json` dependency list and an ordered `dsh.profile.bundles` list. A bundle contributes loader patch rows through `dsh.bundle.patch`. Server-side plugins export `name`, optional `inject`, and `apply(ctx)`. Tools register on `ctx.tools.register`; the effect is removed when the owning fiber is disposed.

A raw JSON-Schema `ToolDefinition` can be registered directly, which avoids a runtime dependency on `defineTool`. Raw JSON Schema and the `defineTool` schema DSL must not be mixed in one definition.

## Official references

- [Tool authoring](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md): canonical output, render, cancellation, failure semantics.
- [Extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md): `tools/result` is the final observation point; `session/event` carries committed events.
- [CLI and profiles](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/cli): bundles, patches, install/reload, compatibility.
- [Session](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/core/session): append-only source of truth; newer production code avoids deprecated synchronous readers.
- [Tools](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/core/tools): `tools/result` is observe-only; canonical value differs from durable rendered content.
- [Native executor](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/core/tool-executor-native): `tool/call` → dispatch → final observation → `tool/result`.

Local cross-checks confirmed: the pipeline's final observer receives `exec`/`result`; the execution token is a `Symbol`; the durable result message field is `message.toolCallId`; raw JSON Schema `required` belongs on the object.

## Related work

| Project | What it already does | Gap / recommendation |
|---|---|---|
| DSH Trajectory | Turn/step event ledger, timeline, tool and nested-call inspector, raw input/output/errors, live canonical cache | Use it to inspect process. No task-scoped Markdown receipt generator found. |
| `bwndlct/dsh-session-audit` | Session statistics, failure/repetition analysis, verification-command hints, text/Markdown/JSON | Markdown and verification observation overlap. Its rules primarily read `isError` and trailing exit markers, not the canonical `exitCode`; it may print raw commands/args/paths. |
| `@yadsh/dsh-session-audit` (`xarleyn/dsh-plugins`) | Audit registry/viewer over disk `analysis.json`/`REPORT.md`, Audit UI, safe loading; schema expresses findings/evidence/task outcome | It is a presentation/protocol layer; a producer supplies artifacts. Contribute a producer or fields rather than duplicating the UI. |
| `030611/dsh-verification-receipt` | Per-turn privacy-minimal JSONL, three-state tool outcomes, lexical verification signals; explicitly not proof tests ran | Very close. Privacy/three-state/receipts are not original here. This project's narrow difference is explicit cross-turn task scope, canonical exit state, file-change references, and Markdown return. |

Sources:

- [Trajectory README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-trajectory/README.md)
- [Trajectory Host](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-trajectory/src/index.ts)
- [bwndlct README](https://github.com/bwndlct/dsh-session-audit)
- [bwndlct verification rules](https://github.com/bwndlct/dsh-session-audit/blob/main/src/rules/verification.ts)
- [bwndlct Markdown formatter](https://github.com/bwndlct/dsh-session-audit/blob/main/src/formatters/markdown.ts)
- [@yadsh README](https://github.com/xarleyn/dsh-plugins/tree/main/plugins/dsh-session-audit)
- [@yadsh Host](https://github.com/xarleyn/dsh-plugins/blob/main/plugins/dsh-session-audit/src/index.ts)
- [audit-core producer](https://github.com/xarleyn/dsh-plugins/blob/main/packages/audit-core/src/producer/publish-audit.ts)
- [Verification Receipt](https://github.com/030611/dsh-verification-receipt)

These projects were checked statically through README/source; their tests were not run, and their current published behavior is not inferred beyond those files.

## Decision

No single project covered the exact combination, so a small reviewable MVP was kept. The long-term value still depends on real use. The intended difference is: explicit task start/end; final structured execution evidence; file-change references; short Markdown; no raw data by default.

File names are replaced by per-task aliases, trading convenience for default privacy; the local event sequence still allows lookup. This is not full working-tree tracking. The first release does not scan the worktree, fully interpret background jobs, sign receipts, or add a UI.

If the need is only “what happened”, use Trajectory. For session-level Markdown audit, use `bwndlct/dsh-session-audit`. For automatic per-turn privacy JSONL, use `dsh-verification-receipt`. A better long-term contribution may be task-range/canonical support upstream rather than maintaining a duplicate.
