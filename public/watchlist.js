(() => {
  const aliases = Object.freeze({'AMAZON':'AMZN','AMAZON.COM':'AMZN'});
  function canonical(market, symbol) {const value=String(symbol).trim().toUpperCase();return market==='美股'?(aliases[value]||value):value}
  function parse(market, raw) {
    if (!['台股', '美股'].includes(market) || typeof raw !== 'string') throw Error('請先選擇市場。');
    const entries = raw.split(/[,，、\r\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean).map(s=>canonical(market,s));
    if (!entries.length) throw Error('請輸入股票代號，可用逗號分隔。');
    if (entries.length > 200) throw Error('一次最多加入 200 個代號，請分批加入。');
    const pattern = market === '台股' ? /^[0-9]{4,6}[A-Z]?$/ : /^[A-Z][A-Z0-9.-]{0,19}$/;
    const invalid = entries.filter(symbol => !pattern.test(symbol));
    if (invalid.length) throw Error(`${market}代號格式不正確：${invalid.slice(0, 5).join('、')}。請修正後再加入；目前沒有新增任何股票。`);
    return {symbols: [...new Set(entries)], repeated: entries.length - new Set(entries).size};
  }
  function plan(stocks, market, raw, create) {
    const {symbols, repeated} = parse(market, raw);
    let added = 0, restored = 0, corrected = 0, skipped = repeated;
    const next = stocks.slice();
    const positions=new Map();stocks.forEach((s,i)=>{const key=s.market+':'+canonical(s.market,s.symbol);if(!positions.has(key)||s.symbol===canonical(s.market,s.symbol))positions.set(key,i)});
    for (const symbol of symbols) {
      const index = positions.get(market + ':' + symbol);
      if (index === undefined) { next.push(create({market, symbol, name: symbol, watch: true})); added++; }
      else {const original=next[index];if(original.symbol!==symbol){next[index]={...original,symbol};corrected++}if(!original.watch){next[index]={...next[index],watch:true};restored++}else if(original.symbol===symbol)skipped++}
    }
    return {stocks: next, added, restored, skipped, corrected};
  }
  function duplicates(stocks, stock) {const key=canonical(stock.market,stock.symbol);return stocks.filter(s=>s.market===stock.market&&canonical(s.market,s.symbol)===key)}
  function mergeDuplicates(stocks, stock) {
    const group=duplicates(stocks,stock).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    if(group.length<2)throw Error('目前沒有可合併的重複項目。');
    const symbol=canonical(stock.market,stock.symbol),primary=group.find(s=>s.symbol===symbol)||group[0];
    const records=[primary,...group.filter(s=>s!==primary)];
    function combine(get){const values=[];for(const s of records){const value=get(s)||'';if(typeof value==='string'&&value.trim()&&!values.some(x=>x.value===value))values.push({label:s.symbol,value})}const merged=values.length<2?(values[0]?.value||''):values.map(x=>'【'+x.label+'】\n'+x.value).join('\n\n');if(merged.length>5000)throw Error('合併後筆記超過長度限制，請先匯出備份並整理筆記。');return merged}
    const research={...structuredClone(primary.research||{}),thesis:combine(s=>s.research?.thesis),sections:Array.from({length:6},(_,i)=>{
      const section={};for(const key of ['summary','support','counter','unknown','source'])section[key]=combine(s=>s.research?.sections?.[i]?.[key]);
      const dates=[...new Set(records.map(s=>s.research?.sections?.[i]?.asOf).filter(Boolean))];section.asOf=dates.length===1?dates[0]:'';return section;
    })};
    const reports=records.filter(s=>s.analysis).sort((a,b)=>(Date.parse(b.analysis.generatedAt)||0)-(Date.parse(a.analysis.generatedAt)||0));
    const history=[];for(const s of records)for(const h of s.history||[])if(!history.some(x=>JSON.stringify(x)===JSON.stringify(h)))history.push(structuredClone(h));history.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const merged={...primary,symbol,name:primary.name!==primary.symbol?primary.name:(reports[0]?.analysis.companyName||records.find(s=>s.name!==s.symbol)?.name||symbol),watch:records.some(s=>s.watch),notes:combine(s=>s.notes),research,analysis:reports[0]?.analysis||null,history:history.slice(-100),duplicateArchive:structuredClone(records)};
    if(JSON.stringify(merged).length>220000||new TextEncoder().encode(JSON.stringify(merged)).length>700000)throw Error('合併前備份過大，請先匯出備份並整理研究內容。');
    const ids=new Set(group.map(s=>s.id));return {stock:merged,stocks:stocks.filter(s=>!ids.has(s.id)).concat(merged),count:records.length};
  }
  globalThis.StockfolioWatchlist = Object.freeze({parse, plan, canonical, duplicates, mergeDuplicates});
})();
