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

  const startBtn = $('btn-start');
  if (isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = !msg.canStart;
    $('lobby-msg').textContent = msg.canStart ? '' : 'あと' + Math.max(0, 3 - msg.players.length) + '人必要です';
  } else {
    $('lobby-msg').textContent = 'ホストの開始を待っています…';
  }
}

// ---------- カード選択 ----------

export function renderPick(msg, onPick) {
  showScreen('pick');
  $('pick-msg').textContent = '';
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

// ---------- 明け方 ----------

export function renderDawn(msg, { onAct, onReady }) {
  showScreen('dawn');
  $('dawn-msg').textContent = '';
  $('dawn-action').innerHTML = '';
  $('dawn-info').innerHTML = '';
  // 前ゲームの状態をリセット
  $('btn-dawn-ready').classList.add('hidden');
  $('btn-dawn-ready').disabled = false;

  const mycard = $('dawn-mycard');
  mycard.innerHTML = '<p>あなたの使用カード:</p>';
  mycard.appendChild(roleCardEl(msg.you));

  const readyBtn = $('btn-dawn-ready');
  const showReady = () => {
    readyBtn.classList.remove('hidden');
    readyBtn.disabled = false;
  };

  if (msg.mates !== undefined) {
    // 人狼: 仲間確認
    $('dawn-info').textContent = msg.mates.length > 0
      ? `🐺 仲間の人狼: ${msg.mates.join('、')}`
      : '🐺 仲間の人狼はいません。あなたは一匹狼です。';
    showReady();
  } else if (msg.action) {
    // 占い師など: 対象選択
    const box = $('dawn-action');
    const p = document.createElement('p');
    p.textContent = '占う相手を選んでください:';
    box.appendChild(p);

    let selected = null;
    const btns = [];
    for (const t of msg.action.targets) {
      const btn = document.createElement('button');
      btn.className = 'target-btn';
      btn.textContent = t.name;
      btn.addEventListener('click', () => {
        selected = t.id;
        btns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      btns.push(btn);
      box.appendChild(btn);
    }
    const row = document.createElement('div');
    row.className = 'button-row';
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = '占う';
    go.addEventListener('click', () => {
      if (!selected) { $('dawn-msg').textContent = '相手を選んでください'; return; }
      box.innerHTML = '';
      onAct({ targetId: selected });
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
    $('dawn-info').textContent = '特別なアクションはありません。静かに朝を待ちましょう…';
    showReady();
  }

  readyBtn.onclick = () => {
    readyBtn.disabled = true;
    $('dawn-msg').textContent = '他のプレイヤーを待っています…';
    onReady();
  };
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
  const readyBtn = $('btn-dawn-ready');
  readyBtn.classList.remove('hidden');
  readyBtn.disabled = false;
}

export function setDawnWaiting(done, total) {
  $('dawn-msg').textContent = `準備完了を待っています… (${done}/${total})`;
}

// ---------- 昼過ぎ ----------

export function clearAfternoonLog() {
  $('afternoon-log').innerHTML = '';
}

export function renderAfternoon(msg, onAct) {
  showScreen('afternoon');
  $('afternoon-step').textContent = `現在のアクション: ${msg.stepRoleName}`;
  const box = $('afternoon-action');
  box.innerHTML = '';
  $('afternoon-result').classList.add('hidden');

  if (!msg.isActor) {
    const p = document.createElement('p');
    p.textContent = `${msg.stepRoleName}のアクションを待っています…`;
    box.appendChild(p);
    return;
  }

  const label = {
    peek_used: '占う相手を選んでください:',
    peek_field: '伏せカードを確認する相手を選んでください:',
    swap: 'カードを交換する相手を選んでください:',
  }[msg.actionType] || '対象を選んでください:';
  const p = document.createElement('p');
  p.textContent = `あなたは${msg.stepRoleName}です。${label}`;
  box.appendChild(p);

  let selected = null;
  const btns = [];
  for (const t of msg.targets) {
    const btn = document.createElement('button');
    btn.className = 'target-btn';
    btn.textContent = t.name;
    btn.addEventListener('click', () => {
      selected = t.id;
      btns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    btns.push(btn);
    box.appendChild(btn);
  }

  // DJ かつ少人数戦: どちらの伏せカードと交換するか選ぶ
  let fieldIndex = 0;
  if (msg.actionType === 'swap' && msg.fieldCount > 1) {
    const fp = document.createElement('p');
    fp.textContent = 'どちらの伏せカードと交換しますか？（中身は見えません）';
    box.appendChild(fp);
    const frow = document.createElement('div');
    frow.className = 'button-row';
    const fbtns = [];
    for (let i = 0; i < msg.fieldCount; i++) {
      const fb = document.createElement('button');
      fb.textContent = `伏せカード${i + 1}枚目`;
      if (i === 0) fb.classList.add('selected');
      fb.addEventListener('click', () => {
        fieldIndex = i;
        fbtns.forEach(b => b.classList.remove('selected'));
        fb.classList.add('selected');
      });
      fbtns.push(fb);
      frow.appendChild(fb);
    }
    box.appendChild(frow);
  }

  const row = document.createElement('div');
  row.className = 'button-row';
  const go = document.createElement('button');
  go.className = 'primary';
  go.textContent = '実行する';
  go.addEventListener('click', () => {
    if (!selected) return;
    box.innerHTML = '<p>実行しました。</p>';
    onAct({ targetId: selected, fieldIndex });
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
    box.appendChild(roleCardEl(card, true));
    box.appendChild(document.createTextNode(' '));
  }
}

export function addAfternoonLog(text) {
  const li = document.createElement('li');
  li.textContent = text;
  $('afternoon-log').appendChild(li);
}

// ---------- 投票 ----------

export function renderVote(msg, selfId, onVote) {
  showScreen('vote');
  $('vote-msg').textContent = '';
  $('vote-desc').textContent = msg.runoff
    ? '⚖️ 決選投票！ 同数だった候補の中から追放したい人を選んでください。'
    : '追放したい人を選んでください。（自分には投票できません）';
  const box = $('vote-candidates');
  box.innerHTML = '';
  let voted = false;
  for (const c of msg.candidates) {
    if (c.id === selfId) continue;
    const btn = document.createElement('button');
    btn.className = 'target-btn';
    btn.textContent = c.name;
    btn.addEventListener('click', () => {
      if (voted) return;
      voted = true;
      btn.classList.add('selected');
      $('vote-msg').textContent = `${c.name}さんに投票しました。他のプレイヤーを待っています…`;
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
  exiledP.append(`追放されたのは ${msg.exiled.name} さん — `);
  exiledP.appendChild(roleCardEl(msg.exiled.card, true));
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

// ---------- タイマー画面のホストボタン ----------

export function setupHostButtons(isHost) {
  if (!isHost) return;
  $('btn-end-day').classList.remove('hidden');
  $('btn-end-evening').classList.remove('hidden');
}
