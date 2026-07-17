// プレイヤーに送る「見える情報」の生成ヘルパ
// カード情報の隠蔽のため、必要な情報だけを抜き出して送る。

/** 役職カードの公開用ビュー */
export function roleView(role) {
  if (!role) return null;
  return { id: role.id, name: role.name, team: role.team, desc: role.desc };
}

/** プレイヤーの公開情報（名前とスコアのみ） */
export function playerView(p, hostId) {
  return { id: p.id, name: p.name, score: p.score, isHost: p.id === hostId, connected: p.connected };
}
