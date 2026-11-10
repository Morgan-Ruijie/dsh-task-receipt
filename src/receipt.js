import { createHash } from 'node:crypto'

const SHELLS = new Set(['bash', 'pwsh', 'ops_bash'])
const SAFE_TOOLS = new Set([...SHELLS, 'read', 'write', 'edit', 'grep', 'glob', 'run_code', 'job_output', 'job_kill'])
const CONTROL = 'task_receipt'
const hash = text => createHash('sha256').update(text).digest('hex')
const position = n => Number.isSafeInteger(n) && n >= 0
const argsOf = args => {
  if (typeof args === 'string') {
    if (args.length > 16384) return {}
    try { args = JSON.parse(args) } catch { return {} }
  }
  return args && typeof args === 'object' && !Array.isArray(args) ? args : {}
}

// Whole-command hints only. No shell parser, no semantic test-passage claim.
export function verificationHint(name, args) {
  if (!SHELLS.has(name)) return 'none'
  const command = argsOf(args).command
  if (typeof command !== 'string' || command.length > 512) return 'none'
  if (/^(?:npm|pnpm) (?:run )?test(?: --[a-z-]+)*$/.test(command) ||
      /^node --test(?: [A-Za-z0-9_./*-]+)*$/.test(command) ||
      /^(?:python -m )?pytest(?: [A-Za-z0-9_./*-]+)*$/.test(command)) return 'test'
  if (/^(?:npm|pnpm) run (?:lint|typecheck|build)$/.test(command)) return 'check'
  return 'none'
}

export function classify(name, result) {
  if (result?.isError === true) {
    const code = result.error?.info?.code ?? result.error?.code
    return /^(?:TOOL_OUTCOME_UNKNOWN|TOOL_NOT_STARTED|ABORTED|ABORTED_BEFORE_DISPATCH|TOOL_TIMEOUT)$/.test(code ?? '')
      ? { status: 'unknown', reason: 'interrupted' }
      : { status: 'failed', reason: 'tool-error' }
  }
  if (result?.isError !== false) return { status: 'unknown', reason: 'missing-result' }
  const v = result.value
  if (SHELLS.has(name)) {
    if (v?.kind === 'background' || v?.kind === 'promoted') return { status: 'unknown', reason: 'background' }
    // DSH bash foreground shape; pwsh and other adapters remain unknown unless compatible.
    if (v?.kind !== 'foreground') return { status: 'unknown', reason: 'unsupported-shell-result' }
    if (v.sandbox?.denied === true || v.sandbox?.runnerFailed === true)
      return { status: 'unknown', reason: 'sandbox-not-confirmed' }
    if (v.aborted === true || v.timedOut === true || v.signal != null || v.stopped != null)
      return { status: 'unknown', reason: 'interrupted' }
    if (!Number.isInteger(v.exitCode) || v.aborted !== false || v.timedOut !== false || v.signal !== null)
      return { status: 'unknown', reason: 'incomplete-process-result' }
    return { status: v.exitCode === 0 ? 'succeeded' : 'failed', reason: 'exit-code', exitCode: v.exitCode }
  }
  return { status: 'succeeded', reason: 'tool-completed' }
}

const labels = { succeeded: '成功', failed: '失败', unknown: '未知' }
const reasons = {
  'missing-result': '缺少最终结构化结果', 'missing-call': '缺少范围内调用开始事件；任务归属未知',
  'tool-error': '工具返回错误',
  interrupted: '中断、超时或未确认启动', background: '后台任务尚无最终进程证据',
  'unsupported-shell-result': '不支持的 shell 结果形状',
  'incomplete-process-result': '进程结束字段不完整',
  'sandbox-not-confirmed': '沙箱拒绝或 runner 失败；命令执行未确认',
  'tool-completed': '工具报告完成；语义未独立验证',
}
const fileReasons = {
  'update-without-baseline': 'write 更新已有文件，但未取得可比对的旧内容（达到上限、二进制或不可读）',
  'unknown-operation': 'write 未提供可识别的 create/update 操作',
  'contradictory-operation': 'write 的 operation 与 before 状态矛盾',
  'missing-fields': '路径或 before/after 字段缺失或类型不符',
}

/**
 * Classify write/edit evidence under the DSH 0.2.2-rc.1 contract.
 * fs-local returns operation=create only when the target was absent; update may
 * carry before=null when the old text is over the diff basis, binary, non-UTF-8
 * or unreadable. A null baseline is therefore never evidence of a change.
 */
export function fileEvidence(name, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return { state: 'unknown', reason: 'missing-fields' }
  const { path, before, after } = value
  if (typeof path !== 'string' || path.length === 0 || typeof after !== 'string')
    return { state: 'unknown', reason: 'missing-fields' }
  if (name === 'write') {
    if (value.operation === 'create') {
      if (before === undefined) return { state: 'unknown', reason: 'missing-fields' }
      if (before !== null) return { state: 'unknown', reason: 'contradictory-operation' }
      return { state: 'created' }
    }
    if (value.operation === 'update') {
      if (typeof before !== 'string') return { state: 'unknown', reason: 'update-without-baseline' }
      return { state: before === after ? 'unchanged' : 'changed' }
    }
    return { state: 'unknown', reason: 'unknown-operation' }
  }
  // editText always returns the pre- and post-edit UTF-8 text.
  if (typeof before !== 'string') return { state: 'unknown', reason: 'missing-fields' }
  return { state: before === after ? 'unchanged' : 'changed' }
}


/** No I/O. Retains only selected fields, never messages, raw outputs or raw paths. */
export class ReceiptCollector {
  #sessions = new WeakMap()
  constructor({ maxCalls = 500 } = {}) {
    if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 5000) throw new Error('invalid maxCalls')
    this.maxCalls = maxCalls
  }
  begin(session, controlCallId) {
    if (!session || !position(session.seq)) throw new Error('task_receipt: session unavailable')
    if (this.#sessions.has(session)) throw new Error('task_receipt: task already active; end it first')
    this.#sessions.set(session, {
      start: session.seq, last: session.seq - 1, rows: [], files: new Map(),
      gap: false, overflow: false, malformed: false, seen: new Set(),
      controls: new Set(typeof controlCallId === 'string' ? [hash(controlCallId)] : []),
    })
    return '任务取证已开始；只观察此后当前 Session 的工具调用。'
  }
  dispose(session) { this.#sessions.delete(session) }
  #row(state, name, callId, callSeq, nested = false) {
    if (state.rows.length >= this.maxCalls) { state.overflow = true; return undefined }
    const row = {
      ref: `R${state.rows.length + 1}`, tool: SAFE_TOOLS.has(name) ? name : 'other-tool',
      // Only a hash is retained for internal pairing; never rendered or exported.
      callKey: typeof callId === 'string' ? hash(callId) : null,
      callSeq, resultSeq: null, nested, hint: 'none', status: 'unknown', reason: 'missing-result',
      final: false,
    }
    state.rows.push(row)
    return row
  }
  event(session, event) {
    const s = this.#sessions.get(session)
    if (!s) return
    if (!event || !position(event.seq) || event.seq <= s.last) { s.gap = true; return }
    if (event.seq !== s.last + 1) s.gap = true
    s.last = event.seq
    const d = event.data
    if (event.type === 'tool/call' || event.type === 'tool/ptc-dispatch-start') {
      const nested = event.type === 'tool/ptc-dispatch-start'
      const id = nested ? d?.subCallId : d?.callId
      if (!d || typeof d.name !== 'string' || typeof id !== 'string') { s.malformed = true; return }
      if (d.name === CONTROL) {
        if (s.controls.size < this.maxCalls) s.controls.add(hash(id))
        else s.overflow = true
        return
      }
      const r = this.#row(s, d.name, id, event.seq, nested)
      if (r) r.hint = verificationHint(d.name, d.arguments)
    } else if (event.type === 'tool/result' || event.type === 'tool/ptc-dispatch') {
      const id = event.type === 'tool/result' ? d?.message?.toolCallId : d?.subCallId
      if (typeof id !== 'string') { s.malformed = true; return }
      const key = hash(id)
      if (s.controls.delete(key)) return
      const r = s.rows.findLast(row => row.callKey === key && row.resultSeq === null)
      if (r) r.resultSeq = event.seq
      else s.gap = true
    }
  }
  result(exec, result) {
    const session = exec?.agent?.session
    const s = session && this.#sessions.get(session)
    if (!s || exec.name === CONTROL) return
    if (!exec.token || !['object', 'symbol'].includes(typeof exec.token)) { s.malformed = true; return }
    if (s.seen.has(exec.token)) return
    const key = typeof exec.callId === 'string' ? hash(exec.callId) : null
    let r = s.rows.findLast(row => row.callKey === key && !row.final && row.nested === Boolean(exec.parent))
    if (!r) {
      r = this.#row(s, exec.name, exec.callId, null, Boolean(exec.parent))
      s.gap = true
    }
    if (!r) return
    s.seen.add(exec.token)
    r.hint = verificationHint(exec.name, exec.arguments)
    Object.assign(r, r.callSeq === null ? { status: 'unknown', reason: 'missing-call' }
      : classify(exec.name, result), { final: true })
    if ((exec.name === 'write' || exec.name === 'edit') && r.status === 'succeeded') {
      const evidence = fileEvidence(exec.name, result.value)
      r.fileEvidence = evidence.state
      if (evidence.reason) r.fileReason = evidence.reason
      if (evidence.state === 'created' || evidence.state === 'changed') {
        // Per-task aliases avoid leaking secrets embedded in file/directory names.
        const key = hash(result.value.path)
        if (!s.files.has(key)) s.files.set(key, { alias: `F${s.files.size + 1}`, created: [], changed: [] })
        s.files.get(key)[evidence.state].push(r.ref)
      }
    }
  }
  render(session, { end = false } = {}) {
    const s = this.#sessions.get(session)
    if (!s) throw new Error('task_receipt: no active task; begin before work')
    if (!position(session.seq) || session.seq - 1 !== s.last) s.gap = true
    const count = status => s.rows.filter(r => r.status === status).length
    const hints = s.rows.filter(r => r.hint !== 'none')
    const markdown = [
      '# 任务执行收据', '',
      `范围：当前 Session，${s.last < s.start ? `自 seq ${s.start} 起尚无事件` : `自 seq ${s.start} 至 ${s.last}（含）`}；${end ? '已结束' : '当前快照'}。`,
      '来源：运行中的 session/event 与最终 tools/result；子 Session、开始前历史不在范围内。', '',
      `观察到 ${s.rows.length} 次调用：成功 ${count('succeeded')}；失败 ${count('failed')}；未知 ${count('unknown')}。`,
      `证据覆盖：${s.gap || s.overflow || s.malformed ? '未知（存在事件缺口、畸形记录或容量截断）' : '观察区间连续；不证明宿主之外的行为已被记录'}。`, '',
      '## 执行证据', '',
      '| 引用 | 工具 | 状态 | 依据 | 事件 seq（调用 / 结果） |',
      '|---|---|---|---|---|',
      ...s.rows.map(r => `| ${r.ref} | ${r.tool}${r.nested ? '（嵌套）' : ''} | ${labels[r.status]} | ${r.reason === 'exit-code' ? `结构化退出码 ${r.exitCode}` : reasons[r.reason]} | ${r.callSeq ?? '未知'} / ${r.resultSeq ?? '未知'} |`),
      ...(s.rows.length ? [] : ['| — | — | 未知 | 未观察到任务工具调用 | — |']), '',
      '## 验证', '',
      ...(hints.length ? hints.map(r => `- ${r.ref}：${r.hint === 'test' ? '测试' : '检查'}命令候选；执行状态 ${labels[r.status]}。`) : ['- 未观察到受支持的测试或检查命令；测试状态：未知。']),
      '- 测试是否实际运行、断言是否充分、业务是否正确：未知。退出码 0 仅支持进程正常结束。',
      '- Agent 自述、命令输出中的“passed”或退出码文字均不作为通过证据。', '',
      '## 文件变化', '',
      ...[...s.files.values()].flatMap(f => [
        ...(f.created.length ? [`- ${f.alias}：新建文件（write 报告 create；没有可比较的旧内容），证据 ${f.created.join('、')}。`] : []),
        ...(f.changed.length ? [`- ${f.alias}：确认内容变化（before 与 after 均为可读文本且不同），证据 ${f.changed.join('、')}。`] : []),
      ]),
      ...(s.files.size ? [] : ['- 未观察到已确认的 write/edit 内容变化或新建文件。']),
      ...s.rows.filter(r => ['write', 'edit'].includes(r.tool) && r.status === 'succeeded' &&
        !['created', 'changed', 'unchanged'].includes(r.fileEvidence))
        .map(r => `- ${r.ref}：${fileReasons[r.fileReason] ?? '缺少可确认的文件证据'}；文件变化：未知。`),
      '- 新建文件不等于内容发生变化；更新文件只有在取得可比对的 before 文本时才能比较。',
      '- 文件名默认替换为本任务代号；记录的是内容变化发生过，不是最终净差异或独立磁盘复查。',
      '- Shell、自定义工具、apply_patch、子 Session、外部编辑导致的文件变化：未知；未读取工作树。', '',
      '## 边界与隐私', '',
      '- 本插件只返回收据；不写文件、不联网、不运行命令、不上传原会话。',
      '- 不复制原始命令、参数、输出、错误详情、文件内容、路径或 Session ID。',
      '- 收据不是签名、可信时间戳或防篡改证明；任务整体完成状态：未知。', '',
    ].join('\n')
    if (end) this.dispose(session)
    return markdown
  }
}
