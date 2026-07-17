// システム通知のトースト表示（チャットの代わり）

export function showToast(text, durationMs = 6000) {
  const area = document.getElementById('toast-area');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  area.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}
