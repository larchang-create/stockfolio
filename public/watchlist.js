(() => {
  function parse(market, raw) {
    if (!['台股', '美股'].includes(market) || typeof raw !== 'string') throw Error('請先選擇市場。');
    const entries = raw.split(/[,，、\r\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!entries.length) throw Error('請輸入股票代號，可用逗號分隔。');
    if (entries.length > 200) throw Error('一次最多加入 200 個代號，請分批加入。');
    const pattern = market === '台股' ? /^[0-9]{4,6}[A-Z]?$/ : /^[A-Z][A-Z0-9.-]{0,19}$/;
    const invalid = entries.filter(symbol => !pattern.test(symbol));
    if (invalid.length) throw Error(`${market}代號格式不正確：${invalid.slice(0, 5).join('、')}。請修正後再加入；目前沒有新增任何股票。`);
    return {symbols: [...new Set(entries)], repeated: entries.length - new Set(entries).size};
  }
  function plan(stocks, market, raw, create) {
    const {symbols, repeated} = parse(market, raw);
    let added = 0, restored = 0, skipped = repeated;
    const next = stocks.slice();
    const positions = new Map(stocks.map((s, i) => [s.market + ':' + s.symbol, i]));
    for (const symbol of symbols) {
      const index = positions.get(market + ':' + symbol);
      if (index === undefined) { next.push(create({market, symbol, name: symbol, watch: true})); added++; }
      else if (!next[index].watch) { next[index] = {...next[index], watch: true}; restored++; }
      else skipped++;
    }
    return {stocks: next, added, restored, skipped};
  }
  globalThis.StockfolioWatchlist = Object.freeze({parse, plan});
})();
