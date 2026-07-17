// エントリポイント
// 画面イベント → 通信層 → (ホストなら)Engine、受信メッセージ → 画面描画 を仲介する。

import { loadRoles } from './data/csv.js';
import { C2H, H2C } from './net/protocol.js';
import { HostNet } from './net/host.js';
import { ClientNet } from './net/client.js';
import * as ui from './ui/screens.js';
import { initChat, addChatMessage, addSystemMessage } from './ui/chat.js';
import { startTimer, stopTimer } from './ui/timer.js';

const $ = (id) => document.getElementById(id);

const state = {
  isHost: false,
  selfId: null,
  hostNet: null,
  clientNet: null,
  roomCode: '',
};

/** 自分のプレイヤー操作をホスト（＝エンジン）へ送る */
function sendToHost(msg) {
  if (state.isHost) state.hostNet.sendAsPlayer(msg);
  else state.clientNet.send(msg);
}

// ---------- 受信メッセージの処理 ----------

function handleMessage(msg) {
  switch (msg.type) {
    case H2C.JOINED:
      state.selfId = msg.selfId;
      break;

    case H2C.LOBBY:
      ui.renderLobby(msg, state.isHost, state.roomCode);
      break;

    case H2C.ERROR:
      if ($('screen-lobby').classList.contains('hidden') && $('screen-home').classList.contains('hidden')) {
        addSystemMessage(`⚠ ${msg.msg}`);
      } else {
        alert(msg.msg);
      }
      break;

    case H2C.PICK:
      stopTimer();
      ui.hideMyCard();
      ui.clearAfternoonLog();
      ui.renderPick(msg, (index) => sendToHost({ type: C2H.PICK, index }));
      break;

    case H2C.WAITING:
      if (msg.what === 'pick') ui.setPickWaiting(msg.done, msg.total);
      else if (msg.what === 'dawn') ui.setDawnWaiting(msg.done, msg.total);
      else if (msg.what === 'vote') ui.setVoteWaiting(msg.done, msg.total);
      break;

    case H2C.DAWN:
      ui.setMyCard(msg.you);
      ui.renderDawn(msg, {
        onAct: (act) => sendToHost({ type: C2H.DAWN_ACT, ...act }),
        onReady: () => sendToHost({ type: C2H.READY }),
      });
      break;

    case H2C.DAWN_RESULT:
      ui.showDawnResult(msg);
      break;

    case H2C.DAY:
      ui.showScreen('day');
      startTimer($('day-timer'), msg.duration);
      break;

    case H2C.AFTERNOON:
      stopTimer();
      ui.renderAfternoon(msg, (act) => sendToHost({ type: C2H.AFT_ACT, ...act }));
      break;

    case H2C.AFT_RESULT:
      ui.showAfternoonResult(msg);
      break;

    case H2C.YOUR_CARD:
      ui.setMyCard(msg.card);
      addSystemMessage(`🎧 DJによってあなたの使用カードが「${msg.card.name}」に変わりました！`);
      break;

    case H2C.LOG:
      ui.addAfternoonLog(msg.text);
      addSystemMessage(msg.text);
      break;

    case H2C.EVENING:
      ui.showScreen('evening');
      startTimer($('evening-timer'), msg.duration);
      break;

    case H2C.VOTE:
      stopTimer();
      ui.renderVote(msg, state.selfId, (targetId) => sendToHost({ type: C2H.VOTE, targetId }));
      break;

    case H2C.RESULT:
      ui.renderResult(msg, state.isHost);
      break;

    case H2C.CHAT:
      addChatMessage(msg.from, msg.text);
      break;
  }
}

// ---------- 画面イベントの配線 ----------

function getName() {
  if (typeof Peer === 'undefined') {
    ui.setHomeError('通信ライブラリを読み込めませんでした。インターネット接続を確認してページを再読み込みしてください。');
    return null;
  }
  const name = $('input-name').value.trim();
  if (!name) {
    ui.setHomeError('名前を入力してください');
    return null;
  }
  return name;
}

function enterGameUI() {
  initChat((text) => sendToHost({ type: C2H.CHAT, text }));
  ui.setupHostButtons(state.isHost);
}

$('btn-create').addEventListener('click', async () => {
  const name = getName();
  if (!name) return;
  ui.setHomeError('');
  ui.setHomeStatus('部屋を作成中…');
  $('btn-create').disabled = true;

  let roles;
  try {
    roles = await loadRoles();
  } catch (e) {
    ui.setHomeError(e.message);
    $('btn-create').disabled = false;
    return;
  }

  state.isHost = true;
  state.hostNet = new HostNet(roles, handleMessage);
  state.hostNet.start(
    name,
    (code) => {
      state.roomCode = code;
      ui.setRoomCode(code);
      ui.setHomeStatus('');
      enterGameUI();
      // ロビー画面は LOBBY メッセージ受信時に描画される
    },
    (err) => {
      ui.setHomeError(err);
      $('btn-create').disabled = false;
      state.isHost = false;
    },
  );
});

$('btn-join').addEventListener('click', () => {
  const name = getName();
  if (!name) return;
  const code = $('input-code').value.trim().toUpperCase();
  if (code.length < 4) {
    ui.setHomeError('4文字のルームコードを入力してください');
    return;
  }
  ui.setHomeError('');
  ui.setHomeStatus('接続中…');
  $('btn-join').disabled = true;

  state.isHost = false;
  state.roomCode = code;
  state.clientNet = new ClientNet();
  state.clientNet.connect(code, name, {
    onMessage: handleMessage,
    onOpen: () => {
      ui.setRoomCode(code);
      ui.setHomeStatus('');
      enterGameUI();
    },
    onError: (err) => {
      ui.setHomeError(err);
      ui.setHomeStatus('');
      $('btn-join').disabled = false;
    },
    onClose: () => {
      addSystemMessage('⚠ ホストとの接続が切れました。ページを再読み込みして入り直してください。');
    },
  });
});

// ホスト専用ボタン
$('btn-start').addEventListener('click', () => state.hostNet.startGame());
$('btn-end-day').addEventListener('click', () => state.hostNet.endDay());
$('btn-end-evening').addEventListener('click', () => state.hostNet.endEvening());
$('btn-next-game').addEventListener('click', () => state.hostNet.nextGame());

// Enterキーで参加しやすく
$('input-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-join').click();
});
