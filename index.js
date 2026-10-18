/**
 * DSH PTC parse-frame plugin.
 *
 * `run_code` already parses the whole program with `stripTypeScriptTypes` before
 * running it, but the failure path only forwards `error.message`. The parser's
 * line number and `^^^` code frame stay in `error.stack` and never reach the
 * model, so a missing comma reads as "Expected ',', got 'string literal'" with
 * no location.
 *
 * This Host plugin listens to `tools/post-execute`, re-parses the original
 * program (wrapped exactly like the runtime's per-call path), and appends the
 * recovered line and a bounded code frame to the failed `run_code` result.
 * Everything else — runtime exceptions, successful results, other tools — is
 * left byte-for-byte untouched.
 */

import { stripTypeScriptTypes } from 'node:module'

const DEFAULT_SOURCE_NAME = 'run_code.ts'
const DEFAULT_MAX_FRAME_LINES = 10
const MAX_FRAME_LINES_LIMIT = 40
const WRAP_PREFIX = 'async function __dsh_program__() {\n'
const WRAP_SUFFIX = '\n}'
const PARSE_FAILURE_PREFIX = 'code run failed (exception): '
const CARET_LINE = /^\s*\^+\s*$/

/** The tool service must exist; the plugin has nothing to do without it. */
export const inject = ['tools']

/**
 * Register the `tools/post-execute` waterfall listener.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ enabled?: boolean, maxFrameLines?: number, sourceName?: string }} [config]
 */
export function apply(ctx, config) {
  const options = resolveOptions(config)
  ctx.on('tools/post-execute', async (exec, result, next) => {
    // Other listeners own the decision: always run the rest of the waterfall
    // first, then enrich only what they accepted.
    const decision = await next()
    try {
      return decorate(exec, result, decision, options)
    } catch {
      // Never swallow or rewrite the failure reason because this plugin broke.
      return decision
    }
  })
}

/**
 * Normalize the row's config. Missing or malformed values fall back to the
 * documented defaults instead of failing activation.
 *
 * @param {unknown} config
 * @returns {{ enabled: boolean, sourceName: string, maxFrameLines: number }}
 */
export function resolveOptions(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const sourceName =
    typeof raw.sourceName === 'string' && raw.sourceName.trim() !== ''
      ? raw.sourceName.trim().replace(/[\r\n]+/g, ' ')
      : DEFAULT_SOURCE_NAME
  const requested = Number.isInteger(raw.maxFrameLines) ? raw.maxFrameLines : DEFAULT_MAX_FRAME_LINES
  return {
    enabled: raw.enabled !== false,
    sourceName,
    maxFrameLines: Math.min(Math.max(requested, 1), MAX_FRAME_LINES_LIMIT),
  }
}

/**
 * Add the recovered frame to a `run_code` parse failure.
 *
 * Returns the input decision unchanged whenever any precondition fails. That is
 * deliberate: a no-op is always safer than a wrong rewrite.
 *
 * @param {unknown} exec - normalized tool execution.
 * @param {unknown} result - pre-waterfall tool result.
 * @param {unknown} decision - decision returned by the rest of the waterfall.
 * @param {{ enabled: boolean, sourceName: string, maxFrameLines: number }} options
 * @returns {unknown} the accepted decision, enriched or unchanged.
 */
export function decorate(exec, result, decision, options) {
  if (options.enabled === false) return decision
  if (decision === null || typeof decision !== 'object' || decision.kind !== 'accept') return decision
  // The registry rejects an accept decision that replaces both value and content.
  if (Object.hasOwn(decision, 'value')) return decision

  if (exec === null || typeof exec !== 'object' || exec.name !== 'run_code') return decision
  if (result === null || typeof result !== 'object' || result.isError !== true) return decision

  const args = exec.arguments
  const code = args !== null && typeof args === 'object' ? args.code : undefined
  if (typeof code !== 'string' || code.length === 0) return decision

  const message = result.error !== null && typeof result.error === 'object' ? result.error.message : undefined
  if (typeof message !== 'string' || !message.startsWith(PARSE_FAILURE_PREFIX)) return decision

  const frame = parseFrame(code, options)
  if (frame === undefined) return decision
  // The runtime appends contextual suffixes to this message (for example
  // "\nFile sandbox: workspace-write."), so the parser's own text is a prefix,
  // not the whole message. A runtime exception whose text merely looks similar
  // still fails the re-parse check above and never reaches this point.
  const anchor = PARSE_FAILURE_PREFIX + frame.message
  if (!message.startsWith(anchor)) return decision
  const suffix = message.slice(anchor.length)
  if (suffix !== '' && !suffix.startsWith('\n') && !suffix.startsWith('\r\n')) return decision

  const content = Array.isArray(decision.content) ? decision.content : result.content
  if (!Array.isArray(content) || content.length === 0) return decision
  // Upstream (or another plugin) already supplied a position: stay out of the way.
  if (content.some(block => isTextBlock(block) && hasPosition(block.text, options.sourceName))) return decision

  const enriched = insertFrame(content, anchor, frame.text)
  if (enriched === undefined) return decision
  return { ...decision, content: enriched }
}

/**
 * Re-parse `code` as the runtime does and recover the parser's diagnostic.
 *
 * @param {string} code - the program passed to `run_code`.
 * @param {{ sourceName?: string, maxFrameLines?: number }} [options]
 * @returns {{ message: string, text: string } | undefined} `undefined` when the
 *   program parses, or when the parser provided no usable location.
 */
export function parseFrame(code, options = {}) {
  let failure
  try {
    stripTypeScriptTypes(WRAP_PREFIX + code + WRAP_SUFFIX)
    return undefined
  } catch (error) {
    failure = error
  }
  const message = failure instanceof Error ? failure.message : String(failure)
  const text = frameFromError(failure, code, options)
  if (text === undefined) return undefined
  return { message, text }
}

/**
 * Turn a parser `SyntaxError` stack into `source:line` plus the SWC code frame.
 *
 * The wrapped parse adds one line before the program; every line number is
 * shifted back and the wrapper/suffix lines are dropped. Line numbers are
 * recomputed from the original program, so both runtime paths (unwrapped
 * retained parse and wrapped per-call parse) report the same user-visible line.
 *
 * @param {unknown} error - the thrown parse error.
 * @param {string} code - the original program.
 * @param {{ sourceName?: string, maxFrameLines?: number }} [options]
 * @returns {string | undefined} the frame, or `undefined` when unrecoverable.
 */
export function frameFromError(error, code, options = {}) {
  const sourceName =
    typeof options.sourceName === 'string' && options.sourceName.trim() !== ''
      ? options.sourceName.trim().replace(/[\r\n]+/g, ' ')
      : DEFAULT_SOURCE_NAME
  const maxFrameLines = Math.min(
    Math.max(Number.isInteger(options.maxFrameLines) ? options.maxFrameLines : DEFAULT_MAX_FRAME_LINES, 1),
    MAX_FRAME_LINES_LIMIT,
  )

  const stack = error !== null && typeof error === 'object' ? error.stack : undefined
  if (typeof stack !== 'string') return undefined

  // SWC puts the frame before the first blank line; the stack trace follows.
  const frameBlock = stack.split(/\r?\n\r?\n/, 1)[0]
  const rawLines = frameBlock.split(/\r?\n/)
  const header = /^:(\d+)$/.exec(rawLines[0] ?? '')
  if (header === null) return undefined

  // In the wrapped program, line 1 is the synthetic function header.
  const wrappedLine = Number(header[1])
  if (!Number.isInteger(wrappedLine) || wrappedLine < 2) return undefined

  const body = rawLines.slice(1)
  if (body.length === 0) return undefined

  const caretIndex = body.findIndex(line => CARET_LINE.test(line))
  const caretLine = caretIndex === -1 ? undefined : body[caretIndex]
  const sourceBody = caretIndex === -1 ? body : [...body.slice(0, caretIndex), ...body.slice(caretIndex + 1)]

  // SWC shows one line of context before the error line (two lines before the
  // caret) when available. Recover which wrapped line each remaining line is.
  const firstWrapped =
    caretIndex === -1
      ? Math.max(1, wrappedLine - 1)
      : caretIndex === 0
        ? wrappedLine
        : Math.max(1, wrappedLine - (caretIndex - 1))

  const sourceLineCount = code.split(/\r?\n/).length
  const userErrorLine = Math.min(Math.max(wrappedLine - 1, 1), sourceLineCount)

  const entries = sourceBody.map((text, index) => ({ wrappedLine: firstWrapped + index, text }))
  const kept = entries.filter(entry => {
    const userLine = entry.wrappedLine - 1
    return userLine >= 1 && userLine <= sourceLineCount
  })

  const lines = []
  let caretPlaced = false
  for (const entry of kept) {
    lines.push(entry.text)
    if (caretLine !== undefined && !caretPlaced && entry.wrappedLine === wrappedLine) {
      lines.push(caretLine)
      caretPlaced = true
    }
  }
  if (lines.length === 0) return `${sourceName}:${userErrorLine}`

  return `${sourceName}:${userErrorLine}\n${capFrame(lines, maxFrameLines).join('\n')}`
}

/**
 * Keep at most `maxFrameLines` body lines, preferring the lines around the caret.
 *
 * @param {string[]} lines
 * @param {number} maxFrameLines
 * @returns {string[]}
 */
function capFrame(lines, maxFrameLines) {
  if (lines.length <= maxFrameLines) return lines
  const caretIndex = lines.findIndex(line => CARET_LINE.test(line))
  const anchor = caretIndex === -1 ? 0 : caretIndex
  const start = Math.min(Math.max(0, anchor - Math.floor(maxFrameLines / 2)), lines.length - maxFrameLines)
  return lines.slice(start, start + maxFrameLines)
}

/**
 * Insert the frame directly after the parser's own message, before any context
 * the runtime appended (logs, sandbox state, escalation guidance).
 *
 * Falls back to appending to the last text block when the runtime (or another
 * plugin) produced content that no longer contains the raw message verbatim.
 *
 * @param {ReadonlyArray<{ type: string, text?: string }>} content
 * @param {string} anchor - the exact parser-message prefix.
 * @param {string} addition - the frame text.
 * @returns {Array<Record<string, unknown>> | undefined}
 */
function insertFrame(content, anchor, addition) {
  const blocks = content.slice()
  let lastText = -1
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!isTextBlock(block)) continue
    lastText = index
    const at = block.text.indexOf(anchor)
    if (at === -1) continue
    const after = at + anchor.length
    const next = block.text[after]
    if (next !== undefined && next !== '\n' && next !== '\r') continue
    const eol = next === '\r' ? '\r\n' : '\n'
    const payload = eol === '\r\n' ? addition.replace(/\r?\n/g, '\r\n') : addition
    blocks[index] = {
      ...block,
      text: `${block.text.slice(0, after)}${eol}${payload}${block.text.slice(after)}`,
    }
    return blocks
  }
  if (lastText === -1) {
    return [...blocks, { type: 'text', text: addition }]
  }
  const block = blocks[lastText]
  blocks[lastText] = { ...block, text: `${block.text}\n${addition}` }
  return blocks
}

/**
 * @param {unknown} block
 * @returns {block is { type: 'text', text: string }}
 */
function isTextBlock(block) {
  return block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string'
}

/**
 * Whether the text already carries this plugin's position line.
 *
 * @param {string} text
 * @param {string} sourceName
 * @returns {boolean}
 */
function hasPosition(text, sourceName) {
  const escaped = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)\\s*${escaped}:\\d+(?::\\d+)?`).test(text)
}
