// 通信メッセージの種別定義
// クライアント → ホスト
export const C2H = {
  JOIN: 'join',           // {name}
  PICK: 'pick',           // {index} 使用カードの選択
  DAWN_ACT: 'dawnAct',    // {skip?, targetId?} 明け方アクション（占い師）
  AFT_ACT: 'aftAct',      // {pass?, targetId?, fieldIndex?} 昼過ぎアクション
  VOTE: 'vote',           // {targetId}
  CHAT: 'chat',           // {text}
};

// ホスト → クライアント
export const H2C = {
  JOINED: 'joined',       // {selfId, roomCode}
  LOBBY: 'lobby',         // {players, roleList, canStart}
  ERROR: 'error',         // {msg}
  PICK: 'pick',           // {cards, handSize}
  WAITING: 'waiting',     // {what, done, total}
  DAWN: 'dawn',           // {you, duration, mates?, action?} 15秒固定
  DAWN_RESULT: 'dawnResult', // {targetName, card}（占い師のみ・非公開）
  DAY: 'day',             // {duration}
  AFTERNOON: 'afternoon', // {stepRoleName, duration, isActor, actionType?, targets?, optional?} 各15秒固定
  AFT_RESULT: 'aftResult',// {text, cards?}（実行者のみ・非公開）
  YOUR_CARD: 'yourCard',  // {card, fieldIndex} DJ交換で自分の使用カードが変わった（本人のみ）
  LOG: 'log',             // {text} システム通知（接続切れ・決選投票など。役職アクションは記録しない）
  EVENING: 'evening',     // {duration}
  VOTE: 'vote',           // {candidates, runoff}
  RESULT: 'result',       // {exiled, winnerTeam, winnerLabel, reveal, votes, scores}
  CHAT: 'chat',           // {from, text}
};
