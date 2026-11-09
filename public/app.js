'use strict';
const KEY='stockfolio-v1';
const $=s=>document.querySelector(s);
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const plus=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+Number(n));return x.toISOString().slice(0,10)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>x===''||x==null?null:Number(x);
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
function normalize(x){if(!x||!['台股','美股'].includes(x.market)||typeof x.symbol!=='string'||!x.symbol.trim()||typeof x.name!=='string'||!x.name.trim())throw Error('每筆股票都需要市場、代號與公司名稱');
const r={id:/^[a-f0-9-]{36}$/.test(x.id)?x.id:crypto.randomUUID(),market:x.market,symbol:x.symbol.trim().toUpperCase().slice(0,20),name:x.name.trim().slice(0,80),watch:x.watch===true,notes:String(x.notes??'').slice(0,5000),frequency:[7,14,30].includes(Number(x.frequency))?Number(x.frequency):7,asOf:x.asOf||'',nextReview:x.nextReview||plus(day(),7),demo:x.demo===true,research:normalizeResearch(x.research),analysis:normalizeAnalysis(x.analysis),history:[]};
for(const k of ['price','pe','yield']){r[k]=number(x[k]);if(r[k]!==null&&(!Number.isFinite(r[k])||(k!=='pe'&&r[k]<0)))throw Error('價格與財務欄位格式不正確')}
if(!validDate(r.nextReview)||(r.asOf&&!validDate(r.asOf)))throw Error('日期格式不正確');
if(x.duplicateArchive!==undefined){if(!Array.isArray(x.duplicateArchive)||JSON.stringify(x.duplicateArchive).length>220000)throw Error('合併前備份格式不正確');r.duplicateArchive=structuredClone(x.duplicateArchive)}
if(Array.isArray(x.history))r.history=x.history.slice(-100).map(h=>({date:String(h.date??'').slice(0,10),notes:String(h.notes??'').slice(0,5000)}));return r}
let stocks=[],view='tw',editId=null;const publicData=new Map(),pendingPublic=new Set();
try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);if(!Array.isArray(saved))throw Error();stocks=saved.map(normalize)}}catch(e){setTimeout(()=>toast('無法讀取本機資料，請匯入備份。原始儲存內容尚未覆寫。'),50)}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',5000)}
function persist(next){try{if(cloudClient)cloudClient.commit(next);else localStorage.setItem(KEY,JSON.stringify(next));stocks=next;render();return true}catch(e){toast('儲存失敗：瀏覽器儲存空間不可用，請先匯出備份。');return false}}
function filtered(){const q=$('#search').value.trim().toLowerCase(),p=number($('#pe').value),y=number($('#yield').value);return stocks.filter(s=>s.market===currentMarket()&&(!q||[s.name,s.symbol,s.notes,publicData.get(s.market+':'+s.symbol)?.data?.companyName||''].some(x=>x.toLowerCase().includes(q)))&&(p===null||(s.pe!==null&&s.pe>0&&s.pe<=p))&&(y===null||(s.yield!==null&&s.yield>=y))).sort((a,b)=>$('#sort').value==='yield'?(b.yield??-Infinity)-(a.yield??-Infinity):$('#sort').value==='due'?a.nextReview.localeCompare(b.nextReview):a.symbol.localeCompare(b.symbol))}
const fmt=x=>x===null?'—':new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(x);
function currentMarket(){return view==='us'?'美股':'台股'}
function render(){StockfolioMacro.setStocks(stocks);updateResearchOptions();$('#market-service-status').textContent='';const marketStocks=stocks.filter(s=>s.market===currentMarket());$('#count-all').textContent=marketStocks.length;$('#count-watch').textContent=marketStocks.filter(x=>x.watch).length;$('#count-due').textContent=marketStocks.filter(x=>x.nextReview<=day()).length;const list=filtered();$('#rows').innerHTML=list.map(s=>`<tr><td><button class="star" data-star="${s.id}" aria-label="${s.watch?'移出':'加入'}觀察清單" aria-pressed="${s.watch}">${s.watch?'★':'☆'}</button></td><td><strong>${esc(s.symbol)}</strong>${s.demo?'<span class="badge">示範</span>':''}<small>${esc(s.name===s.symbol?(publicData.get(s.market+':'+s.symbol)?.data?.companyName||s.market):s.name+' · '+s.market)}</small></td><td>${fmt(s.price??publicData.get(s.market+':'+s.symbol)?.data?.quote?.price??null)}<small>${s.market==='台股'?'TWD':'USD'}</small></td><td>${fmt(s.pe)}${s.pe!==null?' 倍':''}</td><td>${fmt(s.yield)}${s.yield!==null?'%':''}</td><td class="${s.nextReview<=day()?'due':''}">${s.nextReview}${s.nextReview<=day()?'<small>已到檢視日期</small>':''}</td><td>${s.asOf||publicData.get(s.market+':'+s.symbol)?.data?.quote?.date||'未填寫'}</td><td><div class="row-actions"><button class="edit" data-expand="${s.id}" aria-expanded="false">展開資料</button><button class="edit" data-sync="${s.id}" ${pendingPublic.has(s.id)?'disabled':''}>${pendingPublic.has(s.id)?'檢查中…':'更新資料'}</button><button class="edit research-link" data-research="${s.id}">研究院 ↗</button>${StockfolioWatchlist.duplicates(stocks,s).length>1?`<button class="edit duplicate-action" data-merge="${s.id}">合併重複</button>`:''}<button class="edit delete-stock" data-remove="${s.id}" aria-label="刪除 ${esc(s.symbol)}">刪除</button></div></td></tr>`).join('');$('#empty').hidden=!!list.length;$('#empty h3').textContent=marketStocks.length?'沒有符合條件的股票':'從第一個投資想法開始';$('#empty p').textContent=marketStocks.length?'調整篩選條件，或新增其他研究標的。':`輸入${currentMarket()}代號加入觀察名單，研究資料之後再補。`;$('#result-count').textContent=`顯示 ${list.length} / ${marketStocks.length} 筆資料`}
function openEditor(id){editId=id||null;const s=stocks.find(x=>x.id===id)||{market:'台股',watch:true,frequency:7,nextReview:plus(day(),7)};const f=$('#stock-form');f.reset();for(const k of ['market','symbol','name','price','pe','yield','asOf','nextReview','frequency','notes'])f.elements[k].value=s[k]??'';f.elements.watch.checked=s.watch;$('#editor-title').textContent=id?'股票研究筆記':'新增股票';$('#delete').hidden=!id;$('#review').hidden=!id;$('#history').textContent=(s.history||[]).slice().reverse().map(h=>`${h.date}｜${h.notes||'完成檢視'}`).join('\n\n');$('#editor').showModal()}
function readForm(){const f=$('#stock-form');const raw=Object.fromEntries(new FormData(f));raw.watch=f.elements.watch.checked;const old=stocks.find(s=>s.id===editId);const item=normalize({...raw,history:old?.history,demo:old?.demo,research:old?.research,analysis:old?.analysis,duplicateArchive:old?.duplicateArchive});if(old)item.id=old.id;if(stocks.some(s=>s.id!==editId&&s.market===item.market&&s.symbol===item.symbol))throw Error('這檔股票已存在，請編輯原有項目。');return item}
function saveForm(review=false){try{const item=readForm();if(review){item.history.push({date:day(),notes:item.notes});item.nextReview=plus(day(),item.frequency)}const next=editId?stocks.map(s=>s.id===editId?item:s):[...stocks,item];if(persist(next)){$('#editor').close();toast(review?'已記錄檢視並更新下次日期':'已儲存')}}catch(e){toast(e.message)}}
$('#stock-form').onsubmit=e=>{e.preventDefault();saveForm()};$('#review').onclick=()=>{if($('#stock-form').reportValidity())saveForm(true)};$('#close').onclick=()=>$('#editor').close();$('#add').onclick=$('#empty-add').onclick=openQuickAdd;$('#delete').onclick=()=>deleteStock(editId);
$('#rows').onclick=e=>{const star=e.target.closest('[data-star]'),edit=e.target.closest('[data-edit]'),research=e.target.closest('[data-research]'),expand=e.target.closest('[data-expand]'),sync=e.target.closest('[data-sync]'),remove=e.target.closest('[data-remove]'),merge=e.target.closest('[data-merge]'),archive=e.target.closest('[data-archive]');if(remove)deleteStock(remove.dataset.remove);if(merge)mergeDuplicateStock(merge.dataset.merge);if(archive)exportDuplicateArchive(archive.dataset.archive);if(star)persist(stocks.map(s=>s.id===star.dataset.star?{...s,watch:!s.watch}:s));if(edit)openEditor(edit.dataset.edit);if(research){if(!canLeaveResearch())return;setView('academy',true);$('#research-stock').value=research.dataset.research;openResearch(research.dataset.research)}if(expand)toggleStockDetails(expand);if(sync)refreshStockPublicData(sync.dataset.sync)};
function setView(next,skipGuard=false){if(!skipGuard&&!canLeaveResearch())return;view=next;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});const macro=view==='macro',academy=view==='academy',label=academy?'研究院':macro?'總經概況':currentMarket();$('#view-label').textContent=label;$('#page-heading').textContent=academy?'研究院。':macro?'總經概況。':label+'觀察名單。';$('#page-description').textContent=academy?'讓每個投資想法，都能回到證據與假設。':macro?'利率、景氣與國際事件，連回你的觀察名單。':'從一個代號開始，逐步建立你的投資研究。';$('#market-content').hidden=macro||academy;$('#macro-content').hidden=!macro;$('#academy-content').hidden=!academy;$('#add').hidden=macro||academy;if(macro)StockfolioMacro.load(stocks);if(academy){updateResearchOptions();if($('#research-workspace').hidden)openResearch(null)}history.replaceState(null,'','#'+view);$('#table-title').textContent=label+'觀察名單';$('#market-caption').textContent=label;for(const id of ['search','pe','yield'])$('#'+id).value='';render()}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
for(const id of ['search','pe','yield','sort'])$('#'+id).addEventListener('input',render);
function openQuickAdd(){$('#quick-form').reset();$('#quick-market').value=currentMarket();$('#quick-error').textContent='';updateQuickHint();$('#quick-add').showModal();$('#quick-symbol').focus()}
function updateQuickHint(){const example=$('#quick-market').value==='台股'?'2330,2454,0050':'MSFT,AMZN,AAPL';$('#quick-symbol').placeholder='例如 '+example;$('#quick-hint').textContent='支援中英文逗號，例如 '+example+'。重複代號會自動略過。';$('#quick-error').textContent=''}
$('#quick-market').onchange=updateQuickHint;$('#quick-symbol').oninput=()=>$('#quick-error').textContent='';
$('#quick-close').onclick=$('#quick-cancel').onclick=()=>$('#quick-add').close();
$('#quick-form').onsubmit=e=>{e.preventDefault();try{const market=$('#quick-market').value,result=StockfolioWatchlist.plan(stocks,market,$('#quick-symbol').value,normalize);if(!result.added&&!result.restored&&!result.corrected){$('#quick-error').textContent='這些股票已在觀察名單中，沒有重複新增。';return}if(persist(result.stocks)){setView(market==='台股'?'tw':'us');$('#quick-add').close();toast([result.added?'新增 '+result.added+' 檔':'',result.restored?'重新加入 '+result.restored+' 檔':'',result.corrected?'已統一 '+result.corrected+' 檔股票代號':'',result.skipped?'略過 '+result.skipped+' 個重複代號':''].filter(Boolean).join('；'))}}catch(error){$('#quick-error').textContent=error.message}};

function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#export').onclick=()=>download(`stockfolio-${day()}.json`,JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),stocks},null,2),'application/json');
$('#import').onclick=()=>$('#backup-file').click();$('#backup-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5000000)throw Error('備份檔案過大');const data=JSON.parse(await file.text());if(data.schemaVersion!==1||!Array.isArray(data.stocks)||data.stocks.length>10000)throw Error('不支援的備份格式');const next=data.stocks.map(normalize);checkDuplicates(next);if(confirm(`以備份的 ${next.length} 檔股票取代目前資料？建議先匯出目前備份。`)&&persist(next))toast('備份匯入完成')}catch(err){toast('匯入失敗：'+err.message)}finally{e.target.value=''}};
function checkDuplicates(list){const keys=list.map(s=>s.market+':'+s.symbol);if(new Set(keys).size!==keys.length)throw Error('有重複的市場與股票代號')}
function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw Error('CSV 引號未結束');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
$('#csv').onclick=()=>$('#csv-file').click();$('#csv-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5000000)throw Error('CSV 檔案過大');const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));const headers=rows.shift()?.map(x=>x.trim());if(!headers||!['market','symbol','name'].every(x=>headers.includes(x)))throw Error('CSV 必須有 market,symbol,name 標題；欄位格式請參閱隨附範本');const added=rows.map(row=>normalize(Object.fromEntries(headers.map((h,i)=>[h,row[i]?.trim()||'']))));const next=[...stocks,...added];checkDuplicates(next);if(persist(next))toast(`已匯入 ${added.length} 檔股票`)}catch(err){toast('匯入失敗：'+err.message)}finally{e.target.value=''}};
$('#demo').onclick=()=>{const demos=[{market:'台股',symbol:'DEMO-TW',name:'示範台灣公司',price:100,pe:15,yield:3},{market:'美股',symbol:'DEMO-US',name:'Demo US Company',price:80,pe:22,yield:1.5}].filter(x=>!stocks.some(s=>s.market===x.market&&s.symbol===x.symbol)).map(x=>normalize({...x,demo:true,watch:true,nextReview:day(),notes:'虛構示範資料，用於體驗功能。不是實際股票或行情。'}));if(persist([...stocks,...demos]))toast('已加入虛構示範資料，可於研究筆記中刪除')};
$('#calendar').onclick=()=>{const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Stockfolio//Research Reminder//ZH-TW','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@stockfolio.local','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+plus(day(),7).replaceAll('-',''),'RRULE:FREQ=WEEKLY','SUMMARY:拾股｜每週投資研究檢視','DESCRIPTION:開啟拾股檢視自選股票、更新資料與記錄投資假設。資料保存在原本使用的瀏覽器。','BEGIN:VALARM','TRIGGER:-PT9H','ACTION:DISPLAY','DESCRIPTION:本週投資研究檢視','END:VALARM','END:VEVENT','END:VCALENDAR'];download('stockfolio-weekly.ics',lines.join('\r\n')+'\r\n','text/calendar');toast('請將下載的提醒匯入個人行事曆')};// Research worksheets use the same stock records, so backup and restore include drafts.
function normalizeResearch(x){const clean=v=>String(v??'').slice(0,5000);return {thesis:clean(x?.thesis),updatedAt:typeof x?.updatedAt==='string'?x.updatedAt.slice(0,40):'',sections:Array.from({length:6},(_,i)=>{const v=x?.sections?.[i];return {summary:clean(v?.summary),support:clean(v?.support),counter:clean(v?.counter),unknown:clean(v?.unknown),source:clean(v?.source),asOf:clean(v?.asOf).slice(0,10)}})}}
const researchFramework=[
{title:'公司怎麼賺錢？',tag:'BUSINESS MODEL',question:'誰付錢、買什麼、怎麼收費？先找出最大的幾塊收入。',source:'年報業務介紹、部門與產品營收',metrics:'收入來源、營收占比、收費方式',prompt:'把公司如何賺錢說清楚；尚未取得的營收占比不要猜。'},
{title:'未來為什麼能成長？',tag:'GROWTH DRIVERS',question:'成長來自客戶、用量、價格、市占，還是景氣復甦？',source:'業務指標、產業資料、公司財測',metrics:'依產業挑選客戶數、用量、售價或出貨等指標',prompt:'寫出成長的原因，並註明這是已確認事實、公司預測或你的推論。'},
{title:'成長品質好不好？',tag:'FINANCIAL QUALITY',question:'收入增加後，利潤與現金是否跟上？有沒有需要調查的變化？',source:'損益表、現金流量表、資產負債表與附註',metrics:'利潤率、營業現金流、應收帳款、存貨',prompt:'比較同期間的變化，列出原因待查；單一比率異常不等於公司有問題。'},
{title:'成長需要付出什麼？',tag:'COST OF GROWTH',question:'設備、研發、人員與資金投入，會留下什麼負擔？',source:'現金流量表、資產負債表、支出與租賃附註',metrics:'資本支出、研發、負債、租賃、股權稀釋',prompt:'記錄投入及其口徑，區分現金支出、融資租賃與未來承諾。'},
{title:'現在的價格要求它做到什麼？',tag:'VALUATION & EXPECTATIONS',question:'現價需要多高的成長與獲利才能成立？如果不如預期呢？',source:'有日期的股價、估值假設、可比較的同業資料',metrics:'適合該產業的估值方式、樂觀／基準／悲觀情境',prompt:'先列假設與估值範圍；未建立模型前不要填精準目標價。'},
{title:'什麼情況代表想錯了？',tag:'VALIDATION & RISKS',question:'哪些證據會動搖原本的投資理由？下一次要驗證什麼？',source:'原始投資假設與後續公司揭露',metrics:'投資理由失效條件、待追蹤指標、下次檢視事件',prompt:'提出可觀察的失效條件。系統建議與你確認的規則應分開記錄。'}];
let researchId=null,researchDirty=false,notesSaveTimer=null;
function canLeaveResearch(){if(!researchDirty)return true;saveResearchNote();if(!researchDirty)return true;if(!confirm('筆記尚未儲存，確定離開？'))return false;clearTimeout(notesSaveTimer);researchDirty=false;return true}
window.addEventListener('beforeunload',e=>{if(researchDirty){e.preventDefault();e.returnValue=''}});
function updateResearchOptions(){const select=$('#research-stock');if(!select)return;const selected=select.value;select.innerHTML='<option value="">請選擇觀察名單中的股票</option>'+['台股','美股'].map(m=>{const list=stocks.filter(s=>s.market===m);return list.length?`<optgroup label="${m}">${list.map(s=>`<option value="${s.id}">${esc(s.symbol)}${s.name===s.symbol?'':' · '+esc(s.name)}${s.watch?'':'（未標記觀察）'}</option>`).join('')}</optgroup>`:''}).join('');if(stocks.some(s=>s.id===selected))select.value=selected;$('#research-picker-hint').textContent=stocks.length?'選擇已加入的公司，或先看六個區塊的介面示意。':'目前還沒有股票。可先看介面示意，或到台股／美股加入代號。'}
function openResearch(id){if(!canLeaveResearch())return;const stock=stocks.find(s=>s.id===id);researchId=stock?stock.id:null;const draft=normalizeResearch(stock?.research);$('#research-workspace').hidden=false;renderLiveReport(stock);$('#research-company').textContent=stock?`${stock.symbol}${stock.name===stock.symbol?'':' · '+stock.name}`:'介面示意 · 尚未選擇公司';$('#research-status').textContent=stock?`${stock.market} · ${stock.analysis?'已有研究結果':'尚未分析'}`:'選擇公司以取得資料與研究結果。';$('#research-thesis').value=draft.thesis;$('#research-thesis').disabled=!stock;$('#research-save').disabled=!stock;$('#research-save-state').textContent=stock?(draft.updatedAt?'已儲存':'輸入後自動儲存'):'尚未選擇公司';$('#research-saved-at').textContent=draft.updatedAt?`上次儲存 ${new Date(draft.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`:'輸入後自動儲存';$('#research-picker-error').textContent='';researchDirty=false;renderBackgroundStatus(stock)}
function saveResearchNote(id=researchId,value=$('#research-thesis').value){
 clearTimeout(notesSaveTimer);const stock=stocks.find(s=>s.id===id);if(!stock)return;
 const draft=normalizeResearch(stock.research);if(draft.thesis===value){if(researchId===id){researchDirty=false;$('#research-save-state').textContent='已儲存'}return}
 draft.thesis=value;draft.updatedAt=new Date().toISOString();
 if(persist(stocks.map(s=>s.id===stock.id?{...s,research:draft}:s))&&researchId===id){researchDirty=false;$('#research-save-state').textContent='已儲存';$('#research-saved-at').textContent='上次儲存 '+new Date(draft.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'});renderBackgroundStatus(stocks.find(s=>s.id===id))}
}
$('#research-open').onclick=()=>{if(!$('#research-stock').value){$('#research-picker-error').textContent='請先選擇一檔股票，或點「先看介面示意」。';return}openResearch($('#research-stock').value)};
$('#research-preview').onclick=()=>openResearch(null);
$('#research-stock').onchange=()=>{if(!canLeaveResearch()){$('#research-stock').value=researchId||'';return}openResearch($('#research-stock').value)};
$('#research-form').oninput=()=>{if(!researchId)return;researchDirty=true;$('#research-save-state').textContent='正在儲存…';clearTimeout(notesSaveTimer);const id=researchId,value=$('#research-thesis').value;notesSaveTimer=setTimeout(()=>saveResearchNote(id,value),800)};
$('#research-form').onsubmit=e=>{e.preventDefault();saveResearchNote()};
function toggleStockDetails(button){
 const row=button.closest('tr'),next=row.nextElementSibling;if(next?.classList.contains('stock-details-row')){next.remove();button.setAttribute('aria-expanded','false');button.textContent='展開資料';return}
 const s=stocks.find(x=>x.id===button.dataset.expand);if(!s)return;const record=publicData.get(s.market+':'+s.symbol),data=record?.data;
 const state=({pending:'等待首次檢查',ok:'已取得公開資料',partial:'部分來源已取得',error:'來源更新失敗，保留已有資料'})[record?.state]||'尚未取得公開資料';
 const details=document.createElement('tr');details.className='stock-details-row';details.innerHTML=`<td colspan="8"><div class="stock-details"><div><small>公開資料</small><strong>${esc(state)}</strong><p>${record?.checkedAt?'最後檢查 '+esc(new Date(record.checkedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})):'雲端版會依觀察名單分批檢查。'}${record?.error?'<br>'+esc(record.error):''}</p>${data?.quote?`<p><a href="${esc(validSourceURL(data.quote.url))}" target="_blank" rel="noopener noreferrer">官方收盤 ${esc(data.quote.date)} · ${esc(data.quote.price)} ${esc(data.quote.currency)} ↗</a></p>`:''}</div><div><small>我的筆記</small><strong>${s.analysis?'已有研究報告':'尚未研究'}</strong><p>${s.notes?esc(s.notes):'尚未填寫觀察筆記。'}</p></div><div class="detail-actions"><button data-sync="${s.id}" ${pendingPublic.has(s.id)?'disabled':''}>更新公開資料</button><button data-edit="${s.id}">編輯手動資料</button><button data-research="${s.id}" class="primary">前往研究院 ↗</button>${s.duplicateArchive?`<button data-archive="${s.id}">匯出合併前備份</button>`:''}</div>${data?`<details class="stock-filings"><summary>公告與財報來源（${data.filings?.length||0}）</summary>${(data.filings||[]).filter(f=>validSourceURL(f.url)).map(f=>`<article><small>${esc(f.dateLabel||(f.form==='重大訊息'?'公告日':'申報日'))} ${esc(f.date)}${f.periodEnd?' · 資料期末 '+esc(f.periodEnd):''}</small><a href="${esc(validSourceURL(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.title)} ↗</a></article>`).join('')||'<p>本次來源沒有提供此股票的公司公告；不代表沒有歷史申報。</p>'}<p class="public-coverage">${esc(data.coverage)}</p></details>`:''}</div></td>`;
 row.after(details);button.setAttribute('aria-expanded','true');button.textContent='收合資料';
}
function normalizeAnalysis(x){if(!x||x.schemaVersion!==1||!Array.isArray(x.sections)||x.sections.length!==6||!Array.isArray(x.sources))return null;const clean=v=>String(v??'').slice(0,12000),sources=x.sources.slice(0,50).map(s=>({id:clean(s.id),title:clean(s.title),url:validSourceURL(s.url)})).filter(s=>s.url);if(!sources.length)return null;const ids=new Set(sources.map(s=>s.id));return {schemaVersion:1,instrumentType:x.instrumentType==='fund'?'fund':'company',companyName:clean(x.companyName),business:clean(x.business),periodEnd:clean(x.periodEnd),generatedAt:clean(x.generatedAt),method:clean(x.method),sources,sections:x.sections.map(s=>({summary:clean(s.summary),support:clean(s.support),counter:clean(s.counter),unknown:clean(s.unknown),sourceIds:Array.isArray(s.sourceIds)?s.sourceIds.filter(id=>ids.has(id)):[]}))}}
function validSourceURL(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
let cloudClient=null,cloudEmail='',serviceConfig=null,syncState='local';
let backgroundResearch=null,backgroundLoading=false,backgroundError=false;
function renderBackgroundStatus(stock){
 const host=$('#research-background-status');host.hidden=!stock||!cloudClient;if(host.hidden)return;
 if(!backgroundResearch){host.textContent=backgroundError?'暫時無法確認遠端研究狀態；筆記仍可儲存。':'正在確認遠端研究狀態…';return}
 const entry=backgroundResearch.stocks?.find(s=>s.key===stock.market+':'+stock.symbol);
 let message;
 if(backgroundResearch.exchange?.enabled&&backgroundResearch.exchange.lastExport){message=entry?.pending?'名單與筆記已加密同步，等待研究結果。':entry?.hasReport?'研究結果已更新並同步。':'名單已加密同步，等待首次研究。';}
 else if(!entry)message='這家公司未加入觀察清單；加入後才會排入背景研究。';
 else if(!backgroundResearch.deviceAuthorized)message='遠端研究尚未完成授權；筆記會保留並同步。';
 else if(!backgroundResearch.deviceOnline)message='遠端研究目前未連線；筆記會保留，連線恢復後再處理。';
 else if(entry?.job?.state==='running')message='這家公司正在研究中；結果完成後會自動同步。';
 else if(entry?.waitingForPublicData)message='等待這家公司的公開資料，備妥後排入研究。';
 else if(entry?.job?.state==='error'&&entry.pending)message='上次研究未完成；新筆記或下一批資料將觸發重試。';
 else if(entry?.pending)message='已排入研究；每 15 分鐘檢查一次，依序處理。';
 else message='每 15 分鐘檢查變更；目前已有研究，資料與筆記未變更時沿用。';
 host.replaceChildren(document.createTextNode(message));
 if(!backgroundResearch.deviceAuthorized||!backgroundResearch.deviceOnline){const link=document.createElement('a');link.href='/remote-connect';link.textContent='查看連線狀態 ↗';host.append(document.createTextNode(' '),link)}
}
async function refreshBackgroundResearch(){
 if(!cloudClient||backgroundLoading)return;backgroundLoading=true;
 try{const response=await fetch('/api/remote/status',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error();backgroundResearch=await response.json();backgroundError=false}catch{backgroundError=true;backgroundResearch=null}finally{backgroundLoading=false;if(researchId)renderBackgroundStatus(stocks.find(s=>s.id===researchId))}
}
const pendingResearch=new Set(),completedLoads=new Set(),researchErrors=new Map();
function showServiceSettings(){$('#service-url').value=window.STOCKFOLIO_CLOUD_URL||localStorage.getItem('stockfolio-cloud-url')||'';$('#service-error').textContent='';$('#service-dialog').showModal()}
$('#service-settings').onclick=showServiceSettings;$('#sync-status').onclick=()=>{if(syncState==='conflict')$('#sync-conflict').showModal();else showServiceSettings()};$('#service-close').onclick=()=>$('#service-dialog').close();
$('#service-form').onsubmit=e=>{e.preventDefault();const raw=validSourceURL($('#service-url').value.trim());if(!raw){$('#service-error').textContent='請填寫 HTTPS 網站網址。';return}const url=new URL(raw);if(url.pathname!=='/'||url.search||url.hash){$('#service-error').textContent='請填寫網站首頁網址。';return}localStorage.setItem('stockfolio-cloud-url',url.href);location.assign(url.href)};
function syncStatus(state,detail){syncState=state;const labels={local:'本機儲存',syncing:'同步中…',synced:'已同步',pending:'待同步',offline:'離線／待同步',editing:'編輯中',conflict:'版本待處理',error:'尚未連接'};$('#sync-status').textContent=labels[state]||state;$('#sync-status').dataset.state=state;$('#sync-status').title=typeof detail==='string'?detail:'';if(state==='conflict'){const names={notes:'投資筆記',watch:'觀察名單',name:'公司名稱',summary:'重點解讀',support:'支持證據',counter:'反方與風險',unknown:'待確認',thesis:'投資假設',source:'來源',history:'檢視紀錄'};const preview=v=>v===undefined?'（已刪除）':typeof v==='object'?JSON.stringify(v):String(v);$('#conflict-list').innerHTML=detail.map(c=>`<article class="conflict-item"><strong>${esc(c.path.split('.')[0])} · ${esc(names[c.path.split('.').at(-1)]||c.path.split('.').at(-1))}</strong><p>此裝置：${esc(preview(c.local).slice(0,500))}</p><p>雲端：${esc(preview(c.remote).slice(0,500))}</p></article>`).join('');if(!$('#sync-conflict').open)$('#sync-conflict').showModal()}}
function applyCloudData(next){stocks=next;render();if(researchId&&!researchDirty){const stock=stocks.find(x=>x.id===researchId);if(stock){$('#research-stock').value=researchId;openResearch(researchId)}else{researchId=null;openResearch(null)}}}
function editing(){return researchDirty||$('#editor').open||$('#quick-add').open}
async function connectCloud(){
 // GitHub Pages is the local preview. Personal data APIs exist only on the cloud site.
 if(location.hostname.endsWith('github.io')||['localhost','127.0.0.1',''].includes(location.hostname))return;
 try{
  const request=async(path,options={})=>{const response=await fetch(path,{...options,credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(25000)});if(response.status===401&&cloudClient){cloudClient.stop();serviceConfig=null;toast('登入已過期，請重新登入。');setTimeout(()=>location.assign('/login'),1500)}return response};
  const res=await request('/api/session');if(res.status===401){location.assign('/login');return}if(!res.ok)throw Error('登入或雲端服務尚未完成設定。');const account=await res.json();if(!account.accountId||!account.syncReady)throw Error('雲端資料庫尚未連接。');
  cloudEmail=account.accountId;const cacheKey='stockfolio-account:'+cloudEmail;let cached=null;
  try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null')}catch{}
  cloudClient=new StockfolioSync.Client({request,cached,isEditing:editing,save:data=>localStorage.setItem(cacheKey,JSON.stringify(data)),onData:applyCloudData,onStatus:syncStatus});
  // Read only this account's pending cache while the first network sync runs.
  stocks=cached?.current||[];render();$('#account-email').textContent=account.label||'我的個人資料';$('#account-state').textContent='名單、研究筆記及已儲存結果會同步至這個帳號。';$('#service-form').hidden=true;$('#cloud-account-actions').hidden=false;$('#service-settings').textContent='我的帳號';
  serviceConfig=account.analysisReady?{url:location.origin+'/api/'}:null;$('#research-service-state').textContent=account.analysisReady?'研究服務已設定 · '+account.researchModel+'（首次分析待驗證）':'尚未設定 OPENAI_API_KEY；名單與筆記同步正常。';
  await cloudClient.sync();await refreshPublicData();await refreshBackgroundResearch();setInterval(()=>{cloudClient.sync();if(view==='academy')refreshBackgroundResearch()},30000);setInterval(()=>{refreshPublicData();if(view==='macro')StockfolioMacro.load(stocks)},120000);
  window.addEventListener('focus',()=>cloudClient.sync());window.addEventListener('online',()=>cloudClient.sync());
  for(const dialog of ['#editor','#quick-add'])$(dialog).addEventListener('close',()=>cloudClient.schedule());
 }catch(e){syncStatus('error',e.message);$('#account-state').textContent=e.message;toast(e.message)}
}
$('#cloud-refresh').onclick=()=>cloudClient?.sync();
$('#cloud-import-local').onclick=()=>{try{const local=JSON.parse(localStorage.getItem(KEY)||'[]').map(normalize);if(!local.length){toast('這個網址沒有舊本機資料；可以使用匯入備份。');return}const merged=StockfolioSync.merge([],local,stocks);if(merged.conflicts.length){toast('有同代號的不同資料，請使用匯出備份逐一確認。');return}if(confirm(`合併 ${local.length} 檔本機股票至帳號？`)&&persist(merged.stocks))toast('已合併，正在同步')}catch(e){toast('合併失敗：'+e.message)}};
for(const [id,choice] of [['#keep-cloud','remote'],['#keep-device','local']])$(id).onclick=()=>{try{cloudClient.resolve(choice);$('#sync-conflict').close()}catch(e){toast('儲存失敗：請先匯出備份。')}};
window.addEventListener('beforeunload',e=>{if(cloudClient?.dirty){e.preventDefault();e.returnValue=''}});
function renderLiveReport(stock){const host=$('#live-report');host.hidden=false;$('#research-analyze').disabled=!stock||pendingResearch.has(stock.id);$('#research-analyze').textContent=stock&&pendingResearch.has(stock.id)?(completedLoads.has(stock.id)?'載入研究中…':'搜尋與分析中…'):stock?.analysis?'重新即時 AI 分析':'即時 AI 分析';$('#research-analyze').hidden=!serviceConfig;$('#research-load').disabled=!stock||pendingResearch.has(stock.id);$('#research-import').disabled=!stock||pendingResearch.has(stock.id);const report=stock?.analysis;if(!report){host.innerHTML='<div class="report-empty">'+esc(stock?(researchErrors.get(stock.id)||(serviceConfig?'尚未有研究結果。按「取得資料並分析」開始。':'尚未有研究結果；請查看上方遠端研究狀態，也可載入已完成的研究。')):'請先選擇公司。')+'</div>';return}host.innerHTML=`<div class="report-meta"><span>資料期末 ${esc(report.periodEnd)}</span><span>產生時間 ${esc(report.generatedAt)}</span><span>${esc(report.method)}</span></div><p class="business-summary">${esc(report.business)}</p>`+report.sections.map((s,i)=>`<details class="research-section live-section" open><summary><span class="section-number">${String(i+1).padStart(2,'0')}</span><span class="section-summary"><strong>${report.instrumentType==='fund'?['基金運作與指數規則','報酬來源','追蹤與配息品質','費用與集中度風險','價格、淨值與流動性','論點失效條件'][i]:researchFramework[i].title}</strong></span></summary><div class="research-section-body"><p class="report-text">${esc(s.summary)}</p><div class="report-evidence"><article><h4>支持證據</h4><p>${esc(s.support)}</p></article><article><h4>反方與風險</h4><p>${esc(s.counter)}</p></article><article><h4>待確認</h4><p>${esc(s.unknown)}</p></article></div><div class="report-sources">${s.sourceIds.map(id=>{const source=report.sources.find(x=>x.id===id);return source?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.id)} · ${esc(source.title)} ↗</a>`:''}).join('')}</div></div></details>`).join('')}
async function runResearch(id){const stock=stocks.find(s=>s.id===id);if(!stock||pendingResearch.has(id))return;if(!serviceConfig){await refreshResearchService();if(!serviceConfig){showServiceSettings();$('#research-service-setup').open=true;return}}pendingResearch.add(id);researchErrors.delete(id);render();if(researchId===id)renderLiveReport(stock);try{const r=await fetch(serviceConfig.url+'research',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({market:stock.market,symbol:stock.symbol}),signal:AbortSignal.timeout(330000)});const data=await r.json();if(!r.ok)throw Error(data.error||'取得資料失敗');const report=normalizeAnalysis(data);if(!report)throw Error('研究格式不完整，未套用結果。');const current=stocks.find(s=>s.id===id);if(!current||current.market!==stock.market||current.symbol!==stock.symbol)return;if(!persist(stocks.map(s=>s.id===id?{...s,name:s.name===s.symbol?report.companyName:s.name,analysis:report}:s)))return;if(researchId===id){$('#research-company').textContent=stock.symbol+' · '+report.companyName;$('#research-status').textContent=stock.market+' · 已有研究結果';renderLiveReport(stocks.find(s=>s.id===id))}toast(stock.symbol+' 研究結果已更新')}catch(err){researchErrors.set(id,err.name==='TimeoutError'?'分析逾時，請稍後重試。':err.message);toast(stock.symbol+'：'+(err.name==='TimeoutError'?'分析逾時，請稍後重試。':err.message))}finally{pendingResearch.delete(id);render();if(researchId===id)renderLiveReport(stocks.find(s=>s.id===id))}}
$('#research-analyze').onclick=()=>runResearch(researchId);
setView(['tw','us','macro','academy'].includes(location.hash.slice(1))?location.hash.slice(1):'tw',true);


connectCloud();

$('#cloud-logout').onclick=async()=>{if(researchDirty||cloudClient?.dirty){toast('請先儲存筆記並完成同步，再登出；也可以先匯出備份。');return}try{const r=await fetch('/api/logout',{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();cloudClient?.stop();if(cloudEmail)localStorage.removeItem('stockfolio-account:'+cloudEmail);location.assign('/login')}catch{toast('登出未完成，請確認網路後重試。')}};

async function refreshResearchService(check=false){
 const button=$('#research-check');button.disabled=true;$('#research-service-error').textContent='';
 if(!cloudClient){$('#research-service-state').textContent='請使用個人雲端網站登入後檢查研究服務。';button.disabled=false;return}
 try{
  const res=await fetch('/api/research/'+(check?'check':'status'),{method:check?'POST':'GET',credentials:'same-origin',signal:AbortSignal.timeout(25000)});const data=await res.json();
  if(!res.ok)throw Error(data.error||'無法確認研究服務。');serviceConfig=data.configured?{url:location.origin+'/api/'}:null;
  $('#research-service-state').textContent=data.connected?'已連接 · '+data.model+'；搜尋與額度待首次分析確認。':data.configured?'已設定 · '+data.model+'（尚未檢查連線）':'尚未設定 OPENAI_API_KEY；名單與筆記同步正常。';
  if(researchId)renderLiveReport(stocks.find(x=>x.id===researchId));
 }catch(e){serviceConfig=null;$('#research-service-error').textContent=e.message||'連線檢查失敗。'}finally{button.disabled=false}
}
$('#research-check').onclick=()=>refreshResearchService(true);

function saveCompletedResearch(document, id){
 const current=stocks.find(s=>s.id===id);if(!current)throw Error('這檔股票已不在名單中，未套用研究。');
 const next=StockfolioReports.apply(document,current);
 if(current.analysis&&JSON.stringify(current.analysis)===JSON.stringify(next.analysis)){toast('目前已是這份研究。');return}
 if(current.analysis&&!confirm(`更新 ${current.symbol} 的研究報告？你的研究筆記會保留。`))return;
 if(!persist(stocks.map(s=>s.id===id?next:s)))return;
 researchErrors.delete(id);
 if(researchId===id){$('#research-company').textContent=next.symbol+' · '+next.name;$('#research-status').textContent=next.market+' · 已有研究結果';renderLiveReport(next)}
 toast(cloudClient?'研究已載入，正在同步至雲端':'研究已載入此裝置');
}
async function loadCompletedResearch(id){
 const stock=stocks.find(s=>s.id===id);if(!stock||pendingResearch.has(id))return;
 pendingResearch.add(id);completedLoads.add(id);render();if(researchId===id)renderLiveReport(stock);$('#research-load').textContent='載入中…';
 try{
  async function read(path){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});if(r.status===401)throw Error('登入已過期，請重新登入。');if(!r.ok)throw Error('目前無法載入研究，請稍後再試。');const body=await r.text();if(body.length>500000)throw Error('研究檔案過大。');return JSON.parse(body)}
  const catalog=await read('reports/index.json');
  if(catalog.schemaVersion!==1||!Array.isArray(catalog.reports))throw Error('研究目錄格式不正確。');
  const entry=catalog.reports.find(r=>r.market===stock.market&&r.symbol===stock.symbol);
  if(!entry)throw Error(stock.symbol+' 尚未有已完成研究。可在 Omni 提出研究需求，完成後再載入。');
  if(typeof entry.file!=='string'||!/^reports\/[A-Za-z0-9_-]+\.json$/.test(entry.file))throw Error('研究檔案路徑不正確。');
  saveCompletedResearch(await read(entry.file),id);
 }catch(e){toast(e.message||'研究載入失敗。')}finally{pendingResearch.delete(id);completedLoads.delete(id);render();$('#research-load').textContent='載入已完成研究';if(researchId)renderLiveReport(stocks.find(s=>s.id===researchId))}
}
$('#research-load').onclick=()=>loadCompletedResearch(researchId);
$('#research-import').onclick=()=>$('#research-file').click();
$('#research-file').onchange=async e=>{
 const id=researchId;try{const file=e.target.files[0];if(!file)return;if(file.size>500000)throw Error('研究檔案過大。');saveCompletedResearch(JSON.parse(await file.text()),id)}catch(error){toast('匯入失敗：'+error.message)}finally{e.target.value=''}
};

$('#macro-content').addEventListener('stockfolio:open-stock',e=>{if(!stocks.some(s=>s.id===e.detail)||!canLeaveResearch())return;setView('academy',true);$('#research-stock').value=e.detail;openResearch(e.detail)});

function deleteStock(id){
 const stock=stocks.find(s=>s.id===id);if(!stock)return;
 const dirty=researchId===id&&researchDirty;
 if(!confirm(`刪除 ${stock.symbol} 及其研究筆記？${dirty?'未儲存的草稿也會移除。':''}此變更會同步到其他裝置。`))return;
 if(!persist(stocks.filter(s=>s.id!==id)))return;
 if(editId===id&&$('#editor').open)$('#editor').close();
 if(researchId===id){researchDirty=false;researchId=null;$('#research-stock').value='';openResearch(null)}
 toast(stock.symbol+' 已刪除');
}
function mergeDuplicateStock(id){
 const stock=stocks.find(s=>s.id===id);if(!stock)return;
 const group=StockfolioWatchlist.duplicates(stocks,stock);
 if(group.some(s=>pendingResearch.has(s.id))){toast('請等研究載入完成後再合併。');return}
 if(researchDirty&&group.some(s=>s.id===researchId)){toast('請先儲存研究草稿，再合併重複項目。');return}
 try{
  const result=StockfolioWatchlist.mergeDuplicates(stocks,stock);
  if(!confirm(`將 ${group.map(s=>s.symbol).join('、')} 合併為 ${result.stock.symbol}？兩筆筆記會保留，合併前資料可從「展開資料」匯出備份。`))return;
  if(!persist(result.stocks))return;
  if(group.some(s=>s.id===researchId)){researchId=result.stock.id;$('#research-stock').value=researchId;openResearch(researchId)}
  toast('已合併為 '+result.stock.symbol+'，筆記與合併前備份已保留');
 }catch(error){toast(error.message)}
}
function exportDuplicateArchive(id){
 const stock=stocks.find(s=>s.id===id);if(!stock?.duplicateArchive)return;
 const restore=stocks.filter(s=>s.id!==id).concat(stock.duplicateArchive);
 download(`stockfolio-before-merge-${stock.symbol}-${day()}.json`,JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),stocks:restore},null,2),'application/json');
}

function publicDetailsOpen(){return [...document.querySelectorAll('[data-expand][aria-expanded="true"]')].map(b=>b.dataset.expand)}
function renderPublicData(open=[]){render();for(const id of open){const button=document.querySelector('[data-expand="'+id+'"]');if(button)toggleStockDetails(button)}}
async function refreshPublicData(){
 if(!cloudClient)return;
 try{const r=await fetch('/api/public-data/stocks',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)return;const body=await r.json();if(!Array.isArray(body.stocks))return;const open=publicDetailsOpen();publicData.clear();for(const row of body.stocks)if(typeof row.key==='string')publicData.set(row.key,row);renderPublicData(open)}catch{}
}
async function refreshStockPublicData(id){
 const stock=stocks.find(s=>s.id===id);if(!stock||pendingPublic.has(id))return;
 if(!cloudClient){toast('請登入雲端網站，才能更新公開資料。');return}
 const open=publicDetailsOpen();pendingPublic.add(id);renderPublicData(open);
 try{const r=await fetch('/api/public-data/refresh',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'stock',market:stock.market,symbol:stock.symbol}),signal:AbortSignal.timeout(75000)});const result=await r.json();if(!r.ok)throw Error(result.error||'公開資料更新失敗');await refreshPublicData();toast(result.state==='running'?'已有資料更新中，稍後重新載入即可':result.state==='error'?'來源暫時無法更新，已保留原資料':result.state==='partial'?'已取得部分公開資料；可展開查看來源狀態':result.cached?'已顯示近期檢查結果；每 15 分鐘可重新檢查':'公開資料已更新')}catch(error){toast(error.name==='TimeoutError'?'來源連線逾時，請稍後重試。':error.message)}finally{pendingPublic.delete(id);renderPublicData(open)}
}
