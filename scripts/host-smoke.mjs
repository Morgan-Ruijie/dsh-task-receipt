import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import * as receipt from '../src/index.js'

// Supply an unpacked, read-only DSH runtime root. Does not install or run a profile.
if (!process.argv[2]) throw new Error('usage: node scripts/host-smoke.mjs <unpacked-dsh-root>')
const anchor = resolve(process.argv[2])
const requireHost = createRequire(resolve(anchor, 'package.json'))
const host = async name => import(pathToFileURL(requireHost.resolve(`@deepseek-ai/${name}`)))
const { Context } = await host('cordis')
const { default: SystemPrompt } = await host('dsh-system-prompt')
const { default: Tools } = await host('dsh-tools')
const { default: Sessions } = await host('dsh-session')
const native = await host('dsh-tool-executor-native')
const ctx = new Context(), errors = []
ctx.on('internal/error', e => errors.push(String(e)))
await ctx.plugin(SystemPrompt).await()
await ctx.plugin(Tools).await()
await ctx.plugin(Sessions).await()
await ctx.plugin(native).await()
const plugin = ctx.plugin(receipt)
await plugin.await()
assert.ok(ctx.tools.get('task_receipt'), 'plugin registers in real Cordis')
const session = ctx.sessions.create('isolated-synthetic-session'), agent = { session }
const out = resolve('out')
await mkdir(out, { recursive: true })
let callN = 0
const execute = async (name, args = {}) => {
  const result = await ctx.tools.execute({
    calls: [{ type: 'tool_use', id: `integration-${++callN}`, name, arguments: JSON.stringify(args) }],
    agent, log: { turn: 0, step: callN }, signal: new AbortController().signal,
  })
  const row = result.results[0].result
  assert.equal(row.isError, false, JSON.stringify(row.content))
  return row.value
}
const childFile = fileURLToPath(new URL('../test/receipt.test.js', import.meta.url))
// Fixture adapters use actual processes/files and the official canonical shape.
// They are not the production DSH shell/fs plugins or their sandbox services.
ctx.tools.register({
  name: 'bash', description: 'Isolated fixture process only.',
  parameters: { type: 'object', properties: { command: { type: 'string' } } },
  output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'fixture output intentionally omitted' }] },
  async execute(args) {
    const argv = args.command === 'node --test'
      ? ['--test', '--test-isolation=none', childFile]
      : args.command === 'node --exit-7' ? ['-e', 'process.exit(7)'] : null
    if (!argv) throw new Error('fixture command rejected')
    const p = spawnSync(process.execPath, argv, { stdio: 'inherit' })
    if (p.error) throw p.error
    return { kind: 'foreground', exitCode: p.status, signal: p.signal, aborted: false, timedOut: false }
  },
})
const changedPath = resolve(out, 'fixture.txt')
ctx.tools.register({
  name: 'write', description: 'Isolated fixture file only.',
  parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'fixture saved' }] },
  async execute() {
    let before = null
    try { before = await readFile(changedPath, 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
    const after = before === null ? 'fixture-A' : before === 'fixture-A' ? 'fixture-B' : 'fixture-A'
    await writeFile(changedPath, after)
    return { path: changedPath, operation: before === null ? 'create' : 'update', before, after }
  },
})
try {
  await rm(changedPath, { force: true })
  await execute('task_receipt', { action: 'begin' })
  assert.equal((await execute('bash', { command: 'node --test' })).exitCode, 0)
  const created = await execute('write')
  assert.equal(created.operation, 'create')
  const updated = await execute('write')
  assert.equal(updated.operation, 'update')
  const happy = await execute('task_receipt', { action: 'end' })
  assert.match(happy.markdown, /成功 3；失败 0；未知 0/)
  assert.match(happy.markdown, /F1：新建文件.*R2/)
  assert.match(happy.markdown, /F1：确认内容变化.*R3/)
  assert.doesNotMatch(happy.markdown, /F1：确认内容变化.*R2/)
  assert.doesNotMatch(happy.markdown, /证据覆盖：未知/)
  await writeFile(resolve(out, 'receipt-normal.md'), happy.markdown)
  await execute('task_receipt', { action: 'begin' })
  assert.equal((await execute('bash', { command: 'node --exit-7' })).exitCode, 7)
  const failed = await execute('task_receipt', { action: 'end' })
  assert.match(failed.markdown, /失败 1/)
  await writeFile(resolve(out, 'receipt-failure.md'), failed.markdown)
  await plugin.dispose()
  assert.equal(ctx.tools.get('task_receipt'), undefined, 'unload removes tool')
  assert.deepEqual(errors, [])
  const evidence = {
    runtime: JSON.parse(await readFile(resolve(anchor, 'package.json'), 'utf8')).version,
    node: process.version,
    executedAt: new Date().toISOString(),
    sourceSha256: Object.fromEntries(await Promise.all(['src/index.js', 'src/receipt.js', 'test/receipt.test.js', 'scripts/host-smoke.mjs', 'scripts/real-file-tools.mjs']
      .map(async path => [path, createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex')]))),
    checks: ['real Cordis registration', 'real Session event feed', 'real native tool pipeline',
      'actual Node test process exit 0', 'actual Node process exit 7', 'fixture create then update',
      'task range isolation', 'Markdown normal/failure receipts', 'plugin disposal removes tool'],
    limitation: 'Fixture bash/write adapters; real file-tool canonical test is scripts/real-file-tools.mjs; no installation or desktop UI cold-start acceptance.',
  }
  await writeFile(resolve(out, 'integration.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence, null, 2))
} finally { await ctx.fiber.dispose() }
