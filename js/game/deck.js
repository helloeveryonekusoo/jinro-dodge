// 山札の構築と配布
// roles.csv の「枚数_N人」列に従って山札を作る。

/** Fisher-Yates シャッフル */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 1人あたりの配布枚数（ハウスルール②: 3〜4人は3枚） */
export function handSizeFor(playerCount) {
  return playerCount <= 4 ? 3 : 2;
}

/**
 * 人数に応じた山札（役職オブジェクトの配列）を構築する。
 * 合計枚数が 人数×配布枚数 と一致しない場合はエラー。
 */
export function buildDeck(roles, playerCount) {
  const deck = [];
  for (const role of roles) {
    const count = role.counts[playerCount] || 0;
    for (let i = 0; i < count; i++) deck.push(role);
  }
  const need = playerCount * handSizeFor(playerCount);
  if (deck.length !== need) {
    throw new Error(
      `roles.csv の枚数設定が合いません: ${playerCount}人戦には合計${need}枚必要ですが、` +
      `枚数_${playerCount}人 列の合計は${deck.length}枚です。`
    );
  }
  return shuffle(deck);
}

/**
 * 山札を各プレイヤーに配る。
 * @returns {Array<Array>} プレイヤーごとの手札（役職オブジェクトの配列）
 */
export function deal(deck, playerCount) {
  const handSize = handSizeFor(playerCount);
  const hands = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(deck.slice(i * handSize, (i + 1) * handSize));
  }
  return hands;
}
