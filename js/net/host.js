// ホスト側の通信管理
// PeerJS でルームを作成し、クライアントの接続を受け付けて Engine に中継する。
// ホスト自身も1プレイヤーとして参加する（ネットワークを介さずローカル配送）。

import { C2H, H2C } from './protocol.js';
import { Engine } from '../game/engine.js';

export const ID_PREFIX = 'jinro-dodge-';
// 紛らわしい文字（I/O/0/1）を除いたコード用文字
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOST_PLAYER_ID = 'host';

function randomCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class HostNet {
  /**
   * @param {Array} roles - 役職定義
   * @param {Function} onMessage - onMessage(msg) ホスト自身（プレイヤーとして）へのメッセージ
   */
  constructor(roles, onMessage) {
    this.onMessage = onMessage;
    this.conns = new Map(); // playerId -> DataConnection
    this.peer = null;
    this.roomCode = '';
    this.engine = new Engine(roles, (playerId, msg) => {
      if (playerId === HOST_PLAYER_ID) {
        // ホスト自身へはローカル配送（非同期にして送信順を保つ）
        setTimeout(() => this.onMessage(msg), 0);
      } else {
        const conn = this.conns.get(playerId);
        if (conn && conn.open) conn.send(msg);
      }
    });
  }

  /** ルームを作成する。コード衝突時はリトライ。 */
  start(hostName, onReady, onError, retry = 0) {
    this.roomCode = randomCode();
    this.peer = new Peer(ID_PREFIX + this.roomCode);
    let settled = false;

    // 15秒たっても接続できなければエラー表示（通信環境の問題など）
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      this.peer.destroy();
      onError('部屋の作成がタイムアウトしました。インターネット接続を確認して、もう一度お試しください。');
    }, 15000);

    this.peer.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      this.engine.addPlayer(HOST_PLAYER_ID, hostName);
      onReady(this.roomCode);
    });

    this.peer.on('connection', (conn) => {
      conn.on('data', (msg) => this.handleClientMsg(conn, msg));
      const drop = () => {
        for (const [pid, c] of this.conns) {
          if (c === conn) {
            this.conns.delete(pid);
            this.engine.removePlayer(pid);
            break;
          }
        }
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });

    this.peer.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err.type === 'unavailable-id' && retry < 5) {
        // コード衝突 → 再生成
        this.peer.destroy();
        this.start(hostName, onReady, onError, retry + 1);
      } else {
        onError(`接続エラー: ${err.type || err.message}`);
      }
    });
  }

  handleClientMsg(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const playerId = conn.peer;
    if (msg.type === C2H.JOIN) {
      this.conns.set(playerId, conn);
      this.engine.addPlayer(playerId, msg.name);
      return;
    }
    this.route(playerId, msg);
  }

  /** クライアント／ホスト共通のメッセージルーティング */
  route(playerId, msg) {
    const e = this.engine;
    switch (msg.type) {
      case C2H.PICK: e.handlePick(playerId, msg.index); break;
      case C2H.DAWN_ACT: e.handleDawnAct(playerId, msg); break;
      case C2H.AFT_ACT: e.handleAftAct(playerId, msg); break;
      case C2H.VOTE: e.handleVote(playerId, msg.targetId); break;
      case C2H.CHAT: {
        const p = e.getPlayer(playerId);
        const text = String(msg.text || '').slice(0, 100);
        if (p && text) e.broadcast({ type: H2C.CHAT, from: p.name, text });
        break;
      }
    }
  }

  /** ホスト自身のプレイヤー操作（カード選択・投票など） */
  sendAsPlayer(msg) { this.route(HOST_PLAYER_ID, msg); }

  // ホスト専用コマンド
  startGame() { this.engine.startGame(); }
  endDay() { this.engine.endDay(); }
  endEvening() { this.engine.endEvening(); }
  nextGame() { this.engine.nextGame(); }
}
