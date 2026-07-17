// 通信メッセージの種別定義
// クライアント → ホスト
export const C2H = {
  JOIN: 'join',           // {name}
  PICK: 'pick',           // {index} 使用カードの選択
  DAWN_ACT: 'dawnAct',    // {skip?, targetId?} 明け方アクション（占い師）
  AFT_ACT: 'aftAct',      // {pass?, targetId?, fieldIndex?} 昼過ぎアクション
  VOTE: 'vote',           // {targetId}
};

// ホスト → クライアント
export const H2C = {
  JOINED: 'joined',       // {selfId, roomCode}
  LOBBY: 'lobby',         // {players, roleList, canStart}
  ERROR: 'error',         // {msg}
  PICK: 'pick',           // {cards, handSize, players}
  WAITING: 'waiting',     // {what, done, total}
  DAWN: 'dawn',           // {you, duration, mates?, action?} 15秒固定
  DAWN_RESULT: 'dawnResult', // {targetName, card}（占い師のみ・非公開）
  DAY: 'day',             // {duration}
  AFTERNOON: 'afternoon', // {stepRoleName, duration, isActor, actionType?, targets?, optional?} 各15秒固定
  AFT_RESULT: 'aftResult',// {text, cards?}（実行者のみ・非公開）
  LOG: 'log',             // {text} システム通知（接続切れなど。役職アクションは記録しない）
  EVENING: 'evening',     // {duration}
  VOTE: 'vote',           // {candidates}（同数は全員追放・「人狼はいない」は全員一致のみ成立）
  RESULT: 'result',       // {exiled(配列), winnerTeam, winnerLabel, reveal, votes, scores}
};
