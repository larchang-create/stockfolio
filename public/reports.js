// Shared, strict boundary for research completed outside the website API.
(() => {
  const fail = message => { throw new Error(message); };
  const text = (value, label, max = 12000) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + '格式不正確');
    return value;
  };
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  function validate(document, stock, now = new Date()) {
    if (!stock) fail('請先選擇觀察名單中的股票。');
    if (document?.schemaVersion !== 1 || document.type !== 'stockfolio-research') fail('請選擇 Stockfolio 研究報告，備份檔請使用匯入備份。');
    if (document.market !== stock.market || document.symbol !== stock.symbol) fail('報告的市場或代號與目前選擇的股票不同。');
    const report = document.report;
    if (!report || report.schemaVersion !== 1) fail('研究報告版本不支援。');
    const generated = Date.parse(report.generatedAt);
    if (!date(report.periodEnd) || report.periodEnd > now.toISOString().slice(0, 10) || typeof report.generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(report.generatedAt) || !Number.isFinite(generated) || generated > now.getTime() || report.periodEnd > new Date(generated).toISOString().slice(0, 10)) fail('報告的財報期間或產生時間不正確。');
    if (!Array.isArray(report.sources) || !report.sources.length || report.sources.length > 50) fail('報告缺少原始來源。');
    const ids = new Set();
    const sources = report.sources.map(source => {
      const id = text(source?.id, '來源代號', 80);
      if (ids.has(id)) fail('來源代號重複。');
      ids.add(id);
      let url; try { url = new URL(source.url); } catch { fail('來源網址不正確。'); }
      if (url.protocol !== 'https:' || url.username || url.password) fail('來源必須是 HTTPS 網址。');
      return {id, title: text(source.title, '來源標題', 500), url: url.href};
    });
    if (!Array.isArray(report.sections) || report.sections.length !== 6) fail('報告必須包含六個研究區塊。');
    const sections = report.sections.map(section => {
      if (!section || !Array.isArray(section.sourceIds) || !section.sourceIds.length || section.sourceIds.some(id => !ids.has(id))) fail('研究區塊缺少可追溯的來源。');
      return {summary: text(section.summary, '研究重點'), support: text(section.support, '支持證據'), counter: text(section.counter, '反方風險'), unknown: text(section.unknown, '待確認事項'), sourceIds: [...new Set(section.sourceIds)]};
    });
    return {schemaVersion: 1, companyName: text(report.companyName, '公司名稱', 80), business: text(report.business, '公司介紹'), periodEnd: report.periodEnd, generatedAt: report.generatedAt, method: text(report.method, '研究方法', 500), sources, sections};
  }
  function apply(document, stock, {allowOlder = false, now = new Date()} = {}) {
    const report = validate(document, stock, now);
    if (!allowOlder && stock.analysis && Date.parse(stock.analysis.generatedAt) > Date.parse(report.generatedAt)) fail('目前已有較新的研究，未覆寫。');
    return {...stock, name: stock.name === stock.symbol ? report.companyName : stock.name, analysis: report};
  }
  globalThis.StockfolioReports = Object.freeze({validate, apply});
})();
