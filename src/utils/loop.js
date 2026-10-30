/** Runs fn now and then intervalMs after each run has finished, so runs never overlap. */
export function startLoop(fn, intervalMs, onError = (error) => console.error(error)) {
  let stopped = false;
  let timer;
  let current;

  const tick = async () => {
    try {
      await fn();
    } catch (error) {
      onError(error);
    }
    if (!stopped) timer = setTimeout(() => { current = tick(); }, intervalMs);
  };
  current = tick();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}
