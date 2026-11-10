# Audit fix: file evidence in 0.1.1

An independent review of 0.1.0 found that a successful `write` with `operation="update"` and `before=null` was reported as “before/after differ”. That was an evidence error. It was reproduced and fixed in 0.1.1; 0.1.2 carries the same `src/` logic.

## Verified contract (DSH 0.2.2-rc.1)

`@deepseek-ai/dsh-fs-local` computes:

```js
const existing = await this.writeTarget(target, expected);
const before = existing !== null && Buffer.byteLength(content, 'utf8') < this.config.diffBasisMaxBytes
  ? await readTextForDiff(target.targetKey, this.config.diffBasisMaxBytes, signal)
  : null;
return { operation: existing ? 'update' : 'create', version, before, after: normalizeLineEndings(content) };
```

`readTextForDiff` returns `null` for a non-regular file, a file at/above the diff basis limit, binary or non-UTF-8 content, a size change during read, or an unreadable file.

Therefore `before=null` has at least three meanings:

1. `operation="create"`: the target did not exist;
2. `operation="update"` over the size limit: old text was not read;
3. `operation="update"` on binary/non-UTF-8/unreadable content: old text was not read.

Only case 1 supports “new file”. Cases 2 and 3 cannot support “content changed”.

`editText` always returns `before: original.content` and `after: edited.content`, both strings.

## Reproduction and fix

Input that triggered the 0.1.0 bug:

```js
{ isError: false, value: { path: '/example/a.txt', operation: 'update', before: null, after: 'some text' } }
```

0.1.0 output: `F1：write/edit 的 before 与 after 内容不同` — unsupported.

0.1.1+ rules:

| Input | State | `F` alias |
|---|---|---|
| `write` + `create` + `before=null` | `created` | yes |
| `write` + `update` + two strings | `changed` / `unchanged` | only `changed` |
| `write` + `update` + `before=null` | `unknown` | no |
| `write` + missing/unknown operation | `unknown` | no |
| `write` + `create` + non-null before | `unknown` (contradiction) | no |
| `edit` + two strings | `changed` / `unchanged` | only `changed` |
| missing path/after/wrong type | `unknown` | no |

Rendering separates:

- `F1：新建文件（write 报告 create；没有可比较的旧内容）`
- `F1：确认内容变化（before 与 after 均为可读文本且不同）`
- `R1：write 更新已有文件，但未取得可比对的旧内容…；文件变化：未知。`

Unknown evidence never mints a file alias and is never upgraded by a later call.

## Verification

- 20/20 unit tests, including create/null, update/null, update/same, update/different, edit, contradictory create, missing operation, missing fields, and “unknown is not upgraded”.
- Real `dsh-tool-fs` + `dsh-fs-local`: create, update-same, update-different, edit, and an over-limit update that stays unknown.
- The real file-tool test replaces the Windows DACL-copy and atomic-replace primitives because the DSH sandbox rejects `SetFileSecurityW`/`ReplaceFileW`; other canonical behavior remains real.

## Residual risk

- `update + before=null` cannot distinguish “changed” from “wrote identical text”.
- `create` depends on the tool truthfully reporting `operation`.
- File evidence is not an independent disk check; shell/apply_patch/sub-session/external edits remain unknown.
- A malicious tool can fabricate canonical values; the receipt is not tamper-evident.
