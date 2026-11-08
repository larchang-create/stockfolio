(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fail = () => { throw Error('總經資料格式不完整，未套用此版本。'); };
  const text = (s, max = 3000) => { if (typeof s !== 'string' || !s.trim() || s.length > max) fail(); return s; };
  const date = (s, cutoff) => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0,10) !== s || s > cutoff) fail(); return s; };
  function validate(raw, now = new Date()) {
    if (raw?.schemaVersion !== 1) fail();
    const checkedAt = date(raw.checkedAt, now.toISOString().slice(0,10)), ids = new Set();
    if (!Array.isArray(raw.sources) || !raw.sources.length || raw.sources.length > 50) fail();
    const sources = raw.sources.map(s => {const id=text(s.id,80);if(ids.has(id))fail();ids.add(id);let url;try{url=new URL(s.url)}catch{fail()}if(url.protocol!=='https:'||url.username||url.password)fail();return {id,title:text(s.title,300),url:url.href}});
    function refs(list) {if(!Array.isArray(list)||!list.length||list.some(id=>!ids.has(id)))fail();return [...new Set(list)]}
    const unique = new Set();
    function key(s) {text(s,80);if(!/^[a-z0-9-]+$/.test(s)||unique.has(s))fail();unique.add(s);return s}
    if(!Array.isArray(raw.indicators)||!raw.indicators.length||raw.indicators.length>30||!Array.isArray(raw.events)||raw.events.length>50)fail();
    const indicators=raw.indicators.map(x=>{
      if(!Array.isArray(x.history)||x.history.length>100)fail();
      let last='';const history=x.history.map(p=>{const d=date(p.date,checkedAt);if(d<=last||typeof p.value!=='number'||!Number.isFinite(p.value))fail();last=d;return {date:d,value:p.value}});
      const periodEnd=date(x.periodEnd,checkedAt),publishedAt=date(x.publishedAt,checkedAt);if(periodEnd>publishedAt||last>periodEnd)fail();
      return {id:key(x.id),title:text(x.title,100),value:text(x.value,80),unit:text(x.unit,100),comparison:text(x.comparison,300),period:text(x.period,100),periodEnd,publishedAt,interpretation:text(x.interpretation),history,sourceIds:refs(x.sourceIds)};
    });
    function targetsOf(list){if(!Array.isArray(list)||list.length>200)fail();return list.map(t=>{if(!['台股','美股'].includes(t.market)||typeof t.symbol!=='string'||!(t.market==='台股'?/^[0-9]{4,6}[A-Z]?$/:/^[A-Z][A-Z0-9.-]{0,19}$/).test(t.symbol))fail();return {market:t.market,symbol:t.symbol}})}
    const events=raw.events.map(x=>{
      if(!['政策利率','科技管制','地緣風險'].includes(x.topic)||!['announced','consultation','adopted'].includes(x.stage)||typeof x.allStocks!=='boolean'||!Array.isArray(x.targets)||x.targets.length>200)fail();
      const targets=targetsOf(x.targets),eventDate=date(x.date,checkedAt),updatedAt=date(x.updatedAt||x.date,checkedAt),importance=x.importance||'normal';
      if(updatedAt<eventDate||!['major','normal','other'].includes(importance)||(x.ongoing!==undefined&&typeof x.ongoing!=='boolean'))fail();
      const pathIds=new Set();if(x.paths!==undefined&&(!Array.isArray(x.paths)||!x.paths.length||x.paths.length>10))fail();
      const paths=(x.paths||[]).map(p=>{const id=text(p.id,80);if(!/^[a-z0-9-]+$/.test(id)||pathIds.has(id)||!Array.isArray(p.nodes)||p.nodes.length!==3||!Array.isArray(p.checks)||!p.checks.length||p.checks.length>10||typeof p.allStocks!=='boolean')fail();pathIds.add(id);return {id,title:text(p.title,100),horizon:text(p.horizon,50),nodes:p.nodes.map(n=>text(n,200)),summary:text(p.summary),question:text(p.question),checks:p.checks.map(c=>text(c,1000)),counter:text(p.counter),allStocks:p.allStocks,targets:targetsOf(p.targets)}});
      return {id:key(x.id),title:text(x.title,200),topic:x.topic,stage:x.stage,status:text(x.status,100),date:eventDate,updatedAt,importance,ongoing:x.ongoing!==false,updateNote:x.updateNote?text(x.updateNote):'',paths,fact:text(x.fact),impact:text(x.impact),counter:text(x.counter),next:text(x.next),allStocks:x.allStocks,targets,sourceIds:refs(x.sourceIds)};
    });
    const sync=raw.sync&&raw.sync.enabled===true?{...raw.sync,sources:Array.isArray(raw.sync.sources)?raw.sync.sources:[]}:null;
    const announcements=Array.isArray(raw.announcements)?raw.announcements.filter(n=>n&&typeof n.title==='string'&&typeof n.date==='string'&&Number.isFinite(Date.parse(n.date))&&Date.parse(n.date)<=now.getTime()).map(n=>{let url;try{url=new URL(n.url)}catch{return null}return url.protocol==='https:'&&!url.username&&!url.password?{title:n.title.slice(0,300),url:url.href,date:n.date,source:String(n.source||'官方公告').slice(0,100)}:null}).filter(Boolean).slice(0,40):[];
    return {schemaVersion:1,checkedAt,eventsReviewedAt:raw.eventsReviewedAt?date(raw.eventsReviewedAt,checkedAt):null,sources,indicators,events,sync,announcements};
  }
  function related(event, stocks) {return stocks.filter(s=>s.watch && (event.allStocks || event.targets.some(t=>t.market===s.market&&t.symbol===s.symbol)))}
  function filter(events,{topic='all',onlyRelated=false,stocks=[]}={}) {return events.filter(e=>(topic==='all'||e.topic===topic)&&(!onlyRelated||related(e,stocks).length))}
  function groupEvents(events,{stocks=[],now=new Date()}={}){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),recent=new Date(Date.parse(today+'T00:00:00Z')-2*86400000).toISOString().slice(0,10);
    const unique=[...new Map(events.map(e=>[e.id,e])).values()];
    const sorted=unique.sort((a,b)=>(b.importance==='major')-(a.importance==='major')||Number(!!related(b,stocks).length)-Number(!!related(a,stocks).length)||(b.updatedAt||b.date).localeCompare(a.updatedAt||a.date)||a.id.localeCompare(b.id));
    const focus=[],ongoing=[],other=[];let regular=0;
    for(const e of sorted){const updated=e.updatedAt||e.date;if(e.importance!=='other'&&updated>=recent&&updated<=today&&(e.importance==='major'||regular<5)){focus.push(e);regular++}else if(e.ongoing!==false&&e.importance!=='other')ongoing.push(e);else other.push(e)}
    return {focus,ongoing,other};
  }
  function sparkline(history) {
    if(history.length<3)return '';
    const min=Math.min(...history.map(p=>p.value)),max=Math.max(...history.map(p=>p.value)),span=max-min||1;
    const points=history.map((p,i)=>[8+i*224/(history.length-1),44-(p.value-min)*34/span]);
    return `<div class="macro-chart"><svg viewBox="0 0 240 52" role="img" aria-label="${esc(history.map(p=>p.date+'：'+p.value).join('；'))}"><path d="M8 47H232" stroke="#dce3da" fill="none"/><polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#3d6a56" stroke-width="2"/>${points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#3d6a56"><title>${esc(history[i].date+'：'+history[i].value)}</title></circle>`).join('')}</svg><div><span>${esc(history[0].date)}</span><span>${esc(history.at(-1).date)}</span></div><p class="chart-range">範圍 ${min}–${max} · ${history.length} 筆</p></div>`;
  }
  let snapshot=null, stocks=[], loading=null;
  const selectedPaths=new Map();
  const q = selector => typeof document==='undefined'?null:document.querySelector(selector);
  function sources(ids) {return ids.map(id=>{const source=snapshot.sources.find(s=>s.id===id);return `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>`}).join('')}
  function eventPaths(e){return e.paths.length?e.paths:[{id:'main',title:'主要影響',horizon:'待驗證',nodes:[e.topic,'成本、需求或估值', '相關產業與公司'],summary:e.impact,question:e.next,checks:[e.next],counter:e.counter,allStocks:e.allStocks,targets:e.targets}]}
  function renderPath(e){
    const paths=eventPaths(e),p=paths.find(p=>p.id===selectedPaths.get(e.id))||paths[0],links=related(p,stocks);
    return `<div class="impact-chain">${p.nodes.map((node,i)=>`${i?'<span class="impact-arrow" aria-hidden="true">→</span>':''}<div class="impact-node"><small>${['事件起點','傳導推論','可能相關產業'][i]}</small><span>${esc(node)}</span></div>`).join('')}</div><p class="path-takeaway">${esc(p.summary)}</p><details data-detail="${e.id}:company" open><summary>連到公司，還要多問一步</summary>${links.length?`<div class="event-stocks"><span>研究關聯 · 待驗證</span>${links.map(s=>`<button type="button" data-macro-stock="${esc(s.id)}">${esc(s.symbol)} ↗</button>`).join('')}</div>`:'<p class="path-unknown">尚未建立這條路徑與名單中公司的具體連結。</p>'}<p class="path-question">${esc(p.question)}</p></details><details data-detail="${e.id}:checks"><summary>接下來看什麼？</summary><ul class="path-checks">${p.checks.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></details><details data-detail="${e.id}:counter"><summary>什麼會改變判斷？</summary><p class="path-question">${esc(p.counter)}</p></details>`;
  }
  function renderCard(e,compact=false,open=false){
    const paths=eventPaths(e),active=paths.find(p=>p.id===selectedPaths.get(e.id))||paths[0];
    const body=`<div class="event-fact-row"><span>已確認</span><p class="event-fact">${esc(e.fact)}</p></div><div class="path-heading"><h4>影響路徑</h4><span>公司影響待驗證</span></div>${paths.length>1?`<div class="path-picker" role="group" aria-label="${esc(e.title)}的影響路徑">${paths.map(p=>`<button type="button" data-path-event="${e.id}" data-path-id="${p.id}" aria-pressed="${p.id===active.id}">${esc(p.title)}<small>${esc(p.horizon)}</small></button>`).join('')}</div>`:''}<div class="path-content" data-path-content="${e.id}">${renderPath(e)}</div><details class="event-evidence" data-detail="${e.id}:sources"><summary>本次更新與來源</summary><p class="path-question">${esc(e.updateNote||'本次未新增事件解讀。')}</p><p class="path-unknown">原始公告 ${e.date} · 解讀更新 ${e.updatedAt}</p><div class="macro-sources">${sources(e.sourceIds)}</div></details>`;
    const meta=`<div class="event-meta"><span>${esc(e.topic)}</span><time datetime="${e.updatedAt}">解讀更新 ${e.updatedAt}</time><span class="event-stage ${e.stage}">${esc(e.status)}</span></div>`;
    return compact?`<details class="event-card event-compact" data-event="${e.id}" ${open?'open':''}><summary><span>${esc(e.title)}</span><small>${esc(e.topic)} · ${e.updatedAt}</small></summary><div class="event-compact-body">${meta}${body}</div></details>`:`<article class="event-card" data-event-card="${e.id}">${meta}<h3>${esc(e.title)}</h3><p class="event-one-line">${esc(e.impact)}</p>${body}</article>`;
  }
  function renderEvents(){
    if(!snapshot||!q('#macro-events'))return;
    const area=q('#macro-events'),opened=new Map([...area.querySelectorAll('details')].map(d=>[d.dataset.detail||d.dataset.event||d.id,d.open]));
    const events=filter(snapshot.events,{topic:q('#event-topic').value,onlyRelated:q('#event-related').checked,stocks});
    q('#events-empty').hidden=!!events.length;
    const groups=groupEvents(events,{stocks});
    area.innerHTML=`<section class="event-group" aria-labelledby="focus-heading"><div class="event-group-title"><h3 id="focus-heading">今日重點</h3><span>${groups.focus.length} 則</span></div>${groups.focus.length?groups.focus.map(e=>renderCard(e)).join(''):'<p class="event-group-empty">目前沒有最近三天新增或更新的重點；未結束的事件見下方。</p>'}</section>${groups.ongoing.length?`<section class="event-group" aria-labelledby="ongoing-heading"><div class="event-group-title"><h3 id="ongoing-heading">持續追蹤</h3><span>${groups.ongoing.length} 則</span></div>${groups.ongoing.map(e=>renderCard(e,true,opened.get(e.id))).join('')}</section>`:''}${groups.other.length?`<details id="other-events" class="other-events" ${opened.get('other-events')?'open':''}><summary>其他事件 <span>${groups.other.length} 則</span></summary><div>${groups.other.map(e=>renderCard(e,true,opened.get(e.id))).join('')}</div></details>`:''}`;
    area.querySelectorAll('details').forEach(d=>{const id=d.dataset.detail||d.dataset.event||d.id;if(opened.has(id))d.open=opened.get(id)});
    q('#macro-analysis-updated').textContent='事件解讀更新 '+(snapshot.eventsReviewedAt||snapshot.checkedAt);
  }
  function renderIndicators(){
    const stale=(Date.now()-Date.parse(snapshot.checkedAt+'T00:00:00+08:00'))/86400000>7;
    q('#macro-updated').textContent=snapshot.sync?(snapshot.sync.lastRun?'最後檢查 '+new Date(snapshot.sync.lastRun).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+' · 每日分批更新':'每日 07:00 起更新 · 等待首次執行'):`查核 ${snapshot.checkedAt} · 已發布快照${stale?' · 查核已逾 7 天':''}`;
    if(q('#public-sync-state')){q('#public-sync-state').hidden=!snapshot.sync;if(snapshot.sync){const info=snapshot.sync;q('#public-sync-state-body').textContent=info.schedule+'。最近排程執行：'+(info.lastCronRun?new Date(info.lastCronRun).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'等待首次排程；手動檢查不代表排程已執行')+'。';q('#public-source-states').innerHTML=info.sources.map(s=>`<li><strong>${esc(s.label)}</strong><span>${esc(({ok:'已檢查',error:'更新失敗・保留舊資料',pending:'待首次檢查'})[s.state]||s.state)}</span>${s.last_success?`<small>最近成功 ${esc(new Date(s.last_success).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}</small>`:''}${s.error?`<small>${esc(s.error)}</small>`:''}</li>`).join('')}}
    if(q('#official-news')){q('#official-news').hidden=!snapshot.sync;q('#official-news-list').innerHTML=snapshot.announcements.length?snapshot.announcements.map(n=>`<article><div><span>${esc(n.source)}</span><time>${esc(new Date(n.date).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}</time></div><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)} ↗</a></article>`).join(''):'<p class="news-empty">等待官方公告來源首次檢查。</p>'}

    q('#macro-indicators').innerHTML=snapshot.indicators.map(x=>`<article class="indicator-card"><div class="indicator-label"><h3>${esc(x.title)}</h3><span>${esc(x.period)}</span></div><div class="indicator-value">${esc(x.value)}<small>${esc(x.unit)}</small></div><p class="indicator-comparison">${esc(x.comparison)}</p>${sparkline(x.history)}${snapshot.sync?`<p class="indicator-source-state">${esc(indicatorSourceState(x))}</p>`:''}<details><summary>解讀與來源</summary><p class="indicator-reading">推論：${esc(x.interpretation)}</p><p class="indicator-release">資料期末 ${x.periodEnd}<br>發布 ${x.publishedAt}</p>${x.history.length?`<table class="history-table"><caption>本次收錄資料（${esc(x.unit)}）</caption><thead><tr><th>期間</th><th>數值</th></tr></thead><tbody>${x.history.map(p=>`<tr><td>${p.date}</td><td>${p.value}</td></tr>`).join('')}</tbody></table>`:''}<div class="macro-sources">${sources(x.sourceIds)}</div></details></article>`).join('');
  }
  function indicatorSourceState(indicator){const map={fed:'fed',cpi:'cpi',jobs:'employment',fx:'fx',exports:'exports'};const source=snapshot.sync?.sources.find(s=>s.id===map[indicator.sourceIds[0]]);return source?.state==='error'?'更新失敗・保留原資料':source?.state==='ok'?'官方來源已檢查':'待首次自動檢查'}
  async function load(nextStocks=stocks){
    stocks=nextStocks;if(loading)return loading;
    q('#macro-refresh').disabled=true;q('#macro-error').hidden=true;
    loading=(async()=>{try{
      const response=await fetch((['localhost','127.0.0.1',''].includes(location.hostname)||location.hostname.endsWith('github.io'))?'macro-data.json':'/api/public-data/macro',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error(response.status===401?'登入已過期，請重新登入。':'暫時無法載入總經資料。');
      const body=await response.text();if(body.length>300000)fail();
      const data=validate(JSON.parse(body));snapshot=data;renderIndicators();renderEvents();
    }catch(error){q('#macro-error').hidden=false;q('#macro-error').textContent=(snapshot?'更新失敗，保留原資料與查核日期。':'')+(error.name==='TypeError'&&error.message.includes('fetch')?'網路連線失敗，請稍後再試。':['TimeoutError','AbortError'].includes(error.name)?'載入逾時，請稍後再試。':error.name==='SyntaxError'?'未取得有效資料，請確認登入狀態。':error.message);if(!snapshot)q('#macro-updated').textContent='未能載入資料'}finally{q('#macro-refresh').disabled=false;loading=null}})();
    return loading;
  }
  function setStocks(nextStocks){stocks=nextStocks;renderEvents()}
  if(q('#macro-refresh')){
    q('#macro-refresh').onclick=()=>load();q('#event-topic').onchange=renderEvents;q('#event-related').onchange=renderEvents;
    q('#macro-events').onclick=event=>{const path=event.target.closest('[data-path-event]');if(path){const e=snapshot.events.find(e=>e.id===path.dataset.pathEvent);if(!e)return;selectedPaths.set(e.id,path.dataset.pathId);const card=path.closest('.event-card');card.querySelectorAll('[data-path-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pathId===path.dataset.pathId)));card.querySelector('[data-path-content]').innerHTML=renderPath(e);return}const button=event.target.closest('[data-macro-stock]');if(button)q('#macro-content').dispatchEvent(new CustomEvent('stockfolio:open-stock',{detail:button.dataset.macroStock}))};
  }
  globalThis.StockfolioMacro=Object.freeze({validate,related,filter,groupEvents,sparkline,load,setStocks});
})();
