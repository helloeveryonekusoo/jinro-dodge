// クライアント側の通信管理
// ルームコードからホストのピアIDを組み立てて接続する。

import { C2H } from './protocol.js';
import { ID_PREFIX } from './host.js';

export class ClientNet {
  /**
   * @param {string} code - ルームコード
   * @param {string} name - プレイヤー名
   * @param {Object} handlers - {onMessage, onOpen, onError, onClose}
   */
  connect(code, name, { onMessage, onOpen, onError, onClose }) {
    this.peer = new Peer();
    this.conn = null;
    let opened = false;

    // 15秒たっても接続できなければエラー表示
    const timeout = setTimeout(() => {
      if (opened) return;
      this.peer.destroy();
      onError('接続がタイムアウトしました。ルームコードとインターネット接続を確認してください。');
    }, 15000);

    this.peer.on('open', () => {
      const conn = this.peer.connect(ID_PREFIX + code.toUpperCase(), { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        opened = true;
        clearTimeout(timeout);
        conn.send({ type: C2H.JOIN, name });
        onOpen();
      });
      conn.on('data', (msg) => onMessage(msg));
      conn.on('close', () => onClose());
      conn.on('error', () => onClose());
    });

    this.peer.on('error', (err) => {
      clearTimeout(timeout);
      if (err.type === 'peer-unavailable') {
        onError('部屋が見つかりません。ルームコードを確認してください。');
      } else {
        onError(`接続エラー: ${err.type || err.message}`);
      }
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }
}
