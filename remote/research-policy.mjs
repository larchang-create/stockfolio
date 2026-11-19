export const MAX_RESEARCH_AGE_MS=7*86400000;
export const EVENT_CHECK_INTERVAL_MS=86400000;
export function researchExpired(report,now=Date.now()){
 const at=Date.parse(report?.generatedAt);return !Number.isFinite(at)||at>now+30000||now-at>=MAX_RESEARCH_AGE_MS;
}
export function researchReason(stock,cached,fingerprint,eventDigest,now=Date.now()){
 if(!stock.analysis)return 'missing';
 if(!cached||cached.fingerprint!==fingerprint)return 'inputs_changed';
 if(eventDigest&&eventDigest!==cached.eventDigest)return 'material_event';
 if(researchExpired(cached.report,now)||researchExpired(stock.analysis,now))return 'weekly_review';
 return null;
}
export function prioritizeResearch(a,b){
 return Number(!!a.stock.analysis)-Number(!!b.stock.analysis)||Date.parse(a.stock.analysis?.generatedAt||0)-Date.parse(b.stock.analysis?.generatedAt||0)||a.stock.symbol.localeCompare(b.stock.symbol);
}
