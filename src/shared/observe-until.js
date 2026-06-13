export function observeUntil(predicate, options = {}) {
  const {
    timeout = 15000,
    container = document.body,
    rejectOnTimeout = false,
    timeoutError = 'observeUntil: condition not met within timeout',
    observerOptions = { childList: true, subtree: true },
  } = options;

  const initialResult = predicate();
  if (initialResult) return Promise.resolve(initialResult);

  return new Promise((resolve, reject) => {
    let finished = false;

    const done = (value, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      observer.disconnect();
      if (error) reject(error);
      else resolve(value);
    };

    if (!container) {
      done(null, new Error('observeUntil: container element is null'));
      return;
    }

    const observer = new MutationObserver(() => {
      const result = predicate();
      if (result) done(result);
    });

    observer.observe(container, observerOptions);

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
