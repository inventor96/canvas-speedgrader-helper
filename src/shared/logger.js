const PREFIX = '[CSH]'

function formatArgs(args) {
  if (args.length === 0) return [PREFIX]

  const first = args[0]
  if (typeof first === 'string') {
    return [PREFIX + ' ' + first, ...args.slice(1)]
  }

  return [PREFIX, ...args]
}

export const logger = {
  log(...args) {
    console.log(...formatArgs(args))
  },
  warn(...args) {
    console.warn(...formatArgs(args))
  },
  error(...args) {
    console.error(...formatArgs(args))
  },
  info(...args) {
    console.info(...formatArgs(args))
  },
  debug(...args) {
    console.debug(...formatArgs(args))
  },
}
