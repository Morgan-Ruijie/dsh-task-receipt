import { ReceiptCollector } from './receipt.js'

export const name = 'dsh-task-receipt'
export const inject = ['tools', 'sessions']

export function apply(ctx) {
  const collector = new ReceiptCollector()
  ctx.on('session/event', (session, event) => collector.event(session, event))
  ctx.on('session/disposed', session => collector.dispose(session))
  ctx.on('tools/result', (exec, result) => collector.result(exec, result))
  ctx.tools.register({
    name: 'task_receipt',
    description: 'Local task receipt. Call begin BEFORE work, render for a snapshot, end to close. Observes only this live Session. No I/O, no raw commands, outputs or paths. Success means observed execution, never semantic test passage.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['action'],
      properties: { action: { type: 'string', enum: ['begin', 'render', 'end'] } },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['markdown'], properties: {
        markdown: { type: 'string' },
      } },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    // Serializes its own lifecycle; observation never changes tool outcomes.
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const session = exec.agent?.session
      if (!session) throw new Error('task_receipt: live session required')
      if (!args || Object.keys(args).length !== 1 || !['begin', 'render', 'end'].includes(args.action))
        throw new Error('task_receipt: invalid action')
      const markdown = args.action === 'begin' ? collector.begin(session, exec.callId)
        : collector.render(session, { end: args.action === 'end' })
      return { markdown }
    },
  })
}
