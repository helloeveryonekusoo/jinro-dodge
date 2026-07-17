// テキストチャット UI

const panel = () => document.getElementById('chat-panel');
const log = () => document.getElementById('chat-log');

/** チャットパネルを表示し、送信時コールバックを設定する */
export function initChat(onSend) {
  panel().classList.remove('hidden');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) onSend(text);
    input.value = '';
  });
}

export function addChatMessage(from, text) {
  const line = document.createElement('div');
  line.className = 'chat-line';
  const name = document.createElement('span');
  name.className = 'chat-name';
  name.textContent = `${from}: `;
  line.appendChild(name);
  line.appendChild(document.createTextNode(text));
  log().appendChild(line);
  log().scrollTop = log().scrollHeight;
}

/** システムメッセージ（ログ・接続通知など） */
export function addSystemMessage(text) {
  const line = document.createElement('div');
  line.className = 'chat-line chat-system';
  line.textContent = text;
  log().appendChild(line);
  log().scrollTop = log().scrollHeight;
}
