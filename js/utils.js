/** Cancellable debounce for live input. */
export function debounce(callback, delay = 300) {
  let timer;
  const run = (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); };
  run.cancel = () => clearTimeout(timer);
  return run;
}
