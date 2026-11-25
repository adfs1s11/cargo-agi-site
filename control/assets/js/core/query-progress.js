// The service returns one response. Report observed stages and elapsed time.
export function showQueryProgress(container, initialStage) {
  const started = performance.now();
  const bar = document.createElement('progress');
  bar.setAttribute('aria-hidden', 'true');
  bar.style.cssText = 'width:3.5rem;height:.55rem;vertical-align:middle;margin-right:.5rem';
  const stage = document.createElement('span');
  const elapsed = document.createElement('span');
  elapsed.setAttribute('aria-hidden', 'true');
  stage.textContent = initialStage;
  container.replaceChildren(bar, stage, elapsed);
  function tick() {
    if (!container.isConnected) return stop();
    const seconds = Math.floor((performance.now() - started) / 1000);
    if (seconds >= 2) {
      elapsed.textContent = ' · ' + seconds + '초 경과';
      container.dataset.queryDelayed = 'true';
    }
  }
  const timer = setInterval(tick, 1000);
  function stop() {
    clearInterval(timer);
    delete container.dataset.queryDelayed;
  }
  return {stage(text) { stage.textContent = text; }, stop};
}
