// 各画面の描画
// main.js から受け取ったメッセージを元に DOM を組み立てる。

const $ = (id) => document.getElementById(id);

/** 指定した画面だけを表示する */
export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(`screen-${name}`).classList.remove('hidden');
}

/** 役職カード要素を作る */
function roleCardEl(card, mini = false) {
  if (mini) {
    const el = document.createElement('span');
    el.className = `mini-card team-${card.team}`;
    el.textContent = `${card.name}（${card.team}）`;
    return el;
  }
  const el = document.createElement('div');
  el.className = `role-card team-${card.team}`;
  el.innerHTML = `
    <div class="role-title"></div>
    <div class="role-team"></div>
    <div class="role-desc"></div>`;
  el.querySelector('.role-title').textContent = card.name;
  el.querySelector('.role-team').textContent = `陣営: ${card.team}`;
  el.querySelector('.role-desc').textContent = card.desc || '';
  return el;
}

/** カード裏面の要素 */
function cardBackEl(label) {
  const el = document.createElement('div');
  el.className = 'board-card';
  const mark = document.createElement('div');
  mark.className = 'back-mark';
  mark.textContent = '🐺';
  el.appendChild(mark);
  const lb = document.createElement('div');
  lb.textContent = label;
  el.appendChild(lb);
  return el;
}

/**
 * 全プレイヤーのカードを並べて直接クリックで選べるボードを描画する。
 * mode: 'used'（使用カードを選ぶ） | 'field'（伏せカード1枚を選ぶ） | 'field-all'（伏せカードをまとめて選ぶ）
 * @returns {Function} 現在の選択 {targetId, fieldIndex} を返す関数
 */
function renderCardBoard(container, targets, mode, fieldCount) {
  let selection = null;
  const board = document.createElement('div');
  board.className = 'card-board';
  const clearSel = () =>
    board.querySelectorAll('.board-card.selected').forEach(el => el.classList.remove('selected'));

  for (const t of targets) {
    const col = document.createElement('div');
    col.className = 'board-col';
    const nm = document.createElement('div');
    nm.className = 'board-name';
    nm.textContent = t.name;
    col.appendChild(nm);

    const usedEl = cardBackEl('使用中');
    if (mode === 'used') {
      usedEl.classList.add('selectable');
      usedEl.addEventListener('click', () => {
        clearSel();
        usedEl.classList.add('selected');
        selection = { targetId: t.id, fieldIndex: 0 };
      });
    }
    col.appendChild(usedEl);

    const fieldEls = [];
    for (let i = 0; i < fieldCount; i++) {
      const fEl = cardBackEl(`伏せ${i + 1}`);
      if (mode === 'field' || mode === 'field-all') {
        fEl.classList.add('selectable');
        fEl.addEventListener('click', () => {
          clearSel();
          if (mode === 'field-all') fieldEls.forEach(el => el.classList.add('selected'));
          else fEl.classList.add('selected');
          selection = { targetId: t.id, fieldIndex: i };
        });
      }
      fieldEls.push(fEl);
      col.appendChild(fEl);
    }
    board.appendChild(col);
  }
  container.appendChild(board);
  return () => selection;
}

// ---------- ヘッダ・共通 ----------

export function setRoomCode(code) {
  $('room-info').classList.remove('hidden');
  $('room-code-display').textContent = code;
}

export function setMyCard(card) {
  $('my-card-bar').classList.remove('hidden');
  $('my-card-name').textContent = card ? `${card.name}（${card.team}）` : '?';
}

export function hideMyCard() {
  $('my-card-bar').classList.add('hidden');
}

// ---------- ホーム ----------

export function setHomeError(msg) { $('home-error').textContent = msg; }
export function setHomeStatus(msg) { $('home-status').textContent = msg; }

// ---------- ロビー ----------

export function renderLobby(msg, isHost, roomCode) {
  showScreen('lobby');
  $('lobby-code').textContent = roomCode;
  $('lobby-count').textContent = msg.players.length;

  const ul = $('lobby-players');
  ul.innerHTML = '';
  for (const p of msg.players) {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.isHost) {
      const mark = document.createElement('span');
      mark.className = 'host-mark';
      mark.textContent = '👑 ホスト';
      li.appendChild(mark);
    }
    ul.appendChild(li);
  }

  const roleUl = $('role-list');
  roleUl.innerHTML = '';
  for (const r of msg.roleList) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = `role-name team-${r.team}`;
    name.textContent = `${r.name}（${r.team}）`;
    li.appendChild(name);
    li.appendChild(document.createTextNode(` — ${r.desc}`));
    roleUl.appendChild(li);
  }

  // 人数別の枚数表（現在の人数の列を強調）
  renderRoleCountTable(msg.roleList, msg.players.length);

  const startBtn = $('btn-start');
  if (isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = !msg.canStart;
    $('lobby-msg').textContent = msg.canStart ? '' : 'あと' + Math.max(0, 3 - msg.players.length) + '人必要です';
  } else {
    $('lobby-msg').textContent = 'ホストの開始を待っています…';
  }
}

/** 人数別の役職枚数表を描画する */
function renderRoleCountTable(roleList, currentCount) {
  const table = $('role-count-table');
  table.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>役職</th>';
  for (let n = 3; n <= 8; n++) {
    const th = document.createElement('th');
    th.textContent = `${n}人`;
    if (n === currentCount) th.classList.add('current-count');
    head.appendChild(th);
  }
  table.appendChild(head);

  for (const r of roleList) {
    if (!r.counts) continue;
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const span = document.createElement('span');
    span.className = `role-name team-${r.team}`;
    span.textContent = r.name;
    tdName.appendChild(span);
    tr.appendChild(tdName);
    for (let n = 3; n <= 8; n++) {
      const td = document.createElement('td');
      const c = r.counts[n] || 0;
      td.textContent = c === 0 ? '-' : c;
      if (c === 0) td.classList.add('count-zero');
      if (n === currentCount) td.classList.add('current-count');
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

/** 現在の山札の内訳テキスト（例: 人狼×2・占い師×1…） */
function compositionText(composition) {
  return (composition || []).map(c => `${c.name}×${c.count}`).join('・');
}

/** 手札パネル上部に山札の内訳を表示 */
export function renderDeckInfo(composition) {
  $('deck-info').textContent = `📦 この山札の内訳: ${compositionText(composition)}`;
}

// ---------- カード選択 ----------

export function renderPick(msg, onPick) {
  showScreen('pick');
  $('pick-msg').textContent = '';
  $('pick-comp').textContent = `📦 この山札の内訳: ${compositionText(msg.composition)}`;
  const row = $('pick-cards');
  row.innerHTML = '';
  msg.cards.forEach((card, i) => {
    const el = roleCardEl(card);
    el.addEventListener('click', () => {
      if (row.dataset.locked) return;
      row.dataset.locked = '1';
      el.classList.add('selected');
      $('pick-msg').textContent = `「${card.name}」を使用します。他のプレイヤーを待っています…`;
      onPick(i);
    });
    row.appendChild(el);
  });
  delete row.dataset.locked;
}

export function setPickWaiting(done, total) {
  $('pick-msg').textContent = `カード選択中… (${done}/${total})`;
}

// ---------- 明け方（15秒固定） ----------

export function renderDawn(msg, { onAct }) {
  showScreen('dawn');
  $('dawn-msg').textContent = '';
  $('dawn-action').innerHTML = '';
  $('dawn-info').innerHTML = '';

  const mycard = $('dawn-mycard');
  mycard.innerHTML = '<p>あなたの使用カード:</p>';
  mycard.appendChild(roleCardEl(msg.you));

  if (msg.mates !== undefined) {
    // 人狼: 仲間確認
    $('dawn-info').textContent = msg.mates.length > 0
      ? `🐺 仲間の人狼: ${msg.mates.join('、')}`
      : '🐺 仲間の人狼はいません。あなたは一匹狼です。';
  } else if (msg.action) {
    // 占い師など: 相手の使用カードを直接クリックして選ぶ
    const box = $('dawn-action');
    const p = document.createElement('p');
    p.textContent = '占う相手の「使用中」カードをタップして選んでください（15秒以内）:';
    box.appendChild(p);

    const getSel = renderCardBoard(box, msg.action.targets, 'used', msg.fieldCount);

    const row = document.createElement('div');
    row.className = 'button-row';
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = '占う';
    go.addEventListener('click', () => {
      const sel = getSel();
      if (!sel) { $('dawn-msg').textContent = 'カードを選んでください'; return; }
      box.innerHTML = '';
      onAct({ targetId: sel.targetId });
    });
    row.appendChild(go);
    if (msg.action.canSkip) {
      const skip = document.createElement('button');
      skip.textContent = '占わない（昼過ぎに延期）';
      skip.addEventListener('click', () => {
        box.innerHTML = '';
        onAct({ skip: true });
      });
      row.appendChild(skip);
    }
    box.appendChild(row);
  } else {
    $('dawn-info').textContent = '特別なアクションはありません。自分のカードを確認しておきましょう…';
  }
}

export function showDawnResult(msg) {
  const info = $('dawn-info');
  if (msg.skipped) {
    info.textContent = '占いを昼過ぎに延期しました。';
  } else {
    info.innerHTML = '';
    info.appendChild(document.createTextNode(`🔮 ${msg.targetName}さんの使用カードは… `));
    info.appendChild(roleCardEl(msg.card, true));
  }
}

// ---------- 昼過ぎ（各15秒固定・非公開） ----------

export function renderAfternoon(msg, onAct) {
  showScreen('afternoon');
  $('afternoon-step').textContent = `現在のアクション: ${msg.stepRoleName}`;
  const box = $('afternoon-action');
  box.innerHTML = '';
  $('afternoon-result').classList.add('hidden');

  if (!msg.isActor) {
    const p = document.createElement('p');
    p.textContent = `${msg.stepRoleName}のアクション時間です。そのままお待ちください…`;
    box.appendChild(p);
    return;
  }

  const label = {
    peek_used: '占う相手の「使用中」カードをタップしてください:',
    peek_field: '確認したい「伏せ」カードをタップしてください:',
    swap: '交換したい「伏せ」カードをタップしてください（その人の使用カードと入れ替わります）:',
    peek_team: '陣営を調べたい相手の「使用中」カードをタップしてください（陣営だけが分かります）:',
  }[msg.actionType] || '対象のカードをタップしてください:';
  const p = document.createElement('p');
  p.textContent = `あなたは${msg.stepRoleName}です。${label}`;
  box.appendChild(p);

  // アクションに応じてクリックできるカードを変える
  const mode = (msg.actionType === 'peek_used' || msg.actionType === 'peek_team') ? 'used'
    : (msg.actionType === 'peek_field' && msg.smallGame) ? 'field-all'
    : 'field';
  const getSel = renderCardBoard(box, msg.targets, mode, msg.fieldCount);

  const row = document.createElement('div');
  row.className = 'button-row';
  const go = document.createElement('button');
  go.className = 'primary';
  go.textContent = '実行する';
  go.addEventListener('click', () => {
    const sel = getSel();
    if (!sel) return;
    box.innerHTML = '<p>実行しました。</p>';
    onAct({ targetId: sel.targetId, fieldIndex: sel.fieldIndex });
  });
  row.appendChild(go);
  if (msg.optional) {
    const pass = document.createElement('button');
    pass.textContent = '交換しない（パス）';
    pass.addEventListener('click', () => {
      box.innerHTML = '<p>パスしました。</p>';
      onAct({ pass: true });
    });
    row.appendChild(pass);
  }
  box.appendChild(row);
}

export function showAfternoonResult(msg) {
  const box = $('afternoon-result');
  box.classList.remove('hidden');
  box.innerHTML = '';
  box.appendChild(document.createTextNode(msg.text + ' '));
  for (const card of msg.cards || []) {
    if (card.label) box.appendChild(document.createTextNode(`${card.label}: `));
    box.appendChild(roleCardEl(card, true));
    box.appendChild(document.createTextNode(' '));
  }
}

// ---------- 投票 ----------

export function renderVote(msg, selfId, onVote) {
  showScreen('vote');
  $('vote-msg').textContent = '';
  $('vote-desc').textContent = '追放したい人を選んでください。（自分には投票できません）';
  const box = $('vote-candidates');
  box.innerHTML = '';
  let voted = false;
  for (const c of msg.candidates) {
    if (c.id === selfId) continue;
    const btn = document.createElement('button');
    btn.className = 'target-btn';
    if (c.id === 'NOBODY') {
      btn.classList.add('nobody');
      btn.textContent = `🕊 ${c.name}（誰も追放しない）`;
    } else {
      btn.textContent = c.name;
    }
    btn.addEventListener('click', () => {
      if (voted) return;
      voted = true;
      btn.classList.add('selected');
      $('vote-msg').textContent = c.id === 'NOBODY'
        ? '「人狼はいない」に投票しました。他のプレイヤーを待っています…'
        : `${c.name}さんに投票しました。他のプレイヤーを待っています…`;
      onVote(c.id);
    });
    box.appendChild(btn);
  }
}

export function setVoteWaiting(done, total) {
  $('vote-msg').textContent = `投票中… (${done}/${total})`;
}

// ---------- 結果 ----------

export function renderResult(msg, isHost) {
  showScreen('result');

  const main = $('result-main');
  main.innerHTML = '';
  const exiledP = document.createElement('p');
  if (msg.exiled && msg.exiled.length > 0) {
    exiledP.append(msg.exiled.length > 1 ? '同数のため全員追放: ' : '追放されたのは ');
    msg.exiled.forEach((e, i) => {
      if (i > 0) exiledP.append(' / ');
      exiledP.append(`${e.name} さん — `);
      exiledP.appendChild(roleCardEl(e.card, true));
    });
  } else {
    exiledP.textContent = '全員一致で「人狼はいない」が選ばれ、誰も追放されませんでした。';
  }
  main.appendChild(exiledP);
  const winner = document.createElement('p');
  winner.className = `winner team-${msg.winnerTeam}`;
  winner.textContent = `🎉 ${msg.winnerLabel}`;
  main.appendChild(winner);

  const reveal = $('result-reveal');
  reveal.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'reveal-grid';
  for (const r of msg.reveal) {
    const row = document.createElement('div');
    row.className = 'reveal-row';
    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = r.name + (r.exiled ? ' 💀' : '');
    row.appendChild(name);
    row.appendChild(document.createTextNode('使用: '));
    row.appendChild(roleCardEl(r.used, true));
    row.appendChild(document.createTextNode(' 伏せ: '));
    for (const f of r.field) {
      const el = roleCardEl(f, true);
      el.classList.add('field');
      row.appendChild(el);
    }
    grid.appendChild(row);
  }
  reveal.appendChild(grid);

  const votesUl = $('result-votes');
  votesUl.innerHTML = '';
  for (const v of msg.votes) {
    const li = document.createElement('li');
    li.textContent = `${v.from} → ${v.to}`;
    votesUl.appendChild(li);
  }

  const table = $('result-scores');
  table.innerHTML = '<tr><th>プレイヤー</th><th>今回</th><th>累計</th></tr>';
  for (const s of msg.scores) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = s.name;
    const tdDelta = document.createElement('td');
    tdDelta.textContent = (s.delta > 0 ? '+' : '') + s.delta;
    tdDelta.className = s.delta > 0 ? 'delta-plus' : s.delta < 0 ? 'delta-minus' : '';
    const tdTotal = document.createElement('td');
    tdTotal.textContent = s.total;
    tr.append(tdName, tdDelta, tdTotal);
    table.appendChild(tr);
  }

  if (isHost) {
    $('btn-next-game').classList.remove('hidden');
    $('result-msg').textContent = '';
  } else {
    $('result-msg').textContent = 'ホストが次のゲームを開始するのを待っています…';
  }
}

// ---------- 配られたカード＋全員のカードの常時表示・メモ ----------

/** カード選択後、配られた全カードを画面に残す（メモ欄付き・伏せ1/2表記） */
export function renderHandPanel(cards, usedIndex) {
  $('hand-panel').classList.remove('hidden');
  const box = $('hand-cards');
  box.innerHTML = '';
  let fieldNo = 0;
  cards.forEach((card, i) => {
    const isUsed = i === usedIndex;
    if (!isUsed) fieldNo++;
    const el = document.createElement('div');
    el.className = 'hand-card' + (isUsed ? ' used-card' : '');
    const status = document.createElement('span');
    status.className = 'hand-status';
    // 伏せカードには番号を付ける（警官・DJの「伏せ1/伏せ2」と対応）
    status.textContent = isUsed ? '使用中' : `伏せ${fieldNo}`;
    const name = document.createElement('div');
    name.className = 'hand-name';
    name.textContent = card.name;
    const team = document.createElement('div');
    team.className = 'hand-team';
    team.textContent = `陣営: ${card.team}`;
    const memo = document.createElement('input');
    memo.className = 'memo';
    memo.type = 'text';
    memo.maxLength = 30;
    memo.placeholder = 'メモ…';
    el.append(status, name, team, memo);
    box.appendChild(el);
  });
}

/** 他のプレイヤー全員のカードを裏向きで表示（各カードにメモ欄付き） */
export function renderOthersPanel(players, selfId, fieldCount) {
  const box = $('others-cards');
  box.innerHTML = '';
  for (const p of players) {
    if (p.id === selfId) continue;
    const col = document.createElement('div');
    col.className = 'board-col';
    const nm = document.createElement('div');
    nm.className = 'board-name';
    nm.textContent = p.name;
    col.appendChild(nm);
    const labels = ['使用中'];
    for (let i = 1; i <= fieldCount; i++) labels.push(`伏せ${i}`);
    for (const label of labels) {
      col.appendChild(cardBackEl(label));
      const memo = document.createElement('input');
      memo.className = 'board-memo';
      memo.type = 'text';
      memo.maxLength = 20;
      memo.placeholder = 'メモ…';
      col.appendChild(memo);
    }
    box.appendChild(col);
  }
}

export function hideHandPanel() {
  $('hand-panel').classList.add('hidden');
}

// ---------- 観戦（神の視点） ----------

/** 観戦画面の全プレイヤー状態を描画する */
export function renderGodState(msg) {
  showScreen('spectate');
  $('god-phase').textContent = msg.phaseLabel;
  $('god-comp').textContent = msg.composition && msg.composition.length
    ? `📦 山札: ${msg.composition.map(c => `${c.name}×${c.count}`).join('・')}` : '';

  const grid = $('god-players');
  grid.innerHTML = '';
  for (const p of msg.players) {
    const col = document.createElement('div');
    col.className = 'god-player';

    const nm = document.createElement('div');
    nm.className = 'god-name';
    nm.textContent = p.name + (p.connected ? '' : '（切断）');
    col.appendChild(nm);

    if (p.used) {
      const used = document.createElement('div');
      used.className = `god-card team-${p.used.team} used`;
      used.textContent = `使用: ${p.used.name}`;
      col.appendChild(used);
      p.field.forEach((f, i) => {
        const fe = document.createElement('div');
        fe.className = `god-card team-${f.team}`;
        fe.textContent = `伏せ${i + 1}: ${f.name}`;
        col.appendChild(fe);
      });
    } else {
      const wait = document.createElement('div');
      wait.className = 'god-card';
      wait.textContent = 'カード未選択';
      col.appendChild(wait);
    }

    if (p.voteTarget) {
      const v = document.createElement('div');
      v.className = 'god-vote';
      v.textContent = `🗳 → ${p.voteTarget}`;
      col.appendChild(v);
    }

    const sc = document.createElement('div');
    sc.className = 'god-score';
    sc.textContent = `${p.score}点`;
    col.appendChild(sc);

    grid.appendChild(col);
  }
}

/** 観戦画面の実況ログに1行追加する */
export function addGodLog(text) {
  const ul = $('god-log');
  const li = document.createElement('li');
  li.textContent = text;
  ul.appendChild(li);
  // 最新が見えるように自動スクロール
  ul.scrollTop = ul.scrollHeight;
}

export function showSpectateWaiting() {
  showScreen('spectate');
  $('god-phase').textContent = 'ゲーム開始を待っています…';
}

// ---------- タイマー画面のホストボタン ----------

export function setupHostButtons(isHost) {
  if (!isHost) return;
  $('btn-end-day').classList.remove('hidden');
  $('btn-end-evening').classList.remove('hidden');
}
