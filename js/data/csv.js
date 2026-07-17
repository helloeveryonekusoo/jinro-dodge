// roles.csv の読み込みとパース
// Excelで編集して保存しても読めるように、UTF-8 / Shift_JIS 両対応。

/**
 * CSVテキストを2次元配列にパースする（ダブルクォート対応）
 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // 空行を除去
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

/**
 * roles.csv を読み込み、役職定義の配列を返す。
 * 列: id,名前,陣営,アクション種別,実行フェーズ,枚数_3人..枚数_8人,説明,有効
 */
export async function loadRoles(url = 'data/roles.csv') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`roles.csv の読み込みに失敗しました (${res.status})`);
  const buf = await res.arrayBuffer();
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // Excel(日本語版)が Shift_JIS で保存した場合のフォールバック
    text = new TextDecoder('shift_jis').decode(buf);
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM除去

  const rows = parseCSV(text);
  const header = rows[0];
  const idx = (name) => {
    const i = header.findIndex(h => h.trim() === name);
    if (i === -1) throw new Error(`roles.csv に「${name}」列がありません`);
    return i;
  };

  const col = {
    id: idx('id'), name: idx('名前'), team: idx('陣営'),
    action: idx('アクション種別'), phase: idx('実行フェーズ'),
    desc: idx('説明'), enabled: idx('有効'),
    counts: {},
  };
  for (let n = 3; n <= 8; n++) col.counts[n] = idx(`枚数_${n}人`);
  // 人狼判定: 追放されたとき「人狼」として扱うか（狂人は人狼陣営だが0）。
  // 列がない古いCSVでは陣営=人狼なら1として扱う。
  const wolfCol = header.findIndex(h => h.trim() === '人狼判定');

  const roles = [];
  for (const r of rows.slice(1)) {
    const enabled = (r[col.enabled] || '').trim();
    if (enabled === '0' || enabled === '') continue;
    const counts = {};
    for (let n = 3; n <= 8; n++) counts[n] = parseInt(r[col.counts[n]], 10) || 0;
    const team = r[col.team].trim();
    roles.push({
      id: r[col.id].trim(),
      name: r[col.name].trim(),
      team,
      action: (r[col.action] || '').trim() || 'none',
      phase: (r[col.phase] || '').trim(), // '明け方' | '昼過ぎ' | ''
      isWolf: wolfCol >= 0 ? (r[wolfCol] || '').trim() === '1' : team === '人狼',
      counts,
      desc: (r[col.desc] || '').trim(),
    });
  }
  if (roles.length === 0) throw new Error('roles.csv に有効な役職がありません');
  return roles;
}
