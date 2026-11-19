import test from 'node:test';import assert from 'node:assert/strict';
import {researchExpired,researchReason,prioritizeResearch} from '../remote/research-policy.mjs';
import {validateEventReview} from '../remote/event-review.mjs';
const now=Date.parse('2026-11-19T12:00:00Z'),fresh={generatedAt:'2026-11-19T00:00:00Z'},old={generatedAt:'2026-11-09T00:00:00Z'};
test('unchanged inputs expire after seven days including ETF reports; timestamps cannot renew an old report',()=>{
 assert.equal(researchExpired(fresh,now),false);assert.equal(researchExpired(old,now),true);
 assert.equal(researchReason({analysis:old},{fingerprint:'same',report:old},'same',null,now),'weekly_review');
 assert.equal(researchReason({analysis:fresh},{fingerprint:'same',report:fresh},'same',null,now),null);
 assert.equal(researchExpired({generatedAt:'bad'},now),true);
});
test('new material events and notes trigger research; consumed events do not repeat',()=>{
 const stock={analysis:fresh},cached={fingerprint:'same',report:fresh,eventDigest:'old'};
 assert.equal(researchReason(stock,cached,'same','new',now),'material_event');
 assert.equal(researchReason(stock,cached,'changed','old',now),'inputs_changed');
 assert.equal(researchReason(stock,cached,'same','old',now),null);
 assert.equal(researchReason({},cached,'same','old',now),'missing');
});
test('missing and oldest research are processed before recently researched stocks',()=>{
 const list=[{stock:{symbol:'A',analysis:fresh}},{stock:{symbol:'B',analysis:old}},{stock:{symbol:'C'}}];
 assert.deepEqual(list.sort(prioritizeResearch).map(x=>x.stock.symbol),['C','B','A']);
});
test('event review requires every requested stock, primary-source URLs and recent valid dates',()=>{
 const stocks=[{market:'美股',symbol:'NVDA'},{market:'台股',symbol:'0050'}],raw={stocks:[{...stocks[0],events:[{date:'2026-11-18',title:'公告',url:'https://investor.nvidia.com/news?utm_source=test',impact:'管理交接需核對'}]},{...stocks[1],events:[]}]};
 assert.equal(validateEventReview(raw,stocks,new Date(now))[0].events[0].url,'https://investor.nvidia.com/news');
 assert.throws(()=>validateEventReview({stocks:[raw.stocks[0]]},stocks,new Date(now)),/涵蓋/);
 for(const change of [{date:'2026-11-20'},{date:'2026-10-01'},{url:'http://example.com'}]){const copy=structuredClone(raw);Object.assign(copy.stocks[0].events[0],change);assert.throws(()=>validateEventReview(copy,stocks,new Date(now)))}
});
