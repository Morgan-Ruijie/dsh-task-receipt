import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as receipt from '../src/index.js'

// Real DSH 0.2.2-rc.1 file tools, composed in-process from an unpacked runtime.
// No profile, no install, no user workspace: the caller passes every path.
if (process.argv.length < 5) throw new Error('usage: real-file-tools.mjs <unpacked-dsh-root> <fixture-root> <out-dir>')
const anchor = resolve(process.argv[2])
const requireHost = createRequire(resolve(anchor, 'package.json'))
const host = async name => import(pathToFileURL(requireHost.resolve(`@deepseek-ai/${name}`)))
const { Context } = await host('cordis')
const { default: SystemPrompt } = await host('dsh-system-prompt')
const { default: Tools } = await host('dsh-tools')
const { default: Sessions } = await host('dsh-session')
const { default: SessionProjections } = await host('dsh-session-projection')
const { default: WorkingDirectory } = await host('dsh-working-directory')
const { default: LocalFileSystem } = await host('dsh-fs-local')
const toolFs = await host('dsh-tool-fs')
const native = await host('dsh-tool-executor-native')

const root = resolve(process.argv[3])
const outDir = resolve(process.argv[4])
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const ctx = new Context(), errors = []
ctx.on('internal/error', e => errors.push(String(e)))
await ctx.plugin(SystemPrompt).await()
await ctx.plugin(Tools).await()
await ctx.plugin(Sessions).await()
await ctx.plugin(SessionProjections).await()
await ctx.plugin(native).await()
// 8 bytes makes the real backend return before=null for an update whose new text is longer.
await ctx.plugin(LocalFileSystem, { cwd: root, diffBasisMaxBytes: 8 }).await()
// The DSH sandbox denies SetFileSecurityW/ReplaceFileW on this fixture's staging
// files. Replace only the publication primitive; operation/before/after logic,
// size threshold, reads and edit matching remain the real backend's.
ctx.fs.internals.copyFileDacl = async () => {}
ctx.fs.internals.replaceFile = async (target, temp) => {
  const { rename } = await import('node:fs/promises')
  await rename(temp, target)
}
await ctx.plugin(WorkingDirectory, { defaultDirectory: root }).await()
await ctx.plugin(toolFs, { read: false, readImage: false, write: true, edit: true, applyPatch: false }).await()
const plugin = ctx.plugin(receipt)
await plugin.await()
assert.ok(ctx.tools.get('write') && ctx.tools.get('edit') && ctx.tools.get('task_receipt'))

const session = ctx.sessions.create('real-file-tools', { meta: { cwd: root } })
const agent = { session, ctx, inject: () => {} }
let callN = 0
const results = []
const execute = async (name, args) => {
  const result = await ctx.tools.execute({
    calls: [{ type: 'tool_use', id: `real-${++callN}`, name, arguments: JSON.stringify(args) }],
    agent, log: { turn: 0, step: callN }, signal: new AbortController().signal,
  })
  const row = result.results[0].result
  assert.equal(row.isError, false, JSON.stringify(row.content))
  if (name !== 'task_receipt') results.push({ tool: name, value: row.value })
  return row.value
}
try {
  await execute('task_receipt', { action: 'begin' })
  const a = resolve(root, 'a.txt'), b = resolve(root, 'b.txt')
  const createA = await execute('write', { file_path: a, content: 'alpha' })
  const sameA = await execute('write', { file_path: a, content: 'alpha' })
  const updateA = await execute('write', { file_path: a, content: 'beta' })
  const editA = await execute('edit', { file_path: a, old_string: 'beta', new_string: 'gamma' })
  const createB = await execute('write', { file_path: b, content: 'small' })
  const oversizedB = await execute('write', { file_path: b, content: '0123456789' })

  assert.deepEqual([createA.operation, createA.before, createA.after], ['create', null, 'alpha'])
  assert.deepEqual([sameA.operation, sameA.before, sameA.after], ['update', 'alpha', 'alpha'])
  assert.deepEqual([updateA.operation, updateA.before, updateA.after], ['update', 'alpha', 'beta'])
  assert.deepEqual([editA.before, editA.after], ['beta', 'gamma'])
  assert.deepEqual([createB.operation, createB.before, createB.after], ['create', null, 'small'])
  assert.deepEqual([oversizedB.operation, oversizedB.before, oversizedB.after], ['update', null, '0123456789'])
  assert.equal(await readFile(a, 'utf8'), 'gamma')

  const markdown = await execute('task_receipt', { action: 'end' })
  const md = markdown.markdown
  assert.match(md, /F1：新建文件（write 报告 create；没有可比较的旧内容），证据 R1。/)
  assert.match(md, /F1：确认内容变化（before 与 after 均为可读文本且不同），证据 R3、R4。/)
  assert.match(md, /F2：新建文件（write 报告 create；没有可比较的旧内容），证据 R5。/)
  assert.doesNotMatch(md, /F2：确认内容变化/)
  assert.match(md, /R6：write 更新已有文件，但未取得可比对的旧内容（达到上限、二进制或不可读）；文件变化：未知。/)
  assert.doesNotMatch(md, /F1：确认内容变化.*R1/)
  assert.doesNotMatch(md, /F1：确认内容变化.*R2/)
  await writeFile(resolve(outDir, 'real-file-receipt.md'), md)
  await writeFile(resolve(outDir, 'real-file-results.json'), JSON.stringify({
    runtime: JSON.parse(await readFile(resolve(anchor, 'package.json'), 'utf8')).version,
    diffBasisMaxBytes: 8,
    source: 'real @deepseek-ai/dsh-tool-fs + dsh-fs-local from installed 0.2.2-rc.1 ASAR copy',
    sourceSha256: Object.fromEntries(await Promise.all(['src/receipt.js', 'scripts/real-file-tools.mjs']
      .map(async path => [path, createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex')]))),
    fixtureOverride: 'copyFileDacl and replaceFile only, because the DSH sandbox denies SetFileSecurityW/ReplaceFileW; operation/before/after, size threshold, reads and edit matching are the real backend.',
    canonical: results.map((r, i) => ({ ref: `R${i + 1}`, tool: r.tool, operation: r.value.operation, before: r.value.before, after: r.value.after })),
    checks: ['real write create', 'real write update same', 'real write update different',
      'real edit', 'real oversized update yields before=null', 'receipt kept that update unknown',
      'receipt never upgraded create to changed'],
  }, null, 2) + '\n')
  await plugin.dispose()
  assert.equal(ctx.tools.get('task_receipt'), undefined)
  assert.deepEqual(errors, [])
  console.log('REAL FILE TOOLS PASS')
  console.log(md)
} finally { await ctx.fiber.dispose() }
