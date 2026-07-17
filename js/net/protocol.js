// 通信メッセージの種別定義
// クライアント → ホスト
export const C2H = {
  JOIN: 'join',           // {name}
  PICK: 'pick',           // {index} 使用カードの選択
  DAWN_ACT: 'dawnAct',    // {skip?, targetId?} 明け方アクション（占い師）
  READY: 'ready',         // {} 明け方の準備完了
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
  DAWN: 'dawn',           // {you, mates?, action?}
  DAWN_RESULT: 'dawnResult', // {targetName, card}（占い師のみ）
  DAY: 'day',             // {duration}
  AFTERNOON: 'afternoon', // {stepRole, isActor, actionType?, targets?, optional?}
  AFT_RESULT: 'aftResult',// {text, cards?}（実行者のみ）
  YOUR_CARD: 'yourCard',  // {card} DJ交換などで自分の使用カードが変わった
  LOG: 'log',             // {text} 公開ログ
  EVENING: 'evening',     // {duration}
  VOTE: 'vote',           // {candidates, runoff}
  RESULT: 'result',       // {exiled, winnerTeam, winnerLabel, reveal, votes, scores}
  CHAT: 'chat',           // {from, text}
};
