// フェーズ切り替え（タイマー終了）のチャイム音
// 音声ファイル不要の Web Audio API で生成する。
// ブラウザの自動再生制限のため、最初のユーザー操作で initSound() を呼んでおく。

let ctx = null;

export function initSound() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return; // 未対応環境では無音のまま
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function beep(freq, startAfterSec, durationSec, volume = 0.25) {
  const t = ctx.currentTime + startAfterSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + durationSec + 0.05);
}

/** フェーズ切り替えのチャイム（ピンポン） */
export function playChime() {
  if (!ctx || ctx.state !== 'running') return;
  beep(880, 0, 0.25);
  beep(660, 0.2, 0.4);
}

/** 投票開始の強調チャイム（3音上昇） */
export function playVoteChime() {
  if (!ctx || ctx.state !== 'running') return;
  beep(660, 0, 0.2);
  beep(880, 0.18, 0.2);
  beep(1100, 0.36, 0.45);
}
