// ゲームエンジン（ホストのみ実行される権威ロジック）
// カード配布・フェーズ進行・アクション解決・勝敗判定をすべてここで行い、
// 各プレイヤーには「その人が見てよい情報」だけを送信する。

import { H2C } from '../net/protocol.js';
import { buildDeck, deal, handSizeFor } from './deck.js';
import { judge, NOBODY } from './scoring.js';
import { roleView, playerView } from './views.js';

const DAY_SECONDS = 180;      // 昼の議論時間（約3分）
const EVENING_SECONDS = 300;  // 夕方の最終議論時間（5分）
const ACTION_SECONDS = 15;    // 役職アクションの制限時間（固定・短縮不可）

export class Engine {
  /**
   * @param {Array} roles - roles.csv から読み込んだ役職定義
   * @param {Function} send - send(playerId, msg) 個別送信コールバック
   */
  constructor(roles, send) {
    this.roles = roles;
    this.sendFn = send;
    this.players = [];      // {id, name, connected, score, hand, used, field, ...}
    this.hostId = null;
    this.phase = 'lobby';
    this.smallGame = false; // 3〜4人戦（ハウスルール②）
    this.timerHandle = null;
    this.steps = [];        // 昼過ぎのアクション手順
    this.stepIndex = -1;
    this.votes = {};
    this.voteCandidates = [];
  }

  send(playerId, msg) { this.sendFn(playerId, msg); }
  broadcast(msg) {
    for (const p of this.players) if (p.connected) this.send(p.id, msg);
  }
  log(text) { this.broadcast({ type: H2C.LOG, text }); }

  connectedPlayers() { return this.players.filter(p => p.connected); }
  getPlayer(id) { return this.players.find(p => p.id === id); }

  // ---------- ロビー ----------

  addPlayer(id, name) {
    if (this.phase !== 'lobby') {
      this.send(id, { type: H2C.ERROR, msg: 'ゲーム進行中のため参加できません。次のゲームまでお待ちください。' });
      return false;
    }
    if (this.players.length >= 8) {
      this.send(id, { type: H2C.ERROR, msg: '満員です（最大8人）。' });
      return false;
    }
    const safeName = String(name || '').trim().slice(0, 10) || `プレイヤー${this.players.length + 1}`;
    this.players.push({
      id, name: safeName, connected: true, score: 0,
      hand: [], used: null, field: [],
      picked: false, ready: false, dawnActed: false, dawnSkipped: false,
    });
    if (this.hostId === null) this.hostId = id;
    this.send(id, { type: H2C.JOINED, selfId: id });
    this.sendLobby();
    return true;
  }

  removePlayer(id) {
    const p = this.getPlayer(id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players = this.players.filter(x => x.id !== id);
      this.sendLobby();
      return;
    }
    p.connected = false;
    this.log(`（${p.name}さんの接続が切れました）`);
    // 進行が止まらないように各ゲートを再チェック（明け方・昼過ぎはタイマーで自動進行する）
    if (this.phase === 'pick') this.checkAllPicked();
    else if (this.phase === 'vote') this.checkAllVoted();
  }

  sendLobby() {
    const players = this.players.map(p => playerView(p, this.hostId));
    const roleList = this.roles.map(r => roleView(r));
    this.broadcast({
      type: H2C.LOBBY, players, roleList,
      canStart: this.players.length >= 3 && this.players.length <= 8,
    });
  }

  // ---------- ゲーム開始・配布 ----------

  startGame() {
    if (this.phase !== 'lobby' && this.phase !== 'result') return;
    // 再戦時は切断者を除いたメンバーで開始する
    if (this.phase === 'result') {
      this.players = this.connectedPlayers();
    }
    const count = this.players.length;
    if (count < 3 || count > 8) {
      this.send(this.hostId, { type: H2C.ERROR, msg: '3〜8人で開始できます。' });
      return;
    }
    this.smallGame = count <= 4;

    let hands;
    try {
      hands = deal(buildDeck(this.roles, count), count);
    } catch (e) {
      this.send(this.hostId, { type: H2C.ERROR, msg: e.message });
      return;
    }

    this.players.forEach((p, i) => {
      p.hand = hands[i];
      p.used = null;
      p.field = [];
      p.picked = false;
      p.ready = false;
      p.dawnActed = false;
      p.dawnSkipped = false;
    });
    this.votes = {};
    this.phase = 'pick';

    for (const p of this.players) {
      this.send(p.id, {
        type: H2C.PICK,
        cards: p.hand.map(roleView),
        handSize: handSizeFor(count),
        smallGame: this.smallGame,
        // 全員分のカードを裏向きで表示してメモできるように、名前一覧を送る
        players: this.players.map(q => ({ id: q.id, name: q.name })),
      });
    }
  }

  handlePick(id, index) {
    if (this.phase !== 'pick') return;
    const p = this.getPlayer(id);
    if (!p || p.picked) return;
    const i = Number(index);
    if (!(i >= 0 && i < p.hand.length)) return;
    p.used = p.hand[i];
    p.field = p.hand.filter((_, k) => k !== i);
    p.picked = true;
    this.checkAllPicked();
  }

  checkAllPicked() {
    // 切断者は自動的に1枚目を使用
    for (const p of this.players) {
      if (!p.connected && !p.picked) {
        p.used = p.hand[0];
        p.field = p.hand.slice(1);
        p.picked = true;
      }
    }
    const done = this.players.filter(p => p.picked).length;
    if (done < this.players.length) {
      this.broadcast({ type: H2C.WAITING, what: 'pick', done, total: this.players.length });
      return;
    }
    this.startDawn();
  }

  // ---------- 明け方（15秒固定・短縮不可） ----------

  startDawn() {
    this.phase = 'dawn';
    const fieldCount = handSizeFor(this.players.length) - 1;
    for (const p of this.players) {
      if (!p.connected) continue;
      const msg = {
        type: H2C.DAWN, you: roleView(p.used),
        smallGame: this.smallGame, duration: ACTION_SECONDS, fieldCount,
      };
      const role = p.used;
      if (role.phase === '明け方' && role.action === 'mate_check') {
        // 人狼: 仲間確認
        msg.mates = this.players
          .filter(q => q.id !== p.id && q.used.id === role.id)
          .map(q => q.name);
      } else if (role.phase === '明け方' && role.action !== 'none') {
        // 占い師など: 対象を選ぶアクション
        msg.action = {
          actionType: role.action,
          canSkip: this.smallGame, // ハウスルール②: 少人数戦は占いを延期できる
          targets: this.players.filter(q => q.id !== p.id).map(q => ({ id: q.id, name: q.name })),
        };
      }
      this.send(p.id, msg);
    }
    // 全員同じ15秒。誰が何をしているかタイミングからは分からない
    clearTimeout(this.timerHandle);
    this.timerHandle = setTimeout(() => {
      if (this.phase === 'dawn') this.startDay();
    }, ACTION_SECONDS * 1000);
  }

  /** 明け方の終了処理: 時間切れで占えなかった占い師は昼過ぎに持ち越す */
  carryOverDawnActors() {
    for (const p of this.players) {
      const r = p.used;
      if (r.phase === '明け方' && r.action !== 'none' && r.action !== 'mate_check' && !p.dawnActed) {
        p.dawnSkipped = true;
      }
    }
  }

  handleDawnAct(id, { skip, targetId }) {
    if (this.phase !== 'dawn') return;
    const p = this.getPlayer(id);
    if (!p || p.dawnActed) return;
    const role = p.used;
    if (role.phase !== '明け方' || role.action === 'none' || role.action === 'mate_check') return;

    if (skip) {
      if (!this.smallGame) return; // 通常戦はスキップ不可
      p.dawnSkipped = true;
      p.dawnActed = true;
      this.send(id, { type: H2C.DAWN_RESULT, skipped: true });
      return;
    }
    const target = this.getPlayer(targetId);
    if (!target || target.id === id) return;
    p.dawnActed = true;
    // peek_used: 対象の使用カードを見る
    this.send(id, { type: H2C.DAWN_RESULT, targetName: target.name, card: roleView(target.used) });
  }

  // ---------- 昼（議論） ----------

  startDay() {
    this.carryOverDawnActors();
    this.phase = 'day';
    this.broadcast({ type: H2C.DAY, duration: DAY_SECONDS });
    this.timerHandle = setTimeout(() => this.startAfternoon(), DAY_SECONDS * 1000);
  }

  endDay() { // ホスト操作で議論を打ち切り
    if (this.phase !== 'day') return;
    clearTimeout(this.timerHandle);
    this.startAfternoon();
  }

  // ---------- 昼過ぎ（役職アクション・各15秒固定） ----------
  // 役職の有無や行動タイミングがメタ情報として伝わらないよう、
  // 該当者がいなくても全ステップを必ず15秒ずつ実施する（短縮不可）。

  startAfternoon() {
    if (this.phase !== 'day') return;
    this.phase = 'afternoon';
    // 手順: 占い師（延期・時間切れ分）→ 警官 → DJ（CSVの行順）
    // 延期や時間切れの有無を隠すため、占い師のステップは毎回必ず設ける
    this.steps = [];
    for (const role of this.roles) {
      if (role.phase === '明け方' && role.action !== 'none' && role.action !== 'mate_check') {
        this.steps.push({ role, onlySkipped: true });
      }
    }
    for (const role of this.roles) {
      if (role.phase === '昼過ぎ' && role.action !== 'none') {
        this.steps.push({ role, onlySkipped: false });
      }
    }
    this.stepIndex = -1;
    this.nextStep();
  }

  stepActors(step) {
    return this.players.filter(p =>
      p.used.id === step.role.id && (!step.onlySkipped || p.dawnSkipped)
    );
  }

  nextStep() {
    clearTimeout(this.timerHandle);
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) {
      this.startEvening();
      return;
    }
    const step = this.steps[this.stepIndex];
    step.doneIds = new Set();
    const actors = this.stepActors(step).filter(p => p.connected);

    this.broadcast({
      type: H2C.AFTERNOON, stepRoleName: step.role.name,
      isActor: false, duration: ACTION_SECONDS,
    });
    for (const actor of actors) {
      this.send(actor.id, {
        type: H2C.AFTERNOON,
        stepRoleName: step.role.name,
        isActor: true,
        duration: ACTION_SECONDS,
        actionType: step.role.action,
        optional: step.role.action === 'swap', // DJのみ「しない」選択が可能
        smallGame: this.smallGame,
        fieldCount: handSizeFor(this.players.length) - 1,
        targets: this.players
          .filter(q => q.id !== actor.id)
          .map(q => ({ id: q.id, name: q.name })),
      });
    }
    // 15秒経ったら必ず次のステップへ（実行済みでも短縮しない）
    const idx = this.stepIndex;
    this.timerHandle = setTimeout(() => {
      if (this.phase === 'afternoon' && this.stepIndex === idx) this.nextStep();
    }, ACTION_SECONDS * 1000);
  }

  handleAftAct(id, { pass, targetId, fieldIndex }) {
    if (this.phase !== 'afternoon') return;
    const step = this.steps[this.stepIndex];
    if (!step) return;
    const p = this.getPlayer(id);
    if (!p || step.doneIds.has(id)) return;
    if (!this.stepActors(step).some(a => a.id === id)) return;

    // ※アクションの内容は一切公開しない（結果は実行者本人にのみ送る）

    if (pass && step.role.action === 'swap') {
      step.doneIds.add(id);
      this.send(id, { type: H2C.AFT_RESULT, text: '交換しませんでした。' });
      return;
    }

    const target = this.getPlayer(targetId);
    if (!target || target.id === id) return;

    switch (step.role.action) {
      case 'peek_used': { // 延期した占い
        step.doneIds.add(id);
        this.send(id, {
          type: H2C.AFT_RESULT,
          text: `${target.name}さんの使用カードを確認しました。`,
          cards: [roleView(target.used)],
        });
        break;
      }
      case 'peek_field': { // 警官: 伏せカードを見る（少人数戦は2枚とも）
        step.doneIds.add(id);
        const cards = this.smallGame ? target.field : [target.field[0]];
        this.send(id, {
          type: H2C.AFT_RESULT,
          text: `${target.name}さんの伏せカードを確認しました。`,
          cards: cards.map(roleView),
        });
        break;
      }
      case 'swap': { // DJ: 対象の伏せカードと使用カードを交換
        const fi = Number(fieldIndex) || 0;
        if (!(fi >= 0 && fi < target.field.length)) return;
        step.doneIds.add(id);
        const tmp = target.used;
        target.used = target.field[fi];
        target.field[fi] = tmp;
        // 交換したことは対象者本人にも通知しない。
        // 全カードは裏のまま進行し、真実は結果発表で明らかになる。
        this.send(id, { type: H2C.AFT_RESULT, text: `${target.name}さんのカードを交換しました。（中身は見られません）` });
        break;
      }
      default:
        return;
    }
  }

  // ---------- 夕方（最終議論）→ 投票 ----------

  startEvening() {
    this.phase = 'evening';
    this.broadcast({ type: H2C.EVENING, duration: EVENING_SECONDS });
    this.timerHandle = setTimeout(() => this.startVote(), EVENING_SECONDS * 1000);
  }

  endEvening() { // ホスト操作で最終議論を打ち切り
    if (this.phase !== 'evening') return;
    clearTimeout(this.timerHandle);
    this.startVote();
  }

  startVote() {
    this.phase = 'vote';
    this.votes = {};
    // 「人狼はいない」（誰も追放しない）も候補に含める
    this.voteCandidates = [...this.players.map(p => p.id), NOBODY];
    this.broadcast({
      type: H2C.VOTE,
      candidates: this.voteCandidates.map(cid => {
        if (cid === NOBODY) return { id: NOBODY, name: '人狼はいない' };
        const c = this.getPlayer(cid);
        return { id: c.id, name: c.name };
      }),
    });
  }

  handleVote(id, targetId) {
    if (this.phase !== 'vote') return;
    const p = this.getPlayer(id);
    if (!p || !p.connected || this.votes[id]) return;
    if (targetId === id) return; // 自分には投票できない
    if (!this.voteCandidates.includes(targetId)) return;
    this.votes[id] = targetId;
    this.checkAllVoted();
  }

  checkAllVoted() {
    if (this.phase !== 'vote') return;
    const voters = this.connectedPlayers();
    const done = voters.filter(p => this.votes[p.id]).length;
    if (done < voters.length) {
      this.broadcast({ type: H2C.WAITING, what: 'vote', done, total: voters.length });
      return;
    }
    this.tallyVotes();
  }

  tallyVotes() {
    const voters = this.connectedPlayers();
    // 「人狼はいない」は全員一致のときだけ成立する
    const allNobody = voters.length > 0 && voters.every(p => this.votes[p.id] === NOBODY);
    if (allNobody) {
      this.finishGame(null); // 追放なし
      return;
    }
    // 一致しなかった場合、「人狼はいない」への票は無効票として集計から除外
    const counts = {};
    for (const targetId of Object.values(this.votes)) {
      if (targetId === NOBODY) continue;
      counts[targetId] = (counts[targetId] || 0) + 1;
    }
    const max = Math.max(...Object.values(counts));
    const top = Object.keys(counts).filter(cid => counts[cid] === max);
    // 同数の場合は決選投票を行わず、同数だった全員を追放する
    this.finishGame(top);
  }

  // ---------- 結果 ----------

  /** @param {Array<string>|null} exiledIds 追放者ID配列（同数は複数）。null は「人狼はいない」成立 */
  finishGame(exiledIds) {
    this.phase = 'result';
    const ids = exiledIds || [];
    const { winnerTeam, winnerLabel, deltas } = judge(this.players, exiledIds, this.votes);
    for (const p of this.players) p.score += deltas[p.id];

    this.broadcast({
      type: H2C.RESULT,
      exiled: ids.map(id => {
        const e = this.getPlayer(id);
        return { name: e.name, card: roleView(e.used) };
      }),
      winnerTeam,
      winnerLabel,
      reveal: this.players.map(p => ({
        name: p.name,
        exiled: ids.includes(p.id),
        used: roleView(p.used),
        field: p.field.map(roleView),
      })),
      votes: Object.entries(this.votes).map(([from, to]) => ({
        from: this.getPlayer(from).name,
        to: to === NOBODY ? '人狼はいない' : this.getPlayer(to).name,
      })),
      scores: this.players.map(p => ({
        name: p.name, delta: deltas[p.id], total: p.score,
      })),
    });
  }

  nextGame() { // 得点を持ち越して再戦（大会形式）
    if (this.phase !== 'result') return;
    this.startGame();
  }
}
