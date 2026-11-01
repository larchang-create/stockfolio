'use strict';
(() => {
 const clone=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),key=s=>s.market+':'+s.symbol;
 const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
 function merge(base,local,remote,choice){
  const conflicts=[];
  function field(b,l,r,path){
   if(same(l,r))return clone(l);
   if(same(l,b))return clone(r);
   if(same(r,b))return clone(l);
   if(path.endsWith('.id'))return r??l;
   if(path.endsWith('.updatedAt')&&typeof l==='string'&&typeof r==='string')return l>r?l:r;
   if(plain(l)&&plain(r)&&(plain(b)||b===undefined)){
    const out={};for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
     const v=field(b?.[k],l[k],r[k],path+'.'+k);if(v!==undefined)out[k]=v;
    }return out;
   }
   // The six research questions retain their identity by position.
   if(path.endsWith('.sections')&&Array.isArray(l)&&Array.isArray(r)&&l.length===6&&r.length===6)return l.map((x,i)=>field(b?.[i],x,r[i],path+'.'+i));
   conflicts.push({path,local:l,remote:r});return clone(choice==='remote'?r:l);
  }
  const maps=[base,local,remote].map(list=>new Map(list.map(s=>[key(s),s]))),out=[];
  for(const k of new Set(maps.flatMap(m=>[...m.keys()]))){const s=field(...maps.map(m=>m.get(k)),k);if(s!==undefined)out.push(s)}
  out.sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);return {stocks:out,conflicts};
 }
 class Client {
  constructor({request,onData,onStatus,isEditing=()=>false,save=()=>{},cached=null}){
   Object.assign(this,{request,onData,onStatus,isEditing,save});this.base=cached?.base||[];this.current=cached?.current||[];this.revision=cached?.revision??null;this.busy=false;this.conflict=null;this.dirty=!same(this.base,this.current);this.stopped=false;
  }
  cache(){this.save({base:this.base,current:this.current,revision:this.revision})}
  commit(next){const previous=this.current;this.current=clone(next);try{this.cache()}catch(e){this.current=previous;throw e}this.dirty=!same(this.base,this.current);this.onStatus('pending');this.schedule()}
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),250)}
  async json(method,body){const r=await this.request('/api/state',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json()}catch{throw Error('登入可能已過期，請重新整理網站登入。')}if(!r.ok&&r.status!==409)throw Error(data.error||'同步失敗');if(r.status===409)return {...data,conflict:true};return data}
  async sync(){
   if(this.busy||this.stopped||this.conflict)return;
   if(this.isEditing()){this.onStatus('editing');return}
   this.busy=true;this.onStatus('syncing');
   try{
    const remote=await this.json('GET');
    // A form may have opened while the network request was in flight.
    if(this.isEditing()){this.onStatus('editing');return}
    const merged=merge(this.base,this.current,remote.stocks);
    if(merged.conflicts.length){this.conflict=remote;this.onStatus('conflict',merged.conflicts);return}
    this.base=clone(remote.stocks);this.revision=remote.revision;this.current=merged.stocks;this.dirty=!same(this.current,this.base);this.cache();this.onData(clone(this.current));
    if(this.dirty){
     const sent=clone(this.current),result=await this.json('PUT',{revision:this.revision,stocks:sent});
     if(result.conflict){this.onStatus('pending');this.schedule();return}
     this.base=sent;this.revision=result.revision;this.dirty=!same(this.current,sent);this.cache();
    }
    this.onStatus(this.dirty?'pending':'synced');if(this.dirty)this.schedule();
   }catch(e){this.onStatus('offline',e.message)}finally{this.busy=false}
  }
  resolve(choice){if(!this.conflict)return;const remote=this.conflict,result=merge(this.base,this.current,remote.stocks,choice);const before={base:this.base,current:this.current,revision:this.revision};this.base=clone(remote.stocks);this.current=result.stocks;this.revision=remote.revision;try{this.cache()}catch(e){Object.assign(this,before);throw e}this.conflict=null;this.dirty=!same(this.current,this.base);this.onData(clone(this.current));this.onStatus('pending');this.schedule()}
  stop(){this.stopped=true;clearTimeout(this.timer)}
 }
 globalThis.StockfolioSync={merge,Client};
})();
