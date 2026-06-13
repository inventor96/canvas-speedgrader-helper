/**
 * Waits for a DOM predicate to return truthy, polling via MutationObserver.
 * Resolves with the predicate's return value or the final check on timeout.
 */
export function observeUntil(predicate, options = {}) {
  const {
    timeout = 15000,
    container = document.body,
    rejectOnTimeout = false,
    timeoutError = 'observeUntil: condition not met within timeout',
    observerOptions = { childList: true, subtree: true },
  } = options;

  // Short-circuit if already satisfied
  const initialResult = predicate();
  if (initialResult) return Promise.resolve(initialResult);

  return new Promise((resolve, reject) => {
    let finished = false;

    // Guarded completion helper to avoid double-settle
    const done = (value, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      observer.disconnect();
      if (error) reject(error);
      else resolve(value);
    };

    // Bail if container vanished from DOM
    if (!container) {
      done(null, new Error('observeUntil: container element is null'));
      return;
    }

    // Watch DOM mutations and re-check predicate
    const observer = new MutationObserver(() => {
      const result = predicate();
      if (result) done(result);
    });

    observer.observe(container, observerOptions);

    // Fallback: re-check once after timeout even if observer never fired
    const timeoutId = setTimeout(() => {
      if (finished) return;
      const finalResult = predicate();
      if (rejectOnTimeout && !finalResult) {
        done(null, new Error(timeoutError));
      } else {
        done(finalResult);
      }
    }, timeout);
  });
}
