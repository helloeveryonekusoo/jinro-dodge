// ゲームエンジン（ホストのみ実行される権威ロジック）
// カード配布・フェーズ進行・アクション解決・勝敗判定をすべてここで行い、
// 各プレイヤーには「その人が見てよい情報」だけを送信する。

import { H2C } from '../net/protocol.js';
import { buildDeck, deal, handSizeFor } from './deck.js';
import { judge, NOBODY } from './scoring.js';
import { roleView, playerView } from './views.js';

const DAY_SECONDS = 180;      // 昼の議論時間（約3分）
const EVENING_SECONDS = 60;   // 夕方の最終議論時間（約1分）
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
    this.isRunoff = false;
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
    this.isRunoff = false;
    this.phase = 'pick';

    for (const p of this.players) {
      this.send(p.id, {
        type: H2C.PICK,
        cards: p.hand.map(roleView),
        handSize: handSizeFor(count),
        smallGame: this.smallGame,
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
    // 手順: （少人数戦のみ）占い師 → 警官 → DJ（CSVの行順）
    this.steps = [];
    if (this.smallGame) {
      // 占い延期の有無に関係なく毎回ステップを設ける（延期したかどうかを隠すため）
      for (const role of this.roles) {
        if (role.phase === '明け方' && role.action !== 'none' && role.action !== 'mate_check') {
          this.steps.push({ role, onlySkipped: true });
        }
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
        // 対象者には新しい使用カードを通知（実物のカードは手元で見られるのと同じ扱い）
        if (target.connected) {
          this.send(target.id, { type: H2C.YOUR_CARD, card: roleView(target.used), fieldIndex: fi });
        }
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

  startVote(candidates = null) {
    this.phase = 'vote';
    this.votes = {};
    // 「人狼はいない」（誰も追放しない）も候補に含める
    this.voteCandidates = candidates || [...this.players.map(p => p.id), NOBODY];
    this.broadcast({
      type: H2C.VOTE,
      runoff: this.isRunoff,
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
    const counts = {};
    for (const targetId of Object.values(this.votes)) {
      counts[targetId] = (counts[targetId] || 0) + 1;
    }
    const max = Math.max(...Object.values(counts));
    const top = Object.keys(counts).filter(cid => counts[cid] === max);

    if (top.length === 1) {
      this.finishGame(top[0]);
      return;
    }
    if (!this.isRunoff) {
      // 同数 → 同数だった人だけで決選投票（1回）
      this.isRunoff = true;
      this.log('投票が同数のため、決選投票を行います。');
      this.startVote(top);
      return;
    }
    // 決選でも同数 → ランダムで追放（ハウスルール補完）
    const exiledId = top[Math.floor(Math.random() * top.length)];
    this.log('決選投票も同数だったため、ランダムで追放者を決定しました。');
    this.finishGame(exiledId);
  }

  // ---------- 結果 ----------

  finishGame(exiledId) {
    this.phase = 'result';
    const noExile = exiledId === NOBODY;
    const exiled = noExile ? null : this.getPlayer(exiledId);
    const { winnerTeam, winnerLabel, deltas } = judge(this.players, noExile ? null : exiledId, this.votes);
    for (const p of this.players) p.score += deltas[p.id];

    this.broadcast({
      type: H2C.RESULT,
      exiled: exiled ? { name: exiled.name, card: roleView(exiled.used) } : null,
      winnerTeam,
      winnerLabel,
      reveal: this.players.map(p => ({
        name: p.name,
        exiled: !noExile && p.id === exiledId,
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
