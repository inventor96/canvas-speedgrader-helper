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

/** Canvas uses sentry for APM, which overrides the standard console methods. This function ensures we use the original console methods. */
function getConsoleMethodInstance(method) {
  let methodInstance = console[method]
  while (methodInstance && methodInstance.__sentry_original__) {
    methodInstance = methodInstance.__sentry_original__
  }
  return methodInstance || console[method]
}

/** Namespaced console wrapper that tags all output with [CSH]. */
export const logger = {
  log(...args) {
    getConsoleMethodInstance('log')(...formatArgs(args))
  },
  warn(...args) {
    getConsoleMethodInstance('warn')(...formatArgs(args))
  },
  error(...args) {
    getConsoleMethodInstance('error')(...formatArgs(args))
  },
  info(...args) {
    getConsoleMethodInstance('info')(...formatArgs(args))
  },
  debug(...args) {
    getConsoleMethodInstance('debug')(...formatArgs(args))
  },
}
