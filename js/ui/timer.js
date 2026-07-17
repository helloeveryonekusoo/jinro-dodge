// 議論タイマーの表示（進行の権威はホスト側 Engine の setTimeout）

let handle = null;

/** 指定要素で秒数のカウントダウン表示を開始する */
export function startTimer(el, seconds) {
  stopTimer();
  let remain = seconds;
  const render = () => {
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    el.classList.toggle('warning', remain <= 30);
  };
  render();
  handle = setInterval(() => {
    remain = Math.max(0, remain - 1);
    render();
    if (remain === 0) stopTimer();
  }, 1000);
}

export function stopTimer() {
  if (handle) { clearInterval(handle); handle = null; }
}
