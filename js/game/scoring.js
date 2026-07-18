// ハウスルール① ポイント制
// 市民陣営勝利 +1 / 人狼陣営勝利 +2 / おばけ勝利 +3
// 市民陣営のプレイヤーが市民陣営に投票 → -1

export const TEAM_CITIZEN = '市民';
export const TEAM_WOLF = '人狼';
export const TEAM_GHOST = 'おばけ';

// 投票の特別な選択肢「人狼はいない」（誰も追放しない）
export const NOBODY = 'NOBODY';

export const WIN_POINTS = {
  [TEAM_CITIZEN]: 1,
  [TEAM_WOLF]: 2,
  [TEAM_GHOST]: 3,
};

/**
 * 勝敗判定とポイント計算。
 * 陣営・人狼判定は「判定時点の使用カード」（DJ交換後）で決まる。
 * 「人狼かどうか」は陣営ではなく役職の人狼判定(isWolf)で判定する。
 * → 狂人（人狼陣営・人狼判定なし）を追放しても人狼陣営の勝利になる。
 * 投票同数の場合は決選投票を行わず同数の全員が追放される。
 * @param {Array} players - {id, name, used(役職), ...} の配列
 * @param {Array<string>|null} exiledIds - 追放者ID配列（同数なら複数）。null は「人狼はいない」（追放なし）
 * @param {Object} finalVotes - {voterId: targetId} 投票内容
 * @returns {{winnerTeam, winnerLabel, deltas: {playerId: 点数増減}}} winnerTeam は勝った陣営
 */
export function judge(players, exiledIds, finalVotes) {
  const byId = new Map(players.map(p => [p.id, p]));
  const deltas = {};
  for (const p of players) deltas[p.id] = 0;

  const citizensWin = () => {
    for (const p of players) {
      if (p.used.team === TEAM_CITIZEN) deltas[p.id] += WIN_POINTS[TEAM_CITIZEN];
    }
    return TEAM_CITIZEN;
  };
  const wolvesWin = () => {
    // 狂人を含む人狼陣営全員に加点
    for (const p of players) {
      if (p.used.team === TEAM_WOLF) deltas[p.id] += WIN_POINTS[TEAM_WOLF];
    }
    return TEAM_WOLF;
  };

  // 場（使用カード）に本物の人狼がいない場合、人狼陣営の役職（狂人）を人狼として扱う
  const realWolfInPlay = players.some(p => p.used.isWolf);
  const isWolfCard = (p) =>
    p.used.isWolf || (!realWolfInPlay && p.used.team === TEAM_WOLF);

  let winnerTeam, winnerLabel;

  if (exiledIds === null) {
    // 「人狼はいない」（全員一致）: 本当にいなければ市民勝利、潜んでいたら人狼勝利
    const wolfExists = players.some(p => isWolfCard(p));
    if (!wolfExists) {
      winnerLabel = '本当に人狼はいなかった！市民陣営の勝利！';
      winnerTeam = citizensWin();
    } else {
      winnerLabel = '人狼は村に潜んでいた…人狼陣営の勝利！';
      winnerTeam = wolvesWin();
    }
  } else {
    const exiledList = exiledIds.map(id => byId.get(id));
    const ghosts = exiledList.filter(p => p.used.team === TEAM_GHOST);

    if (ghosts.length > 0) {
      // おばけが追放されていれば最優先でおばけの単独勝利（他の陣営は無得点）
      winnerTeam = TEAM_GHOST;
      winnerLabel = `おばけ（${ghosts.map(g => g.name).join('、')}）の単独勝利！`;
      for (const g of ghosts) deltas[g.id] += WIN_POINTS[TEAM_GHOST];
    } else if (exiledList.some(p => isWolfCard(p))) {
      // 人狼（または人狼扱いの狂人）を追放できていれば市民陣営の勝利
      winnerLabel = '市民陣営の勝利！';
      winnerTeam = citizensWin();
    } else {
      // 人狼以外だけを追放 → 人狼陣営の勝利
      winnerLabel = '人狼陣営の勝利！';
      winnerTeam = wolvesWin();
    }
  }

  applyVotePenalty(players, byId, finalVotes, deltas);

  // 賞金稼ぎ(id: bounty): 自分の投票先が人狼（人狼扱いの狂人含む）なら追加+1
  for (const [voterId, targetId] of Object.entries(finalVotes)) {
    const voter = byId.get(voterId);
    const target = byId.get(targetId);
    if (voter && target && voter.used.id === 'bounty' && isWolfCard(target)) {
      deltas[voterId] += 1;
    }
  }

  return { winnerTeam, winnerLabel, deltas };
}

// 投票ペナルティ: 市民陣営 → 市民陣営への投票は -1
// （「人狼はいない」への投票はプレイヤーへの投票ではないため対象外）
function applyVotePenalty(players, byId, finalVotes, deltas) {
  for (const [voterId, targetId] of Object.entries(finalVotes)) {
    const voter = byId.get(voterId);
    const target = byId.get(targetId);
    if (!voter || !target) continue;
    if (voter.used.team === TEAM_CITIZEN && target.used.team === TEAM_CITIZEN) {
      deltas[voterId] -= 1;
    }
  }
}
