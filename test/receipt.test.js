import test from 'node:test'
import assert from 'node:assert/strict'
import { ReceiptCollector, classify, fileEvidence, verificationHint } from '../src/receipt.js'
import { apply } from '../src/index.js'

const ok = value => ({ isError: false, value, content: [{ type: 'text', text: 'all tests passed' }] })
const proc = (exitCode = 0, more = {}) => ok({ kind: 'foreground', exitCode, signal: null, aborted: false, timedOut: false, ...more })
function harness(options) {
  const c = new ReceiptCollector(options), session = { seq: 0 }, agent = { session }
  c.begin(session)
  const event = (type, data) => c.event(session, { seq: session.seq++, type, data })
  let n = 0
  const call = (name, args = {}, result, { nested = false, durable = true } = {}) => {
    const callId = `secret-call-${++n}`
    const exec = { agent, name, callId, arguments: args, token: Symbol('execution'), ...(nested ? { parent: Symbol('parent') } : {}) }
    event(nested ? 'tool/ptc-dispatch-start' : 'tool/call', { name, arguments: JSON.stringify(args), ...(nested ? { subCallId: callId } : { callId }) })
    if (result !== undefined) {
      c.result(exec, result)
      if (durable) event(nested ? 'tool/ptc-dispatch' : 'tool/result', nested ? { subCallId: callId } : { message: { toolCallId: callId, isError: result.isError } })
    }
    return exec
  }
  return { c, session, agent, event, call, render: () => c.render(session) }
}

test('正常任务：结构化进程退出 + 新建文件 + 引用，不声称语义通过', () => {
  const h = harness()
  h.call('write', {}, ok({ path: '/secret/work/a.js', operation: 'create', before: null, after: 'x' }))
  h.call('bash', { command: 'node --test' }, proc())
  const receipt = h.render()
  assert.match(receipt, /成功 2；失败 0；未知 0/)
  assert.match(receipt, /结构化退出码 0/)
  assert.match(receipt, /F1：新建文件.*R1/)
  assert.doesNotMatch(receipt, /内容变化.*R1/)
  assert.match(receipt, /0 \/ 1/)
  assert.match(receipt, /测试是否实际运行.*未知/)
  assert.doesNotMatch(receipt, /\/secret|a\.js|all tests passed/)
})
test('命令非零退出不会被 isError=false 覆盖', () => {
  const h = harness(); h.call('bash', { command: 'npm test' }, proc(7))
  assert.match(h.render(), /失败 1/); assert.match(h.render(), /退出码 7/)
})
test('未执行测试：忽略 Agent 的 passed 自述与伪造输出', () => {
  const h = harness()
  h.event('assistant/message', { text: 'All tests passed; sk-SENTINEL' })
  h.call('read', {}, ok('all tests passed'))
  assert.match(h.render(), /测试状态：未知/)
  assert.doesNotMatch(h.render(), /SENTINEL|All tests passed/)
})
test('无文件修改与相同内容写入', () => {
  const h = harness(); h.call('edit', {}, ok({ path: 'a', before: 'same', after: 'same' }))
  assert.match(h.render(), /未观察到已确认的 write\/edit 内容变化或新建文件/)
  assert.doesNotMatch(h.render(), /- F1/)
  assert.doesNotMatch(h.render(), /R1：.*文件变化：未知/)
})

test('文件证据矩阵：create/null 是新建，update/null 只能是未知', () => {
  const cases = [
    ['write', { path: 'p', operation: 'create', before: null, after: 'x' }, 'created'],
    ['write', { path: 'p', operation: 'create', before: null, after: '' }, 'created'],
    ['write', { path: 'p', operation: 'update', before: null, after: 'x' }, 'unknown'],
    ['write', { path: 'p', operation: 'update', before: 'a', after: 'a' }, 'unchanged'],
    ['write', { path: 'p', operation: 'update', before: 'a', after: 'b' }, 'changed'],
    ['write', { path: 'p', operation: 'create', before: 'a', after: 'b' }, 'unknown'],
    ['write', { path: 'p', before: 'a', after: 'b' }, 'unknown'],
    ['write', { path: 'p', operation: 'replace', before: 'a', after: 'b' }, 'unknown'],
    ['write', { path: '', operation: 'update', before: 'a', after: 'b' }, 'unknown'],
    ['write', { operation: 'update', before: 'a', after: 'b' }, 'unknown'],
    ['write', { path: 'p', operation: 'update', before: 'a' }, 'unknown'],
    ['edit', { path: 'p', before: 'a', after: 'a' }, 'unchanged'],
    ['edit', { path: 'p', before: 'a', after: 'b' }, 'changed'],
    ['edit', { path: 'p', before: null, after: 'b' }, 'unknown'],
    ['edit', { path: 'p', after: 'b' }, 'unknown'],
    ['edit', null, 'unknown'],
  ]
  for (const [name, value, expected] of cases)
    assert.equal(fileEvidence(name, value).state, expected, `${name} ${JSON.stringify(value)}`)
})

test('update + before=null 不生成 F 代号，也不能在之后升级为已确认变化', () => {
  const h = harness()
  h.call('write', {}, ok({ path: 'unknown-basis.txt', operation: 'update', before: null, after: 'new text' }))
  const before = h.render()
  assert.doesNotMatch(before, /- F1/)
  assert.match(before, /R1：write 更新已有文件，但未取得可比对的旧内容.*文件变化：未知/)
  assert.match(before, /未观察到已确认的 write\/edit 内容变化或新建文件/)
  h.call('edit', {}, ok({ path: 'unknown-basis.txt', before: 'new text', after: 'newer text' }))
  const after = h.render()
  assert.match(after, /F1：确认内容变化.*R2/)
  assert.doesNotMatch(after, /F1：确认内容变化.*R1/)
  assert.match(after, /R1：write 更新已有文件.*文件变化：未知/)
})

test('矛盾 operation 与缺失 operation 不得推断新建；合法 update 仍可确认变化', () => {
  const h = harness()
  h.call('write', {}, ok({ path: 'x', operation: 'create', before: 'old', after: 'new' }))
  h.call('write', {}, ok({ path: 'y', operation: 'update', before: 'old', after: 'new' }))
  h.call('write', {}, ok({ path: 'z', after: 'new' }))
  const receipt = h.render()
  assert.match(receipt, /R1：write 的 operation 与 before 状态矛盾；文件变化：未知/)
  assert.match(receipt, /F1：确认内容变化.*R2/)
  assert.doesNotMatch(receipt, /F1：确认内容变化.*R1/)
  assert.match(receipt, /R3：write 未提供可识别的 create\/update 操作；文件变化：未知/)
})

test('已创建文件上的 update/null 不追加确认变化', () => {
  const h = harness()
  h.call('write', {}, ok({ path: 'x', operation: 'create', before: null, after: 'a' }))
  h.call('write', {}, ok({ path: 'x', operation: 'update', before: null, after: 'a' }))
  const receipt = h.render()
  assert.match(receipt, /F1：新建文件.*R1/)
  assert.doesNotMatch(receipt, /F1：确认内容变化/)
  assert.match(receipt, /R2：write 更新已有文件，但未取得可比对的旧内容.*文件变化：未知/)
})

test('缺失 canonical 结果：durable 的成功文本不能升级未知', () => {
  const h = harness(); const exec = h.call('bash', { command: 'npm test' })
  h.event('tool/result', { message: { toolCallId: exec.callId, isError: false, content: 'passed' } })
  assert.match(h.render(), /未知 1/)
})
test('丢失事件、孤儿结果、重复事件及畸形记录显式降级', () => {
  for (const mode of ['gap', 'orphan', 'duplicate', 'malformed']) {
    const h = harness()
    if (mode === 'gap') { h.session.seq++; h.event('turn/end', {}) }
    if (mode === 'orphan') h.event('tool/result', { message: { toolCallId: 'orphan' } })
    if (mode === 'duplicate') { h.event('turn/end', {}); h.c.event(h.session, { seq: 0 }) }
    if (mode === 'malformed') h.event('tool/call', {})
    assert.match(h.render(), /证据覆盖：未知/, mode)
  }
})
test('敏感字段从所有允许输入渠道都不进入收据', () => {
  const marker = 'NOT_A_CREDENTIAL_7f3c9a'
  const h = harness()
  h.call(marker, { apiKey: marker, command: `echo ${marker}` }, { isError: true, error: { message: marker } })
  h.call('write', { file_path: marker, content: marker }, ok({ path: marker, operation: 'create', before: null, after: marker }))
  h.call('bash', { command: `npm test --token=${marker}` }, proc(0, { stdout: marker }))
  const markdown = h.render()
  assert.equal(markdown.includes(marker), false)
  assert.doesNotMatch(markdown, /SENTINEL|apiKey|secret-call|token=/)
  assert.match(markdown, /other-tool/); assert.match(markdown, /F1/)
})
test('任务开始前的在途结果与丢失的调用起点不能归入成功', () => {
  const h = harness()
  h.c.result({ agent: h.agent, name: 'write', callId: 'old-call', token: Symbol('old') },
    ok({ path: 'outside', operation: 'create', before: null, after: 'x' }))
  assert.match(h.render(), /未知 1/)
  assert.match(h.render(), /任务归属未知/)
  assert.doesNotMatch(h.render(), /- F1/)
})

test('后台、超时、取消、未知形状均未知', () => {
  for (const result of [ok({ kind: 'background', jobId: 'secret' }), ok({ kind: 'promoted' }),
    proc(0, { timedOut: true }), proc(0, { sandbox: { runnerFailed: true } }),
    proc(0, { sandbox: { denied: true } }), proc(null), ok({ exitCode: 0 }),
    { isError: true, error: { info: { code: 'TOOL_OUTCOME_UNKNOWN' } } }])
    assert.equal(classify('bash', result).status, 'unknown')
})
test('不匹配 echo、复合命令、掩盖错误命令或无 command 的脚本', () => {
  for (const command of ['echo "npm test"', 'npm test || true', 'false; npm test', 'npm test && npm run build', 'node fake-test.js'])
    assert.equal(verificationHint('bash', { command }), 'none')
  assert.equal(verificationHint('bash', { script_path: '/secret/test.sh' }), 'none')
  assert.equal(verificationHint('bash', { command: 'node --test' }), 'test')
})
test('嵌套调用取证与失败不会被外层成功吞掉', () => {
  const h = harness()
  h.call('bash', { command: 'npm test' }, proc(1), { nested: true })
  h.call('run_code', {}, ok(null))
  assert.match(h.render(), /成功 1；失败 1/)
  assert.match(h.render(), /bash（嵌套）.*失败/)
})
test('任务边界、会话隔离、结束、重开和重复结果去重', () => {
  const h = harness(); const exec = h.call('read', {}, ok('x'))
  h.c.result(exec, ok('x'))
  assert.match(h.render(), /观察到 1 次调用/)
  assert.throws(() => h.c.begin(h.session), /already active/)
  assert.throws(() => h.c.render({ seq: 0 }), /no active task/)
  assert.match(h.c.render(h.session, { end: true }), /已结束/)
  assert.throws(() => h.render(), /no active task/)
  h.c.begin(h.session); assert.match(h.render(), /观察到 0 次调用/)
})
test('容量截断明确标未知，不静默输出完整报告', () => {
  const h = harness({ maxCalls: 1 })
  h.call('read', {}, ok('x')); h.call('read', {}, ok('y'))
  assert.match(h.render(), /证据覆盖：未知/)
  assert.match(h.render(), /观察到 1 次调用/)
})
test('重复变更按文件代号合并，创建与后续变化分别标注', () => {
  const h = harness()
  h.call('write', {}, ok({ path: 'x', operation: 'create', before: null, after: 'a' }))
  h.call('edit', {}, ok({ path: 'x', before: 'a', after: '' }))
  const receipt = h.render()
  assert.match(receipt, /F1：新建文件.*R1/)
  assert.match(receipt, /F1：确认内容变化.*R2/)
  assert.doesNotMatch(receipt, /F2/)
})
test('write/edit 仅有文本成功时不伪造变更', () => {
  const h = harness(); h.call('write', { file_path: 'x', content: 'a' }, ok('Created'))
  assert.doesNotMatch(h.render(), /- F1/)
  assert.match(h.render(), /R1.*文件变化：未知/)
})
test('插件注册公开 API、取消与参数校验；不提供 session_id 或写盘入口', async () => {
  const listeners = new Map(); let definition
  apply({ on: (name, callback) => listeners.set(name, callback), tools: { register: def => { definition = def } } })
  assert.equal(definition.name, 'task_receipt')
  assert.deepEqual([...listeners.keys()], ['session/event', 'session/disposed', 'tools/result'])
  const exec = { agent: { session: { seq: 0 } }, signal: new AbortController().signal }
  assert.match((await definition.execute({ action: 'begin' }, exec)).markdown, /已开始/)
  await assert.rejects(definition.execute({ action: 'bad' }, exec), /invalid action/)
  await assert.rejects(definition.execute({ action: 'render', session_id: 'secret' }, exec), /invalid action/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(definition.execute({ action: 'render' }, { ...exec, signal: controller.signal }))
  listeners.get('session/disposed')(exec.agent.session)
  await assert.rejects(definition.execute({ action: 'render' }, exec), /no active task/)
})
