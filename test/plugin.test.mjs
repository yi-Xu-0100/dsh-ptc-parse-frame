import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, decorate, frameFromError, parseFrame, resolveOptions } from '../index.js'

const PARSE_MESSAGE = "Expected ',', got 'string literal'"
const FAILURE_MESSAGE = `code run failed (exception): ${PARSE_MESSAGE}`
const SANDBOX_SUFFIX = '\nFile sandbox: workspace-write.'

/** Build the normalized failure a `run_code` parse error produces. */
function failureResult(message = FAILURE_MESSAGE) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: ${message}` }],
    error: { message },
  }
}

/** Build a normalized `run_code` execution. */
function runCode(code) {
  return { name: 'run_code', arguments: { code, description: 'check syntax' } }
}

/** Register the plugin against a minimal Cordis context and return its listener. */
function listenerFor(config = {}) {
  let listener
  const ctx = {
    on(name, callback) {
      assert.equal(name, 'tools/post-execute')
      listener = callback
      return () => {}
    },
  }
  apply(ctx, config)
  assert.equal(typeof listener, 'function')
  return listener
}

test('line 1 failure reports run_code.ts:1 with the caret frame', () => {
  const frame = parseFrame('const a = ["x" "y"];\nreturn a.length;', resolveOptions({}))
  assert.ok(frame)
  assert.equal(frame.message, PARSE_MESSAGE)
  assert.equal(
    frame.text,
    ['run_code.ts:1', 'const a = ["x" "y"];', '               ^^^', 'return a.length;'].join('\n'),
  )
})

test('a later failure reports the user line, not the wrapped line', () => {
  const code = ['const a = [1, 2, 3];', 'const b = ["x" "y"];', 'return b.length;'].join('\n')
  const frame = parseFrame(code, resolveOptions({}))
  assert.ok(frame)
  assert.match(frame.text, /^run_code\.ts:2\n/)
  assert.ok(!frame.text.includes('async function __dsh_program__'))
  assert.equal(frame.text, ['run_code.ts:2', 'const a = [1, 2, 3];', 'const b = ["x" "y"];', '               ^^^', 'return b.length;'].join('\n'))
})

test('a runtime exception is not framed', () => {
  assert.equal(parseFrame('throw new Error("boom")', resolveOptions({})), undefined)
})

test('a valid program is not framed', () => {
  assert.equal(parseFrame('return 1', resolveOptions({})), undefined)
})

test('a missing stack falls back to no frame', () => {
  assert.equal(frameFromError({ name: 'SyntaxError' }, 'const a = ["x" "y"];', {}), undefined)
  assert.equal(frameFromError({ stack: 'not a frame' }, 'const a = ["x" "y"];', {}), undefined)
})

test('a last-line failure keeps the user line and drops the wrapper suffix', () => {
  const code = ['const a = 1;', 'const b = 2;', 'const c = ["x" "y"];'].join('\n')
  const frame = parseFrame(code, resolveOptions({}))
  assert.ok(frame)
  assert.equal(frame.text, ['run_code.ts:3', 'const b = 2;', 'const c = ["x" "y"];', '               ^^^'].join('\n'))
})

test('an end-of-file failure without a caret still reports a line', () => {
  const frame = parseFrame('if (true) {\nreturn 1;', resolveOptions({}))
  assert.ok(frame)
  assert.match(frame.text, /^run_code\.ts:2\n/)
  assert.ok(frame.text.includes('return 1;'))
})

test('a long program is bounded by maxFrameLines', () => {
  const lines = Array.from({ length: 200 }, (_, index) => `const value${index} = ${index};`)
  lines[99] = 'const broken = ["x" "y"];'
  const frame = parseFrame(lines.join('\n'), resolveOptions({ maxFrameLines: 3 }))
  assert.ok(frame)
  assert.match(frame.text, /^run_code\.ts:100\n/)
  assert.ok(frame.text.split('\n').length <= 4, `frame was ${frame.text.split('\n').length} lines`)
  assert.ok(frame.text.includes('^^^'))
})

test('non-ASCII source and backslashes survive verbatim', () => {
  const frame = parseFrame('const a = ["中文" "y"];\nconst b = "C:\\\\tmp";', resolveOptions({}))
  assert.ok(frame)
  assert.match(frame.text, /^run_code\.ts:1\n/)
  assert.ok(frame.text.includes('const a = ["中文" "y"];'))
  assert.ok(frame.text.includes('^^^'))
})

test('CRLF input still reports the right line', () => {
  const frame = parseFrame('const a = [1, 2];\r\nconst b = ["x" "y"];\r\nreturn b.length;', resolveOptions({}))
  assert.ok(frame)
  assert.match(frame.text, /^run_code\.ts:2\n/)
  assert.ok(!frame.text.includes('\r'))
})

test('decorate appends the frame to the run_code error text', () => {
  const decision = { kind: 'accept' }
  const decorated = decorate(runCode('const a = ["x" "y"];'), failureResult(), decision, resolveOptions({}))
  assert.notEqual(decorated, decision)
  assert.equal(
    decorated.content[0].text,
    `Error: ${FAILURE_MESSAGE}\nrun_code.ts:1\nconst a = ["x" "y"];\n               ^^^`,
  )
})

test('decorate inserts the frame before the runtime sandbox suffix', () => {
  const message = FAILURE_MESSAGE + SANDBOX_SUFFIX
  const decorated = decorate(
    runCode('const a = ["x" "y"];\nreturn a.length;'),
    failureResult(message),
    { kind: 'accept' },
    resolveOptions({}),
  )
  assert.equal(
    decorated.content[0].text,
    `Error: ${FAILURE_MESSAGE}\nrun_code.ts:1\nconst a = ["x" "y"];\n               ^^^\nreturn a.length;${SANDBOX_SUFFIX}`,
  )
})

test('decorate keeps the sandbox suffix on a non-parse runtime failure', () => {
  const message = 'code run failed (exception): boom' + SANDBOX_SUFFIX
  const decision = { kind: 'accept' }
  assert.equal(
    decorate(runCode('throw new Error("boom")'), failureResult(message), decision, resolveOptions({})),
    decision,
  )
})

test('decorate follows CRLF result content', () => {
  const message = FAILURE_MESSAGE + '\r\nFile sandbox: workspace-write.'
  const decorated = decorate(
    runCode('const a = ["x" "y"];'),
    failureResult(message),
    { kind: 'accept' },
    resolveOptions({}),
  )
  assert.match(decorated.content[0].text, /string literal'\r\nrun_code\.ts:1\r\n/)
})

test('decorate preserves the rest of the downstream decision', () => {
  const marker = { marker: true }
  const decision = {
    kind: 'accept',
    additionalContexts: [marker],
    content: [{ type: 'text', text: 'downstream content' }],
  }
  const decorated = decorate(runCode('const a = ["x" "y"];'), failureResult(), decision, resolveOptions({}))
  assert.deepEqual(decorated.additionalContexts, [marker])
  assert.match(decorated.content[0].text, /^downstream content\nrun_code\.ts:1\n/)
})

test('decorate leaves non-accept decisions alone', () => {
  const block = { kind: 'block', feedback: [{ type: 'text', text: 'blocked' }] }
  assert.equal(decorate(runCode('const a = ["x" "y"];'), failureResult(), block, resolveOptions({})), block)

  const withValue = { kind: 'accept', value: { ok: true } }
  assert.equal(decorate(runCode('const a = ["x" "y"];'), failureResult(), withValue, resolveOptions({})), withValue)
})

test('decorate is scoped to failed run_code calls', () => {
  const decision = { kind: 'accept' }
  assert.equal(decorate({ name: 'pwsh', arguments: { code: 'x' } }, failureResult(), decision, resolveOptions({})), decision)
  assert.equal(
    decorate(runCode('const a = ["x" "y"];'), { ...failureResult(), isError: false }, decision, resolveOptions({})),
    decision,
  )
  assert.equal(decorate(runCode('return 1'), failureResult('code run failed (exception): boom'), decision, resolveOptions({})), decision)
  assert.equal(decorate(runCode('throw new Error("boom")'), failureResult('code run failed (exception): boom'), decision, resolveOptions({})), decision)
})

test('decorate ignores a failure whose message does not match the re-parse', () => {
  const decision = { kind: 'accept' }
  const mismatched = failureResult("code run failed (exception): Unexpected keyword 'return'")
  assert.equal(decorate(runCode('const a = ["x" "y"];'), mismatched, decision, resolveOptions({})), decision)
})

test('decorate is idempotent when a position is already present', () => {
  const decision = { kind: 'accept' }
  const framed = failureResult()
  framed.content[0].text += '\nrun_code.ts:1'
  assert.equal(decorate(runCode('const a = ["x" "y"];'), framed, decision, resolveOptions({})), decision)
})

test('decorate honors enabled: false', () => {
  const decision = { kind: 'accept' }
  assert.equal(
    decorate(runCode('const a = ["x" "y"];'), failureResult(), decision, resolveOptions({ enabled: false })),
    decision,
  )
})

test('the listener calls next once and returns the enriched decision', async () => {
  const listener = listenerFor()
  const decision = { kind: 'accept' }
  let calls = 0
  const result = await listener(runCode('const a = ["x" "y"];'), failureResult(), async () => {
    calls += 1
    return decision
  })
  assert.equal(calls, 1)
  assert.match(result.content[0].text, /\nrun_code\.ts:1\n/)
})

test('the listener returns the downstream decision when enrichment throws', async () => {
  const listener = listenerFor()
  const decision = { kind: 'accept' }
  const hostileExec = {
    get name() {
      throw new Error('plugin bug')
    },
    arguments: { code: 'const a = ["x" "y"];' },
  }
  const result = await listener(hostileExec, failureResult(), async () => decision)
  assert.equal(result, decision)
})

test('config is normalized with sane bounds', () => {
  assert.deepEqual(resolveOptions(undefined), { enabled: true, sourceName: 'run_code.ts', maxFrameLines: 10 })
  assert.deepEqual(resolveOptions({ enabled: false, sourceName: ' a.ts\nb ', maxFrameLines: 999 }), {
    enabled: false,
    sourceName: 'a.ts b',
    maxFrameLines: 40,
  })
  assert.deepEqual(resolveOptions({ maxFrameLines: 0 }), { enabled: true, sourceName: 'run_code.ts', maxFrameLines: 1 })
})
