/** Prefix applied to all extension console output. */
const PREFIX = '[CSH]'

/**
 * Prepends the CSH prefix to the first argument if it's a string,
 * otherwise passes the prefix as a separate argument.
 */
function formatArgs(args) {
  if (args.length === 0) return [PREFIX]

  const first = args[0]
  if (typeof first === 'string') {
    return [PREFIX + ' ' + first, ...args.slice(1)]
  }

  return [PREFIX, ...args]
}

/** Namespaced console wrapper that tags all output with [CSH]. */
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
