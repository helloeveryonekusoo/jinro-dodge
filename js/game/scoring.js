// ハウスルール① ポイント制
// 市民陣営勝利 +1 / 人狼陣営勝利 +2 / おばけ勝利 +3
// 市民陣営のプレイヤーが市民陣営に投票 → -1

export const TEAM_CITIZEN = '市民';
export const TEAM_WOLF = '人狼';
export const TEAM_GHOST = 'おばけ';

export const WIN_POINTS = {
  [TEAM_CITIZEN]: 1,
  [TEAM_WOLF]: 2,
  [TEAM_GHOST]: 3,
};

/**
 * 勝敗判定とポイント計算。
 * 陣営は「判定時点の使用カード」（DJ交換後）で決まる。
 * @param {Array} players - {id, name, used(役職), ...} の配列
 * @param {string} exiledId - 追放されたプレイヤーID
 * @param {Object} finalVotes - {voterId: targetId} 最終（決選）投票
 * @returns {{winnerTeam, winnerLabel, deltas: {playerId: 点数増減}}}
 */
export function judge(players, exiledId, finalVotes) {
  const byId = new Map(players.map(p => [p.id, p]));
  const exiled = byId.get(exiledId);
  const winnerTeam = exiled.used.team; // 追放されたカードの陣営で勝敗が決まる
  const deltas = {};
  for (const p of players) deltas[p.id] = 0;

  let winnerLabel;
  if (winnerTeam === TEAM_WOLF) {
    // 人狼を追放 → 市民陣営の勝利
    winnerLabel = '市民陣営の勝利！';
    for (const p of players) {
      if (p.used.team === TEAM_CITIZEN) deltas[p.id] += WIN_POINTS[TEAM_CITIZEN];
    }
  } else if (winnerTeam === TEAM_GHOST) {
    // おばけを追放 → 追放された本人の単独勝利
    winnerLabel = `おばけ（${exiled.name}）の単独勝利！`;
    deltas[exiledId] += WIN_POINTS[TEAM_GHOST];
  } else {
    // 市民系を追放 → 人狼陣営の勝利
    winnerLabel = '人狼陣営の勝利！';
    for (const p of players) {
      if (p.used.team === TEAM_WOLF) deltas[p.id] += WIN_POINTS[TEAM_WOLF];
    }
  }

  // 投票ペナルティ: 市民陣営 → 市民陣営への投票は -1
  for (const [voterId, targetId] of Object.entries(finalVotes)) {
    const voter = byId.get(voterId);
    const target = byId.get(targetId);
    if (!voter || !target) continue;
    if (voter.used.team === TEAM_CITIZEN && target.used.team === TEAM_CITIZEN) {
      deltas[voterId] -= 1;
    }
  }

  return { winnerTeam, winnerLabel, deltas };
}
