function handleEPIPE(
  stream: NodeJS.WriteStream,
): (err: NodeJS.ErrnoException) => void {
  return (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      stream.destroy()
    }
  }
}

// Prevents memory leak when pipe is broken (e.g., `claude -p | head -1`)
export function registerProcessOutputErrorHandlers(): void {
  process.stdout.on('error', handleEPIPE(process.stdout))
  process.stderr.on('error', handleEPIPE(process.stderr))
}

function writeOut(stream: NodeJS.WriteStream, data: string): void {
  if (stream.destroyed) {
    return
  }

  // Note: we don't handle backpressure (write() returning false).
  //
  // We should consider handling the callback to ensure we wait for data to flush.
  stream.write(data /* callback to handle here */)
}

export function writeToStdout(data: string): void {
  writeOut(process.stdout, data)
}

export function writeToStderr(data: string): void {
  writeOut(process.stderr, data)
}

// Write error to stderr and exit with code 1. Consolidates the
// console.error + process.exit(1) pattern used in entrypoint fast-paths.
export function exitWithError(message: string): never {
  // biome-ignore lint/suspicious/noConsole:: intentional console output
  console.error(message)
  // eslint-disable-next-line custom-rules/no-process-exit
  process.exit(1)
}

// Wait for a stdin-like stream to close, but give up after ms if no data ever
// arrives. First data chunk cancels the timeout — after that, wait for end
// unconditionally (caller's accumulator needs all chunks, not just the first).
// Returns true on timeout, false on end. Used by -p mode to distinguish a
// real pipe producer from an inherited-but-idle parent stdin.
export function peekForStdinData(
  stream: NodeJS.EventEmitter,
  ms: number,
): Promise<boolean> {
  const streamState = stream as NodeJS.EventEmitter & {
    closed?: boolean
    destroyed?: boolean
    readableEnded?: boolean
  }
  if (
    streamState.readableEnded === true ||
    streamState.destroyed === true ||
    streamState.closed === true
  ) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>(resolve => {
    const done = (timedOut: boolean) => {
      clearTimeout(peek)
      stream.off('end', onEnd)
      stream.off('data', onFirstData)
      void resolve(timedOut)
    }
    const onEnd = () => done(false)
    const onFirstData = () => clearTimeout(peek)
    // eslint-disable-next-line no-restricted-syntax -- not a sleep: races timeout against stream end/data events
    const peek = setTimeout(done, ms, true)
    stream.once('end', onEnd)
    stream.once('data', onFirstData)
  })
}

export function readTextFromStdinWithTimeout(
  stream: NodeJS.EventEmitter,
  ms: number,
): Promise<{ text: string; timedOut: boolean }> {
  const streamState = stream as NodeJS.EventEmitter & {
    closed?: boolean
    destroyed?: boolean
    readableEnded?: boolean
  }

  return new Promise(resolve => {
    let text = ''
    let sawData = false
    let resolved = false

    const done = (timedOut: boolean) => {
      if (resolved) {
        return
      }
      resolved = true
      clearTimeout(peek)
      stream.off('end', onEnd)
      stream.off('data', onData)
      resolve({ text, timedOut })
    }
    const onEnd = () => done(false)
    const onData = (chunk: unknown) => {
      sawData = true
      clearTimeout(peek)
      text += Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk)
    }
    // eslint-disable-next-line no-restricted-syntax -- races idle inherited stdin against real pipe data
    const peek = setTimeout(() => {
      if (!sawData) {
        done(true)
      }
    }, ms)

    stream.on('data', onData)
    stream.once('end', onEnd)

    if (
      streamState.readableEnded === true ||
      streamState.destroyed === true ||
      streamState.closed === true
    ) {
      done(false)
    }
  })
}
