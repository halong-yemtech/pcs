(function(){
const TYPES=[
  {code:'GA',label:'GA drawing',hint:'General arrangement drawing'},
  {code:'MFR',label:"Manufacturer's drawing",hint:'OEM / supplier drawing'},
  {code:'IIOM',label:'IIOM manual',hint:'Installation, inspection, operation & maintenance'},
  {code:'OTH',label:'Other documents',hint:'Datasheets, certificates, test reports'}];
const TYPE=Object.fromEntries(TYPES.map(t=>[t.code,t]));
const MIME={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml'};
const DEF_ROLES=['Tensioner','Pole','Arm','Cushion','Tip / Blade','Frame','Accessories'];
const ITEM_DEF={cost:0,labour:0,supplier:'',notes:'',unit:'ea',makeBuy:'',role:'',material:'',orderNo:'',weight:'',components:[],productIds:[],attrs:{},kind:''};
const LIST_MAX=300;
const LEVELS=['Product','Part','Component','Item'];
const lvRank=l=>{const i=LEVELS.indexOf(l);return i<0?-1:i};
function defaultLevel(p){
  if(p.kind!=='spare'&&p.kind!=='variant')return '';
  const t=(p.description+' '+(p.orderNo||'')).toLowerCase();
  if(p.kind==='variant'){const bd=String(p.description).split(' · ')[0].toLowerCase();return /replacement|tensioner|\bpole\b|side assembl|spare/.test(bd)?'Part':'Product'}
  if(/\bbolt|\bpin\b|\bnut\b|washer|screw|rivet|fastener|\bclip|toggle|split pin|grub/.test(t))return 'Item';
  if(/tensioner|\bpole|suspension arm|polyarm|side assembl|\bside\b|adjuster arm|blade|scraper|mandrel|segment|frame/.test(t))return 'Part';
  return 'Component';
}
const tmpTag=p=>p.tempCode?' <span class="tag tmp" title="Temporary item code: replace it with the real one in Edit details">Temp code</span>':'';
const lvTag=p=>p.level?`<span class="tag lv lv-${esc(p.level)}">${esc(p.level)}</span>`:'<span class="tag" title="No level set">—</span>';
const nextLevel=l=>LEVELS[lvRank(l)+1]||'';

const S={parts:new Map(),products:new Map(),catalog:{items:{},products:{}},over:{parts:new Map(),products:new Map()},docs:[],
  selected:null,product:null,view:'tasks',ttab:'mine',tab:'structure',ptab:'matrix',q:'',pq:'',filter:'all',mat:'all',collapsed:new Set(),
  db:null,assets:null,downloads:null,user:null,canWrite:null,me:null,loaded:{parts:false,docs:false,pricing:false,stock:false,catalog:false,products:false},
  uploading:null,armed:null,pending:false,regType:'all',regQ:'',build:1,usedBy:new Map(),busy:false,dsel:null,dq:'',dlv:'all',dcat:'all',dmiss:'all',expenses:[],emonth:'',eall:false,ecat:'all',eq:'',suppliers:[],pos:[],ptab2:'open',pq2:'',deals:[],customers:[],stab:'pipeline',slq:'',showLost:false,hfy:'all',rfqs:[],priceLog:[],emails:[],emailCfg:null,meEmail:'',meName:'',alertSettings:null,alertStates:[],users:[],orders:[],otab:'open',oq:'',sel:null,price:new Map(),stock:new Map(),moves:[],sq:'',sf:'all',slv:'all'};

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0};
const money=v=>'$'+num(v).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
const qfmt=v=>{const n=num(v);return Number.isInteger(n)?n.toLocaleString('en-AU'):n.toLocaleString('en-AU',{maximumFractionDigits:3})};
const kg=v=>num(v).toLocaleString('en-AU',{maximumFractionDigits:2})+' kg';
const when=iso=>{try{return new Date(iso).toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(e){return iso}};
const stamp=iso=>{const d=new Date(iso),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`};
const size=b=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
const revLabel=i=>{let s='',n=i+1;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
const kids=p=>(p&&Array.isArray(p.components))?p.components:[];
const isAsm=p=>kids(p).some(c=>num(c.qty)>0);
const shortMat=m=>String(m||'').replace('Mild Steel','MS').replace('Stainless Steel','SS');
const baseDesc=p=>String(p?.description||'').split(' · ')[0];
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000)}

/* ---------- data merge: catalogue chunks + edited overrides ---------- */
function rebuild(){
  const parts=new Map();
  for(const [id,it] of Object.entries(S.catalog.items))parts.set(id,{...ITEM_DEF,...it,catalog:true});
  for(const [id,o] of S.over.parts){if(o.deleted)parts.delete(id);else parts.set(id,{...ITEM_DEF,...(S.catalog.items[id]||{}),...o,catalog:!!S.catalog.items[id]})}
  for(const p of parts.values())if(!p.level)p.level=defaultLevel(p);
  S.parts=parts;
  const prods=new Map();
  for(const [id,p] of Object.entries(S.catalog.products))prods.set(id,{roles:DEF_ROLES.slice(),...p});
  for(const [id,o] of S.over.products){if(o.deleted)prods.delete(id);else prods.set(id,{roles:DEF_ROLES.slice(),...(S.catalog.products[id]||{}),...o})}
  S.products=prods;
  for(const pr of prods.values())if(pr.moduleWidth==null)pr.moduleWidth=defaultModule(pr);
  const ub=new Map();for(const [id,p] of parts)for(const c of kids(p)){if(!ub.has(c.partId))ub.set(c.partId,new Set());ub.get(c.partId).add(id)}
  S.usedBy=ub;costMemo=new Map();
}

/* ---------- BOM maths ---------- */
let costMemo=new Map();
const NSHARD=16;
const shardOf=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return String(h%NSHARD).padStart(2,'0')};
const buyOf=id=>{const x=S.price.get(id);return x&&x.buy!=null&&x.buy!==''?num(x.buy):num(S.parts.get(id)?.cost)};
const sellOf=id=>num(S.price.get(id)?.sell);
const stk=id=>S.stock.get(id)||{};
const onHand=id=>num(stk(id).onHand);
const stockStatus=id=>{const s=stk(id);if(s.onHand==null&&!s.min)return '';const oh=num(s.onHand),mn=num(s.min);if(oh<=0)return 'out';if(mn&&oh<mn)return 'low';return 'ok'};
const stTag=id=>{const st=stockStatus(id);return st==='out'?'<span class="tag st-out">Out</span>':st==='low'?'<span class="tag st-low">Low</span>':st==='ok'?'<span class="tag st-ok">OK</span>':'<span class="muted">—</span>'};
const marginPct=(id)=>{const sp=sellOf(id),c=unitCost(id);return sp?((sp-c)/sp*100):null};
const mfmt=m=>m==null?'—':`<span class="${m<0?'neg':''}">${m.toFixed(1)}%</span>`;
function bomCost(id,stack=new Set()){const p=S.parts.get(id);if(!p||!isAsm(p))return 0;let t=num(p.labour);stack.add(id);for(const l of lines(p))if(!stack.has(l.partId))t+=l.qty*unitCost(l.partId,stack);stack.delete(id);return t}
function canBuild(id){const ls=lines(S.parts.get(id));if(!ls.length)return null;return Math.max(0,Math.min(...ls.map(l=>Math.floor(onHand(l.partId)/l.qty))))}
const lines=p=>kids(p).map((c,i)=>({i,partId:c.partId,qty:num(c.qty),role:c.role||'',perModule:num(c.perModule)||0})).filter(l=>l.partId&&l.qty>0);
function unitCost(id,stack=new Set()){
  if(costMemo.has(id))return costMemo.get(id);
  const p=S.parts.get(id);if(!p)return 0;
  const bp=buyOf(id);
  if(bp>0||!isAsm(p)){costMemo.set(id,bp);return bp}
  if(stack.has(id))return 0;
  stack.add(id);let t=num(p.labour);for(const l of lines(p))t+=l.qty*unitCost(l.partId,stack);
  stack.delete(id);costMemo.set(id,t);return t;
}
function explode(id,{honourCollapse=false}={},mult=1,level=0,path='',out=[],stack=new Set([id])){
  for(const l of lines(S.parts.get(id))){
    const cp=S.parts.get(l.partId);const key=path+'/'+l.i;const total=mult*l.qty;const cycle=stack.has(l.partId);const hasKids=!cycle&&isAsm(cp);
    const pp=S.parts.get(id);const lvBad=!!(cp&&pp&&cp.level&&pp.level&&lvRank(cp.level)<=lvRank(pp.level));
    out.push({level:level+1,id:l.partId,part:cp,qty:l.qty,role:l.role,total,key,index:l.i,hasKids,cycle,lvBad});
    if(hasKids&&!(honourCollapse&&S.collapsed.has(key))){stack.add(l.partId);explode(l.partId,{honourCollapse},total,level+1,key,out,stack);stack.delete(l.partId)}
  }
  return out;
}
function leaves(id,mult=1,acc=new Map(),stack=new Set([id])){
  for(const l of lines(S.parts.get(id))){
    const cp=S.parts.get(l.partId);const t=mult*l.qty;
    if(cp&&isAsm(cp)&&!stack.has(l.partId)){stack.add(l.partId);leaves(l.partId,t,acc,stack);stack.delete(l.partId)}
    else acc.set(l.partId,(acc.get(l.partId)||0)+t);
  }
  return acc;
}
const leafList=id=>[...leaves(id).entries()].map(([pid,q])=>({pid,q,p:S.parts.get(pid)})).sort((a,b)=>String(a.p?.partNo).localeCompare(String(b.p?.partNo),undefined,{numeric:true}));
function contains(root,target,seen=new Set()){
  if(root===target)return true;if(seen.has(root))return false;seen.add(root);
  return kids(S.parts.get(root)).some(c=>contains(c.partId,target,seen));
}
const whereUsed=id=>[...(S.usedBy.get(id)||[])].map(pid=>({id:pid,p:S.parts.get(pid)})).filter(x=>x.p);
function totals(id){
  const p=S.parts.get(id);const lv=leafList(id);
  const matl=lv.reduce((a,x)=>a+x.q*buyOf(x.pid),0);
  const lab=num(p.labour)+explode(id).filter(r=>r.hasKids).reduce((a,r)=>a+r.total*num(r.part?.labour),0);
  const wt=lv.reduce((a,x)=>a+x.q*num(x.p?.weight),0);
  return {lv,matl,lab,wt,total:unitCost(id)};
}
const docsFor=(id,code)=>S.docs.filter(d=>d.partId===id&&(!code||d.type===code)).sort((a,b)=>b.revIndex-a.revIndex||(b.uploadedAt>a.uploadedAt?1:-1));
const isCurrent=d=>docsFor(d.partId,d.type)[0]?._id===d._id;
const byCode=(a,b)=>String(a[1].partNo).localeCompare(String(b[1].partNo),undefined,{numeric:true});
const sortedParts=()=>[...S.parts.entries()].sort(byCode);
const pn=id=>S.parts.get(id)?.partNo||id;

/* ---------- product types ---------- */
const prodVariants=pr=>(pr.variantIds||[]).map(id=>[id,S.parts.get(id)]).filter(x=>x[1]);
const prodSpares=pr=>(pr.spareIds||[]).map(id=>[id,S.parts.get(id)]).filter(x=>x[1]);
const prodMats=pr=>[...new Set(prodVariants(pr).map(([,p])=>p.material||''))];
const ARMS=['SS','S','M','L','LL'];const armRank=p=>{const a=p.attrs&&p.attrs['Arm Size'];const i=ARMS.indexOf(a);return i<0?9:i};
const vSort=(a,b)=>num(a[1].width)-num(b[1].width)||String(a[1].material).localeCompare(String(b[1].material))||armRank(a[1])-armRank(b[1])||String(a[1].partNo).localeCompare(String(b[1].partNo),undefined,{numeric:true});
const prodWidth=p=>num(p?.productWidth)||num(p?.attrs?.['Tip Width (mm)'])||null;
const MOD_ROLES=['Tip / Blade','Arm','Cushion'];
const NO_MODULE_CATS=['Ploughs'];
const NON_MODULAR=/^(U|A) Belt Cleaner\b|alledge/i;
const modApplies=pr=>!!pr&&!NO_MODULE_CATS.includes(pr.category)&&!NON_MODULAR.test(pr.name||'');
const modBarFor=pr=>modApplies(pr)&&(/belt cleaner/i.test(pr.category)||num(pr.moduleWidth)>0);
const modulesOf=(pr,p)=>{if(!modApplies(pr))return null;const mw=num(pr?.moduleWidth),w=prodWidth(p);return mw&&w?w/mw:null};
const modOk=m=>m!=null&&Math.abs(m-Math.round(m))<1e-6;
function defaultModule(pr){
  const ws=(pr.variantIds||[]).map(id=>prodWidth(S.parts.get(id))).filter(Boolean);
  if(!ws.length)return 0;
  const fits=mw=>ws.every(w=>w%mw===0);
  if(!modApplies(pr))return 0;
  if(pr.category==='Primary Belt Cleaners'){if(/alledge/i.test(pr.name))return 0;return fits(200)?200:fits(150)?150:0}
  if(pr.category==='Secondary Belt Cleaners')return fits(150)?150:0;
  return 0;
}
const vLabel=p=>[p.width?p.width+' mm belt':'',prodWidth(p)&&prodWidth(p)!==num(p.width)?prodWidth(p)+' mm product':'',p.attrs&&p.attrs['Arm Size']?'Arm '+p.attrs['Arm Size']:'',shortMat(p.material)].filter(Boolean).join(' · ');
const filled=pr=>{const v=prodVariants(pr);return {n:v.length,done:v.filter(([,p])=>isAsm(p)).length}};

function score(item,variant,role){
  let s=0;
  if(item.role===role)s+=5;
  if(item.width!=null&&item.width!==''&&variant.width!=null){s+=num(item.width)===num(variant.width)?4:-3}
  if(item.material&&variant.material)s+=item.material===variant.material?2:-2;
  const pd=String(variant.attrs?.['Pole Dia (mm)']||'').replace(/\D/g,'');
  if(pd&&(String(item.attrs?.['Pole Dia (mm)']||'').replace(/\D/g,'')===pd||new RegExp(pd+'(\\b|-|$)').test(item.orderNo||'')))s+=2;
  const arm=variant.attrs?.['Arm Size'];
  if(arm&&item.role==='Arm'&&new RegExp('A'+arm+'$').test(String(item.orderNo||'').replace(/-304$/,'')))s+=3;
  return s;
}
const armMatch=(item,target)=>{const arm=target.attrs?.['Arm Size'];return !!arm&&new RegExp('A'+arm+'$').test(String(item.orderNo||'').replace(/-304$/,''))};
function equivalent(partId,target,pool){
  const p=S.parts.get(partId);if(!p)return partId;
  const needA=p.role==='Arm'&&!!target.attrs?.['Arm Size']&&!armMatch(p,target);
  const needW=p.width!=null&&p.width!==''&&target.width!=null&&num(p.width)!==num(target.width);
  const needM=p.material&&target.material&&p.material!==target.material;
  if(!needW&&!needM&&!needA)return partId;
  const bd=baseDesc(p);let best=null,bs=-99;
  for(const [id,c] of pool){
    if(baseDesc(c)!==bd||(c.role||'')!==(p.role||''))continue;
    let s=0;
    if(p.width!=null&&p.width!==''){if(num(c.width)!==num(target.width))continue;s+=2}
    if(target.material&&c.material)s+=c.material===target.material?1:-1;
    if(needA||p.role==='Arm')s+=armMatch(c,target)?3:0;
    if(s>bs){bs=s;best=id}
  }
  return best||partId;
}

/* ---------- rendering ---------- */
function typing(){const a=document.activeElement;return a&&$('#main').contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.type!=='file'}
function schedule(){rebuild();_attn=null;updateBell();if(typing()||document.querySelector('.modal')||S.busy){S.pending=true;return}render()}
document.addEventListener('focusout',()=>setTimeout(()=>{if(S.pending&&!typing()&&!document.querySelector('.modal')&&!S.busy){S.pending=false;render()}},50));
function render(){costMemo=new Map();_oo=null;_attn=null;renderSide();renderMain();fillNames();updateBell()}
const allLoaded=()=>S.loaded.parts&&S.loaded.catalog&&S.loaded.products;

function renderSide(){
  const pv=S.view==='products';
  const full=S.view==='tasks'||S.view==='register'||S.view==='stock'||S.view==='orders'||S.view==='sales'||S.view==='purchasing'||S.view==='expenses';
  $('#side').hidden=full;
  $('#wrap').style.gridTemplateColumns=full?'minmax(0,1fr)':'';
  $('#filters').hidden=pv;
  const qi=$('#q');qi.placeholder=pv?'Search product types':'Search item code, ordering no. or description';
  if(qi.value!==(pv?S.pq:S.q))qi.value=pv?S.pq:S.q;
  const list=$('#plist');
  if(!allLoaded()){list.innerHTML='<div class="empty">Loading…</div>';return}
  if(pv){
    const q=S.pq.toLowerCase();
    const prods=[...S.products.entries()].filter(([,p])=>!q||(p.name+' '+p.category).toLowerCase().includes(q));
    if(!S.products.size){list.innerHTML='<div class="empty"><strong>No product types</strong>Load your product database to create them.</div>';return}
    const cats=[...new Set(prods.map(([,p])=>p.category))];
    const tools=canW()?`<div class="sidetools"><button class="btn small primary" id="pt-new">+ New product type</button><button class="btn small" id="pt-imp">Import items</button><button class="btn small" id="pt-tpl">Template</button></div>`:'';
    list.innerHTML=tools+cats.map(c=>`<div class="grp">${esc(c)}</div>`+prods.filter(([,p])=>p.category===c).map(([id,p])=>{const f=filled(p);return `<button class="pitem" data-prod="${esc(id)}" aria-current="${id===S.product}">
      <span class="pn" style="font-family:var(--f-body);font-weight:600">${esc(p.name)}</span><span class="tag ${f.done?(f.done===f.n?'cur':'rev'):''}" title="Variants with components allocated">${f.done}/${f.n}</span>
      <span class="pd">${f.n} variants · ${(p.spareIds||[]).length} spare parts${p.custom?' · added in register':''}</span></button>`}).join('')).join('')||'<div class="empty">No product types match.</div>';
    const pn2=$('#pt-new');if(pn2)pn2.onclick=()=>productTypeModal(null);
    const pi2=$('#pt-imp');if(pi2)pi2.onclick=()=>pickImportFile(null);
    const pt2=$('#pt-tpl');if(pt2)pt2.onclick=()=>importTemplate(null);
    return;
  }
  const q=S.q.toLowerCase();
  const rows=sortedParts().filter(([,p])=>{
    if(q&&!(String(p.partNo).toLowerCase().includes(q)||String(p.orderNo).toLowerCase().includes(q)||String(p.description).toLowerCase().includes(q)))return false;
    if(S.filter==='bom')return isAsm(p);
    if(S.filter==='none')return !p.level;
    if(S.filter!=='all')return p.level===S.filter;
    return true;
  });
  const itools=canW()?`<div class="sidetools"><button class="btn small" id="it-imp">Import items from Excel</button><button class="btn small" id="it-tpl">Template</button></div>`:'';
  if(!S.parts.size){list.innerHTML='<div class="empty"><strong>No items yet</strong>Use “+ New item” to add one.</div>';return}
  if(!rows.length){list.innerHTML='<div class="empty">No items match.</div>';return}
  list.innerHTML=itools+rows.slice(0,LIST_MAX).map(([id,p])=>`<button class="pitem" data-id="${esc(id)}" aria-current="${id===S.selected}">
    <span class="pn">${esc(p.partNo)} <span class="muted">${esc(p.orderNo||'')}</span>${p.tempCode?' <span class="tag tmp">Temp</span>':''}</span>
    <span class="row" style="gap:4px;flex-wrap:nowrap">${lvTag(p)}${isAsm(p)?'<span class="tag asm" title="Has its own BOM">BOM</span>':''}</span>
    <span class="pd">${esc(p.description)}</span></button>`).join('')+(rows.length>LIST_MAX?`<div class="empty">Showing ${LIST_MAX} of ${rows.length.toLocaleString()} items. Search to narrow the list.</div>`:'');
  const ii=$('#it-imp');if(ii)ii.onclick=()=>pickImportFile(null);const itp=$('#it-tpl');if(itp)itp.onclick=()=>importTemplate(null);
}

function renderMain(){
  const m=$('#main');
  if(S.view==='register'){m.innerHTML=registerHTML();bindRegister();return}
  if(S.view==='tasks'){if(!allLoaded()){m.innerHTML='<div class="panel empty">Loading…</div>';return}m.innerHTML=tasksHTML();bindTasks();return}
  if(S.view==='expenses'){if(!allLoaded()){m.innerHTML='<div class="panel empty">Loading…</div>';return}m.innerHTML=expensesHTML();bindExpenses();return}
  if(S.view==='purchasing'){if(!allLoaded()){m.innerHTML='<div class="panel empty">Loading…</div>';return}m.innerHTML=purchHTML();bindPurch();return}
  if(S.view==='sales'){if(!allLoaded()){m.innerHTML='<div class="panel empty">Loading…</div>';return}m.innerHTML=salesHTML();bindSales();return}
  if(S.view==='orders'){if(!allLoaded()){m.innerHTML='<div class="panel empty">Loading…</div>';return}m.innerHTML=ordersHTML();bindOrders();return}
  if(S.view==='stock'){if(!allLoaded()){m.innerHTML='<div class="panel empty">Loading…</div>';return}m.innerHTML=stockViewHTML();bindStockView();return}
  if(!allLoaded()){m.innerHTML='<div class="panel empty">Loading the product database…</div>';return}
  if(S.view==='products'){m.innerHTML=productHTML();bindProduct();return}
  const p=S.parts.get(S.selected);
  if(!p){m.innerHTML=`<div class="panel empty"><strong>Pick an item</strong>Choose an item from the list, or open a product type and click a variant.</div>`;return}
  const id=S.selected;const asm=isAsm(p);const uc=unitCost(id);const used=whereUsed(id);
  const prods=(p.productIds||[]).map(x=>[x,S.products.get(x)]).filter(x=>x[1]);
  const attrs=Object.entries(p.attrs||{}).filter(([k])=>!/weigh/i.test(k));
  m.innerHTML=`<section class="panel">
    <div class="head">
      <div class="head-top">
        <div style="flex:1;min-width:0">
          <div class="pnum">Item code <strong class="mono" style="color:var(--ink)">${esc(p.partNo)}</strong>${tmpTag(p)}${p.orderNo?` · Ordering no. <span class="mono">${esc(p.orderNo)}</span>`:''}${p.role?` · role ${esc(p.role)}`:''}</div>
          <h1>${esc(p.description)}</h1>
        </div>
        <div class="row">${canW()?`<button class="btn" id="edit">Edit details</button>`:''}${S.downloads?`<button class="btn" id="exp">Export Excel</button>`:''}</div>
      </div>
      <dl class="kv">
        <div><dt>Level</dt><dd>${canW()?`<select class="f" id="lvl-sel" style="width:auto" aria-label="Level">${['',...LEVELS].map(l=>`<option value="${l}" ${l===(p.level||'')?'selected':''}>${l||'Not set'}</option>`).join('')}</select>`:lvTag(p)}</dd></div>
        <div><dt>Buy price</dt><dd class="big">${buyOf(id)?money(buyOf(id)):'<span class="muted">Not set</span>'}</dd>${asm?`<dd class="note">BOM cost ${money(bomCost(id))}</dd>`:''}</div>
        <div><dt>Sell price</dt><dd class="big">${sellOf(id)?money(sellOf(id)):'<span class="muted">Not set</span>'}</dd><dd class="note">Margin ${mfmt(marginPct(id))}</dd></div>
        <div><dt>On hand</dt><dd class="big">${stk(id).onHand!=null?qfmt(onHand(id)):'<span class="muted">—</span>'} ${stTag(id)}</dd>${stk(id).min?`<dd class="note">Min ${qfmt(stk(id).min)}</dd>`:''}</div>
        ${p.width?`<div><dt>Belt width</dt><dd>${esc(p.width)} mm</dd></div>`:''}
        ${p.material?`<div><dt>Material / version</dt><dd>${esc(p.material)}</dd></div>`:''}
        ${attrs.map(([k,v])=>`<div><dt>${esc(/tip width/i.test(k)?'Product (tip) width':k.replace(/\s*\(.*?\)/,''))}</dt><dd>${esc(v)}${/\(mm\)/.test(k)&&/^[\d.]+$/.test(v)?' mm':''}</dd></div>`).join('')}
        ${p.weight?`<div><dt>Catalogue weight</dt><dd>${esc(p.weight)} kg</dd></div>`:''}
        <div><dt>Supplier</dt><dd>${esc(supName(prefSup(id))||p.supplier||'—')}</dd></div>
        <div><dt>Product type</dt><dd>${prods.length?prods.slice(0,4).map(([x,pr])=>`<button class="link" data-gop="${esc(x)}">${esc(pr.name)}</button>`).join(', ')+(prods.length>4?` +${prods.length-4} more`:''):'—'}</dd></div>
        <div><dt>Used in</dt><dd>${used.length?used.slice(0,6).map(u=>`<button class="link mono" data-go="${esc(u.id)}">${esc(u.p.partNo)}</button>`).join(', ')+(used.length>6?` +${used.length-6} more`:''):'Not used in a BOM'}</dd></div>
      </dl>
      ${p.notes?`<div class="note">${esc(p.notes)}</div>`:''}
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="structure" aria-selected="${S.tab==='structure'}">Structure</button>
      <button role="tab" data-tab="stock" aria-selected="${S.tab==='stock'}">Prices &amp; stock</button>
      <button role="tab" data-tab="costing" aria-selected="${S.tab==='costing'}">Costing &amp; quantities</button>
      <button role="tab" data-tab="documents" aria-selected="${S.tab==='documents'}">Documents (${docsFor(id).length})</button>
    </div>
    <div class="tabbody">${S.tab==='structure'?structureHTML(id):S.tab==='stock'?stockTabHTML(id):S.tab==='costing'?costingHTML(id):documentsHTML(id)}</div>
  </section>`;
  bindMain(id);
}

const qtyOpts=(sel)=>{let s='';const v=num(sel);for(let i=0;i<=100;i++)s+=`<option value="${i}" ${i===v?'selected':''}>${i}</option>`;if(!Number.isInteger(v)||v>100)s+=`<option value="${v}" selected>${qfmt(v)}</option>`;return s};
function structureHTML(id){
  const p=S.parts.get(id);
  const rows=explode(id,{honourCollapse:true});
  const wr=canW();
  let body='';
  if(!rows.length){body=`<div class="empty" style="padding:16px">No components yet.${p.kind==='variant'&&(p.productIds||[]).length?' The quickest way to fill this in is the product type’s component matrix.':''}${wr?' You can also add components below.':''}</div>`}
  else body=`<div class="scroll"><table>
    <thead><tr><th>Item code</th><th>Level</th><th>Role</th><th>Description</th><th class="num">Qty per</th><th class="num">Total qty</th><th class="num">Unit cost</th><th class="num">Ext. cost</th><th class="num">On hand</th><th>Docs</th>${wr?'<th></th>':''}</tr></thead>
    <tbody>${rows.map(r=>{
      const cp=r.part;const direct=r.level===1;
      if(!cp)return `<tr><td colspan="${wr?11:10}" class="warn">Missing item <code>${esc(r.id)}</code>${wr&&direct?` <button class="btn small danger" data-rm="${r.index}">Remove line</button>`:''}</td></tr>`;
      const uc=unitCost(r.id);const dn=docsFor(r.id).length;
      return `<tr class="${direct?'lvl1':'deep'}">
        <td><span class="tree" style="padding-left:${(r.level-1)*18}px">
          <button class="tw ${r.hasKids?'':'none'}" data-tog="${esc(r.key)}" aria-label="Expand or collapse">${S.collapsed.has(r.key)?'▸':'▾'}</button>
          <span class="lvl">${r.level}</span><button class="link mono pn-cell" data-go="${esc(r.id)}">${esc(cp.partNo)}</button></span></td>
        <td>${lvTag(cp)}${r.lvBad?' <span class="tag" style="color:var(--bad)" title="Should be a lower level than its parent">Check level</span>':''}</td>
        <td>${r.role?`<span class="tag">${esc(r.role)}</span>`:''}</td>
        <td>${esc(cp.description)}${cp.orderNo?` <span class="mono muted">${esc(cp.orderNo)}</span>`:''}${r.cycle?' <span class="tag" style="color:var(--bad)">Loop</span>':''}</td>
        <td class="num">${wr&&direct?`<select class="f qty num" data-qty="${r.index}" aria-label="Quantity per">${qtyOpts(r.qty)}</select>`:qfmt(r.qty)}</td>
        <td class="num">${qfmt(r.total)}</td>
        <td class="num">${money(uc)}</td>
        <td class="num">${money(uc*r.qty)}</td>
        <td class="num">${stk(r.id).onHand!=null?qfmt(onHand(r.id)):'—'} ${['low','out'].includes(stockStatus(r.id))?stTag(r.id):''}</td>
        <td>${dn?`<span class="tag rev">${dn}</span>`:'<span class="muted">—</span>'}</td>
        ${wr?`<td>${direct?`<button class="btn small danger" data-rm="${r.index}">Remove</button>`:''}</td>`:''}
      </tr>`}).join('')}</tbody>
    <tfoot><tr><td colspan="7">Components${num(p.labour)?' + labour '+money(p.labour):''}</td><td class="num">${money(bomCost(id))}</td><td colspan="${wr?3:2}"></td></tr></tfoot>
  </table></div>
  <div class="row note"><button class="link" id="expand-all">Expand all</button> · <button class="link" id="collapse-all">Collapse all</button> · “Total qty” is per one ${esc(p.partNo)}.</div>`;
  const nl=nextLevel(p.level);
  const sim=similarItems(id);
  const copy=wr&&isAsm(p)&&p.level!=='Product'&&sim.length?`<div class="row" style="justify-content:space-between;background:var(--sunk);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px"><span class="note">${sim.length} similar item${sim.length>1?'s':''} (${esc(baseDesc(p))}) can reuse this BOM, with width and material-specific components swapped to match.</span><button class="btn" id="copybom">Copy BOM to similar items</button></div>`:'';
  const add=wr?copy+`<div><h2 class="h2" style="margin-bottom:8px">Add ${nl?nl.toLowerCase():'component'}${nl?'s':''} to this ${esc((p.level||'item').toLowerCase())}</h2>
    <div class="addrow">
      <label class="lb">Item code<input class="f mono" id="add-part" list="add-list" inputmode="numeric" placeholder="Type an item code"><datalist id="add-list"></datalist></label>
      <label class="lb">Qty per<select class="f num" id="add-qty">${qtyOpts(1)}</select></label>
      <button class="btn primary" id="add-go">Add</button>
      <button class="btn" id="add-new">+ New item as component</button>
    </div><div class="note" id="add-msg" style="margin-top:6px"></div></div>`:'';
  return body+add;
}

function costingHTML(id){
  const p=S.parts.get(id);
  if(!isAsm(p))return `<div class="empty" style="padding:16px">Nothing to roll up yet. Add components on the Structure tab or in the product type’s matrix.</div>`;
  const {lv,matl,lab,wt,total}=totals(id);const b=S.build||1;
  return `<div class="tiles">
    <div class="tile"><div class="l">BOM cost</div><div class="big">${money(bomCost(id))}</div></div>
    <div class="tile"><div class="l">Sell price · margin</div><div class="big">${sellOf(id)?money(sellOf(id)):'—'}</div><div class="note">Margin on BOM cost ${sellOf(id)?mfmt((sellOf(id)-bomCost(id))/sellOf(id)*100):'—'}</div></div>
    <div class="tile"><div class="l">Materials &amp; bought-in</div><div class="big">${money(matl)}</div></div>
    <div class="tile"><div class="l">Assembly labour</div><div class="big">${money(lab)}</div></div>
    <div class="tile"><div class="l">Component weight${p.weight?' · catalogue '+esc(p.weight)+' kg':''}</div><div class="big">${kg(wt)}</div></div>
  </div>
  <div class="row" style="justify-content:space-between"><h2 class="h2">Items to pick for ${esc(p.partNo)}</h2>
    <div class="row"><label class="lb" style="grid-auto-flow:column;align-items:center">Build qty <input class="f num" id="build" type="number" min="1" step="1" value="${b}" style="width:80px"></label>
    ${S.downloads?'<button class="btn" id="exp-csv">Download CSV</button>':''}</div></div>
  <div class="scroll"><table>
    <thead><tr><th>Item code</th><th>Ordering no.</th><th>Description</th><th class="num">Qty / unit</th><th class="num">Qty × build</th><th class="num">Buy price</th><th class="num">Ext. cost</th><th class="num">Weight</th></tr></thead>
    <tbody>${lv.map(x=>`<tr><td><button class="link mono" data-go="${esc(x.pid)}">${esc(x.p?.partNo||x.pid)}</button></td><td class="mono">${esc(x.p?.orderNo||'')}</td><td>${esc(x.p?.description||'Missing item')}</td><td class="num">${qfmt(x.q)}</td><td class="num">${qfmt(x.q*b)}</td><td class="num">${money(buyOf(x.pid))}</td><td class="num">${money(x.q*b*buyOf(x.pid))}</td><td class="num">${x.p?.weight?kg(x.q*b*num(x.p.weight)):'—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="6">Totals for ${b} unit(s)</td><td class="num">${money(matl*b)}</td><td class="num">${kg(wt*b)}</td></tr></tfoot>
  </table></div>`;
}

function documentsHTML(id){
  const p=S.parts.get(id);const canUp=!!S.assets;
  return `<div class="note">Uploads are filed automatically as <span class="mono">${esc(p.partNo)}-TYPE-Rev#_date-time</span> with the uploader recorded. Uploading the same type again files the next revision and keeps earlier ones as superseded. Accepted: PDF, PNG, JPG, WEBP, SVG (export CAD to PDF), up to 20 MB.</div>
  ${canUp?'':'<div class="warn">You can view and download documents. Uploading needs Editor access to this page.</div>'}
  <div class="docgrid">${TYPES.map(t=>{
    const list=docsFor(id,t.code);const cur=list[0];const next=revLabel(cur?cur.revIndex+1:0);
    return `<div class="slot ${cur?'has':''}">
      <div><h3>${esc(t.label)}</h3><div class="code">${esc(t.code)} · ${esc(t.hint)}</div></div>
      ${cur?`<div class="row"><span class="tag rev">Rev ${esc(cur.rev)}</span><span class="tag cur">Current</span></div>
        <div class="filed">${esc(cur.filedName)}</div>
        <div class="note">${esc(when(cur.uploadedAt))} · <span data-uid="${esc(cur.uploadedBy||'')}">…</span></div>
        <div class="row">${docButtons(cur)}</div>`:'<div class="note">No document filed yet.</div>'}
      ${canUp?(S.uploading===t.code?'<div class="drop">Uploading…</div>':`<label class="drop" data-drop="${t.code}">Drop file or click to file <strong>Rev ${next}</strong><input type="file" data-up="${t.code}" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg"></label>`):''}
      ${list.length>1?`<details><summary class="note" style="cursor:pointer">Revision history (${list.length})</summary><div class="scroll" style="margin-top:6px"><table><tbody>${list.map((d,i)=>`<tr><td><span class="tag rev ${i?'old':''}">Rev ${esc(d.rev)}</span></td><td class="note">${esc(when(d.uploadedAt))}</td><td style="white-space:nowrap">${docButtons(d,true)}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    </div>`}).join('')}</div>`;
}
function docButtons(d,compact){
  return `<a class="btn small" href="/_blob/${esc(d.assetId)}" target="_blank" rel="noopener">Open</a>${S.downloads?`<button class="btn small" data-dl="${esc(d._id)}">${compact?'Save':'Save as filed'}</button>`:''}`;
}

/* ---------- product type view ---------- */
function productHTML(){
  const pr=S.products.get(S.product);
  if(!pr)return `<div class="panel empty"><strong>Pick a product type</strong>Choose a product type from the list to allocate its components for every belt width and version.</div>`;
  const f=filled(pr);
  return `<section class="panel">
    <div class="head">
      <div class="head-top"><div style="flex:1;min-width:0">
        <div class="pnum">${esc(pr.category)}${pr.sourcePage?' · catalogue page '+esc(pr.sourcePage):''}${pr.copiedFrom&&S.products.get(pr.copiedFrom)?` · copied from <button class="link" data-gop="${esc(pr.copiedFrom)}">${esc(S.products.get(pr.copiedFrom).name)}</button>`:''}</div>
        ${(()=>{const t=prodVariants(pr).filter(([,p])=>p.tempCode).length;return t?`<div class="warn" style="margin-top:6px;background:var(--rev-soft);color:var(--rev)">${t} variant${t>1?'s have':' has'} a temporary item code. Open a variant and use Edit details to enter its real code.</div>`:''})()}
        <h1>${esc(pr.name)}</h1></div>
        <div class="row">${canW()?'<button class="btn" id="pt-edit">Edit product type</button>':''}${S.downloads?'<button class="btn" id="exp-mx">Export matrix</button><button class="btn" id="exp-pbom">Export all BOMs</button>':''}</div>
      </div>
      ${pr.notes?`<div class="note">${esc(pr.notes)}</div>`:''}
      <div class="tiles">
        <div class="tile"><div class="l">Variants (item codes)</div><div class="big">${f.n}</div></div>
        <div class="tile"><div class="l">With components allocated</div><div class="big">${f.done} <span class="note">of ${f.n}</span></div></div>
        <div class="tile"><div class="l">Spare parts linked</div><div class="big">${(pr.spareIds||[]).length}</div></div>
        <div class="tile"><div class="l">Versions</div><div style="font-weight:600;margin-top:4px">${esc(prodMats(pr).map(m=>m||'Standard').join(' · '))}</div></div>
      </div>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" data-ptab="matrix" aria-selected="${S.ptab==='matrix'}">Component matrix</button>
      <button role="tab" data-ptab="variants" aria-selected="${S.ptab==='variants'}">Variants &amp; specs (${(pr.variantIds||[]).length})</button>
      <button role="tab" data-ptab="build" aria-selected="${S.ptab==='build'}">Parts to build (${buildList(pr).filter(x=>x.needs).length})</button>
      <button role="tab" data-ptab="spares" aria-selected="${S.ptab==='spares'}">Spare parts (${(pr.spareIds||[]).length})</button>
    </div>
    <div class="tabbody">${S.ptab==='spares'?sparesHTML(pr):S.ptab==='variants'?variantsHTML(pr):S.ptab==='build'?buildHTML(pr):matrixHTML(pr)}</div>
  </section>`;
}
function matrixHTML(pr){
  const roles=pr.roles||DEF_ROLES;const wr=canW();
  const mats=prodMats(pr);
  let vs=prodVariants(pr).sort(vSort);
  if(S.mat!=='all'&&mats.includes(S.mat))vs=vs.filter(([,p])=>(p.material||'')===S.mat);
  const cols=(pr.attrCols||[]).filter(c=>!/tip width|pole length|weigh/i.test(c)).slice(0,2);
  const mw=modApplies(pr)?num(pr.moduleWidth):0;const hasPW=vs.some(([,p])=>prodWidth(p));
  return `${modBarFor(pr)?`<div class="modbar">
    <label class="lb" style="grid-auto-flow:column;align-items:center;gap:8px">Module width
      <select class="f" id="modw" style="width:auto" ${wr?'':'disabled'}>${[[0,'Not modular'],[100,'100 mm'],[150,'150 mm (secondary)'],[200,'200 mm (primary)'],[250,'250 mm'],[300,'300 mm']].map(([v,l])=>`<option value="${v}" ${v===mw?'selected':''}>${l}</option>`).join('')}${[0,100,150,200,250,300].includes(mw)?'':`<option value="${mw}" selected>${mw} mm</option>`}</select></label>
    <span class="note">${mw?`Modules = product (tip) width ÷ ${mw} mm. Tips, arms and cushions are set per module and multiplied by each variant’s module count; everything else is per product.`:'Set a module width so tips, arms and cushions are calculated from the number of modules.'}</span></div>`:''}
  <div class="note">Each row is a variant with its own item code. ${wr?'Click a cell to choose the parts for that role and set the quantity (0–100). In the editor you can copy the choice to other widths or versions; width and material-specific parts are swapped to the matching item for each variant.':''}</div>
  ${mats.length>1?`<div class="chips">${['all',...mats].map(m=>`<button class="chip" data-mat="${esc(m)}" aria-pressed="${S.mat===m}">${m==='all'?'All versions':esc(m||'Standard')}</button>`).join('')}</div>`:''}
  <div class="scroll mxwrap"><table class="mx2">
    <thead><tr><th class="stk">Item code</th><th>Ordering no.</th><th class="num">Belt width</th>${hasPW?'<th class="num">Product width</th>':''}${mw?'<th class="num">Modules</th>':''}${cols.map(c=>`<th>${esc(c.replace(/\s*\(.*?\)/,''))}</th>`).join('')}<th>Version</th>${roles.map(r=>`<th class="rc">${esc(r)}${mw&&MOD_ROLES.includes(r)?' <span class="note" style="text-transform:none;letter-spacing:0">/module</span>':''}${wr?` <button class="x" data-delrole="${esc(r)}" title="Remove column" aria-label="Remove ${esc(r)} column">×</button>`:''}</th>`).join('')}<th class="num">Weight</th></tr></thead>
    <tbody>${vs.map(([id,p])=>{const ls=lines(p);const wt=ls.length?totals(id).wt:0;return `<tr>
      <td class="stk"><button class="link mono" data-go="${esc(id)}">${esc(p.partNo)}</button>${p.tempCode?' <span class="tag tmp">Temp</span>':''}</td>
      <td class="mono note">${esc(p.orderNo||'')}</td><td class="num">${esc(p.width??'')}</td>${hasPW?`<td class="num">${esc(prodWidth(p)??'')}</td>`:''}${mw?(()=>{const m=modulesOf(pr,p);return `<td class="num">${m==null?'—':modOk(m)?m:`<span class="tag" style="color:var(--bad)" title="Product width is not a whole number of ${mw} mm modules">${qfmt(m)}</span>`}</td>`})():''}
      ${cols.map(c=>`<td>${esc(p.attrs?.[c]||'')}</td>`).join('')}<td>${esc(shortMat(p.material)||'—')}</td>
      ${roles.map(r=>{const rl=ls.filter(l=>(l.role||'Accessories')===r);return `<td class="cell ${rl.length?'on':''}" ${wr?`data-cell="${esc(id)}" data-role="${esc(r)}" tabindex="0" role="button" aria-label="${esc(r)} for ${esc(p.partNo)}"`:''}>${rl.length?rl.map(l=>`<div><span class="mono">${esc(pn(l.partId))}</span> <strong>×${qfmt(l.qty)}</strong>${l.perModule?` <span class="note">(${qfmt(l.perModule)}/mod)</span>`:''}</div>`).join(''):(wr?'<span class="plus">+</span>':'')}</td>`}).join('')}
      <td class="num note">${wt?kg(wt):(p.weight?esc(p.weight)+' kg':'')}</td></tr>`}).join('')}</tbody>
  </table></div>
  ${wr?`<div class="row"><input class="f" id="newrole" placeholder="New column, e.g. Hardware" style="max-width:240px"><button class="btn" id="addrole">Add column</button></div>`:''}`;
}
function buildList(pr){
  const m=new Map();
  for(const [vid] of prodVariants(pr))for(const r of explode(vid)){
    if(!r.part)continue;const e=m.get(r.id)||{id:r.id,p:r.part,variants:new Set(),parents:new Set()};e.variants.add(vid);e.parents.add(r.level===1?vid:'');m.set(r.id,e)}
  return [...m.values()].map(e=>({...e,needs:(e.p.level==='Part'||e.p.level==='Component')&&!isAsm(e.p)}))
    .sort((a,b)=>lvRank(a.p.level)-lvRank(b.p.level)||String(a.p.partNo).localeCompare(String(b.p.partNo),undefined,{numeric:true}));
}
function buildHTML(pr){
  const bl=buildList(pr);
  if(!bl.length)return `<div class="empty">Nothing allocated yet. Fill in the component matrix first; every Part and Component you use will be listed here so you can build its own BOM.</div>`;
  const nd=bl.filter(x=>x.needs).length;
  return `<div class="note">Every Part, Component and Item used anywhere in ${esc(pr.name)}, across all ${prodVariants(pr).length} variants. Parts are made of Components and Components are made of Items: open one marked <strong>Needs BOM</strong> to add what it is made of. A part's BOM is defined once and reused by every product that uses it.</div>
  ${nd?`<div class="warn" style="background:var(--rev-soft);color:var(--rev)">${nd} part${nd>1?'s':''} or component${nd>1?'s':''} still need${nd>1?'':'s'} a BOM.</div>`:''}
  <div class="scroll"><table><thead><tr><th>Item code</th><th>Level</th><th>Description</th><th>Ordering no.</th><th class="num">In variants</th><th class="num">Used by products</th><th>Own BOM</th></tr></thead>
  <tbody>${bl.map(e=>`<tr><td><button class="link mono" data-go="${esc(e.id)}">${esc(e.p.partNo)}</button></td><td>${lvTag(e.p)}</td><td>${esc(e.p.description)}</td><td class="mono note">${esc(e.p.orderNo||'')}</td>
    <td class="num">${e.variants.size}</td><td class="num">${(e.p.productIds||[]).length||''}</td>
    <td>${isAsm(e.p)?`<span class="tag cur">${lines(e.p).length} line${lines(e.p).length>1?'s':''}</span>`:e.needs?'<span class="tag rev">Needs BOM</span>':'<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
function similarItems(id){
  const p=S.parts.get(id);if(!p)return [];const bd=baseDesc(p);const pids=new Set(p.productIds||[]);
  return [...S.parts.entries()].filter(([x,c])=>x!==id&&baseDesc(c)===bd&&(c.level||'')===(p.level||'')&&(!pids.size||(c.productIds||[]).some(y=>pids.has(y))));
}
function copyModal(id){
  const p=S.parts.get(id);const sim=similarItems(id);if(!sim.length)return;
  const pool=[];const seen=new Set();for(const x of [id,...sim.map(s=>s[0])])for(const pid of (S.parts.get(x).productIds||[]))for(const c of (S.products.get(pid)?.spareIds||[]))if(!seen.has(c)&&S.parts.has(c)){seen.add(c);pool.push([c,S.parts.get(c)])}
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-back"><form class="modal" id="cpform" novalidate>
    <div><div class="pnum">${esc(p.partNo)} · ${esc(p.description)}</div><h2>Copy BOM to similar items</h2></div>
    <div class="note">The ${lines(p).length} line${lines(p).length>1?'s':''} of this BOM will replace the BOM of each item you tick.</div>
    <div class="scroll" style="max-height:44vh"><table><thead><tr><th><input type="checkbox" id="cp-all" checked aria-label="Select all"></th><th>Item code</th><th>Description</th><th>Current BOM</th></tr></thead>
    <tbody>${sim.sort(byCode).map(([x,c])=>`<tr><td><input type="checkbox" data-cpi="${esc(x)}" checked aria-label="Copy to ${esc(c.partNo)}"></td><td class="mono">${esc(c.partNo)}</td><td>${esc(c.description)}</td><td>${isAsm(c)?`<span class="tag rev">${lines(c).length} lines, will be replaced</span>`:'<span class="muted">empty</span>'}</td></tr>`).join('')}</tbody></table></div>
    <label class="note" style="display:flex;gap:8px"><input type="checkbox" id="cp-swap" checked> Swap width and material-specific components to the matching item for each</label>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="cp-cancel">Cancel</button><button class="btn primary" type="submit" id="cp-go">Copy BOM</button></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#cp-cancel').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  $('#cp-all').onchange=e=>root.querySelectorAll('[data-cpi]').forEach(c=>c.checked=e.target.checked);
  $('#cpform').onsubmit=async e=>{
    e.preventDefault();const swap=$('#cp-swap').checked;const btn=$('#cp-go');btn.disabled=true;S.busy=true;
    const src=kids(p).filter(c=>num(c.qty)>0);let n=0,bad=0;
    for(const cb of root.querySelectorAll('[data-cpi]:checked')){
      const tid=cb.dataset.cpi;const tp=S.parts.get(tid);
      const next=src.map(c=>({...c,partId:swap?equivalent(c.partId,tp,pool):c.partId})).filter(c=>!contains(c.partId,tid));
      n++;btn.textContent=`Copying ${n}…`;if(!await putPart(tid,{components:next}))bad++;
    }
    S.busy=false;S.pending=false;close();render();toast(bad?`Copied, but ${bad} failed. Try again.`:`BOM copied to ${n} item${n>1?'s':''}`);
  };
}
function sparesHTML(pr){
  const roles=pr.roles||DEF_ROLES;const wr=canW();
  const sp=prodSpares(pr).sort((a,b)=>roles.indexOf(a[1].role)-roles.indexOf(b[1].role)||byCode(a,b));
  const linkBar=wr?`<div class="row"><input class="f mono" id="sp-link" list="sp-ll" placeholder="Item code to link as a spare part" style="max-width:260px"><datalist id="sp-ll">${sortedParts().filter(([id,p])=>p.level!=='Product'&&!(pr.spareIds||[]).includes(id)).slice(0,1500).map(([,p])=>`<option value="${esc(p.partNo)}">${esc(p.orderNo||'')} ${esc(p.description)}</option>`).join('')}</datalist><button class="btn" id="sp-linkgo">Link spare part</button><button class="btn" id="sp-newpart">+ New part for this product</button></div>`:'';
  if(!sp.length)return linkBar+`<div class="empty">No spare parts are linked to this product type yet. Link existing parts by item code, or create new ones.</div>`;
  return linkBar+`<div class="note">The role decides which matrix column a part is offered in first. Change it if the catalogue wording put a part under the wrong role.</div>
  <div class="scroll"><table><thead><tr><th>Item code</th><th>Ordering no.</th><th>Description</th><th class="num">Width</th><th>Version</th><th>Level</th><th>Role</th><th class="num">Used in</th>${wr?'<th></th>':''}</tr></thead>
  <tbody>${sp.map(([id,p])=>`<tr><td><button class="link mono" data-go="${esc(id)}">${esc(p.partNo)}</button></td><td class="mono note">${esc(p.orderNo||'')}</td><td>${esc(baseDesc(p))}</td><td class="num">${esc(p.width??'')}</td><td>${esc(shortMat(p.material))}</td>
    <td>${wr?`<select class="f" data-setlvl="${esc(id)}" style="width:auto" aria-label="Level">${['',...LEVELS].map(l=>`<option value="${l}" ${l===(p.level||'')?'selected':''}>${l||'—'}</option>`).join('')}</select>`:lvTag(p)}</td>
    <td>${wr?`<select class="f" data-setrole="${esc(id)}" style="width:auto" aria-label="Role">${[...new Set([...roles,p.role||'Accessories'])].map(r=>`<option ${r===(p.role||'Accessories')?'selected':''}>${esc(r)}</option>`).join('')}</select>`:esc(p.role)}</td>
    <td class="num">${(S.usedBy.get(id)||new Set()).size||''}</td>${wr?`<td style="white-space:nowrap"><button class="btn small" data-spedit="${esc(id)}">Edit</button> <button class="btn small danger" data-spun="${esc(id)}">Unlink</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}

function docCount(id){const m={};for(const d of S.docs)if(d.partId===id)m[d.type]=1;return m}
function libItems(){
  const q=S.dq.toLowerCase();const cnt=new Map();for(const d of S.docs){if(!cnt.has(d.partId))cnt.set(d.partId,new Set());cnt.get(d.partId).add(d.type)}
  return sortedParts().filter(([id,p])=>{
    if(S.dlv!=='all'&&p.level!==S.dlv)return false;
    if(S.dcat!=='all'){if(S.dcat==='__custom'){if(p.catalog)return false}else if(p.category!==S.dcat&&!(p.productIds||[]).includes(S.dcat))return false}
    const has=cnt.get(id)||new Set();
    if(S.dmiss==='has'&&!has.size)return false;
    if(S.dmiss==='none'&&has.size)return false;
    if(['GA','MFR','IIOM'].includes(S.dmiss)&&has.has(S.dmiss))return false;
    if(q&&![p.partNo,p.orderNo,p.description].some(v=>String(v||'').toLowerCase().includes(q)))return false;
    return true;
  }).map(([id,p])=>[id,p,cnt.get(id)||new Set()]);
}
function registerHTML(){
  const q=S.regQ.toLowerCase();
  const list=S.docs.filter(d=>(S.regType==='all'||d.type===S.regType)&&(!q||(d.filedName+' '+(S.parts.get(d.partId)?.partNo||'')+' '+(S.parts.get(d.partId)?.description||'')+' '+(d.originalName||'')).toLowerCase().includes(q)))
    .sort((a,b)=>b.uploadedAt>a.uploadedAt?1:-1);
  const items=allLoaded()?libItems():[];const shown=items.slice(0,LIST_MAX);
  const cats=[...new Set([...S.parts.values()].map(p=>p.category).filter(Boolean))];
  const sel=S.dsel&&S.parts.get(S.dsel);
  const tick=(has,c)=>`<span class="dt ${has.has(c)?'on':''}" title="${esc(TYPE[c].label)}${has.has(c)?' filed':' missing'}">${c==='MFR'?'MFR':c}</span>`;
  const withAny=new Set(S.docs.map(d=>d.partId)).size;
  return `<section class="panel"><div class="head">
    <div class="head-top"><div style="flex:1"><div class="pnum">GA drawings · manufacturer’s drawings · IIOM manuals · other</div><h1>Document library</h1></div>
      <div class="row">${canW()?'<button class="btn primary" id="lib-new">+ New item for documents</button>':''}${S.downloads?'<button class="btn" id="reg-csv">Download register CSV</button>':''}</div></div>
    <div class="tiles">
      <div class="tile"><div class="l">Documents filed</div><div class="big">${S.docs.length}</div><div class="note">${S.docs.filter(isCurrent).length} current revisions</div></div>
      <div class="tile"><div class="l">Items with documents</div><div class="big">${withAny.toLocaleString()} <span class="note">of ${S.parts.size.toLocaleString()}</span></div></div>
      ${TYPES.slice(0,3).map(t=>`<div class="tile"><div class="l">${esc(t.label)} filed</div><div class="big">${new Set(S.docs.filter(d=>d.type===t.code).map(d=>d.partId)).size}</div></div>`).join('')}
    </div>
  </div>
  <div class="libgrid">
    <aside class="libside">
      <div class="side-head">
        <input class="f" id="lib-q" type="search" placeholder="Filter items: code, ordering no., description" value="${esc(S.dq)}" aria-label="Filter items">
        <select class="f" id="lib-cat" aria-label="Category or product type"><option value="all">All categories &amp; product types</option><option value="__custom" ${S.dcat==='__custom'?'selected':''}>Items added in the register</option>
          <optgroup label="Categories">${cats.map(c=>`<option ${S.dcat===c?'selected':''}>${esc(c)}</option>`).join('')}</optgroup>
          <optgroup label="Product types">${[...S.products.entries()].map(([id,p])=>`<option value="${esc(id)}" ${S.dcat===id?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup></select>
        <div class="chips">${['all',...LEVELS].map(l=>`<button class="chip" data-dlv="${l}" aria-pressed="${S.dlv===l}">${l==='all'?'All levels':l+'s'}</button>`).join('')}</div>
        <select class="f" id="lib-miss" aria-label="Document status"><option value="all">Any document status</option><option value="has" ${S.dmiss==='has'?'selected':''}>Has documents</option><option value="none" ${S.dmiss==='none'?'selected':''}>No documents yet</option><option value="GA" ${S.dmiss==='GA'?'selected':''}>Missing GA drawing</option><option value="MFR" ${S.dmiss==='MFR'?'selected':''}>Missing manufacturer’s drawing</option><option value="IIOM" ${S.dmiss==='IIOM'?'selected':''}>Missing IIOM manual</option></select>
        <div class="note">${items.length.toLocaleString()} item${items.length===1?'':'s'}${items.length>LIST_MAX?`, showing first ${LIST_MAX}`:''}</div>
      </div>
      <div class="plist">${shown.map(([id,p,has])=>`<button class="pitem" data-dsel="${esc(id)}" aria-current="${id===S.dsel}"><span class="pn">${esc(p.partNo)} <span class="muted">${esc(p.orderNo||'')}</span></span><span class="dts">${tick(has,'GA')}${tick(has,'MFR')}${tick(has,'IIOM')}</span><span class="pd">${esc(p.description)}</span></button>`).join('')||'<div class="empty">No items match these filters.</div>'}</div>
    </aside>
    <div class="libmain">
      ${sel?`<div class="libhead"><div style="flex:1;min-width:0"><div class="pnum">Item code <strong class="mono" style="color:var(--ink)">${esc(sel.partNo)}</strong>${sel.orderNo?' · '+esc(sel.orderNo):''} · ${lvTag(sel)}</div><h2 class="h2" style="font-size:22px">${esc(sel.description)}</h2></div><button class="btn small" data-go="${esc(S.dsel)}">Open item</button></div>${documentsHTML(S.dsel)}`
        :`<div class="empty"><strong>Pick an item to file documents</strong>Filter the item list on the left, pick the item, then drop its GA drawing, manufacturer’s drawing or IIOM manual into the slots. If the item isn’t in the register yet, use “+ New item for documents”.</div>`}
    </div>
  </div>
  <div class="tabbody" style="border-top:1px solid var(--line)">
    <div class="row" style="justify-content:space-between"><h2 class="h2">All filed documents</h2><div class="row"><input class="f" id="reg-q" type="search" placeholder="Search filed name, item or original file name" style="max-width:320px" value="${esc(S.regQ)}">
      <div class="chips">${[['all','All types'],...TYPES.map(t=>[t.code,t.label])].map(([c,l])=>`<button class="chip" data-rt="${c}" aria-pressed="${S.regType===c}">${esc(l)}</button>`).join('')}</div></div></div>
    ${!S.loaded.docs?'<div class="empty">Loading…</div>':!list.length?'<div class="note">No documents filed yet.</div>':`<div class="scroll" style="max-height:50vh"><table>
    <thead><tr><th>Filed name</th><th>Item</th><th>Type</th><th>Rev</th><th>Status</th><th>Filed</th><th>By</th><th class="num">Size</th><th>Original file</th><th></th></tr></thead>
    <tbody>${list.map(d=>{const p=S.parts.get(d.partId);return `<tr>
      <td class="mono">${esc(d.filedName)}</td>
      <td>${p?`<button class="link mono" data-dsel="${esc(d.partId)}">${esc(p.partNo)}</button>`:'<span class="muted">deleted</span>'}</td>
      <td>${esc(TYPE[d.type]?.label||d.type)}</td><td><span class="tag rev">${esc(d.rev)}</span></td>
      <td>${isCurrent(d)?'<span class="tag cur">Current</span>':'<span class="tag">Superseded</span>'}</td>
      <td class="note" style="white-space:nowrap">${esc(when(d.uploadedAt))}</td>
      <td><span data-uid="${esc(d.uploadedBy||'')}">…</span></td>
      <td class="num note">${size(num(d.sizeBytes))}</td>
      <td class="note" style="max-width:220px;overflow-wrap:anywhere">${esc(d.originalName||'')}</td>
      <td style="white-space:nowrap">${docButtons(d,true)}</td></tr>`}).join('')}</tbody></table></div>`}
  </div></section>`;
}

async function fillNames(){
  const els=[...document.querySelectorAll('[data-uid]')];if(!els.length)return;
  const ids=[...new Set(els.map(e=>e.dataset.uid).filter(Boolean))];
  let ps={};if(S.user&&ids.length){try{ps=await S.user.profiles(ids)}catch(e){}}
  els.forEach(e=>{const p=ps[e.dataset.uid];e.textContent=p?(p.isMe?'You':(p.name||'Team member')):'Team member'});
}

/* ---------- interactions ---------- */
const canW=()=>S.db&&S.canWrite!==false;
function select(id,tab){S.selected=id;if(tab)S.tab=tab;S.view='items';setViewBtns();render();try{localStorage.setItem('bom.sel',id)}catch(e){}if(innerWidth<860)$('#main').scrollIntoView({block:'start'})}
function selectProduct(id){S.product=id;S.view='products';S.mat='all';setViewBtns();render();try{localStorage.setItem('bom.prod',id)}catch(e){}if(innerWidth<860)$('#main').scrollIntoView({block:'start'})}
function setViewBtns(){{const e=$('#v-tasks');if(e)e.setAttribute('aria-pressed',S.view==='tasks')}$('#v-prod').setAttribute('aria-pressed',S.view==='products');$('#v-parts').setAttribute('aria-pressed',S.view==='items');$('#v-docs').setAttribute('aria-pressed',S.view==='register');$('#v-stock').setAttribute('aria-pressed',S.view==='stock');$('#v-orders').setAttribute('aria-pressed',S.view==='orders');$('#v-sales').setAttribute('aria-pressed',S.view==='sales');$('#v-purch').setAttribute('aria-pressed',S.view==='purchasing');$('#v-exp').setAttribute('aria-pressed',S.view==='expenses')}

$('#plist').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b)return select(b.dataset.id);const pb=e.target.closest('[data-prod]');if(pb)selectProduct(pb.dataset.prod)});
$('#q').addEventListener('input',e=>{if(S.view==='products')S.pq=e.target.value;else S.q=e.target.value;renderSide()});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;S.filter=b.dataset.f;document.querySelectorAll('#filters .chip').forEach(c=>c.setAttribute('aria-pressed',c===b));renderSide()});
$('#v-prod').onclick=()=>{S.view='products';setViewBtns();render()};
$('#v-parts').onclick=()=>{S.view='items';setViewBtns();render()};
$('#v-docs').onclick=()=>{S.view='register';setViewBtns();render()};
$('#v-tasks').onclick=()=>{S.view='tasks';setViewBtns();render()};
$('#v-stock').onclick=()=>{S.view='stock';setViewBtns();render()};
$('#v-exp').onclick=()=>{S.view='expenses';setViewBtns();render()};
$('#v-purch').onclick=()=>{S.view='purchasing';setViewBtns();render()};
$('#v-sales').onclick=()=>{S.view='sales';setViewBtns();render()};
$('#v-orders').onclick=()=>{S.view='orders';setViewBtns();render()};
$('#btn-new').onclick=()=>partModal(null);
$('#btn-co').onclick=()=>companyModal();
{const ab=document.createElement('button');ab.className='btn bell';ab.id='btn-alerts';ab.setAttribute('aria-label','Needs attention');$('#btn-co').before(ab);ab.onclick=()=>attnModal()}
if(window.PCS&&window.PCS.hosted){const xb=document.createElement('button');xb.className='btn';xb.id='btn-xero';xb.textContent='Xero';xb.title='Xero connection and settings';$('#btn-co').before(xb);xb.onclick=()=>xeroHub()}

function bindCommon(m){
  m.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>select(b.dataset.go,b.dataset.gotab));
  m.querySelectorAll('[data-gop]').forEach(b=>b.onclick=()=>selectProduct(b.dataset.gop));
  m.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>saveDoc(b.dataset.dl));
}
function bindMain(id){
  const m=$('#main');bindCommon(m);
  m.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;renderMain();fillNames()});
  m.querySelectorAll('[data-tog]').forEach(b=>b.onclick=()=>{const k=b.dataset.tog;S.collapsed.has(k)?S.collapsed.delete(k):S.collapsed.add(k);renderMain()});
  const ea=$('#expand-all'),ca=$('#collapse-all');
  if(ea)ea.onclick=()=>{S.collapsed.clear();renderMain()};
  if(ca)ca.onclick=()=>{explode(id).filter(r=>r.hasKids).forEach(r=>S.collapsed.add(r.key));renderMain()};
  const ed=$('#edit');if(ed)ed.onclick=()=>partModal(id);
  const ls=$('#lvl-sel');if(ls)ls.onchange=()=>putPart(id,{level:ls.value},ls.value?`Level set to ${ls.value}`:'Level cleared').then(render);
  const cb=$('#copybom');if(cb)cb.onclick=()=>copyModal(id);
  const ex=$('#exp');if(ex)ex.onclick=()=>exportXlsx(id);
  const ec=$('#exp-csv');if(ec)ec.onclick=()=>exportCsv(id);
  bindStockTab(m,id);
  const bd=$('#build');if(bd)bd.onchange=()=>{S.build=Math.max(1,Math.round(num(bd.value))||1);renderMain()};
  m.querySelectorAll('[data-qty]').forEach(inp=>inp.onchange=()=>setQty(id,+inp.dataset.qty,num(inp.value)));
  m.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{
    const k='rm'+b.dataset.rm;if(S.armed!==k){S.armed=k;b.textContent='Confirm';b.classList.add('armed');setTimeout(()=>{if(S.armed===k){S.armed=null;b.textContent='Remove';b.classList.remove('armed')}},3000);return}
    S.armed=null;removeLine(id,+b.dataset.rm)});
  const ap=$('#add-part');
  if(ap){ap.onfocus=()=>{const dl=$('#add-list');if(dl.children.length)return;const p=S.parts.get(id);const pool=new Set();(p.productIds||[]).forEach(x=>(S.products.get(x)?.spareIds||[]).forEach(c=>pool.add(c)));
      const nl=nextLevel(p.level);let ids=pool.size?[...pool]:sortedParts().filter(([,x])=>!nl||x.level===nl).slice(0,600).map(x=>x[0]);
      if(nl)ids=ids.sort((a,b)=>(S.parts.get(a)?.level===nl?0:1)-(S.parts.get(b)?.level===nl?0:1));dl.innerHTML=ids.filter(x=>S.parts.has(x)).map(x=>`<option value="${esc(pn(x))}">${esc(S.parts.get(x).level||'')} · ${esc(S.parts.get(x).orderNo||'')} ${esc(S.parts.get(x).description)}</option>`).join('')};
    ap.onkeydown=e=>{if(e.key==='Enter')addLine(id)}}
  const ag=$('#add-go');if(ag)ag.onclick=()=>addLine(id);
  const an=$('#add-new');if(an)an.onclick=()=>partModal(null,{parentId:id,qty:num($('#add-qty').value)||1});
  bindDocSlots(m,id);
}
function bindDocSlots(m,id){
  m.querySelectorAll('[data-up]').forEach(inp=>inp.onchange=()=>{if(inp.files[0])uploadDoc(id,inp.dataset.up,inp.files[0])});
  m.querySelectorAll('[data-drop]').forEach(z=>{
    z.ondragover=e=>{e.preventDefault();z.classList.add('over')};z.ondragleave=()=>z.classList.remove('over');
    z.ondrop=e=>{e.preventDefault();z.classList.remove('over');const f=e.dataTransfer.files[0];if(f)uploadDoc(id,z.dataset.drop,f)}});
}
function bindProduct(){
  const m=$('#main');bindCommon(m);const pr=S.products.get(S.product);if(!pr)return;
  m.querySelectorAll('[data-ptab]').forEach(b=>b.onclick=()=>{S.ptab=b.dataset.ptab;renderMain()});
  m.querySelectorAll('[data-mat]').forEach(b=>b.onclick=()=>{S.mat=b.dataset.mat;renderMain()});
  m.querySelectorAll('[data-cell]').forEach(td=>{const go=()=>cellModal(S.product,td.dataset.cell,td.dataset.role);td.onclick=go;td.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
  m.querySelectorAll('[data-setrole]').forEach(s=>s.onchange=()=>putPart(s.dataset.setrole,{role:s.value},'Role updated'));
  m.querySelectorAll('[data-setlvl]').forEach(s=>s.onchange=()=>putPart(s.dataset.setlvl,{level:s.value},'Level updated'));
  m.querySelectorAll('[data-delrole]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=b.dataset.delrole;
    const used=prodVariants(pr).some(([,p])=>kids(p).some(c=>(c.role||'Accessories')===r));
    if(used){toast(`Clear the ${r} cells before removing the column.`);return}
    putProduct(S.product,{roles:(pr.roles||DEF_ROLES).filter(x=>x!==r)},'Column removed').then(render)});
  const ar=$('#addrole');if(ar)ar.onclick=()=>{const v=$('#newrole').value.trim();if(!v)return;const rs=pr.roles||DEF_ROLES;if(rs.includes(v)){toast('That column already exists.');return}putProduct(S.product,{roles:[...rs,v]},'Column added').then(render)};
  const mws=$('#modw');if(mws)mws.onchange=()=>setModuleWidth(S.product,num(mws.value));
  const em=$('#exp-mx');if(em)em.onclick=()=>exportMatrix(S.product);
  const pe=$('#pt-edit');if(pe)pe.onclick=()=>productTypeModal(S.product);
  const va=$('#v-add');if(va)va.onclick=()=>variantModal(S.product,null);
  const vi=$('#v-imp');if(vi)vi.onclick=()=>pickImportFile(S.product);
  const vt=$('#v-tpl');if(vt)vt.onclick=()=>importTemplate(S.product);
  m.querySelectorAll('[data-vedit]').forEach(b=>b.onclick=()=>variantModal(S.product,b.dataset.vedit));
  m.querySelectorAll('[data-vcopy]').forEach(b=>b.onclick=()=>variantModal(S.product,null,b.dataset.vcopy));
  m.querySelectorAll('[data-vrm]').forEach(b=>b.onclick=()=>removeVariant(S.product,b.dataset.vrm,b));
  const sl=$('#sp-linkgo');if(sl)sl.onclick=()=>linkSpare(S.product);
  const sn=$('#sp-newpart');if(sn)sn.onclick=()=>{S.newForProduct=S.product;partModal(null)};
  m.querySelectorAll('[data-spedit]').forEach(b=>b.onclick=()=>partModal(b.dataset.spedit));
  m.querySelectorAll('[data-spun]').forEach(b=>b.onclick=()=>unlinkSpare(S.product,b.dataset.spun));
  const eb=$('#exp-pbom');if(eb)eb.onclick=()=>exportProductBoms(S.product);
}
function bindRegister(){
  const m=$('#main');bindCommon(m);
  const rq=$('#reg-q');if(rq)rq.oninput=()=>{S.regQ=rq.value;const pos=rq.selectionStart;renderMain();fillNames();const n=$('#reg-q');n.focus();n.setSelectionRange(pos,pos)};
  m.querySelectorAll('[data-rt]').forEach(b=>b.onclick=()=>{S.regType=b.dataset.rt;renderMain();fillNames()});
  const rc=$('#reg-csv');if(rc)rc.onclick=registerCsv;
  const lq=$('#lib-q');if(lq)lq.oninput=()=>{S.dq=lq.value;const pos=lq.selectionStart;renderMain();fillNames();const n=$('#lib-q');n.focus();n.setSelectionRange(pos,pos)};
  const lc=$('#lib-cat');if(lc)lc.onchange=()=>{S.dcat=lc.value;renderMain();fillNames()};
  const lm=$('#lib-miss');if(lm)lm.onchange=()=>{S.dmiss=lm.value;renderMain();fillNames()};
  m.querySelectorAll('[data-dlv]').forEach(b=>b.onclick=()=>{S.dlv=b.dataset.dlv;renderMain();fillNames()});
  m.querySelectorAll('[data-dsel]').forEach(b=>b.onclick=()=>{S.dsel=b.dataset.dsel;renderMain();fillNames();const lm2=m.querySelector('.libmain');if(lm2&&innerWidth<860)lm2.scrollIntoView({block:'start'})});
  const ln=$('#lib-new');if(ln)ln.onclick=()=>{S.newForDocs=true;partModal(null)};
  if(S.dsel&&S.parts.get(S.dsel))bindDocSlots(m,S.dsel);
}

/* ---------- writes ---------- */
function wErr(e){
  if(e&&e.code==='invalid_argument'&&S.canWrite==null){S.canWrite=false;render();toast('You have view-only access to this BOM.')}
  else if(e&&e.code==='quota_exceeded')toast('Storage is full. Remove unused items or documents.');
  else toast('Could not save: '+(e&&e.message||'try again'));
}
async function write(fn,ok){try{await fn();if(ok)toast(ok);return true}catch(e){wErr(e);return false}}
function putPart(id,patch,ok){
  const base={...(S.parts.get(id)||{})};delete base.catalog;
  const doc={...base,...patch,updatedAt:new Date().toISOString()};
  S.over.parts.set(id,doc);rebuild();
  return write(()=>S.db.doc('parts/'+id).set(doc),ok);
}
function putProduct(id,patch,ok){
  const doc={...(S.products.get(id)||{}),...patch,updatedAt:new Date().toISOString()};
  S.over.products.set(id,doc);rebuild();
  return write(()=>S.db.doc('products/'+id).set(doc),ok);
}
const cloneLines=p=>kids(p).map(x=>({...x}));
const saveLines=(id,c,msg)=>putPart(id,{components:c},msg).then(r=>{render();return r});
function setQty(id,i,q){const c=cloneLines(S.parts.get(id));if(!c[i]||num(c[i].qty)===q)return;if(q<=0)c.splice(i,1);else{c[i].qty=q;delete c[i].perModule}saveLines(id,c,q<=0?'Removed':'Quantity updated')}
function removeLine(id,i){const c=cloneLines(S.parts.get(id)).filter((_,j)=>j!==i);saveLines(id,c,'Removed from BOM')}
function findByNo(no){no=String(no||'').trim().toLowerCase();if(!no)return null;if(S.parts.has(no))return no;for(const [id,p] of S.parts)if(String(p.partNo).toLowerCase()===no)return id;for(const [id,p] of S.parts)if(String(p.orderNo||'').toLowerCase()===no)return id;return null}
function addLine(id){
  const msg=$('#add-msg');const cid=findByNo($('#add-part').value);const q=num($('#add-qty').value);
  if(!cid){msg.textContent='No item with that code or ordering number.';return}
  if(q<=0){msg.textContent='Choose a quantity above zero.';return}
  if(contains(cid,id)){msg.textContent='That item already contains this one, so adding it would create a loop.';return}
  addComponent(id,cid,q);
}
function addComponent(id,cid,q,role){
  const r=role||S.parts.get(cid)?.role||'';
  const c=cloneLines(S.parts.get(id));const ex=c.find(x=>x.partId===cid&&(x.role||'')===r);
  if(ex)ex.qty=num(ex.qty)+q;else c.push({partId:cid,qty:q,role:r});
  return saveLines(id,c,ex?'Quantity added to existing line':'Component added');
}

async function setModuleWidth(pid,mw){
  const pr=S.products.get(pid);if(!pr)return;
  if(!await putProduct(pid,{moduleWidth:mw},mw?`Module width set to ${mw} mm`:'Product set as not modular'))return;
  const pr2=S.products.get(pid);S.busy=true;let n=0;
  for(const [vid,p] of prodVariants(pr2)){
    if(!kids(p).some(c=>num(c.perModule)))continue;
    const m=modulesOf(pr2,p);
    const next=kids(p).map(c=>num(c.perModule)?{...c,qty:m!=null?Math.round(num(c.perModule)*m*1000)/1000:0}:{...c});
    if(JSON.stringify(next)!==JSON.stringify(kids(p))){n++;await putPart(vid,{components:next})}
  }
  S.busy=false;S.pending=false;render();if(n)toast(`Per-module quantities recalculated on ${n} variant${n>1?'s':''}`);
}

/* ---------- matrix cell editor ---------- */
function cellModal(pid,vid,role){
  if(!canW())return;
  const pr=S.products.get(pid);const v=S.parts.get(vid);if(!pr||!v)return;
  const pool=prodSpares(pr);
  const cur=lines(v).filter(l=>(l.role||'Accessories')===role);
  const ranked=pool.map(([id,p])=>({id,p,s:score(p,v,role)})).sort((a,b)=>b.s-a.s||byCode([0,a.p],[0,b.p]));
  const sugg=ranked.filter(x=>x.p.role===role&&x.s>=5);
  const sameRole=ranked.filter(x=>x.p.role===role&&x.s<5);
  const other=ranked.filter(x=>x.p.role!==role);
  const opt=(x,sel)=>`<option value="${esc(x.id)}" ${x.id===sel?'selected':''}>${esc(x.p.partNo)} · ${esc(x.p.orderNo||'')} · ${esc(baseDesc(x.p))}${x.p.width?' '+x.p.width:''}${x.p.material?' '+esc(shortMat(x.p.material)):''}</option>`;
  const options=sel=>`<option value="">Choose a part…</option>${sugg.length?`<optgroup label="Best match for this variant">${sugg.map(x=>opt(x,sel)).join('')}</optgroup>`:''}${sameRole.length?`<optgroup label="Other ${esc(role)} parts">${sameRole.map(x=>opt(x,sel)).join('')}</optgroup>`:''}${other.length?`<optgroup label="Other spare parts for ${esc(pr.name)}">${other.map(x=>opt(x,sel)).join('')}</optgroup>`:''}<option value="__other" ${sel==='__other'?'selected':''}>Other item code…</option>`;
  let seq=0;const vm=modulesOf(pr,v);const byMod=vm!=null&&MOD_ROLES.includes(role);
  const rowHTML=l=>{const known=!l.partId||pool.some(([id])=>id===l.partId);return `<div class="crow" data-i="${seq++}">
    <div class="cpick"><select class="f" data-cp aria-label="Part">${options(known?l.partId:'__other')}</select>
    <input class="f mono" data-co inputmode="numeric" placeholder="Item code or ordering no." value="${known?'':esc(pn(l.partId))}" ${known?'hidden':''}></div>
    <div class="qmode"><select class="f num" data-cq aria-label="Quantity">${qtyOpts(l.perModule||l.qty)}</select>
    <input type="hidden" data-cm value="${byMod?'mod':'each'}"><span class="note">${byMod?'per module':'per product'}</span></div>
    <button type="button" class="btn small danger" data-cx aria-label="Remove part">×</button></div>`};
  const start=cur.length?cur.map(l=>({partId:l.partId,qty:l.qty,perModule:byMod?(l.perModule||(vm?l.qty/vm:0)):0})):[{partId:sugg[0]?.id||'',qty:0,perModule:0}];
  const w=v.width;const mat=v.material;const all=prodVariants(pr);
  const sameW=all.filter(([,p])=>w!=null&&num(p.width)===num(w)).length;
  const sameM=all.filter(([,p])=>(p.material||'')===(mat||'')).length;
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-back"><form class="modal" id="cform" novalidate>
    <div><div class="pnum">${esc(pr.name)} · <span class="mono">${esc(v.partNo)}</span> ${esc(v.orderNo||'')} · ${esc(vLabel(v))}</div><h2>${esc(role)}</h2>${byMod?`<div class="note">Quantity is per module. Product width ${prodWidth(v)} mm = <strong>${qfmt(vm)} module${vm===1?'':'s'}</strong> of ${num(pr.moduleWidth)} mm${modOk(vm)?'':' (not a whole number, check the product width)'}, so 1 per module gives ${qfmt(vm)} here.</div>`:vm!=null?'<div class="note">Quantity is per product (module width only applies to tips, arms and cushions).</div>':''}</div>
    <div class="crow h"><span>Part</span><span>Qty</span><span></span></div>
    <div id="crows">${start.map(rowHTML).join('')}</div>
    <div><button type="button" class="btn small" id="cadd">+ Add another part</button></div>
    <fieldset class="apply"><legend>Apply to</legend>
      <label><input type="radio" name="ap" value="one" checked> This variant only</label>
      ${w!=null?`<label><input type="radio" name="ap" value="width"> All ${esc(w)} mm variants (${sameW})</label>`:''}
      ${mat&&sameM<all.length?`<label><input type="radio" name="ap" value="mat"> All ${esc(mat)} variants (${sameM})</label>`:''}
      <label><input type="radio" name="ap" value="all"> Every variant of ${esc(pr.name)} (${all.length})</label>
      <label class="note"><input type="checkbox" id="cswap" checked> Swap width and material-specific parts (poles, blades, stainless items) to the matching item for each variant</label>
    </fieldset>
    <div class="warn" id="c-err" hidden></div>
    <div class="row" style="justify-content:space-between"><span class="note">Quantity 0 leaves the part out.</span>
      <div class="row"><button type="button" class="btn" id="c-cancel">Cancel</button><button class="btn primary" type="submit" id="c-save">Save</button></div></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#c-cancel').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const wire=()=>root.querySelectorAll('.crow[data-i]').forEach(r=>{
    const sel=r.querySelector('[data-cp]'),oth=r.querySelector('[data-co]');
    sel.onchange=()=>{oth.hidden=sel.value!=='__other';if(!oth.hidden)oth.focus();const q=r.querySelector('[data-cq]');if(sel.value&&q.value==='0')q.value='1'};
    r.querySelector('[data-cx]').onclick=()=>r.remove();
  });
  wire();
  $('#cadd').onclick=()=>{const d=document.createElement('div');d.innerHTML=rowHTML({partId:'',qty:1});$('#crows').appendChild(d.firstElementChild);wire()};
  $('#cform').onsubmit=async e=>{
    e.preventDefault();const err=$('#c-err');const fail=t=>{err.hidden=false;err.textContent=t};
    const picks=[];
    for(const r of root.querySelectorAll('.crow[data-i]')){
      const sv=r.querySelector('[data-cp]').value;const q=num(r.querySelector('[data-cq]').value);
      if(!sv)continue;
      let id=sv;if(sv==='__other'){const t=r.querySelector('[data-co]').value.trim();if(!t)continue;id=findByNo(t);if(!id)return fail(`No item with code ${t}.`)}
      if(contains(id,vid))return fail(`${pn(id)} contains ${v.partNo}, which would create a loop.`);
      const pm=r.querySelector('[data-cm]').value==='mod';
      picks.push({partId:id,qty:q,perModule:pm?q:0});
    }
    const ap=(root.querySelector('input[name="ap"]:checked')||{}).value||'one';const swap=$('#cswap').checked;
    let targets=[[vid,v]];
    if(ap==='width')targets=all.filter(([,p])=>num(p.width)===num(w));
    if(ap==='mat')targets=all.filter(([,p])=>(p.material||'')===(mat||''));
    if(ap==='all')targets=all;
    const btn=$('#c-save');btn.disabled=true;S.busy=true;let n=0,bad=0,skipped=0;
    for(const [tid,tp] of targets){
      const tm=modulesOf(pr,tp);
      const mine=picks.map(x=>({partId:(swap&&tid!==vid)?equivalent(x.partId,tp,pool):x.partId,qty:x.perModule?(tm!=null?Math.round(x.perModule*tm*1000)/1000:0):x.qty,perModule:x.perModule})).filter(x=>x.qty>0&&!contains(x.partId,tid));
      if(picks.some(x=>x.perModule)&&tm==null)skipped++;
      const merged=[];for(const x of mine){const ex=merged.find(y=>y.partId===x.partId&&!!y.perModule===!!x.perModule);if(ex){ex.qty+=x.qty;ex.perModule+=x.perModule}else merged.push({...x})}
      const keep=kids(tp).filter(c=>(c.role||'Accessories')!==role).map(c=>({...c}));
      const next=[...keep,...merged.map(x=>x.perModule?{partId:x.partId,qty:x.qty,role,perModule:x.perModule}:{partId:x.partId,qty:x.qty,role})];
      if(JSON.stringify(next)===JSON.stringify(kids(tp)))continue;
      n++;btn.textContent=`Saving ${n}…`;
      if(!await putPart(tid,{components:next}))bad++;
    }
    S.busy=false;S.pending=false;close();render();
    toast(bad?`Saved, but ${bad} variant${bad>1?'s':''} failed. Try again.`:(n?`${role} updated on ${n} variant${n>1?'s':''}`:'No changes')+(skipped?` · ${skipped} without a product width got no per-module parts`:''));
  };
}

/* ---------- prices & stock: storage ---------- */
async function patchShard(coll,patch){ // patch: {id:{...fields}}
  const by={};for(const [id,v] of Object.entries(patch)){const sh=coll.slice(0,1)+shardOf(id);(by[sh]=by[sh]||{})[id]=v}
  for(const [sh,items] of Object.entries(by)){
    const ref=S.db.doc(coll+'/'+sh);
    try{await ref.update({items})}
    catch(e){if(e&&e.code==='invalid_argument'){const g=await ref.get();if(g.exists)throw e;await ref.set({items})}else throw e}
  }
}
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));
async function setPrice(id,pr,log){
  const cur=S.price.get(id)||{};const next={...cur,...clean(pr),updatedAt:new Date().toISOString()};
  if(cur.buy===next.buy&&cur.sell===next.sell)return true;
  const buyChanged=pr.buy!==undefined&&num(next.buy)!==buyOf(id);const from=buyOf(id);
  let roll=null;if(log&&buyChanged&&!log.rollup){const r=costRollup(new Map([[id,num(next.buy)]]));roll={rollup:r.slice(0,40).map(x=>({id:x.id,from:+x.before.toFixed(4),to:+x.after.toFixed(4)})),rollupCount:r.length}}
  S.price.set(id,next);costMemo=new Map();
  const ok=await write(()=>patchShard('pricing',{[id]:next}));
  if(ok&&log&&buyChanged){const e={itemId:id,field:'buy',from:from||null,to:num(next.buy),source:log.source||'',rollup:log.rollup||roll?.rollup||[],rollupCount:log.rollupCount??roll?.rollupCount??0,at:new Date().toISOString(),by:S.me||null};S.priceLog.unshift(e);await logPrice([e])}
  return ok;
}
async function setStockFields(patch,ok){
  const p={};for(const [id,v] of Object.entries(patch)){const n={...(S.stock.get(id)||{}),...clean(v),updatedAt:new Date().toISOString()};S.stock.set(id,n);p[id]=n}
  return write(()=>patchShard('stock',p),ok);
}
const monthNow=()=>new Date().toISOString().slice(0,7);
async function moveStock(changes,type,note,ok){ // changes: [{id,qty}] qty signed, or {id,set}
  const now=new Date().toISOString();const patch={};const entries={};
  for(const c of changes){
    const before=onHand(c.id);const after=c.set!=null?num(c.set):before+num(c.qty);
    patch[c.id]={...(S.stock.get(c.id)||{}),onHand:+after.toFixed(4),updatedAt:now};
    const mid=Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    entries[mid]={itemId:c.id,qty:+(after-before).toFixed(4),before,after:+after.toFixed(4),type,note:note||'',at:now,by:S.me||null};
  }
  for(const [id,v] of Object.entries(patch))S.stock.set(id,v);
  const ok1=await write(()=>patchShard('stock',patch));
  if(!ok1)return false;
  const byDoc={};for(const [mid,e] of Object.entries(entries)){const d=monthNow()+'-'+shardOf(e.itemId);(byDoc[d]=byDoc[d]||{})[mid]=e}
  for(const [d,en] of Object.entries(byDoc)){
    const ref=S.db.doc('moves/'+d);
    await write(async()=>{try{await ref.update({entries:en})}catch(e){if(e&&e.code==='invalid_argument'){const g=await ref.get();if(g.exists)throw e;await ref.set({month:monthNow(),entries:en})}else throw e}});
  }
  if(ok)toast(ok);render();return true;
}

/* ---------- prices & stock: item tab ---------- */
const MOVE_LABEL={sold:'Sold',receive:'Received',issue:'Issued',adjust:'Stock count',build:'Built',consume:'Used in build',import:'Imported'};
function stockTabHTML(id){
  const p=S.parts.get(id);const s=stk(id);const wr=canW();const cb=isAsm(p)?canBuild(id):null;
  const mv=S.moves.filter(m=>m.itemId===id).slice(0,40);
  const val=onHand(id)*unitCost(id);
  return `<div class="tiles">
    <div class="tile"><div class="l">On hand</div><div class="big">${s.onHand!=null?qfmt(s.onHand):'—'} ${stTag(id)}</div><div class="note">${s.location?'Location '+esc(s.location):'No location set'}</div></div>
    <div class="tile"><div class="l">Stock value at cost</div><div class="big">${money(val)}</div></div>
    <div class="tile"><div class="l">Margin</div><div class="big">${mfmt(marginPct(id))}</div><div class="note">Sell ${sellOf(id)?money(sellOf(id)):'not set'} vs cost ${money(unitCost(id))}</div></div>
    ${cb!=null?`<div class="tile"><div class="l">Can build from stock</div><div class="big">${qfmt(cb)}</div><div class="note">Limited by direct components on hand</div></div>`:''}
  </div>
  ${wr?`<div class="fgrid4">
    <label class="lb">Buy price ($)<input class="f num" id="sp-buy" type="number" min="0" step="0.01" value="${esc(S.price.get(id)?.buy??'')}" placeholder="${isAsm(p)?esc(bomCost(id).toFixed(2)):''}"></label>
    <label class="lb">Sell price ($)<input class="f num" id="sp-sell" type="number" min="0" step="0.01" value="${esc(S.price.get(id)?.sell??'')}"></label>
    <label class="lb">Minimum stock<input class="f num" id="sp-min" type="number" min="0" step="1" value="${esc(s.min??'')}"></label>
    <label class="lb">Reorder qty<input class="f num" id="sp-re" type="number" min="0" step="1" value="${esc(s.reorder??'')}"></label>
    <label class="lb">Location / bin<input class="f" id="sp-loc" value="${esc(s.location??'')}"></label>
  </div>
  <div class="fgrid4"><label class="lb">Preferred supplier<select class="f" id="sp-sup"><option value="">None</option>${S.suppliers.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${esc(x._id)}" ${prefSup(id)===x._id?'selected':''}>${esc(x.name)}${x.items?.[id]?' ★':''}</option>`).join('')}</select></label>
    <div class="lb">On order<div class="big" style="font-size:20px">${qfmt(onOrder(id))}</div></div>
    <div class="lb" style="align-self:end">${prefSup(id)?'<button class="btn" id="sp-po">Order from preferred supplier</button>':'<span class="note">Pick a supplier to order this item.</span>'}</div></div>
  ${suppliersFor(id).length?`<div class="scroll"><table><thead><tr><th>Supplier</th><th>Their part no.</th><th class="num">Price</th><th class="num">Min order</th><th class="num">Lead days</th></tr></thead><tbody>${suppliersFor(id).map(x=>{const v=x.items[id];return `<tr><td>${esc(x.name)}${prefSup(id)===x._id?' <span class="tag st-ok">Preferred</span>':''}</td><td class="mono">${esc(v.supCode||'')}</td><td class="num">${v.price!=null?money(v.price):'—'}</td><td class="num">${v.moq??''}</td><td class="num">${v.lead??x.lead??''}</td></tr>`}).join('')}</tbody></table></div>`:''}
  <div class="row"><button class="btn primary" data-mv="receive">Receive stock</button><button class="btn" data-mv="issue">Issue / sell</button><button class="btn" data-mv="adjust">Stock count</button>${isAsm(p)?'<button class="btn" data-mv="build">Build from components</button>':''}</div>`:''}
  <div><h2 class="h2" style="margin-bottom:8px">Buy price history</h2>${priceLogHTML('',id)}</div>
  <div><h2 class="h2" style="margin-bottom:8px">Stock movements</h2>
  ${mv.length?`<div class="scroll"><table><thead><tr><th>When</th><th>Type</th><th class="num">Change</th><th class="num">On hand after</th><th>Note</th><th>By</th></tr></thead><tbody>${mv.map(m=>`<tr><td class="note" style="white-space:nowrap">${esc(when(m.at))}</td><td>${esc(MOVE_LABEL[m.type]||m.type)}</td><td class="num ${m.qty<0?'neg':''}">${m.qty>0?'+':''}${qfmt(m.qty)}</td><td class="num">${qfmt(m.after)}</td><td class="note">${esc(m.note||'')}</td><td><span data-uid="${esc(m.by||'')}">…</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="note">No movements in the last 12 months.</div>'}</div>`;
}
function bindStockTab(m,id){
  const f=k=>m.querySelector('#sp-'+k);if(!f('buy'))return;
  const v=el=>el.value===''?null:num(el.value);
  f('buy').onchange=()=>setPrice(id,{buy:v(f('buy'))},{source:'Edited on the item page'}).then(()=>{toast('Buy price saved');render()});
  f('sell').onchange=()=>setPrice(id,{sell:v(f('sell'))}).then(()=>{toast('Sell price saved');render()});
  f('min').onchange=()=>setStockFields({[id]:{min:v(f('min'))}},'Minimum saved').then(render);
  f('re').onchange=()=>setStockFields({[id]:{reorder:v(f('re'))}},'Reorder qty saved').then(render);
  f('loc').onchange=()=>setStockFields({[id]:{location:f('loc').value.trim()}},'Location saved');
  const su=m.querySelector('#sp-sup');if(su)su.onchange=()=>setStockFields({[id]:{supplierId:su.value}},'Preferred supplier saved').then(render);
  const sp=m.querySelector('#sp-po');if(sp)sp.onclick=()=>{const sid=prefSup(id);const s0=stk(id);newPo(sid,[lineFor(sid,id,num(s0.reorder)||Math.max(1,num(s0.min)-onHand(id)))])};
  m.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>moveModal(id,b.dataset.mv));
}
function moveModal(id,type){
  const p=S.parts.get(id);const root=$('#modal-root');
  const title={receive:'Receive stock',issue:'Issue / sell stock',adjust:'Stock count',build:'Build from components'}[type];
  const ls=type==='build'?lines(p):[];
  root.innerHTML=`<div class="modal-back"><form class="modal" id="mvform" novalidate>
    <div><div class="pnum"><span class="mono">${esc(p.partNo)}</span> · ${esc(p.description)}</div><h2>${title}</h2><div class="note">On hand now: <strong>${qfmt(onHand(id))}</strong></div></div>
    <div class="fgrid"><label class="lb">${type==='adjust'?'Counted quantity':'Quantity'}<input class="f num" id="mv-q" type="number" step="any" min="0" value="${type==='adjust'?onHand(id):1}"></label>
      <label class="lb">Note / reference<input class="f" id="mv-n" placeholder="${type==='receive'?'PO or supplier invoice':type==='issue'?'Sales order or job':'Optional'}"></label></div>
    ${type==='build'?`<div class="note">Building takes each direct component out of stock and adds the built quantity to ${esc(p.partNo)}.</div><div class="scroll" style="max-height:36vh"><table><thead><tr><th>Component</th><th class="num">Needed</th><th class="num">On hand</th><th class="num">After</th></tr></thead><tbody id="mv-bom"></tbody></table></div>`:''}
    <div class="warn" id="mv-err" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="mv-cancel">Cancel</button><button class="btn primary" type="submit" id="mv-go">${title}</button></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#mv-cancel').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const drawBom=()=>{const tb=$('#mv-bom');if(!tb)return;const q=num($('#mv-q').value);tb.innerHTML=ls.map(l=>{const need=l.qty*q,oh=onHand(l.partId),af=oh-need;return `<tr><td class="mono">${esc(pn(l.partId))} <span class="note">${esc(baseDesc(S.parts.get(l.partId)))}</span></td><td class="num">${qfmt(need)}</td><td class="num">${qfmt(oh)}</td><td class="num ${af<0?'neg':''}">${qfmt(af)}</td></tr>`}).join('')};
  drawBom();$('#mv-q').oninput=drawBom;$('#mv-q').focus();$('#mv-q').select();
  $('#mvform').onsubmit=async e=>{
    e.preventDefault();const q=num($('#mv-q').value);const note=$('#mv-n').value.trim();const err=$('#mv-err');
    if(type!=='adjust'&&q<=0){err.hidden=false;err.textContent='Enter a quantity above zero.';return}
    $('#mv-go').disabled=true;S.busy=true;let ok;
    if(type==='receive')ok=await moveStock([{id,qty:q}],'receive',note,`Received ${qfmt(q)}`);
    if(type==='issue')ok=await moveStock([{id,qty:-q}],'issue',note,`Issued ${qfmt(q)}`);
    if(type==='adjust')ok=await moveStock([{id,set:q}],'adjust',note,`On hand set to ${qfmt(q)}`);
    if(type==='build'){
      ok=await moveStock(ls.map(l=>({id:l.partId,qty:-l.qty*q})),'consume',(note?note+' · ':'')+'for '+p.partNo);
      if(ok)ok=await moveStock([{id,qty:q}],'build',note,`Built ${qfmt(q)} × ${p.partNo}`);
    }
    S.busy=false;S.pending=false;close();render();
  };
}

/* ---------- manufacturing & sales orders ---------- */
const OSTAT={open:'To build',built:'Built · awaiting dispatch',sold:'Dispatched'};
function orderPlan(pid,qty){
  const avail=new Map();const av=id=>{if(!avail.has(id))avail.set(id,Math.max(0,onHand(id)));return avail.get(id)};
  const pulls=new Map(),short=new Map(),made=new Map();const add=(m,k,v)=>m.set(k,(m.get(k)||0)+v);const stack=new Set();
  const alloc=(id,q,top)=>{
    if(!top){const t=Math.min(av(id),q);if(t>0){avail.set(id,av(id)-t);add(pulls,id,t);q-=t}}
    if(q<=1e-9)return;
    const p=S.parts.get(id);
    if(p&&isAsm(p)&&!stack.has(id)){stack.add(id);for(const l of lines(p))alloc(l.partId,q*l.qty,false);stack.delete(id);if(!top)add(made,id,q)}
    else add(short,id,q);
  };
  alloc(pid,qty,true);
  let cost=0;for(const [id,q] of pulls)cost+=q*unitCost(id);
  return {pulls,short,made,cost};
}
const nextOrderNo=()=>{let mx=0;for(const o of S.orders){const n=parseInt(String(o.no||'').replace(/\D/g,''),10);if(n>mx)mx=n}return 'MO-'+String(mx+1).padStart(4,'0')};
function ordersHTML(){
  const wr=canW();const q=S.oq.toLowerCase();
  const all=S.orders.slice().sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true}));
  const list=all.filter(o=>o.status===S.otab&&(!q||[o.no,S.deals.find(x=>x._id===o.dealId)?.no,o.customer,o.ref,pn(o.itemId),S.parts.get(o.itemId)?.description].join(' ').toLowerCase().includes(q)));
  const cnt=k=>all.filter(o=>o.status===k).length;
  let fgQty=0,fgVal=0;for(const [id,p] of S.parts)if(p.level==='Product'&&onHand(id)>0){fgQty+=onHand(id);fgVal+=onHand(id)*unitCost(id)}
  const m0=new Date().toISOString().slice(0,7);const soldM=all.filter(o=>o.status==='sold'&&String(o.soldAt||'').startsWith(m0));
  const rev=soldM.reduce((a,o)=>a+num(o.sellTotal),0),cst=soldM.reduce((a,o)=>a+num(o.costTotal),0);
  const sel=S.orders.find(o=>o._id===S.sel);
  return `<section class="panel"><div class="head">
    <div class="head-top"><div style="flex:1"><div class="pnum">Build orders raised from sales at Start production</div><h1>Orders</h1></div>
      <div class="row">${S.downloads?'<button class="btn" id="exp-orders">Export</button>':''}</div></div>
    <div class="tiles">
      <div class="tile"><div class="l">Open orders</div><div class="big">${cnt('open')}</div></div>
      <div class="tile"><div class="l">Finished products on hand</div><div class="big">${qfmt(fgQty)}</div><div class="note">${money(fgVal)} at cost</div></div>
      <div class="tile"><div class="l">Dispatched this month</div><div class="big">${money(rev)}</div><div class="note">${soldM.length} order${soldM.length===1?'':'s'} · margin ${rev?mfmt((rev-cst)/rev*100):'—'}</div></div>
    </div>
    <div class="row"><div class="chips">${Object.entries(OSTAT).map(([k,l])=>`<button class="chip" data-otab="${k}" aria-pressed="${S.otab===k}">${l} (${cnt(k)})</button>`).join('')}</div>
      <input class="f" id="o-q" type="search" placeholder="Search sale no., order, customer, PO or item" style="max-width:320px" value="${esc(S.oq)}"></div>
  </div>
  <div class="tabbody">
    ${!list.length?`<div class="empty"><strong>No ${OSTAT[S.otab].toLowerCase()} orders</strong>${S.otab==='open'?'Build orders are raised from a sale: open the sale in Sales and use Start production after the customer PO is received.':''}</div>`:`<div class="scroll"><table><thead><tr><th>Sale no.</th><th>Order</th><th>Product</th><th>Description</th><th class="num">Qty</th><th>Customer</th><th>Reference</th><th class="num">Sell total</th><th>${S.otab==='sold'?'Sold':S.otab==='built'?'Built':'Created'}</th><th></th></tr></thead>
    <tbody>${list.map(o=>{const p=S.parts.get(o.itemId);return `<tr ${o._id===S.sel?'class="selrow"':''}><td>${(()=>{const dd=S.deals.find(x=>x._id===o.dealId);return dd?`<button class="link mono" data-odeal="${esc(dd._id)}">${esc(dd.no)}</button>`:'<span class="tag st-low">No sale</span>'})()}</td><td><button class="link mono" data-osel="${esc(o._id)}">${esc(o.no)}</button></td><td><button class="link mono" data-go="${esc(o.itemId)}">${esc(p?.partNo||o.itemId)}</button></td><td class="desc">${esc(p?.description||'')}</td><td class="num">${qfmt(o.qty)}</td><td>${esc(o.customer||'')}</td><td class="note">${esc(o.ref||'')}</td><td class="num">${money(num(o.sell)*num(o.qty))}</td><td class="note" style="white-space:nowrap">${esc(when(o.status==='sold'?o.soldAt:o.status==='built'?o.builtAt:o.createdAt))}</td><td><button class="btn small" data-osel="${esc(o._id)}">Open</button></td></tr>`}).join('')}</tbody></table></div>`}
    ${sel?orderDetailHTML(sel):''}
  </div></section>`;
}
function orderDetailHTML(o){
  const p=S.parts.get(o.itemId);const wr=canW();
  let plan='';
  if(o.status==='open'&&p){
    const pl=orderPlan(o.itemId,num(o.qty));const sh=[...pl.short.entries()];
    plan=`<h2 class="h2">Build plan</h2>
    <div class="note">Building ${qfmt(o.qty)} × ${esc(p.partNo)} pulls these items from stock. Parts and components already on hand are used first; anything short is built from its own BOM where it has one.</div>
    ${sh.length?`<div class="warn">${sh.length} item${sh.length>1?'s are':' is'} short: ${sh.slice(0,6).map(([id,q])=>`${esc(pn(id))} ×${qfmt(q)}`).join(', ')}${sh.length>6?'…':''}. Receive them first, or build anyway and let stock go negative.</div>`:''}
    <div class="scroll" style="max-height:40vh"><table><thead><tr><th>Item code</th><th>Level</th><th>Description</th><th class="num">Pull from stock</th><th class="num">On hand</th><th class="num">After</th><th class="num">Short</th></tr></thead><tbody>
    ${[...new Set([...pl.pulls.keys(),...pl.short.keys()])].map(id=>{const c=S.parts.get(id)||{};const pq=pl.pulls.get(id)||0,sq=pl.short.get(id)||0;return `<tr><td><button class="link mono" data-go="${esc(id)}">${esc(c.partNo||id)}</button></td><td>${lvTag(c)}</td><td class="desc">${esc(c.description||'')}</td><td class="num">${qfmt(pq+sq)}</td><td class="num">${qfmt(onHand(id))}</td><td class="num ${sq?'neg':''}">${qfmt(onHand(id)-pq-sq)}</td><td class="num neg">${sq?qfmt(sq):''}</td></tr>`}).join('')||'<tr><td colspan="7" class="note">This product has no BOM yet.</td></tr>'}
    </tbody></table></div>
    <div class="note">Material cost of this build: <strong>${money(pl.cost)}</strong>${pl.made.size?` · ${pl.made.size} sub-assembl${pl.made.size>1?'ies':'y'} built on the way`:''}</div>`;
  }
  const oh=onHand(o.itemId);
  return `<div class="odetail">
    <div class="head-top"><div style="flex:1"><div class="pnum">${esc(OSTAT[o.status])} · created ${esc(when(o.createdAt))}</div><h2 class="h2" style="font-size:24px">${esc(o.no)} · ${qfmt(o.qty)} × <span class="mono">${esc(p?.partNo||o.itemId)}</span></h2><div>${esc(p?.description||'')}</div></div>
      <div class="row">${S.downloads?'<button class="btn small" id="o-sheet">Build sheet (Word)</button>':''}<button class="btn small" id="o-close">Close</button></div></div>
    <dl class="kv"><div><dt>Sale no.</dt><dd>${(()=>{const dd=S.deals.find(x=>x._id===o.dealId);return dd?`<button class="link mono" data-odeal="${esc(dd._id)}">${esc(dd.no)}</button> <span class="tag stg-${dd.stage}">${esc(STG[dd.stage])}</span>`:'<span class="tag st-low">Not linked to a sale</span>'})()}</dd></div><div><dt>Customer</dt><dd>${esc(o.customer||'—')}</dd></div><div><dt>Customer PO</dt><dd>${esc(o.ref||'—')}</dd></div><div><dt>Due</dt><dd>${esc(o.due||'—')}</dd></div>
      <div><dt>Sell price each</dt><dd>${money(o.sell)}</dd></div><div><dt>Sell total</dt><dd>${money(num(o.sell)*num(o.qty))}</dd></div>
      ${o.costTotal!=null?`<div><dt>Build cost</dt><dd>${money(o.costTotal)}</dd></div><div><dt>Margin</dt><dd>${o.sell?mfmt((num(o.sell)*num(o.qty)-num(o.costTotal))/(num(o.sell)*num(o.qty))*100):'—'}</dd></div>`:''}
      <div><dt>Product on hand</dt><dd>${qfmt(oh)}</dd></div></dl>
    ${o.notes?`<div class="note">${esc(o.notes)}</div>`:''}
    ${plan}
    ${wr&&o.status!=='sold'?`<div class="row">
      ${o.status==='open'?`<button class="btn primary" data-oact="build">Build ${qfmt(o.qty)} into stock</button><label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="o-force"> Build even if short</label><span class="spacer"></span><button class="btn danger" data-oact="delete">Cancel build order</button>`:''}
      ${o.status==='built'?`<span class="note">Built and on hand. It leaves stock on the sale’s delivery docket when the sale is dispatched.</span>`:''}
    </div>`:''}
    ${o.status==='sold'?`<div class="note">Dispatched ${esc(when(o.soldAt))} on the sale’s delivery docket.</div>`:''}
  </div>`;
}
function bindOrders(){
  const m=$('#main');bindCommon(m);
  m.querySelectorAll('[data-otab]').forEach(b=>b.onclick=()=>{S.otab=b.dataset.otab;S.sel=null;renderMain()});
  const oq=$('#o-q');oq.oninput=()=>{S.oq=oq.value;const pos=oq.selectionStart;renderMain();const n=$('#o-q');n.focus();n.setSelectionRange(pos,pos)};
  m.querySelectorAll('[data-osel]').forEach(b=>b.onclick=()=>{S.sel=b.dataset.osel;renderMain();const d=m.querySelector('.odetail');if(d)d.scrollIntoView({block:'nearest'})});
  const c=$('#o-close');if(c)c.onclick=()=>{S.sel=null;renderMain()};
  const bs=$('#o-sheet');if(bs)bs.onclick=()=>docDialog(specBuild(S.orders.find(o=>o._id===S.sel)));
  m.querySelectorAll('[data-odeal]').forEach(b=>b.onclick=()=>{S.view='sales';setViewBtns();render();drawDeal(b.dataset.odeal)});
  const ex=$('#exp-orders');if(ex)ex.onclick=exportOrders;
  m.querySelectorAll('[data-oact]').forEach(b=>b.onclick=()=>orderAction(S.sel,b.dataset.oact,b));
}
async function orderAction(oid,act,btn){
  const o=S.orders.find(x=>x._id===oid);if(!o)return;const p=S.parts.get(o.itemId);const q=num(o.qty);const now=new Date().toISOString();
  const ref=S.db.doc('orders/'+oid);const dl0=S.deals.find(x=>x._id===o.dealId);const tag=`${dl0?dl0.no+' · ':''}${o.no}${o.customer?' · '+o.customer:''}`;
  if(act==='delete'){if(!btn.classList.contains('armed')){btn.classList.add('armed');btn.textContent='Click again to delete';return}
    if(await write(()=>ref.delete(),'Build order cancelled')){S.orders=S.orders.filter(x=>x._id!==oid);S.sel=null;if(dl0)await saveDeal(dl0._id,{},`Build order ${o.no} cancelled`);render()}return}
  const doBuild=async()=>{
    const pl=orderPlan(o.itemId,q);
    if(pl.short.size&&!$('#o-force')?.checked){toast('Some items are short. Receive them first, or tick “Build even if short”.');return false}
    const ch=[...pl.pulls.entries()].map(([id,x])=>({id,qty:-x})).concat([...pl.short.entries()].map(([id,x])=>({id,qty:-x})));
    if(ch.length&&!await moveStock(ch,'consume','Order '+tag))return false;
    if(!await moveStock([{id:o.itemId,qty:q}],'build','Order '+tag))return false;
    const up={status:'built',builtAt:now,costTotal:+pl.cost.toFixed(2),pulled:Object.fromEntries([...pl.pulls,...pl.short].map(([k,v])=>[k,+v.toFixed(4)]))};
    Object.assign(o,up);return write(()=>ref.update(up));
  };
  const doSell=async()=>{
    if(!await moveStock([{id:o.itemId,qty:-q}],'sold','Order '+tag))return false;
    const up={status:'sold',soldAt:now,sellTotal:+(num(o.sell)*q).toFixed(2)};
    if(o.costTotal==null)up.costTotal=+(unitCost(o.itemId)*q).toFixed(2);
    Object.assign(o,up);return write(()=>ref.update(up));
  };
  btn.disabled=true;S.busy=true;let ok=false;
  if(act==='build')ok=await doBuild();
  if(act==='buildsell')ok=await doBuild()&&await doSell();
  if(act==='sell'||act==='sellstock')ok=await doSell();
  S.busy=false;S.pending=false;
  if(ok){S.otab=o.status;toast(o.status==='sold'?`${o.no} sold: ${qfmt(q)} × ${p?.partNo} removed from stock`:`${o.no} built: ${qfmt(q)} × ${p?.partNo} added to products on hand`)}
  render();
}
function orderModal(pid){
  if(!canW())return;
  const root=$('#modal-root');const no=nextOrderNo();
  const prods=sortedParts().filter(([,p])=>isAsm(p)||p.level==='Product');
  root.innerHTML=`<div class="modal-back"><form class="modal" id="oform" novalidate>
    <div><div class="pnum mono">${esc(no)}</div><h2>New manufacturing &amp; sales order</h2></div>
    <div class="fgrid">
      <label class="lb full">Product (item code)<input class="f mono" id="of-item" list="of-list" value="${pid?esc(pn(pid)):''}" placeholder="Type an item code or ordering no."><datalist id="of-list">${prods.slice(0,1500).map(([id,p])=>`<option value="${esc(p.partNo)}">${esc(p.orderNo||'')} ${esc(p.description)}${isAsm(p)?'':' (no BOM yet)'}</option>`).join('')}</datalist></label>
      <div class="full note" id="of-desc"></div>
      <label class="lb">Quantity<input class="f num" id="of-q" type="number" min="1" step="1" value="1"></label>
      <label class="lb">Sell price each ($)<input class="f num" id="of-sell" type="number" min="0" step="0.01" value="${pid&&sellOf(pid)?sellOf(pid):''}"></label>
      <label class="lb">Customer<input class="f" id="of-cust"></label>
      <label class="lb">Customer PO / reference<input class="f" id="of-ref"></label>
      <label class="lb">Due date<input class="f" id="of-due" type="date"></label>
      <label class="lb full">Notes<textarea class="f" id="of-notes" rows="2"></textarea></label>
    </div>
    <div class="warn" id="of-err" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="of-cancel">Cancel</button><button class="btn primary" type="submit">Create order</button></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#of-cancel').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const desc=()=>{const id=findByNo($('#of-item').value);const p=id&&S.parts.get(id);$('#of-desc').textContent=p?`${p.description} · on hand ${qfmt(onHand(id))}${isAsm(p)?'':' · no BOM yet, so building pulls nothing'}`:'';if(p&&!$('#of-sell').value&&sellOf(id))$('#of-sell').value=sellOf(id)};
  $('#of-item').oninput=desc;desc();(pid?$('#of-q'):$('#of-item')).focus();
  $('#oform').onsubmit=async e=>{
    e.preventDefault();const err=$('#of-err');const id=findByNo($('#of-item').value);const q=num($('#of-q').value);
    if(!id){err.hidden=false;err.textContent='Choose a product by its item code.';return}
    if(q<=0){err.hidden=false;err.textContent='Enter a quantity above zero.';return}
    const o={no,itemId:id,qty:q,sell:num($('#of-sell').value),customer:$('#of-cust').value.trim(),ref:$('#of-ref').value.trim(),due:$('#of-due').value,notes:$('#of-notes').value.trim(),status:'open',createdAt:new Date().toISOString(),createdBy:S.me||null};
    if(await write(()=>S.db.doc('orders/'+no).set(o),`Order ${no} created`)){S.orders.push({...o,_id:no});S.sel=no;S.otab='open';S.view='orders';close();setViewBtns();render()}
  };
}
async function exportOrders(){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  const rows=S.orders.slice().sort((a,b)=>String(a.no).localeCompare(String(b.no),undefined,{numeric:true})).map(o=>{const p=S.parts.get(o.itemId)||{};return {Order:o.no,Status:OSTAT[o.status]||o.status,'Item code':p.partNo||o.itemId,'Ordering no.':p.orderNo||'',Description:p.description||'',Qty:o.qty,Customer:o.customer||'',Reference:o.ref||'',Due:o.due||'','Sell each':o.sell||'','Sell total':num(o.sell)*num(o.qty),'Build cost':o.costTotal??'',Created:o.createdAt||'',Built:o.builtAt||'',Sold:o.soldAt||''}});
  sheet(wb,rows,'Orders',[10,14,12,18,44,6,20,16,11,10,11,11,20,20,20]);
  await saveWb(wb,`orders_${stamp(new Date().toISOString())}.xlsx`);
}

/* ---------- prices & stock: overview ---------- */
function stockRows(){
  const q=S.sq.toLowerCase();
  return sortedParts().filter(([id,p])=>{
    if(S.slv!=='all'&&p.level!==S.slv)return false;
    if(q&&!(String(p.partNo).toLowerCase().includes(q)||String(p.orderNo).toLowerCase().includes(q)||String(p.description).toLowerCase().includes(q)))return false;
    const st=stockStatus(id);
    if(S.sf==='low')return st==='low'||st==='out';
    if(S.sf==='stocked')return stk(id).onHand!=null;
    if(S.sf==='noprice')return !buyOf(id)||!sellOf(id);
    return true;
  });
}
function stockViewHTML(){
  _oo=null;const rows=stockRows();const wr=canW();
  let val=0,low=0,priced=0;for(const [id] of S.parts){val+=Math.max(0,onHand(id))*unitCost(id);const st=stockStatus(id);if(st==='low'||st==='out')low++;if(buyOf(id)&&sellOf(id))priced++}
  const shown=rows.slice(0,LIST_MAX);
  return `<section class="panel"><div class="head">
    <div class="head-top"><div style="flex:1"><div class="pnum">All items</div><h1>Stock &amp; prices</h1></div>
      <div class="row">${wr?'<label class="btn" for="imp-file">Import prices &amp; stock</label><input type="file" id="imp-file" accept=".xlsx,.xls,.csv" hidden>':''}${S.downloads?'<button class="btn" id="exp-stock">Export</button><button class="btn" id="exp-reorder">Reorder list</button>':''}</div></div>
    <div class="tiles">
      <div class="tile"><div class="l">Stock value at cost</div><div class="big">${money(val)}</div></div>
      <div class="tile"><div class="l">Below minimum or out</div><div class="big ${low?'neg':''}">${low}</div></div>
      <div class="tile"><div class="l">Items with buy and sell price</div><div class="big">${priced.toLocaleString()} <span class="note">of ${S.parts.size.toLocaleString()}</span></div></div>
    </div>
    <div class="row"><input class="f" id="s-q" type="search" placeholder="Search item code, ordering no. or description" style="max-width:340px" value="${esc(S.sq)}">
      <div class="chips">${[['all','All'],['low','Below minimum'],['stocked','In stock list'],['noprice','Missing a price']].map(([k,l])=>`<button class="chip" data-sf="${k}" aria-pressed="${S.sf===k}">${l}</button>`).join('')}</div>
      <div class="chips">${['all',...LEVELS].map(l=>`<button class="chip" data-slv="${l}" aria-pressed="${S.slv===l}">${l==='all'?'All levels':l+'s'}</button>`).join('')}</div></div>
  </div>
  <div class="tabbody">
    <div class="note">${wr?'Type in a cell and press Tab or Enter to save. Import a spreadsheet with an <span class="mono">Item code</span> column plus any of <span class="mono">Buy price, Sell price, On hand, Min level, Reorder qty, Location</span> to update many items at once; Export gives you a file in that layout.':''}</div>
    <div class="scroll"><table class="stk-t"><thead><tr><th>Item code</th><th>Level</th><th>Description</th><th class="num">Buy</th><th class="num">Sell</th><th class="num">Margin</th><th class="num">On hand</th><th class="num">On order</th><th class="num">Min</th><th class="num">Reorder qty</th><th>Status</th><th class="num">Value</th>${wr?'<th></th>':''}</tr></thead>
    <tbody>${shown.map(([id,p])=>{const s=stk(id);const pr=S.price.get(id)||{};const inp=(k,v,ph)=>wr?`<input class="f num cellin" data-k="${k}" data-id="${esc(id)}" type="number" min="0" step="any" value="${esc(v??'')}" placeholder="${esc(ph??'')}" aria-label="${k} for ${esc(p.partNo)}">`:esc(v??'—');
      return `<tr><td><button class="link mono" data-go="${esc(id)}" data-gotab="stock">${esc(p.partNo)}</button></td><td>${lvTag(p)}</td><td class="desc">${esc(p.description)}</td>
      <td class="num">${inp('buy',pr.buy,isAsm(p)?bomCost(id).toFixed(2):'')}</td><td class="num">${inp('sell',pr.sell)}</td><td class="num">${mfmt(marginPct(id))}</td>
      <td class="num">${s.onHand!=null?qfmt(s.onHand):'—'}</td><td class="num">${onOrder(id)?qfmt(onOrder(id)):''}</td><td class="num">${inp('min',s.min)}</td><td class="num">${inp('reorder',s.reorder)}</td><td>${stTag(id)}</td>
      <td class="num">${s.onHand?money(Math.max(0,onHand(id))*unitCost(id)):''}</td>
      ${wr?`<td style="white-space:nowrap"><button class="btn small" data-mvq="receive" data-id="${esc(id)}" title="Receive">+</button> <button class="btn small" data-mvq="issue" data-id="${esc(id)}" title="Issue">−</button> <button class="btn small" data-mvq="adjust" data-id="${esc(id)}" title="Stock count">=</button></td>`:''}</tr>`}).join('')}</tbody></table></div>
    ${rows.length>LIST_MAX?`<div class="note">Showing ${LIST_MAX} of ${rows.length.toLocaleString()} items. Search or filter to narrow the list.</div>`:''}
  </div></section>`;
}
function bindStockView(){
  const m=$('#main');bindCommon(m);
  const sq=$('#s-q');sq.oninput=()=>{S.sq=sq.value;const pos=sq.selectionStart;renderMain();const n=$('#s-q');n.focus();n.setSelectionRange(pos,pos)};
  m.querySelectorAll('[data-sf]').forEach(b=>b.onclick=()=>{S.sf=b.dataset.sf;renderMain()});
  m.querySelectorAll('[data-slv]').forEach(b=>b.onclick=()=>{S.slv=b.dataset.slv;renderMain()});
  m.querySelectorAll('.cellin').forEach(i=>i.onchange=()=>{const id=i.dataset.id,k=i.dataset.k,v=i.value===''?null:num(i.value);
    if(k==='buy'||k==='sell')setPrice(id,{[k]:v},k==='buy'?{source:'Edited in the stock list'}:null).then(()=>toast('Saved'));else setStockFields({[id]:{[k]:v}},'Saved')});
  m.querySelectorAll('[data-mvq]').forEach(b=>b.onclick=()=>moveModal(b.dataset.id,b.dataset.mvq));
  const f=$('#imp-file');if(f)f.onchange=()=>{if(f.files[0])importStock(f.files[0]);f.value=''};
  const es=$('#exp-stock');if(es)es.onclick=exportStock;
  const er=$('#exp-reorder');if(er)er.onclick=exportReorder;
}
const stockRow=([id,p])=>{const s=stk(id);const pr=S.price.get(id)||{};return {'Item code':p.partNo,'Ordering no.':p.orderNo||'',Level:p.level||'',Description:p.description,'Buy price':pr.buy??'','Sell price':pr.sell??'','BOM cost':isAsm(p)?+bomCost(id).toFixed(2):'','Margin %':marginPct(id)==null?'':+marginPct(id).toFixed(1),'On hand':s.onHand??'','Min level':s.min??'','Reorder qty':s.reorder??'',Location:s.location||'','Stock value':s.onHand?+(Math.max(0,onHand(id))*unitCost(id)).toFixed(2):''}};
async function exportStock(){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  sheet(wb,stockRows().map(stockRow),'Stock & prices',[12,18,10,48,10,10,10,8,8,8,8,12,12]);
  await saveWb(wb,`stock-and-prices_${stamp(new Date().toISOString())}.xlsx`);
}
async function exportReorder(){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  const rows=sortedParts().filter(([id])=>['low','out'].includes(stockStatus(id))).map(([id,p])=>{const s=stk(id);const need=Math.max(0,Math.max(num(s.reorder),num(s.min)-onHand(id))-onOrder(id));return {'Item code':p.partNo,'Ordering no.':p.orderNo||'',Description:p.description,Supplier:supName(prefSup(id))||p.supplier||'','On hand':onHand(id),'On order':onOrder(id),'Min level':num(s.min),'Order qty':need,'Buy price':buyOf(id),'Order value':+(need*buyOf(id)).toFixed(2)}});
  sheet(wb,rows,'Reorder list',[12,18,48,20,8,8,9,10,11]);
  await saveWb(wb,`reorder-list_${stamp(new Date().toISOString())}.xlsx`);
}
async function importStock(file){
  if(!xlsxReady())return;
  let rows;try{const wb=XLSX.read(await file.arrayBuffer());rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''})}catch(e){toast('Could not read that file.');return}
  const key=(r,...names)=>{for(const k of Object.keys(r)){const n=k.toLowerCase().replace(/[^a-z]/g,'');if(names.includes(n))return r[k]}return undefined};
  const pp={},sp={},moves=[];let matched=0,unknown=[];
  for(const r of rows){
    const code=String(key(r,'itemcode','code','item')??'').trim();if(!code)continue;
    const id=findByNo(code);if(!id){unknown.push(code);continue}matched++;
    const nv=v=>v===undefined||v===''?undefined:num(v);
    const b=nv(key(r,'buyprice','buy','cost','costprice')),se=nv(key(r,'sellprice','sell','price','sellingprice'));
    if(b!==undefined||se!==undefined)pp[id]={...(S.price.get(id)||{}),...clean({buy:b,sell:se}),updatedAt:new Date().toISOString()};
    const mn=nv(key(r,'minlevel','min','minimum','minstock')),re=nv(key(r,'reorderqty','reorder')),loc=key(r,'location','bin');
    const oh=nv(key(r,'onhand','stock','qty','quantity'));
    if(mn!==undefined||re!==undefined||(loc!==undefined&&loc!==''))sp[id]=clean({min:mn,reorder:re,location:loc===undefined||loc===''?undefined:String(loc)});
    if(oh!==undefined&&oh!==onHand(id))moves.push({id,set:oh});
  }
  if(!matched){toast('No rows matched an item code. Check the file has an "Item code" column.');return}
  S.busy=true;toast(`Importing ${matched} rows…`);
  let ok=true;
  if(Object.keys(pp).length){for(const [id,v] of Object.entries(pp))S.price.set(id,v);ok=await write(()=>patchShard('pricing',pp))&&ok}
  if(Object.keys(sp).length)ok=await setStockFields(sp)&&ok;
  if(moves.length)ok=await moveStock(moves,'import','Imported from '+file.name)&&ok;
  S.busy=false;S.pending=false;costMemo=new Map();render();
  toast((ok?`Imported ${matched} item${matched>1?'s':''}`:'Import finished with errors')+(unknown.length?` · ${unknown.length} code${unknown.length>1?'s':''} not found (${unknown.slice(0,3).join(', ')}${unknown.length>3?'…':''})`:''));
}

/* ---------- range building: product types, variants, specs, import ---------- */
const slugId=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const newPid=name=>'p-'+slugId(name)+'-'+Math.random().toString(36).slice(2,6);
const allCats=()=>[...new Set([...[...S.products.values()].map(p=>p.category),...[...S.parts.values()].map(p=>p.category)].filter(Boolean))].sort();
const codeTaken=(code,except)=>[...S.parts.entries()].some(([k,x])=>k!==except&&String(x.partNo).toLowerCase()===String(code).toLowerCase());
const autoDesc=(pr,v)=>[pr?.name||'',v.width?v.width+' mm':'',v.attrs?.['Arm Size']?'Arm '+v.attrs['Arm Size']:'',String(v.material||'').replace('Mild Steel','Mild steel').replace('Stainless Steel','Stainless')].filter(Boolean).join(' · ');
const safeKey=k=>String(k).trim().replace(/[.\/\[\]#$]/g,' ').replace(/\s+/g,' ').slice(0,60);

function productTypeModal(pid){
  if(!canW())return;const pr=pid?S.products.get(pid):{roles:DEF_ROLES.slice(),attrCols:['Tip Width (mm)','Pole Length (mm)','Pole Dia (mm)'],moduleWidth:0};
  const root=$('#modal-root');const cats=allCats();
  root.innerHTML=`<div class="modal-back"><form class="modal" id="ptform" novalidate>
    <h2>${pid?'Edit product type':'New product type'}</h2>
    <div class="fgrid">
      <label class="lb full">Name *<input class="f" id="pt-name" value="${esc(pr.name||'')}" placeholder="e.g. Profiler PX Primary Cleaner"></label>
      <label class="lb">Category<input class="f" id="pt-cat" list="pt-cats" value="${esc(pr.category||'Primary Belt Cleaners')}"><datalist id="pt-cats">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="lb">Module width (mm)<select class="f" id="pt-mod">${[[0,'Not modular'],[100,'100'],[150,'150 (secondary)'],[200,'200 (primary)'],[250,'250'],[300,'300']].map(([v,l])=>`<option value="${v}" ${num(pr.moduleWidth)===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="lb full">Spec columns for its variants<input class="f" id="pt-cols" value="${esc((pr.attrCols||[]).join(', '))}" placeholder="e.g. Tip Width (mm), Pole Length (mm), Pole Dia (mm), Arm Size"><span class="note">Comma separated. These become fields on every variant and columns in the matrix and exports.</span></label>
      <label class="lb full">Matrix columns (roles)<input class="f" id="pt-roles" value="${esc((pr.roles||DEF_ROLES).join(', '))}"></label>
      <label class="lb full">Notes<textarea class="f" id="pt-notes" rows="2">${esc(pr.notes||'')}</textarea></label>
      ${pid?'':`<label class="lb full">Start by copying variants from<select class="f" id="pt-copy"><option value="">Nothing, start empty</option>${[...S.products.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([k,p])=>`<option value="${esc(k)}">${esc(p.name)} (${(p.variantIds||[]).length} variants)</option>`).join('')}</select><span class="note">Copies widths, versions, specs, spare-part links and matrix, with temporary item codes to replace.</span></label>`}
    </div>
    <div class="warn" id="pt-err" hidden></div>
    <div class="row" style="justify-content:space-between"><div>${pid&&!(pr.variantIds||[]).length?'<button type="button" class="btn danger" id="pt-del">Delete product type</button>':''}</div><div class="row"><button type="button" class="btn" id="pt-c">Cancel</button><button class="btn primary" type="submit" id="pt-go">${pid?'Save':'Create product type'}</button></div></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#pt-c').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const del=$('#pt-del');if(del)del.onclick=async()=>{if(!del.classList.contains('armed')){del.classList.add('armed');del.textContent='Click again to delete';return}
    if(await putProduct(pid,{deleted:true},'Product type deleted')){S.product=null;close();render()}};
  $('#ptform').onsubmit=async e=>{
    e.preventDefault();const name=$('#pt-name').value.trim();if(!name){const er=$('#pt-err');er.hidden=false;er.textContent='Name is required.';return}
    const patch={name,category:$('#pt-cat').value.trim()||'Other',moduleWidth:num($('#pt-mod').value),attrCols:$('#pt-cols').value.split(',').map(safeKey).filter(Boolean),roles:$('#pt-roles').value.split(',').map(x=>x.trim()).filter(Boolean),notes:$('#pt-notes').value.trim()};
    if(!patch.roles.length)patch.roles=DEF_ROLES.slice();
    $('#pt-go').disabled=true;
    if(pid){if(await putProduct(pid,patch,'Product type saved')){close();render()}return}
    const id=newPid(name);const src=$('#pt-copy')?.value;
    if(!src){if(await putProduct(id,{...patch,variantIds:[],spareIds:[],custom:true,createdAt:new Date().toISOString()},`${name} created`)){close();selectProduct(id);S.ptab='variants';render()}return}
    const sp=S.products.get(src);S.busy=true;const vids=[];const tag=slugId(name).toUpperCase().slice(0,12);
    for(const [vid,v] of prodVariants(sp)){
      let code=`TMP-${tag}-${v.width||''}-${(v.attrs?.['Arm Size']||'')}-${shortMat(v.material)||'V'}`.replace(/-+/g,'-').replace(/-$/,'');let k=code,n=2;while(S.parts.has(k)||vids.includes(k)){k=code+'-'+n;n++}
      const nv={...v};delete nv.catalog;
      Object.assign(nv,{partNo:k,orderNo:'',description:autoDesc({name},v),productIds:[id],tempCode:true,copiedFrom:vid,sourcePage:'',components:kids(v).map(c=>({...c})),createdAt:new Date().toISOString(),createdBy:S.me||null});
      if(await putPart(k,nv))vids.push(k);
    }
    for(const s0 of sp.spareIds||[]){const x=S.parts.get(s0);if(x&&!(x.productIds||[]).includes(id))await putPart(s0,{productIds:[...(x.productIds||[]),id]})}
    await putProduct(id,{...patch,variantIds:vids,spareIds:[...(sp.spareIds||[])],copiedFrom:src,custom:true,createdAt:new Date().toISOString()},`${name} created with ${vids.length} variants`);
    S.busy=false;S.pending=false;close();selectProduct(id);S.ptab='variants';render();
  };
}

function variantsHTML(pr){
  const wr=canW();const vs=prodVariants(pr).sort(vSort);const cols=pr.attrCols||[];
  return `<div class="row" style="justify-content:space-between"><div class="note">Every variant is its own item with its own item code. Edit specs here; the component matrix uses the same variants.</div>
    ${wr?'<div class="row"><button class="btn primary" id="v-add">+ Add variant</button><button class="btn" id="v-imp">Import variants from Excel</button><button class="btn" id="v-tpl">Download template</button></div>':''}</div>
  ${vs.length?`<div class="scroll"><table class="stk-t"><thead><tr><th>Item code</th><th>Ordering no.</th><th class="num">Belt width</th><th>Version</th>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th class="num">Weight</th><th>Docs</th>${wr?'<th></th>':''}</tr></thead>
    <tbody>${vs.map(([id,p])=>{const dc=docCount(id);return `<tr><td><button class="link mono" data-go="${esc(id)}">${esc(p.partNo)}</button>${tmpTag(p)}</td><td class="mono note">${esc(p.orderNo||'')}</td><td class="num">${esc(p.width??'')}</td><td>${esc(p.material||'')}</td>${cols.map(c=>`<td>${esc(p.attrs?.[c]||'')}</td>`).join('')}<td class="num">${esc(p.weight||'')}</td>
      <td><span class="dts">${['GA','MFR','IIOM'].map(t=>`<span class="dt ${dc[t]?'on':''}">${t}</span>`).join('')}</span></td>
      ${wr?`<td style="white-space:nowrap"><button class="btn small" data-vedit="${esc(id)}">Edit</button> <button class="btn small" data-vcopy="${esc(id)}" title="New variant based on this one">Copy</button> <button class="btn small danger" data-vrm="${esc(id)}">Remove</button></td>`:''}</tr>`}).join('')}</tbody></table></div>`
  :`<div class="empty"><strong>No variants yet</strong>Add each belt width and version as a variant with its own item code, or import them from a spreadsheet.</div>`}`;
}
function variantModal(pid,vid,copyFrom){
  if(!canW())return;const pr=S.products.get(pid);const base=vid?S.parts.get(vid):copyFrom?S.parts.get(copyFrom):{attrs:{},material:prodMats(pr)[0]||'Mild Steel'};
  const cols=[...new Set([...(pr.attrCols||[]),...Object.keys(base.attrs||{}).filter(k=>!/weigh/i.test(k))])];
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-back"><form class="modal" id="vform" novalidate>
    <div><div class="pnum">${esc(pr.name)}</div><h2>${vid?'Edit variant '+esc(base.partNo):copyFrom?'New variant (copy of '+esc(base.partNo)+')':'New variant'}</h2></div>
    <div class="fgrid">
      <label class="lb">Item code *<input class="f mono" id="vf-code" inputmode="numeric" value="${vid?esc(base.partNo):''}" ${vid&&!base.tempCode?'readonly title="Item codes are fixed once created"':''} placeholder="e.g. 8110301"></label>
      <label class="lb">Ordering no.<input class="f mono" id="vf-ord" value="${esc(vid?base.orderNo||'':'')}"></label>
      <label class="lb">Belt width (mm)<input class="f num" id="vf-w" type="number" min="0" step="1" value="${esc(base.width??'')}"></label>
      <label class="lb">Version / material<input class="f" id="vf-mat" list="vf-mats" value="${esc(base.material||'')}"><datalist id="vf-mats">${[...new Set(['Mild Steel','Stainless Steel','Galvanised','Mild Steel- EL15','Mild Steel- EL25',...prodMats(pr)])].filter(Boolean).map(m=>`<option value="${esc(m)}">`).join('')}</datalist></label>
      ${cols.map((c,i)=>`<label class="lb">${esc(c)}<input class="f" data-vattr="${esc(c)}" value="${esc(base.attrs?.[c]||'')}"></label>`).join('')}
      <label class="lb">Weight (kg)<input class="f num" id="vf-wt" type="number" min="0" step="any" value="${esc(base.weight||'')}"></label>
      <label class="lb full">Description<input class="f" id="vf-desc" value="${esc(vid?base.description:'')}" placeholder="Leave blank to build it from the name, width and version"></label>
    </div>
    <div class="warn" id="vf-err" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="vf-c">Cancel</button><button class="btn primary" type="submit" id="vf-go">${vid?'Save':'Add variant'}</button></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#vf-c').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  $('#vf-code').focus();
  $('#vform').onsubmit=async e=>{
    e.preventDefault();const err=$('#vf-err');const fail=t=>{err.hidden=false;err.textContent=t};
    const code=$('#vf-code').value.trim();if(!code)return fail('Enter the item code.');
    if(codeTaken(code,vid))return fail(`Item code ${code} is already used by ${S.parts.get(findByNo(code))?.description||'another item'}.`);
    const attrs={...(base.attrs||{})};root.querySelectorAll('[data-vattr]').forEach(i=>{const v=i.value.trim();if(v)attrs[i.dataset.vattr]=v;else delete attrs[i.dataset.vattr]});
    const w=$('#vf-w').value===''?null:num($('#vf-w').value);
    const v={partNo:code,orderNo:$('#vf-ord').value.trim(),width:w,material:$('#vf-mat').value.trim(),attrs,weight:$('#vf-wt').value};
    v.description=$('#vf-desc').value.trim()||autoDesc(pr,v);
    $('#vf-go').disabled=true;
    if(vid){if(await putPart(vid,{...v,tempCode:/^TMP-/i.test(code)},'Variant saved')){close();render()}else $('#vf-go').disabled=false;return}
    const id=/^[A-Za-z0-9_\-.]{1,60}$/.test(code)&&!S.parts.has(code)&&!S.over.parts.has(code)?code:S.db.collection('parts').doc().id;
    const src=copyFrom?S.parts.get(copyFrom):null;
    const doc={...ITEM_DEF,...v,kind:'variant',level:'Product',makeBuy:'Make',unit:'ea',productIds:[pid],components:src?kids(src).map(c=>({...c})):[],createdAt:new Date().toISOString(),createdBy:S.me||null};
    if(!await putPart(id,doc)){$('#vf-go').disabled=false;return}
    if(await putProduct(pid,{variantIds:[...(pr.variantIds||[]),id]},`Variant ${code} added`)){close();render()}
  };
}
async function removeVariant(pid,vid,btn){
  if(!btn.classList.contains('armed')){btn.classList.add('armed');btn.textContent='Confirm';setTimeout(()=>{btn.classList.remove('armed');btn.textContent='Remove'},3000);return}
  const pr=S.products.get(pid);await putProduct(pid,{variantIds:(pr.variantIds||[]).filter(x=>x!==vid)},'Variant removed from this product type (the item itself is kept)');render();
}
async function linkSpare(pid){
  const code=$('#sp-link')?.value.trim();if(!code)return;const id=findByNo(code);if(!id){toast(`No item with code ${code}.`);return}
  const pr=S.products.get(pid);if((pr.spareIds||[]).includes(id)){toast('Already linked.');return}
  const it=S.parts.get(id);
  await putPart(id,{productIds:[...new Set([...(it.productIds||[]),pid])]});
  await putProduct(pid,{spareIds:[...(pr.spareIds||[]),id]},`${it.partNo} linked as a spare part`);render();
}
async function unlinkSpare(pid,id){
  const pr=S.products.get(pid);const it=S.parts.get(id);
  await putProduct(pid,{spareIds:(pr.spareIds||[]).filter(x=>x!==id)},'Spare part unlinked');
  if(it)await putPart(id,{productIds:(it.productIds||[]).filter(x=>x!==pid)});render();
}

/* bulk import */
const IMP_COLS=['Item code','Ordering no.','Description','Product type','Category','Level','Role','Belt width','Version','Weight (kg)','Unit','Supplier','Notes'];
async function importTemplate(pid){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  const pr=pid&&S.products.get(pid);const cols=pr?(pr.attrCols||[]):['Tip Width (mm)','Pole Length (mm)','Pole Dia (mm)','Arm Size'];
  let rows;
  if(pr&&prodVariants(pr).length)rows=prodVariants(pr).sort(vSort).map(([,p])=>({'Item code':p.partNo,'Ordering no.':p.orderNo||'',Description:p.description,'Product type':pr.name,Category:pr.category,Level:p.level||'Product',Role:'','Belt width':p.width??'',Version:p.material||'','Weight (kg)':p.weight||'',Unit:p.unit||'ea',Supplier:p.supplier||'',Notes:p.notes||'',...Object.fromEntries(cols.map(c=>[c,p.attrs?.[c]||'']))}));
  else rows=[{'Item code':'9100001','Ordering no.':'PX600','Description':'','Product type':pr?pr.name:'Profiler PX Primary Cleaner',Category:pr?pr.category:'Primary Belt Cleaners',Level:'Product',Role:'','Belt width':600,Version:'Mild Steel','Weight (kg)':'',Unit:'ea',Supplier:'',Notes:'Example row: replace or delete',...Object.fromEntries(cols.map(c=>[c,'']))},
    {'Item code':'9100101','Ordering no.':'PX-TIP200','Description':'Profiler tungsten tip 200 mm','Product type':pr?pr.name:'Profiler PX Primary Cleaner',Category:'',Level:'Component',Role:'Tip / Blade','Belt width':'',Version:'Mild Steel','Weight (kg)':1,Unit:'ea',Supplier:'',Notes:'Example spare part row',...Object.fromEntries(cols.map(c=>[c,'']))}];
  const ws=XLSX.utils.json_to_sheet(rows,{header:[...IMP_COLS,...cols]});ws['!cols']=[...IMP_COLS,...cols].map(c=>({wch:Math.max(10,c.length+2)}));XLSX.utils.book_append_sheet(wb,ws,'Items');
  const help=[['How to use'],['One row per item code. Existing item codes are updated; new codes are created.'],['Product type: rows with Level = Product become variants of that product type; other levels are linked as its spare parts. A product type name that does not exist yet is created.'],['Any extra column you add (e.g. Tip Width (mm), Arm Size, Blade Material) is saved as a spec on the item.'],['Blank cells leave the existing value unchanged.'],['Levels: Product, Part, Component, Item. Roles (matrix column): Tensioner, Pole, Arm, Cushion, Tip / Blade, Frame, Accessories.']];
  const wh=XLSX.utils.aoa_to_sheet(help);wh['!cols']=[{wch:120}];XLSX.utils.book_append_sheet(wb,wh,'How to use');
  await saveWb(wb,`${pr?fname(pr.name):'PCS'}-item-import-template.xlsx`);
}
function pickImportFile(pid){const i=document.createElement('input');i.type='file';i.accept='.xlsx,.xls,.csv';i.onchange=()=>{if(i.files[0])importItemsPreview(i.files[0],pid)};i.click()}
async function importItemsPreview(file,pid){
  if(!xlsxReady())return;let rows;
  try{const wb=XLSX.read(await file.arrayBuffer());rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''})}catch(e){toast('Could not read that file.');return}
  const norm=k=>String(k).toLowerCase().replace(/[^a-z]/g,'');
  const MAP={itemcode:'code',code:'code',orderingno:'orderNo',orderingnumber:'orderNo',description:'description',producttype:'ptype',category:'category',level:'level',role:'role',beltwidth:'width',version:'material',material:'material',weightkg:'weight',weight:'weight',unit:'unit',supplier:'supplier',notes:'notes'};
  const plan=[];const errs=[];const newTypes=new Map();
  const typeByName=n=>{const t=String(n).trim().toLowerCase();for(const [k,p] of S.products)if(p.name.toLowerCase()===t)return k;return null};
  rows.forEach((r,ix)=>{
    const f={},attrs={};for(const [k,v] of Object.entries(r)){const m=MAP[norm(k)];const val=String(v??'').trim();if(m)f[m]=val;else if(val!==''&&!/^__/.test(k))attrs[safeKey(k)]=val}
    if(!f.code){if(Object.values(f).some(Boolean)||Object.keys(attrs).length)errs.push(`Row ${ix+2}: no item code`);return}
    if(f.level&&!LEVELS.includes(f.level[0].toUpperCase()+f.level.slice(1).toLowerCase()))errs.push(`Row ${ix+2}: level “${f.level}” is not Product, Part, Component or Item`);
    const id=findByNo(f.code);const exists=!!id&&String(S.parts.get(id).partNo).toLowerCase()===f.code.toLowerCase();
    let tid=f.ptype?typeByName(f.ptype):(pid||null);if(f.ptype&&!tid){if(!newTypes.has(f.ptype.toLowerCase()))newTypes.set(f.ptype.toLowerCase(),{name:f.ptype,category:f.category||'Other'});tid='new:'+f.ptype.toLowerCase()}
    plan.push({row:ix+2,code:f.code,id:exists?id:null,f,attrs,tid});
  });
  const dup=plan.map(p=>p.code.toLowerCase()).filter((c,i,a)=>a.indexOf(c)!==i);if(dup.length)errs.push('Item code repeated in the file: '+[...new Set(dup)].join(', '));
  const nNew=plan.filter(p=>!p.id).length,nUpd=plan.length-nNew;
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-back"><div class="modal wide">
    <h2>Import items from ${esc(file.name)}</h2>
    <div class="tiles"><div class="tile"><div class="l">New items</div><div class="big">${nNew}</div></div><div class="tile"><div class="l">Existing items updated</div><div class="big">${nUpd}</div></div><div class="tile"><div class="l">New product types</div><div class="big">${newTypes.size}</div><div class="note">${esc([...newTypes.values()].map(t=>t.name).join(', '))}</div></div><div class="tile"><div class="l">Problems</div><div class="big ${errs.length?'neg':''}">${errs.length}</div></div></div>
    ${errs.length?`<div class="warn">${errs.slice(0,8).map(esc).join('<br>')}${errs.length>8?'<br>…':''}</div>`:''}
    <div class="scroll" style="max-height:40vh"><table><thead><tr><th>Row</th><th>Item code</th><th></th><th>Description</th><th>Level</th><th>Product type</th><th>Specs</th></tr></thead><tbody>${plan.slice(0,300).map(p=>`<tr><td class="note">${p.row}</td><td class="mono">${esc(p.code)}</td><td>${p.id?'<span class="tag">Update</span>':'<span class="tag st-ok">New</span>'}</td><td>${esc(p.f.description||(p.id?S.parts.get(p.id).description:''))}</td><td>${esc(p.f.level||(p.id?S.parts.get(p.id).level:''))}</td><td>${esc(p.f.ptype||(p.tid&&!String(p.tid).startsWith('new:')?S.products.get(p.tid)?.name:''))}</td><td class="note">${esc(Object.entries(p.attrs).map(([k,v])=>k+': '+v).join(' · '))}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="im-c">Cancel</button><button class="btn primary" id="im-go" ${errs.length||!plan.length?'disabled':''}>Import ${plan.length} row${plan.length===1?'':'s'}</button></div>
    ${errs.length?'<div class="note">Fix the problems in the spreadsheet and import it again.</div>':''}
  </div></div>`;
  $('#im-c').onclick=()=>root.innerHTML='';
  $('#im-go').onclick=async()=>{
    const b=$('#im-go');b.disabled=true;S.busy=true;const tmap={};let done=0,bad=0;
    for(const [k,t] of newTypes){const id=newPid(t.name);if(await putProduct(id,{name:t.name,category:t.category,roles:DEF_ROLES.slice(),attrCols:[],variantIds:[],spareIds:[],moduleWidth:0,custom:true,createdAt:new Date().toISOString()}))tmap['new:'+k]=id}
    const addV={},addS={},cols={};
    for(const p of plan){
      const tid=p.tid?(tmap[p.tid]||p.tid):null;const cur=p.id?S.parts.get(p.id):null;
      const lv=p.f.level?p.f.level[0].toUpperCase()+p.f.level.slice(1).toLowerCase():(cur?.level||(tid?'Product':''));
      const patch={};const set=(k,v)=>{if(v!==undefined&&v!=='')patch[k]=v};
      set('orderNo',p.f.orderNo);set('description',p.f.description);set('category',p.f.category);set('role',p.f.role);set('material',p.f.material);set('weight',p.f.weight);set('unit',p.f.unit);set('supplier',p.f.supplier);set('notes',p.f.notes);
      if(p.f.width)patch.width=num(p.f.width);if(lv)patch.level=lv;
      if(Object.keys(p.attrs).length)patch.attrs={...(cur?.attrs||{}),...p.attrs};
      if(tid){patch.productIds=[...new Set([...(cur?.productIds||[]),tid])];
        if(lv==='Product'){patch.kind='variant';(addV[tid]=addV[tid]||[]).push(p.id||null);(cols[tid]=cols[tid]||new Set());Object.keys(p.attrs).forEach(k=>cols[tid].add(k))}else{patch.kind=patch.kind||cur?.kind||'spare';(addS[tid]=addS[tid]||[]).push(p.id||null)}}
      let id=p.id;
      if(!id){id=/^[A-Za-z0-9_\-.]{1,60}$/.test(p.code)&&!S.parts.has(p.code)&&!S.over.parts.has(p.code)?p.code:S.db.collection('parts').doc().id;
        const pr=tid&&S.products.get(tid);
        Object.assign(patch,{...ITEM_DEF,...patch,partNo:p.code,components:[],createdAt:new Date().toISOString(),createdBy:S.me||null});
        if(!patch.description)patch.description=lv==='Product'&&pr?autoDesc(pr,patch):p.code;
        if(lv==='Product')patch.makeBuy='Make';
        if(tid){const arr=lv==='Product'?addV[tid]:addS[tid];arr[arr.length-1]=id}}
      b.textContent=`Importing ${++done} of ${plan.length}…`;
      if(!await putPart(id,patch))bad++;
    }
    for(const tid of new Set([...Object.keys(addV),...Object.keys(addS)])){const pr=S.products.get(tid);if(!pr)continue;
      await putProduct(tid,{variantIds:[...new Set([...(pr.variantIds||[]),...(addV[tid]||[]).filter(Boolean)])],spareIds:[...new Set([...(pr.spareIds||[]),...(addS[tid]||[]).filter(Boolean)])],attrCols:[...new Set([...(pr.attrCols||[]),...(cols[tid]||[])])]})}
    S.busy=false;S.pending=false;root.innerHTML='';render();
    toast(bad?`Imported with ${bad} error${bad>1?'s':''}`:`Imported ${plan.length} item${plan.length>1?'s':''}`);
  };
}

/* ---------- item modal ---------- */
function partModal(id,ctx){
  if(!canW()){toast('You have view-only access to this BOM.');return}
  const p=id?S.parts.get(id):{unit:'ea',makeBuy:ctx?'Buy':'Make'};
  const used=id?whereUsed(id):[];
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-back"><form class="modal" id="pform" novalidate>
    <h2>${id?'Edit '+esc(p.partNo):ctx?'New component for '+esc(S.parts.get(ctx.parentId).partNo):'New item'}</h2>
    <div class="fgrid">
      <label class="lb">Item code *<input class="f mono" id="pf-no" required inputmode="numeric" value="${esc(p.partNo||'')}" placeholder="e.g. 8110014" ${id&&!p.tempCode?'readonly title="Item codes are fixed once created"':''}></label>
      <label class="lb">Ordering no.<input class="f mono" id="pf-ord" value="${esc(p.orderNo||'')}"></label>
      <label class="lb full">Description *<input class="f" id="pf-desc" required value="${esc(p.description||'')}"></label>
      <label class="lb">Level<select class="f" id="pf-lvl">${['',...LEVELS].map(l=>`<option value="${l}" ${l===(p.level||(ctx?nextLevel(S.parts.get(ctx.parentId)?.level):''))?'selected':''}>${l||'Not set'}</option>`).join('')}</select></label>
      <label class="lb">Role (matrix column)<input class="f" id="pf-role" list="roles" value="${esc(p.role||'')}"><datalist id="roles">${DEF_ROLES.map(r=>`<option>${esc(r)}</option>`).join('')}</datalist></label>
      <label class="lb">Make / Buy<select class="f" id="pf-mb">${['','Make','Buy'].map(o=>`<option ${p.makeBuy===o?'selected':''} value="${o}">${o||'—'}</option>`).join('')}</select></label>
      <label class="lb">Buy price ($)${isAsm(p)?' – blank uses BOM cost':''}<input class="f num" id="pf-cost" type="number" min="0" step="0.01" value="${esc(id&&S.price.get(id)?.buy!=null?S.price.get(id).buy:(p.cost||''))}"></label>
      <label class="lb">Sell price ($)<input class="f num" id="pf-sell" type="number" min="0" step="0.01" value="${esc(id?S.price.get(id)?.sell??'':'')}"></label>
      <label class="lb">Labour per assembly ($)<input class="f num" id="pf-lab" type="number" min="0" step="0.01" value="${esc(p.labour||'')}"></label>
      ${p.kind==='variant'||p.productWidth||p.attrs?.['Tip Width (mm)']?`<label class="lb">Product (tip) width, mm<input class="f num" id="pf-pw" type="number" min="0" step="1" value="${esc(p.productWidth||p.attrs?.['Tip Width (mm)']||'')}"></label>`:''}
      <label class="lb">Weight (kg)<input class="f num" id="pf-wt" type="number" min="0" step="any" value="${esc(p.weight||'')}"></label>
      <label class="lb">Unit of measure<input class="f" id="pf-unit" value="${esc(p.unit||'ea')}"></label>
      <label class="lb full">Supplier<input class="f" id="pf-sup" value="${esc(p.supplier||'')}"></label>
      <label class="lb">Belt width (mm)<input class="f num" id="pf-bw" type="number" min="0" step="1" value="${esc(p.width??'')}"></label>
      <label class="lb">Version / material<input class="f" id="pf-mat" list="pf-mats" value="${esc(p.material||'')}"><datalist id="pf-mats"><option value="Mild Steel"><option value="Stainless Steel"><option value="Galvanised"><option value="Polyurethane"><option value="Tungsten"></datalist></label>
      <div class="full"><div class="lb" style="margin-bottom:4px">Specifications</div><div id="pf-specs">${Object.entries(p.attrs||{}).filter(([k])=>!/weigh|tip width/i.test(k)).map(([k,v])=>`<div class="specrow"><input class="f" data-sk value="${esc(k)}" aria-label="Spec name"><input class="f" data-sv value="${esc(v)}" aria-label="Spec value"><button type="button" class="btn small danger" data-sx aria-label="Remove spec">×</button></div>`).join('')}</div><button type="button" class="btn small" id="pf-addspec">+ Add spec</button> <span class="note">e.g. Blade material, Hardness, Pole dia, Arm size, Max belt speed</span></div>
      <label class="lb full">Notes<textarea class="f" id="pf-notes" rows="2">${esc(p.notes||'')}</textarea></label>
      ${ctx?`<label class="lb">Qty per ${esc(S.parts.get(ctx.parentId).partNo)}<select class="f num" id="pf-q">${qtyOpts(ctx.qty)}</select></label>`:''}
    </div>
    <div class="warn" id="pf-err" hidden></div>
    <div class="row" style="justify-content:space-between">
      <div>${id?`<button type="button" class="btn danger" id="pf-del" ${used.length?'disabled title="Remove it from the BOMs that use it first"':''}>Delete item</button>`:''}</div>
      <div class="row"><button type="button" class="btn" id="pf-cancel">Cancel</button><button class="btn primary" type="submit">${id?'Save changes':'Create item'}</button></div>
    </div>
    ${id&&used.length?`<div class="note">Used in ${used.slice(0,8).map(u=>esc(u.p.partNo)).join(', ')}${used.length>8?'…':''}. Remove it there before deleting.</div>`:''}
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending){S.pending=false;render()}};
  $('#pf-cancel').onclick=()=>{S.newForDocs=false;S.newForProduct=null;close()};
  const wsx=()=>root.querySelectorAll('[data-sx]').forEach(b=>b.onclick=()=>b.closest('.specrow').remove());wsx();
  $('#pf-addspec').onclick=()=>{const d0=document.createElement('div');d0.className='specrow';d0.innerHTML='<input class="f" data-sk placeholder="Spec name" aria-label="Spec name"><input class="f" data-sv placeholder="Value" aria-label="Spec value"><button type="button" class="btn small danger" data-sx aria-label="Remove spec">×</button>';$('#pf-specs').appendChild(d0);wsx();d0.querySelector('input').focus()};$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  (id?$('#pf-desc'):$('#pf-no')).focus();
  const del=$('#pf-del');
  if(del)del.onclick=async()=>{
    if(!del.classList.contains('armed')){del.classList.add('armed');del.textContent='Click again to delete';return}
    let ok;
    if(S.catalog.items[id]){ok=await write(()=>S.db.doc('parts/'+id).set({deleted:true,updatedAt:new Date().toISOString()}),'Item deleted');if(ok)S.over.parts.set(id,{deleted:true})}
    else{ok=await write(()=>S.db.doc('parts/'+id).delete(),'Item deleted');if(ok)S.over.parts.delete(id)}
    if(ok){rebuild();S.selected=null;close();render()}
  };
  $('#pform').onsubmit=async e=>{
    e.preventDefault();const err=$('#pf-err');
    const no=$('#pf-no').value.trim(),desc=$('#pf-desc').value.trim();
    if(!no||!desc){err.hidden=false;err.textContent='Item code and description are required.';return}
    if([...S.parts.entries()].some(([k,x])=>k!==id&&String(x.partNo).toLowerCase()===no.toLowerCase())){err.hidden=false;err.textContent=`Item code ${no} is already used.`;return}
    const pwi=$('#pf-pw');const pw=pwi?num(pwi.value):0;const pwx=pw&&pw!==num(p.attrs?.['Tip Width (mm)'])?{productWidth:pw}:{};
    const tc=id&&p.tempCode?{tempCode:/^TMP-/i.test(no)}:{};
    const attrs={};for(const [k,v] of Object.entries(p.attrs||{}))if(/weigh|tip width/i.test(k))attrs[k]=v;
    root.querySelectorAll('.specrow').forEach(r=>{const k=safeKey(r.querySelector('[data-sk]').value),v=r.querySelector('[data-sv]').value.trim();if(k&&v)attrs[k]=v});
    const bw=$('#pf-bw').value===''?null:num($('#pf-bw').value);
    const data={...pwx,...tc,attrs,width:bw,material:$('#pf-mat').value.trim(),level:$('#pf-lvl').value,partNo:no,orderNo:$('#pf-ord').value.trim(),description:desc,role:$('#pf-role').value.trim(),makeBuy:$('#pf-mb').value,unit:$('#pf-unit').value.trim()||'ea',
      labour:num($('#pf-lab').value),weight:$('#pf-wt').value,supplier:$('#pf-sup').value.trim(),notes:$('#pf-notes').value.trim()};
    const pr={buy:$('#pf-cost').value===''?null:num($('#pf-cost').value),sell:$('#pf-sell').value===''?null:num($('#pf-sell').value)};
    if(id){if(await putPart(id,data,'Saved')){await setPrice(id,pr);close()}render();return}
    const nid=/^[A-Za-z0-9_\-.]{1,60}$/.test(no)&&!S.parts.has(no)&&!S.over.parts.has(no)?no:S.db.collection('parts').doc().id;
    if(!await putPart(nid,{...data,components:[],createdAt:new Date().toISOString(),createdBy:S.me||null},'Item created'))return;
    if(pr.buy!=null||pr.sell!=null)await setPrice(nid,pr);
    if(ctx){await addComponent(ctx.parentId,nid,num($('#pf-q').value)||1);close();render();return}
    if(S.newForProduct){const tp=S.newForProduct;S.newForProduct=null;const pr=S.products.get(tp);const it=S.parts.get(nid);if(pr&&it){await putPart(nid,{productIds:[...new Set([...(it.productIds||[]),tp])],kind:it.kind||'spare'});await putProduct(tp,{spareIds:[...(pr.spareIds||[]),nid]},'Part created and linked')}close();render();return}
    close();if(S.newForDocs){S.newForDocs=false;S.dsel=nid;S.view='register';setViewBtns();render();toast('Item created. Now drop its documents into the slots.')}else select(nid);
  };
}

/* ---------- documents ---------- */
async function uploadDoc(id,code,file){
  const p=S.parts.get(id);if(!S.assets||!p)return;
  const ext=(file.name.split('.').pop()||'').toLowerCase();const type=MIME[ext];
  if(!type){toast('That file type can’t be stored. Export it to PDF first.');return}
  S.uploading=code;renderMain();
  try{
    const res=await S.assets.upload(file,{type});
    const prev=docsFor(id,code);const revIndex=prev.length?prev[0].revIndex+1:0;const rev=revLabel(revIndex);
    const now=new Date().toISOString();
    const filedName=`${p.partNo}-${code}-Rev${rev}_${stamp(now)}.${ext}`;
    await S.db.collection('documents').add({partId:id,partNo:p.partNo,itemCode:p.partNo,type:code,revIndex,rev,assetId:res.id,contentType:res.contentType,sizeBytes:res.sizeBytes,
      originalName:file.name,filedName,uploadedAt:now,uploadedBy:S.me||null});
    toast(`Filed ${filedName}`);
  }catch(e){
    const m={too_large:'File is over 20 MB.',unsupported_type:'That file type can’t be stored. Export it to PDF first.',quota_or_state:'Document storage is full.',rate_limited:'Too many uploads at once. Try again in a moment.',not_granted:'Uploading needs Editor access.'};
    toast(m[e&&e.code]||('Upload failed: '+(e&&e.message||'try again')));
  }finally{S.uploading=null;renderMain();fillNames()}
}
async function saveDoc(docId){
  const d=S.docs.find(x=>x._id===docId);if(!d||!S.downloads)return;
  try{const r=await fetch('/_blob/'+d.assetId);if(!r.ok)throw new Error('File not found');const blob=await r.blob();await S.downloads.save({filename:d.filedName,data:blob})}
  catch(e){if(e&&e.code!=='declined')toast('Could not save file: '+(e.message||e.code||'try again'))}
}

/* ---------- exports ---------- */
function bomRows(id){
  const p=S.parts.get(id);const uc=unitCost(id);
  const out=[{Level:0,Type:p.level||'','Item code':p.partNo,'Ordering no.':p.orderNo||'',Role:'',Description:p.description,'Qty per parent':1,'Total qty':1,Unit:p.unit||'ea','Unit cost':+uc.toFixed(2),'Ext cost':+uc.toFixed(2),'Sell price':sellOf(id)||'','Weight (kg)':p.weight||''}];
  for(const r of explode(id)){const c=r.part||{};const u=unitCost(r.id);
    out.push({Level:r.level,Type:c.level||'','Item code':(' '.repeat(r.level*2))+(c.partNo||r.id),'Ordering no.':c.orderNo||'',Role:r.role||'',Description:c.description||'Missing item','Qty per parent':r.qty,'Total qty':+r.total.toFixed(4),Unit:c.unit||'ea','Unit cost':+u.toFixed(2),'Ext cost':+(u*r.total).toFixed(2),'Sell price':sellOf(r.id)||'','Weight (kg)':c.weight?+(num(c.weight)*r.total).toFixed(3):''})}
  return out;
}
const buyRows=(id,b=1)=>leafList(id).map(x=>{const c=x.p||{};return {'Item code':c.partNo||x.pid,'Ordering no.':c.orderNo||'',Description:c.description||'Missing item','Qty per unit':+x.q.toFixed(4),'Build qty':b,'Total qty':+(x.q*b).toFixed(4),Unit:c.unit||'ea','Buy price':buyOf(x.pid),'Ext cost':+(x.q*b*buyOf(x.pid)).toFixed(2),'On hand':stk(x.pid).onHand??'','Short':Math.max(0,+(x.q*b-onHand(x.pid)).toFixed(4))||'',Supplier:c.supplier||''}});
const docRow=d=>{const p=S.parts.get(d.partId);return {'Filed name':d.filedName,'Item code':p?.partNo||d.partNo,Type:TYPE[d.type]?.label||d.type,Rev:d.rev,Status:isCurrent(d)?'Current':'Superseded',Filed:when(d.uploadedAt),'Original file':d.originalName||''}};
function sheet(wb,rows,name,widths){const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{Note:'None'}]);ws['!cols']=widths.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,name.replace(/[\\/?*\[\]:]/g,' ').slice(0,31))}
async function saveWb(wb,filename){
  const data=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  try{await S.downloads.save({filename,data})}catch(e){if(e.code!=='declined')toast('Could not export: '+(e.message||e.code))}
}
const xlsxReady=()=>{if(window.XLSX)return true;toast('Excel export is still loading. Try again in a moment.');return false};
const fname=s=>String(s).replace(/[^A-Za-z0-9 -]/g,'').trim().replace(/\s+/g,'-');
async function exportXlsx(id){
  if(!xlsxReady())return;
  const p=S.parts.get(id);const wb=XLSX.utils.book_new();
  sheet(wb,bomRows(id),'Indented BOM',[6,10,14,16,12,44,10,10,6,10,10,10]);sheet(wb,buyRows(id,S.build||1),'Pick list',[12,16,44,10,8,10,6,10,10,18]);
  const ids=new Set([id,...explode(id).map(r=>r.id)]);sheet(wb,S.docs.filter(d=>ids.has(d.partId)).map(docRow),'Documents',[44,12,22,6,12,20,30]);
  await saveWb(wb,`${p.partNo}-BOM_${stamp(new Date().toISOString())}.xlsx`);
}
function matrixRows(pr){
  const roles=pr.roles||DEF_ROLES;
  return prodVariants(pr).sort(vSort).map(([,p])=>{const o={'Item code':p.partNo,'Ordering no.':p.orderNo||'','Belt width':p.width??'','Product width':prodWidth(p)??'',Modules:modulesOf(pr,p)??'',Version:p.material||'',...Object.fromEntries((pr.attrCols||[]).map(c=>[c,p.attrs?.[c]||'']))};
    const ls=lines(p);roles.forEach(r=>{o[r]=ls.filter(l=>(l.role||'Accessories')===r).map(l=>`${pn(l.partId)} x${qfmt(l.qty)}`).join('; ')});return o});
}
async function exportMatrix(pid){
  if(!xlsxReady())return;
  const pr=S.products.get(pid);const wb=XLSX.utils.book_new();
  sheet(wb,matrixRows(pr),'Component matrix',[12,18,10,12,8,16,...(pr.attrCols||[]).map(()=>12),...(pr.roles||DEF_ROLES).map(()=>24)]);
  sheet(wb,prodSpares(pr).map(([,p])=>({'Item code':p.partNo,'Ordering no.':p.orderNo||'',Description:baseDesc(p),Width:p.width??'',Version:p.material||'',Role:p.role||''})),'Spare parts',[12,18,40,8,16,14]);
  await saveWb(wb,`${fname(pr.name)}-matrix_${stamp(new Date().toISOString())}.xlsx`);
}
async function exportProductBoms(pid){
  if(!xlsxReady())return;
  const pr=S.products.get(pid);const wb=XLSX.utils.book_new();
  const rows=[];for(const [vid,p] of prodVariants(pr).sort(vSort))for(const r of explode(vid)){const l={partId:r.id,qty:r.total,role:r.role};const c=r.part||{};rows.push({'Product item code':p.partNo,'Product ordering no.':p.orderNo||'','Belt width':p.width??'','Product width':prodWidth(p)??'',Version:p.material||'','BOM level':r.level,Type:c.level||'',Role:l.role||'','Item code':(' '.repeat((r.level-1)*2))+(c.partNo||l.partId),'Ordering no.':c.orderNo||'',Description:c.description||'','Qty per parent':r.qty,'Total per product':+r.total.toFixed(4)})}
  sheet(wb,rows,'BOM lines',[12,18,10,12,16,6,11,14,14,18,44,8,10]);
  await saveWb(wb,`${fname(pr.name)}-BOMs_${stamp(new Date().toISOString())}.xlsx`);
}
const csv=rows=>{if(!rows.length)return '';const h=Object.keys(rows[0]);const q=v=>{v=String(v??'');return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};return [h.map(q).join(','),...rows.map(r=>h.map(k=>q(r[k])).join(','))].join('\n')};
async function exportCsv(id){
  const p=S.parts.get(id);
  try{await S.downloads.save({filename:`${p.partNo}-pick-list.csv`,data:csv(buyRows(id,S.build||1))||'No items'})}catch(e){if(e.code!=='declined')toast('Could not export: '+(e.message||e.code))}
}
async function registerCsv(){
  const rows=S.docs.slice().sort((a,b)=>a.filedName.localeCompare(b.filedName)).map(d=>({...docRow(d),Filed:d.uploadedAt,'Size (bytes)':d.sizeBytes}));
  try{await S.downloads.save({filename:`document-register_${stamp(new Date().toISOString())}.csv`,data:csv(rows)||'No documents'})}catch(e){if(e.code!=='declined')toast('Could not export: '+(e.message||e.code))}
}

/* ---------- expenses log ---------- */
const EXP_CATS=[['Motor vehicle & fuel','449'],['Freight & courier','425'],['Tools & consumables','429'],['Repairs & maintenance','473'],['Rent','469'],['Light & power','445'],['Telephone & internet','489'],['Subscriptions & software','485'],['Office & stationery','453'],['Advertising & marketing','400'],['Travel & accommodation','493'],['Meals & entertainment','420'],['Insurance','433'],['Accounting & legal','412'],['Bank fees','404'],['General','429']];
const EXP_ACCT=Object.fromEntries(EXP_CATS);
const PAID_BY=['Business bank account','Business card','Personal (reimburse)','Cash'];
const expTotal=e=>num(e.total);
const expGst=e=>e.gstFree?0:num(e.gst??(num(e.total)/11));
const expNet=e=>expTotal(e)-expGst(e);
function expensesHTML(){
  const wr=canW();const m0=S.emonth||new Date().toISOString().slice(0,7);
  const q=S.eq.toLowerCase();
  const inMonth=S.expenses.filter(e=>String(e.date||'').startsWith(m0));
  const list=(S.eall?S.expenses:inMonth).filter(e=>(S.ecat==='all'||e.category===S.ecat)&&(!q||[e.no,e.payee,e.description,e.category,e.ref,S.deals.find(d=>d._id===e.saleId)?.no].join(' ').toLowerCase().includes(q))).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.no).localeCompare(String(a.no),undefined,{numeric:true}));
  const noRec=S.expenses.filter(e=>!e.receiptId).length;const notX=S.expenses.filter(e=>!e.xeroAt).length;const reimb=S.expenses.filter(e=>e.paidBy==='Personal (reimburse)'&&!e.reimbursed).reduce((a,e)=>a+expTotal(e),0);
  const byCat={};inMonth.forEach(e=>byCat[e.category]=(byCat[e.category]||0)+expNet(e));
  const top=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,4);
  return `<section class="panel"><div class="head">
    <div class="head-top"><div style="flex:1"><div class="pnum">Non-stock spending · receipts · GST · Xero</div><h1>Expenses</h1></div>
      <div class="row">${wr?'<button class="btn primary" id="new-exp">+ New expense</button>':''}${S.downloads?'<button class="btn" id="xero-exp">Xero</button><button class="btn" id="exp-exp">Export</button>':''}</div></div>
    <div class="tiles">
      <div class="tile"><div class="l">Spent in ${esc(new Date(m0+'-01T00:00').toLocaleDateString('en-AU',{month:'long',year:'numeric'}))}</div><div class="big">${money(inMonth.reduce((a,e)=>a+expTotal(e),0))}</div><div class="note">${money(inMonth.reduce((a,e)=>a+expNet(e),0))} ex GST · GST ${money(inMonth.reduce((a,e)=>a+expGst(e),0))}</div></div>
      <div class="tile"><div class="l">Biggest categories this month</div><div class="note" style="margin-top:4px">${top.length?top.map(([k,v])=>`${esc(k)} <strong>${money(v)}</strong>`).join('<br>'):'—'}</div></div>
      <div class="tile"><div class="l">Missing receipts</div><div class="big ${noRec?'neg':''}">${noRec}</div><div class="note">${notX} not yet sent to Xero</div></div>
      <div class="tile"><div class="l">To reimburse staff</div><div class="big">${money(reimb)}</div></div>
    </div>
    <div class="row"><label class="lb" style="grid-auto-flow:column;align-items:center;gap:6px">Month <input class="f" id="e-month" type="month" value="${esc(m0)}" style="width:auto" ${S.eall?'disabled':''}></label>
      <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="e-all" ${S.eall?'checked':''}> All dates</label>
      <select class="f" id="e-cat" style="width:auto" aria-label="Category"><option value="all">All categories</option>${EXP_CATS.map(([c])=>`<option ${S.ecat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <input class="f" id="e-q" type="search" placeholder="Search payee, description, sale" style="max-width:280px" value="${esc(S.eq)}"></div>
  </div>
  <div class="tabbody">${!list.length?`<div class="empty"><strong>No expenses ${S.eall?'yet':'this month'}</strong>Log fuel, freight, tools, rent, subscriptions and other spending that isn’t stock bought on a purchase order. Attach the receipt and it can go to Xero for reconciling.</div>`:`<div class="scroll"><table><thead><tr><th>No.</th><th>Date</th><th>Payee</th><th>Description</th><th>Category</th><th class="num">Ex GST</th><th class="num">GST</th><th class="num">Total</th><th>Paid by</th><th>Receipt</th><th>Sale</th><th>Xero</th></tr></thead>
    <tbody>${list.map(e=>{const d=S.deals.find(x=>x._id===e.saleId);return `<tr><td><button class="link mono" data-exp="${esc(e._id)}">${esc(e.no)}</button></td><td class="note" style="white-space:nowrap">${esc(fmtDate(e.date))}</td><td>${esc(e.payee||'')}</td><td class="desc">${esc(e.description||'')}</td><td class="note">${esc(e.category||'')}</td><td class="num">${money(expNet(e))}</td><td class="num note">${e.gstFree?'Free':money(expGst(e))}</td><td class="num">${money(expTotal(e))}</td><td class="note">${esc(e.paidBy||'')}${e.paidBy==='Personal (reimburse)'?(e.reimbursed?' ✓':' <span class="tag st-low">Owed</span>'):''}</td><td>${e.receiptId?`<a class="btn small" href="/_blob/${esc(e.receiptId)}" target="_blank" rel="noopener">View</a>`:'<span class="tag st-low">None</span>'}</td><td class="mono note">${d?esc(d.no):''}</td><td class="note">${e.xeroAt?'✓':''}</td></tr>`}).join('')}</tbody>
    <tfoot><tr><td colspan="5">${list.length} expense${list.length>1?'s':''}</td><td class="num">${money(list.reduce((a,e)=>a+expNet(e),0))}</td><td class="num">${money(list.reduce((a,e)=>a+expGst(e),0))}</td><td class="num">${money(list.reduce((a,e)=>a+expTotal(e),0))}</td><td colspan="4"></td></tr></tfoot></table></div>`}</div></section>`;
}
function bindExpenses(){
  const m=$('#main');bindCommon(m);
  const mo=$('#e-month');mo.onchange=()=>{S.emonth=mo.value;renderMain()};
  $('#e-all').onchange=e=>{S.eall=e.target.checked;renderMain()};
  $('#e-cat').onchange=e=>{S.ecat=e.target.value;renderMain()};
  const q=$('#e-q');q.oninput=()=>{S.eq=q.value;const pos=q.selectionStart;renderMain();const n=$('#e-q');n.focus();n.setSelectionRange(pos,pos)};
  m.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>expenseModal(b.dataset.exp));
  const ne=$('#new-exp');if(ne)ne.onclick=()=>expenseModal(null);
  const ex=$('#exp-exp');if(ex)ex.onclick=exportExpenses;
  const xe=$('#xero-exp');if(xe)xe.onclick=()=>xeroModal('expenses');
}
function expenseModal(eid,preset){
  const wr=canW();const e=eid?S.expenses.find(x=>x._id===eid):{date:todayISO(),category:'General',paidBy:'Business bank account',...(preset||{})};if(!e)return;
  const root=$('#modal-root');const payees=[...new Set([...S.expenses.map(x=>x.payee),...S.suppliers.map(x=>x.name)].filter(Boolean))].sort();
  const sales=S.deals.filter(d=>!['lost'].includes(d.stage)).sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true}));
  const dis=wr?'':'disabled';
  root.innerHTML=`<div class="modal-back"><form class="modal" id="exform" novalidate>
    <h2>${eid?'Expense '+esc(e.no):'New expense'}</h2>
    <div class="fgrid">
      <label class="lb">Date *<input class="f" id="ex-date" type="date" value="${esc(e.date||'')}" ${dis}></label>
      <label class="lb">Payee *<input class="f" id="ex-payee" list="ex-pl" value="${esc(e.payee||'')}" placeholder="e.g. Ampol, Bunnings, Toll" ${dis}><datalist id="ex-pl">${payees.map(p=>`<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="lb full">What was it for? *<input class="f" id="ex-desc" value="${esc(e.description||'')}" placeholder="e.g. Fuel for site visit to Roy Hill" ${dis}></label>
      <label class="lb">Category<select class="f" id="ex-cat" ${dis}>${EXP_CATS.map(([c])=>`<option ${e.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="lb">Xero account code<input class="f mono" id="ex-acct" value="${esc(e.account||EXP_ACCT[e.category]||'429')}" ${dis}></label>
      <label class="lb">Total paid inc GST ($) *<input class="f num" id="ex-total" type="number" min="0" step="0.01" value="${esc(e.total??'')}" ${dis}></label>
      <label class="lb">GST ($)<input class="f num" id="ex-gst" type="number" min="0" step="0.01" value="${esc(e.gstFree?0:(e.gst??''))}" placeholder="1/11 of total" ${dis}></label>
      <label class="note full" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ex-free" ${e.gstFree?'checked':''} ${dis}> No GST on this purchase (GST-free or overseas)</label>
      <label class="lb">Paid by<select class="f" id="ex-paid" ${dis}>${PAID_BY.map(p=>`<option ${e.paidBy===p?'selected':''}>${esc(p)}</option>`).join('')}</select></label>
      <label class="lb">Receipt / invoice no.<input class="f mono" id="ex-ref" value="${esc(e.ref||'')}" ${dis}></label>
      <label class="lb full">Charge to sale (optional)<select class="f" id="ex-sale" ${dis}><option value="">Not charged to a sale</option>${sales.map(d=>`<option value="${esc(d._id)}" ${e.saleId===d._id?'selected':''}>${esc(d.no)} · ${esc(custName(d.customerId))} · ${esc(d.title||'')}</option>`).join('')}</select></label>
      ${e.paidBy==='Personal (reimburse)'||eid?`<label class="note full" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ex-reimb" ${e.reimbursed?'checked':''} ${dis}> Reimbursed to staff member</label>`:''}
      <label class="lb full">Notes<textarea class="f" id="ex-notes" rows="2" ${dis}>${esc(e.notes||'')}</textarea></label>
    </div>
    <div class="row">${e.receiptId?`<a class="btn small" href="/_blob/${esc(e.receiptId)}" target="_blank" rel="noopener">View receipt</a> <span class="note">${esc(e.receiptName||'')}</span>`:'<span class="tag st-low">No receipt attached</span>'}
      ${wr&&S.assets?`<label class="btn small" for="ex-file">${e.receiptId?'Replace':'Attach'} receipt</label><input type="file" id="ex-file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden><span class="note" id="ex-fname"></span>`:wr?'<span class="note">Attaching receipts needs Editor access.</span>':''}</div>
    <div class="warn" id="ex-err" hidden></div>
    <div class="row" style="justify-content:space-between"><div>${eid&&wr?'<button type="button" class="btn danger" id="ex-del">Delete</button>':''}</div><div class="row"><button type="button" class="btn" id="ex-c">${wr?'Cancel':'Close'}</button>${wr?`<button class="btn primary" type="submit" id="ex-save">${eid?'Save':'Add expense'}</button>`:''}</div></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#ex-c').onclick=()=>{close();if(preset&&preset.saleId&&!eid)drawDeal(preset.saleId)};$('.modal-back').onclick=ev=>{if(ev.target.classList.contains('modal-back'))close()};
  if(!wr)return;
  $('#ex-cat').onchange=()=>{$('#ex-acct').value=EXP_ACCT[$('#ex-cat').value]||'429'};
  const calc=()=>{if($('#ex-free').checked){$('#ex-gst').value='0';$('#ex-gst').disabled=true}else{$('#ex-gst').disabled=false;if(!$('#ex-gst').dataset.touched)$('#ex-gst').value=$('#ex-total').value?(num($('#ex-total').value)/11).toFixed(2):''}};
  $('#ex-total').oninput=calc;$('#ex-free').onchange=calc;$('#ex-gst').oninput=()=>$('#ex-gst').dataset.touched='1';if(e.gst!=null)$('#ex-gst').dataset.touched='1';calc();
  let file=null;const fi=$('#ex-file');if(fi)fi.onchange=()=>{file=fi.files[0]||null;$('#ex-fname').textContent=file?file.name:''};
  const del=$('#ex-del');if(del)del.onclick=async()=>{if(!del.classList.contains('armed')){del.classList.add('armed');del.textContent='Click again to delete';return}
    if(await write(()=>S.db.doc('expenses/'+eid).delete(),'Expense deleted')){S.expenses=S.expenses.filter(x=>x._id!==eid);close();render()}};
  $('#exform').onsubmit=async ev=>{
    ev.preventDefault();const err=$('#ex-err');const fail=t=>{err.hidden=false;err.textContent=t};
    const date=$('#ex-date').value,payee=$('#ex-payee').value.trim(),desc=$('#ex-desc').value.trim(),total=num($('#ex-total').value);
    if(!date||!payee||!desc)return fail('Date, payee and what it was for are required.');
    if(total<=0)return fail('Enter the total paid.');
    const gstFree=$('#ex-free').checked;const gst=gstFree?0:($('#ex-gst').value===''?+(total/11).toFixed(2):num($('#ex-gst').value));
    if(gst>total)return fail('GST can’t be more than the total.');
    $('#ex-save').disabled=true;
    let rec={};
    if(file){const ext=(file.name.split('.').pop()||'').toLowerCase();const ty=MIME[ext];if(!ty){$('#ex-save').disabled=false;return fail('Attach a PDF or photo of the receipt.')}
      try{const r=await S.assets.upload(file,{type:ty});rec={receiptId:r.id,receiptName:file.name}}catch(x){$('#ex-save').disabled=false;return fail('Receipt upload failed: '+(x.message||x.code||'try again'))}}
    const id=eid||S.db.collection('expenses').doc().id;const no=e.no||nextNo(S.expenses,'EXP-','no');
    const doc={...(eid?e:{}),no,date,payee,description:desc,category:$('#ex-cat').value,account:$('#ex-acct').value.trim(),total:+total.toFixed(2),gst:+gst.toFixed(2),gstFree,paidBy:$('#ex-paid').value,ref:$('#ex-ref').value.trim(),saleId:$('#ex-sale').value||null,reimbursed:!!$('#ex-reimb')?.checked,notes:$('#ex-notes').value.trim(),...rec,updatedAt:new Date().toISOString()};
    delete doc._id;if(!eid){doc.createdAt=doc.updatedAt;doc.createdBy=S.me||null}
    if(await write(()=>S.db.doc('expenses/'+id).set(doc),eid?'Expense saved':`Expense ${no} added`)){const i=S.expenses.findIndex(x=>x._id===id);const v={...doc,_id:id};if(i<0)S.expenses.push(v);else S.expenses[i]=v;close();render();if(preset&&preset.saleId&&!eid)drawDeal(preset.saleId)}
    else $('#ex-save').disabled=false;
  };
}
async function exportExpenses(){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  const rows=S.expenses.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(e=>({No:e.no,Date:e.date,Payee:e.payee||'',Description:e.description||'',Category:e.category||'','Xero account':e.account||'','Ex GST':+expNet(e).toFixed(2),GST:+expGst(e).toFixed(2),Total:expTotal(e),'Paid by':e.paidBy||'',Reimbursed:e.paidBy==='Personal (reimburse)'?(e.reimbursed?'Yes':'No'):'','Receipt no.':e.ref||'','Receipt attached':e.receiptId?'Yes':'No',Sale:S.deals.find(d=>d._id===e.saleId)?.no||'','Sent to Xero':e.xeroAt?String(e.xeroAt).slice(0,10):'',Notes:e.notes||''}));
  sheet(wb,rows,'Expenses',[10,11,22,40,22,8,10,9,10,20,10,14,10,9,11,30]);
  const cats={};for(const e of S.expenses){const k=String(e.date).slice(0,7)+'|'+e.category;cats[k]=(cats[k]||0)+expNet(e)}
  sheet(wb,Object.entries(cats).sort().map(([k,v])=>({Month:k.split('|')[0],Category:k.split('|')[1],'Ex GST':+v.toFixed(2)})),'By month & category',[9,26,12]);
  await saveWb(wb,`expenses_${stamp(new Date().toISOString())}.xlsx`);
}

/* ---------- purchasing: suppliers & purchase orders ---------- */
const PSTAT=[['draft','Draft'],['sent','Sent'],['part','Part received'],['received','Received'],['cancelled','Cancelled']];
const PST=Object.fromEntries(PSTAT);
const supName=id=>S.suppliers.find(s=>s._id===id)?.name||'';
const poOutstanding=po=>(po.lines||[]).reduce((a,l)=>a+Math.max(0,num(l.qty)-num(l.received))*num(l.price),0);
const poTotal=po=>(po.lines||[]).reduce((a,l)=>a+num(l.qty)*num(l.price),0);
function onOrderMap(){const m=new Map();for(const po of S.pos){if(!['sent','part','draft'].includes(po.status))continue;for(const l of po.lines||[]){const r=Math.max(0,num(l.qty)-num(l.received));if(r>0&&l.itemId)m.set(l.itemId,(m.get(l.itemId)||0)+r)}}return m}
let _oo=null;const onOrder=id=>(_oo||(_oo=onOrderMap())).get(id)||0;
const prefSup=id=>stk(id).supplierId||'';
const supItem=(sid,id)=>S.suppliers.find(s=>s._id===sid)?.items?.[id]||null;
const suppliersFor=id=>S.suppliers.filter(s=>s.items&&s.items[id]);

function purchHTML(){
  _oo=null;const wr=canW();
  const open=S.pos.filter(p=>['draft','sent','part'].includes(p.status));
  const m0=new Date().toISOString().slice(0,7);
  const recM=S.moves.filter(m=>m.type==='receive'&&String(m.at).startsWith(m0)&&/PUR-/.test(m.note||'')).reduce((a,m)=>a+num(m.qty)*buyOf(m.itemId),0);
  const lowNoPo=sortedParts().filter(([id])=>['low','out'].includes(stockStatus(id))&&!onOrder(id)).length;
  const q=S.pq2.toLowerCase();
  const head=`<div class="head">
    <div class="head-top"><div style="flex:1"><div class="pnum">RFQ → supplier quote → price check → purchase order → receiving</div><h1>Purchasing</h1></div>
      <div class="row">${wr?(S.ptab2==='suppliers'?'<button class="btn primary" id="new-sup">+ New supplier</button>':S.ptab2==='rfqs'?'<button class="btn primary" id="new-rfq">+ New RFQ</button>':'<button class="btn primary" id="new-po">+ New purchase order</button><button class="btn" id="new-rfq">+ New RFQ</button><button class="btn" id="po-reorder">Order everything below minimum</button>'):''}${S.downloads?'<button class="btn" id="xero-bills">Xero bills</button><button class="btn" id="exp-pur">Export</button>':''}</div></div>
    <div class="tiles">
      <div class="tile"><div class="l">Open purchase orders</div><div class="big">${open.length}</div><div class="note">${money(open.reduce((a,p)=>a+poOutstanding(p),0))} still to receive</div></div>
      <div class="tile"><div class="l">Below minimum, not on order</div><div class="big ${lowNoPo?'neg':''}">${lowNoPo}</div></div>
      <div class="tile"><div class="l">Received this month</div><div class="big">${money(recM)}</div><div class="note">at buy price</div></div>
    </div>
    <div class="row"><div class="chips">${[['rfqs',`RFQs (${S.rfqs.filter(r=>['draft','sent','quoted'].includes(r.status)).length})`],['open','Open POs'],['closed','Received & cancelled'],['suppliers',`Suppliers (${S.suppliers.length})`],['pricelog','Price log'],...(window.PCS?[['emails','Sent emails']]:[])].map(([k,l])=>`<button class="chip" data-ptab2="${k}" aria-pressed="${S.ptab2===k}">${l}</button>`).join('')}</div>
      <input class="f" id="pu-q" type="search" placeholder="Search supplier, PO number or item" style="max-width:320px" value="${esc(S.pq2)}"></div>
  </div>`;
  let body='';
  if(S.ptab2==='rfqs')body=rfqListHTML(q);
  else if(S.ptab2==='pricelog')body=priceLogHTML(q);
  else if(S.ptab2==='emails')body=emailsHTML(['rfq','po'],q);
  else if(S.ptab2==='suppliers'){
    const ss=S.suppliers.filter(s=>!q||[s.name,s.abn,s.email,s.phone,...(s.contacts||[]).map(k=>k.name)].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a.name).localeCompare(b.name));
    body=!ss.length?`<div class="empty"><strong>No suppliers yet</strong>Add your suppliers, then link the items they supply with their part numbers and prices.</div>`:`<div class="scroll"><table><thead><tr><th>Supplier</th><th>Phone</th><th>Email</th><th class="num">Items supplied</th><th class="num">Lead time</th><th class="num">Open POs</th><th class="num">Spend (received)</th></tr></thead><tbody>${ss.map(s=>{const ps=S.pos.filter(p=>p.supplierId===s._id);return `<tr><td><button class="link" data-sup="${esc(s._id)}">${esc(s.name)}</button></td><td class="note">${esc(s.phone||'')}</td><td class="note">${esc(s.email||'')}</td><td class="num">${Object.keys(s.items||{}).length||''}</td><td class="num">${s.lead?esc(s.lead)+' d':''}</td><td class="num">${ps.filter(p=>['draft','sent','part'].includes(p.status)).length||''}</td><td class="num">${money(ps.reduce((a,p)=>a+(p.lines||[]).reduce((b,l)=>b+num(l.received)*num(l.price),0),0))}</td></tr>`}).join('')}</tbody></table></div>`;
  }else{
    const st=S.ptab2==='open'?['draft','sent','part']:['received','cancelled'];
    const ps=S.pos.filter(p=>st.includes(p.status)&&(!q||[p.no,supName(p.supplierId),p.ref,...(p.lines||[]).map(l=>pn(l.itemId))].join(' ').toLowerCase().includes(q))).sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true}));
    body=!ps.length?`<div class="empty"><strong>No ${S.ptab2==='open'?'open':'closed'} purchase orders</strong>${S.ptab2==='open'?'Create one for a supplier, or order everything that is below its minimum stock level.':''}</div>`:`<div class="scroll"><table><thead><tr><th>PO</th><th>Status</th><th>Supplier</th><th>Sale</th><th class="num">Lines</th><th class="num">Total ex GST</th><th class="num">To receive</th><th>Ordered</th><th>Expected</th></tr></thead><tbody>${ps.map(p=>`<tr><td><button class="link mono" data-po="${esc(p._id)}">${esc(p.no)}</button></td><td><span class="tag po-${p.status}">${esc(PST[p.status])}</span></td><td>${esc(supName(p.supplierId))}</td><td class="mono note">${esc(S.deals.find(x=>x._id===p.saleId)?.no||'')}</td><td class="num">${(p.lines||[]).length}</td><td class="num">${money(poTotal(p))}</td><td class="num">${money(poOutstanding(p))}</td><td class="note">${esc(fmtDate(p.date))}</td><td class="note ${p.expected&&p.expected<todayISO()&&['sent','part'].includes(p.status)?'neg':''}">${esc(fmtDate(p.expected))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  return `<section class="panel">${head}<div class="tabbody">${body}</div></section>`;
}
function bindPurch(){
  const m=$('#main');bindCommon(m);
  m.querySelectorAll('[data-ptab2]').forEach(b=>b.onclick=()=>{S.ptab2=b.dataset.ptab2;renderMain()});
  const q=$('#pu-q');q.oninput=()=>{S.pq2=q.value;const pos=q.selectionStart;renderMain();const n=$('#pu-q');n.focus();n.setSelectionRange(pos,pos)};
  m.querySelectorAll('[data-sup]').forEach(b=>b.onclick=()=>supplierModal(b.dataset.sup));
  m.querySelectorAll('[data-po]').forEach(b=>b.onclick=()=>poModal(b.dataset.po));
  const ns=$('#new-sup');if(ns)ns.onclick=()=>supplierModal(null);
  const np=$('#new-po');if(np)np.onclick=()=>newPo(null,[]);
  const nrq=$('#new-rfq');if(nrq)nrq.onclick=()=>newRfq();
  m.querySelectorAll('[data-rfq]').forEach(b=>b.onclick=()=>rfqModal(b.dataset.rfq));fillNames();
  const nr=$('#po-reorder');if(nr)nr.onclick=reorderPos;
  const ex=$('#exp-pur');if(ex)ex.onclick=exportPurch;
  const xb=$('#xero-bills');if(xb)xb.onclick=()=>xeroModal('bills');
}

/* suppliers */
function supplierModal(sid){
  const wr=canW();const s=sid?S.suppliers.find(x=>x._id===sid):{contacts:[{}],items:{},terms:30};if(!s)return;
  const root=$('#modal-root');
  const crow=(k,i)=>`<div class="krow" data-k="${i}"><input class="f" data-kf="name" placeholder="Name" value="${esc(k.name||'')}"><input class="f" data-kf="role" placeholder="Role" value="${esc(k.role||'')}"><input class="f" data-kf="email" placeholder="Email" value="${esc(k.email||'')}"><input class="f" data-kf="phone" placeholder="Phone" value="${esc(k.phone||'')}"><button type="button" class="btn small danger" data-kx aria-label="Remove contact">×</button></div>`;
  const irow=(id,v)=>{const p=id&&S.parts.get(id);return `<tr class="sirow"><td><input class="f mono" data-sf="code" list="si-items" value="${esc(p?p.partNo:'')}" placeholder="Our item code"></td><td class="note sdesc">${esc(p?.description||'')}</td><td><input class="f mono" data-sf="supcode" value="${esc(v?.supCode||'')}" placeholder="Their part no."></td><td><input class="f num" data-sf="price" type="number" min="0" step="0.01" value="${esc(v?.price??'')}"></td><td><input class="f num" data-sf="moq" type="number" min="0" step="1" value="${esc(v?.moq??'')}"></td><td><input class="f num" data-sf="lead" type="number" min="0" step="1" value="${esc(v?.lead??'')}"></td><td><button type="button" class="btn small danger" data-six aria-label="Remove item">×</button></td></tr>`};
  const items=Object.entries(s.items||{});
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="suform" novalidate>
    <h2>${sid?esc(s.name):'New supplier'}</h2>
    <div class="fgrid4">
      <label class="lb" style="grid-column:span 2">Supplier name *<input class="f" id="su-name" value="${esc(s.name||'')}"></label>
      <label class="lb">ABN<input class="f" id="su-abn" value="${esc(s.abn||'')}"></label>
      <label class="lb">Account no. with them<input class="f" id="su-acct" value="${esc(s.account||'')}"></label>
      <label class="lb" style="grid-column:span 2">Address<input class="f" id="su-addr" value="${esc(s.address||'')}"></label>
      <label class="lb">Phone<input class="f" id="su-phone" value="${esc(s.phone||'')}"></label>
      <label class="lb">Orders email<input class="f" id="su-email" value="${esc(s.email||'')}"></label>
      <label class="lb">Payment terms (days)<input class="f num" id="su-terms" type="number" min="0" value="${esc(s.terms??30)}"></label>
      <label class="lb">Usual lead time (days)<input class="f num" id="su-lead" type="number" min="0" value="${esc(s.lead??'')}"></label>
      <label class="lb" style="grid-column:span 2">Supplies<input class="f" id="su-cat" value="${esc(s.category||'')}" placeholder="e.g. bearings, polyurethane, steel, fasteners"></label>
    </div>
    <div><div class="h2" style="font-size:16px;margin-bottom:6px">Contacts</div><div id="su-k">${(s.contacts||[]).map(crow).join('')}</div><button type="button" class="btn small" id="su-addk">+ Add contact</button></div>
    <div><div class="h2" style="font-size:16px;margin-bottom:6px">Items they supply</div>
      <datalist id="si-items">${sortedParts().filter(([,p])=>p.level!=='Product').slice(0,1500).map(([id,p])=>`<option value="${esc(p.partNo)}">${esc(p.orderNo||'')} ${esc(p.description)}</option>`).join('')}</datalist>
      <div class="scroll"><table class="qt"><thead><tr><th>Our item code</th><th>Description</th><th>Their part no.</th><th class="num">Price ex GST</th><th class="num">Min order</th><th class="num">Lead days</th><th></th></tr></thead><tbody id="su-items">${items.map(([id,v])=>irow(id,v)).join('')}</tbody></table></div>
      <button type="button" class="btn small" id="su-addi">+ Add item</button></div>
    <label class="lb">Notes<textarea class="f" id="su-notes" rows="2">${esc(s.notes||'')}</textarea></label>
    <div class="warn" id="su-err" hidden></div>
    <div class="row" style="justify-content:space-between"><div>${sid&&wr?'<button type="button" class="btn" id="su-po">New purchase order</button>':''}</div><div class="row"><button type="button" class="btn" id="su-cancel">Close</button>${wr?'<button class="btn primary" type="submit">Save supplier</button>':''}</div></div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#su-cancel').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const wire=()=>{root.querySelectorAll('[data-kx]').forEach(b=>b.onclick=()=>b.closest('.krow').remove());root.querySelectorAll('[data-six]').forEach(b=>b.onclick=()=>b.closest('tr').remove());
    root.querySelectorAll('[data-sf="code"]').forEach(i=>i.onchange=()=>{const id=findByNo(i.value);i.closest('tr').querySelector('.sdesc').textContent=id?S.parts.get(id).description:'Not found';const pr=i.closest('tr').querySelector('[data-sf="price"]');if(id&&!pr.value&&buyOf(id))pr.value=buyOf(id)})};wire();
  $('#su-addk').onclick=()=>{const d=document.createElement('div');d.innerHTML=crow({},Date.now());$('#su-k').appendChild(d.firstElementChild);wire()};
  $('#su-addi').onclick=()=>{const t=document.createElement('tbody');t.innerHTML=irow(null,null);$('#su-items').appendChild(t.firstElementChild);wire();$('#su-items').lastElementChild.querySelector('input').focus()};
  const sp=$('#su-po');if(sp)sp.onclick=()=>{close();newPo(sid,[])};
  $('#suform').onsubmit=async e=>{
    e.preventDefault();const err=$('#su-err');const name=$('#su-name').value.trim();if(!name){err.hidden=false;err.textContent='Supplier name is required.';return}
    const its={};let bad=[];
    for(const tr of root.querySelectorAll('.sirow')){const g=k=>tr.querySelector(`[data-sf="${k}"]`).value.trim();if(!g('code'))continue;const id=findByNo(g('code'));if(!id){bad.push(g('code'));continue}its[id]=clean({supCode:g('supcode'),price:g('price')===''?undefined:num(g('price')),moq:g('moq')===''?undefined:num(g('moq')),lead:g('lead')===''?undefined:num(g('lead'))})}
    if(bad.length){err.hidden=false;err.textContent=`Item code${bad.length>1?'s':''} not found: ${bad.join(', ')}`;return}
    const contacts=[...root.querySelectorAll('.krow')].map(r=>Object.fromEntries([...r.querySelectorAll('[data-kf]')].map(i=>[i.dataset.kf,i.value.trim()]))).filter(k=>k.name||k.email||k.phone);
    const doc={...(sid?s:{}),name,abn:$('#su-abn').value.trim(),account:$('#su-acct').value.trim(),address:$('#su-addr').value.trim(),phone:$('#su-phone').value.trim(),email:$('#su-email').value.trim(),terms:num($('#su-terms').value),lead:$('#su-lead').value===''?null:num($('#su-lead').value),category:$('#su-cat').value.trim(),contacts,items:its,notes:$('#su-notes').value.trim(),updatedAt:new Date().toISOString()};
    delete doc._id;if(!sid){doc.createdAt=doc.updatedAt;doc.createdBy=S.me||null}
    const id=sid||S.db.collection('suppliers').doc().id;
    if(await write(()=>S.db.doc('suppliers/'+id).set(doc),'Supplier saved')){
      const i=S.suppliers.findIndex(x=>x._id===id);const v={...doc,_id:id};if(i<0)S.suppliers.push(v);else S.suppliers[i]=v;
      const pref={};for(const iid of Object.keys(its))if(!prefSup(iid))pref[iid]={supplierId:id};
      if(Object.keys(pref).length)await setStockFields(pref);
      close();render();
    }
  };
}

/* purchase orders */
async function savePo(id,patch,note,ok){
  const cur=S.pos.find(p=>p._id===id)||{};const hist=[...(cur.history||[])];if(note)hist.push({at:new Date().toISOString(),by:S.me||null,note});
  const doc={...cur,...patch,history:hist.slice(-60),updatedAt:new Date().toISOString()};delete doc._id;
  const w=await write(()=>S.db.doc('pos/'+id).set(doc),ok);
  if(w){const i=S.pos.findIndex(p=>p._id===id);const v={...doc,_id:id};if(i<0)S.pos.push(v);else S.pos[i]=v;_oo=null}
  return w;
}
const nextPurNo=()=>nextNo(S.pos,'PUR-','no');
function lineFor(sid,id,qty){const si=supItem(sid,id);const q=Math.max(num(qty),num(si?.moq)||0);return {itemId:id,qty:q,price:si?.price!=null?num(si.price):buyOf(id),supCode:si?.supCode||'',received:0}}
async function newPo(sid,lines){
  if(!canW())return;
  if(!sid){
    const root=$('#modal-root');
    root.innerHTML=`<div class="modal-back"><form class="modal" id="npform" novalidate><h2>New purchase order</h2>
      <label class="lb">Supplier<select class="f" id="np-s"><option value="">Choose a supplier…</option>${S.suppliers.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${esc(s._id)}">${esc(s.name)}</option>`).join('')}</select></label>
      ${S.suppliers.length?'':'<div class="note">Add a supplier first on the Suppliers list.</div>'}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="np-c">Cancel</button><button class="btn primary" type="submit">Create</button></div></form></div>`;
    $('#np-c').onclick=()=>root.innerHTML='';
    $('#npform').onsubmit=e=>{e.preventDefault();const v=$('#np-s').value;if(!v)return;root.innerHTML='';newPo(v,lines)};return;
  }
  const s=S.suppliers.find(x=>x._id===sid);const id=S.db.collection('pos').doc().id;const no=nextPurNo();
  const exp=s?.lead?addDays(todayISO(),s.lead):'';
  if(await savePo(id,{no,supplierId:sid,status:'draft',date:todayISO(),expected:exp,lines,deliverTo:co().deliverTo||[co().legal||co().name,co().address].filter(Boolean).join(', '),notes:'',createdAt:new Date().toISOString(),createdBy:S.me||null},`${no} created`,`${no} created`)){S.view='purchasing';S.ptab2='open';setViewBtns();render();poModal(id)}
}
async function reorderPos(){
  _oo=null;
  const need=sortedParts().filter(([id])=>['low','out'].includes(stockStatus(id))).map(([id])=>{const s=stk(id);const q=Math.max(num(s.reorder),num(s.min)-onHand(id)-onOrder(id));return {id,q}}).filter(x=>x.q>0);
  if(!need.length){toast('Nothing to order: everything is at or above minimum, counting stock already on order.');return}
  const by={};const none=[];
  for(const x of need){const sid=prefSup(x.id)||suppliersFor(x.id)[0]?._id;if(!sid){none.push(x.id);continue}(by[sid]=by[sid]||[]).push(lineFor(sid,x.id,x.q))}
  S.busy=true;const made=[];
  for(const [sid,ls] of Object.entries(by)){const id=S.db.collection('pos').doc().id;const no=nextPurNo();const s=S.suppliers.find(x=>x._id===sid);
    if(await savePo(id,{no,supplierId:sid,status:'draft',date:todayISO(),expected:s?.lead?addDays(todayISO(),s.lead):'',lines:ls,deliverTo:co().deliverTo||[co().legal||co().name,co().address].filter(Boolean).join(', '),notes:'Created from reorder list',createdAt:new Date().toISOString(),createdBy:S.me||null},`${no} created from reorder list`))made.push(no)}
  S.busy=false;S.pending=false;render();
  toast((made.length?`Draft POs created: ${made.join(', ')}`:'No POs created')+(none.length?` · ${none.length} item${none.length>1?'s have':' has'} no supplier (${none.slice(0,3).map(pn).join(', ')}${none.length>3?'…':''})`:''));
}
function poModal(pid){
  const po=S.pos.find(p=>p._id===pid);if(!po)return;const wr=canW();const s=S.suppliers.find(x=>x._id===po.supplierId)||{};
  const root=$('#modal-root');const editable=wr&&po.status==='draft';const recv=wr&&['sent','part'].includes(po.status);
  const lrow=(l,i)=>{const p=l.itemId&&S.parts.get(l.itemId);const out=Math.max(0,num(l.qty)-num(l.received));return `<tr class="plrow">
    <td><input class="f mono" data-pf="code" list="po-items" value="${esc(p?p.partNo:'')}" ${editable?'':'disabled'}></td>
    <td class="note pdesc">${esc(p?.description||'')}</td>
    <td><input class="f mono" data-pf="supcode" value="${esc(l.supCode||'')}" ${editable?'':'disabled'}></td>
    <td><input class="f num" data-pf="qty" type="number" min="0" step="any" value="${esc(l.qty)}" ${editable?'':'disabled'}></td>
    <td><input class="f num" data-pf="price" type="number" min="0" step="0.01" value="${esc(l.price)}" ${editable?'':'disabled'}></td>
    <td class="num">${money(num(l.qty)*num(l.price))}</td>
    <td class="num">${qfmt(l.received||0)}</td>
    ${recv?`<td><input class="f num" data-pf="rcv" type="number" min="0" step="any" value="${out}" aria-label="Receive now"></td>`:''}
    <td class="num note">${p?qfmt(onHand(l.itemId)):''}</td>
    <td>${editable?'<button type="button" class="btn small danger" data-plx aria-label="Remove line">×</button>':''}</td></tr>`};
  const tot=poTotal(po);
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="poform" novalidate>
    <div class="head-top"><div style="flex:1"><div class="pnum mono">${esc(po.no)} · <span class="tag po-${po.status}">${esc(PST[po.status])}</span></div><h2>${esc(s.name||'Supplier')}</h2><div class="note">${esc([s.phone,s.email].filter(Boolean).join(' · '))}${po.rfqId?` · from ${esc(S.rfqs.find(x=>x._id===po.rfqId)?.no||'RFQ')}${po.ref?' (quote '+esc(po.ref)+')':''}`:''}</div></div>
      <div class="row"><button type="button" class="btn small primary" data-pa="doc">PO: email / print / PDF</button>${S.downloads?'<button type="button" class="btn small" data-pa="xlsx">Excel</button>':''}<button type="button" class="btn small" id="po-close">Close</button></div></div>
    ${po.status==='draft'?approvalBanner('po',po._id,approvalInfo('po',po)):''}
    <div class="fgrid4">
      <label class="lb">Order date<input class="f" id="po-date" type="date" value="${esc(po.date||'')}" ${editable?'':'disabled'}></label>
      <label class="lb">Expected delivery<input class="f" id="po-exp" type="date" value="${esc(po.expected||'')}" ${wr&&po.status!=='received'?'':'disabled'}></label>
      <label class="lb">Their quote / ref<input class="f" id="po-ref" value="${esc(po.ref||'')}" ${editable?'':'disabled'}></label>
      ${po.status!=='draft'&&po.status!=='cancelled'?`<label class="lb">Supplier invoice no.<input class="f mono" id="po-sinv" value="${esc(po.supInvoice||'')}" ${wr?'':'disabled'}></label><label class="lb">Supplier invoice date<input class="f" id="po-sinvd" type="date" value="${esc(po.supInvoiceDate||'')}" ${wr?'':'disabled'}></label>`:''}
      <label class="lb">Deliver to<input class="f" id="po-to" value="${esc(po.deliverTo||'')}" ${editable?'':'disabled'}></label>
      <label class="lb">For sale (optional)<select class="f" id="po-sale" ${wr&&po.status!=='cancelled'?'':'disabled'}><option value="">Stock replenishment</option>${S.deals.filter(x=>!['closed','lost'].includes(x.stage)||x._id===po.saleId).sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true})).map(x=>`<option value="${esc(x._id)}" ${po.saleId===x._id?'selected':''}>${esc(x.no)} · ${esc(custName(x.customerId))}</option>`).join('')}</select></label>
    </div>
    <datalist id="po-items">${(()=>{const ids=Object.keys(s.items||{});const rest=sortedParts().filter(([id,p])=>!ids.includes(id)&&p.level!=='Product').slice(0,1200).map(x=>x[0]);return [...ids,...rest].filter(id=>S.parts.has(id)).map(id=>{const p=S.parts.get(id);return `<option value="${esc(p.partNo)}">${ids.includes(id)?'★ ':''}${esc(p.orderNo||'')} ${esc(p.description)}</option>`}).join('')})()}</datalist>
    <div class="scroll"><table class="qt"><thead><tr><th>Item code</th><th>Description</th><th>Their part no.</th><th class="num">Qty</th><th class="num">Price ex GST</th><th class="num">Line total</th><th class="num">Received</th>${recv?'<th class="num">Receive now</th>':''}<th class="num">On hand</th><th></th></tr></thead>
      <tbody id="po-lines">${(po.lines||[]).map(lrow).join('')}</tbody>
      <tfoot><tr><td colspan="5">Total ex GST</td><td class="num">${money(tot)}</td><td colspan="${recv?4:3}"></td></tr><tr><td colspan="5">GST 10%</td><td class="num">${money(tot*GST)}</td><td colspan="${recv?4:3}"></td></tr><tr><td colspan="5">Total inc GST</td><td class="num">${money(tot*(1+GST))}</td><td colspan="${recv?4:3}"></td></tr></tfoot></table></div>
    ${editable?'<div class="row"><button type="button" class="btn small" id="po-addl">+ Add line</button><span class="note">★ items are on this supplier’s list; their part number and price fill in.</span></div>':''}
    <label class="lb">Notes to supplier<textarea class="f" id="po-notes" rows="2" ${editable?'':'disabled'}>${esc(po.notes||'')}</textarea></label>
    ${recv?'<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="po-upd" checked> Update each item’s buy price to the PO price when received</label>':''}
    <div class="row">
      ${editable?'<button type="button" class="btn" data-pa="save">Save draft</button><button type="button" class="btn primary" data-pa="send">Mark as sent</button><button type="button" class="btn danger" data-pa="cancel">Cancel PO</button>':''}
      ${wr&&['sent','part','received'].includes(po.status)?'<button type="button" class="btn" data-pa="saveinv">Save supplier invoice</button>':''}
      ${recv?'<button type="button" class="btn primary" data-pa="receive">Receive into stock</button><button type="button" class="btn" data-pa="saveexp">Save expected date</button><button type="button" class="btn danger" data-pa="close">Close short</button>':''}
    </div>
    <details><summary class="note" style="cursor:pointer">Activity (${(po.history||[]).length})</summary><div class="scroll" style="margin-top:6px"><table><tbody>${(po.history||[]).slice().reverse().map(h=>`<tr><td class="note" style="white-space:nowrap">${esc(when(h.at))}</td><td>${esc(h.note)}</td><td><span data-uid="${esc(h.by||'')}">…</span></td></tr>`).join('')}</tbody></table></div></details>
  </form></div>`;
  fillNames();
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}else render()};
  bindApprovals(root,()=>poModal(pid));
  $('#po-close').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  $('#poform').onsubmit=e=>e.preventDefault();
  const tb=$('#po-lines');
  const wire=()=>{tb.querySelectorAll('[data-plx]').forEach(b=>b.onclick=()=>b.closest('tr').remove());
    tb.querySelectorAll('[data-pf="code"]').forEach(i=>i.onchange=()=>{const id=findByNo(i.value);const tr=i.closest('tr');tr.querySelector('.pdesc').textContent=id?S.parts.get(id).description:'Not found';if(id){const l=lineFor(po.supplierId,id,tr.querySelector('[data-pf="qty"]').value||1);tr.querySelector('[data-pf="supcode"]').value=l.supCode;tr.querySelector('[data-pf="price"]').value=l.price||'';tr.querySelector('[data-pf="qty"]').value=l.qty}})};wire();
  const al=$('#po-addl');if(al)al.onclick=()=>{const t=document.createElement('tbody');t.innerHTML=lrow({qty:1,price:''},0);tb.appendChild(t.firstElementChild);wire();tb.lastElementChild.querySelector('input').focus()};
  const read=()=>{const lines=[];const bad=[];for(const tr of tb.querySelectorAll('.plrow')){const g=k=>tr.querySelector(`[data-pf="${k}"]`)?.value??'';if(!g('code').trim())continue;const id=findByNo(g('code'));if(!id){bad.push(g('code'));continue}lines.push({itemId:id,supCode:g('supcode').trim(),qty:num(g('qty')),price:num(g('price')),received:0})}
    return {bad,patch:{saleId:$('#po-sale').value||null,lines,date:$('#po-date').value,expected:$('#po-exp').value,ref:$('#po-ref').value.trim(),deliverTo:$('#po-to').value.trim(),notes:$('#po-notes').value}}};
  root.querySelectorAll('[data-pa]').forEach(b=>b.onclick=async()=>{
    const a=b.dataset.pa;
    if(a==='save'||a==='send'){const r=read();if(r.bad.length){toast('Item code not found: '+r.bad.join(', '));return}if(a==='send'&&!r.patch.lines.length){toast('Add at least one line.');return}
      if(a==='send'&&!['none','approved'].includes(approvalInfo('po',{...po,...r.patch}).state)){await savePo(pid,r.patch);toast('This PO needs approval before it is sent.');return poModal(pid)}
      await savePo(pid,{...r.patch,...(a==='send'?{status:'sent',sentAt:todayISO()}:{})},a==='send'?'Sent to supplier':'Draft saved',a==='send'?`${po.no} marked as sent`:'Draft saved');return poModal(pid)}
    if(a==='doc'||a==='xlsx'){if(editable){const r=read();if(r.bad.length){toast('Item code not found: '+r.bad.join(', '));return}await savePo(pid,r.patch)}const p2=S.pos.find(x=>x._id===pid);return a==='doc'?docDialog(specPo(p2),{after:()=>poModal(pid)}):poXlsx(p2)}
    if(a==='cancel'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to cancel';return}await savePo(pid,{status:'cancelled'},'Cancelled','PO cancelled');return close()}
    if(a==='saveinv'){await savePo(pid,{saleId:$('#po-sale').value||null,supInvoice:$('#po-sinv').value.trim(),supInvoiceDate:$('#po-sinvd').value},'Supplier invoice '+$('#po-sinv').value.trim()+' recorded','Supplier invoice saved');return poModal(pid)}
    if(a==='saveexp'){await savePo(pid,{expected:$('#po-exp').value},'Expected date changed to '+$('#po-exp').value,'Saved');return poModal(pid)}
    if(a==='close'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again: close with lines unreceived';return}await savePo(pid,{status:'received',closedShort:true},'Closed short','PO closed');return close()}
    if(a==='receive'){
      const rows=[...tb.querySelectorAll('.plrow')];const lines=(po.lines||[]).map(l=>({...l}));const ch=[];const upd=$('#po-upd')?.checked;
      rows.forEach((tr,i)=>{const r=num(tr.querySelector('[data-pf="rcv"]')?.value);if(r>0&&lines[i]){lines[i].received=num(lines[i].received)+r;ch.push({id:lines[i].itemId,qty:r,price:lines[i].price})}});
      if(!ch.length){toast('Enter a quantity to receive.');return}
      b.disabled=true;S.busy=true;
      const ok=await moveStock(ch.map(c=>({id:c.id,qty:c.qty})),'receive',`${po.no} · ${s.name||''}`);
      if(ok){if(upd)for(const c of ch)if(c.price&&c.price!==buyOf(c.id))await setPrice(c.id,{buy:c.price},{source:`${po.no} received from ${s.name||'supplier'}`});
        const all=lines.every(l=>num(l.received)>=num(l.qty));
        await savePo(pid,{lines,status:all?'received':'part',...(all?{receivedAt:todayISO()}:{})},`Received ${ch.map(c=>qfmt(c.qty)+' × '+pn(c.id)).join(', ')}`,all?`${po.no} fully received`:`${po.no} part received`)}
      S.busy=false;S.pending=false;return poModal(pid)}
  });
}
async function poXlsx(po){
  if(!xlsxReady())return;const s=S.suppliers.find(x=>x._id===po.supplierId)||{};const tot=poTotal(po);
  const aoa=[[co().legal||co().name],['ABN '+co().abn],[coLine()],['PURCHASE ORDER'],[po.no,'',`Date ${fmtDate(po.date)}`,'',po.expected?`Required by ${fmtDate(po.expected)}`:''],[],['Supplier',s.name||''],['Deliver to',po.deliverTo||''],[],['Our code','Description','Your part no.','Qty','Unit price','Total']];
  (po.lines||[]).forEach(l=>{const p=S.parts.get(l.itemId)||{};aoa.push([p.partNo||'',p.description||'',l.supCode||'',num(l.qty),num(l.price),+(num(l.qty)*num(l.price)).toFixed(2)])});
  aoa.push([],['','','','','Total ex GST',+tot.toFixed(2)],['','','','','GST 10%',+(tot*GST).toFixed(2)],['','','','','Total inc GST',+(tot*(1+GST)).toFixed(2)],[],[po.notes||''],['Please quote '+po.no+' on all delivery dockets and invoices.']);
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:12},{wch:50},{wch:16},{wch:8},{wch:14},{wch:12}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Purchase order');await saveWb(wb,`${po.no}.xlsx`);
}
async function exportPurch(){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  const rows=[];for(const po of S.pos.slice().sort((a,b)=>String(a.no).localeCompare(String(b.no),undefined,{numeric:true})))for(const l of po.lines||[]){const p=S.parts.get(l.itemId)||{};rows.push({PO:po.no,Status:PST[po.status]||po.status,Supplier:supName(po.supplierId),Date:po.date||'',Expected:po.expected||'','Item code':p.partNo||l.itemId,Description:p.description||'','Supplier part no.':l.supCode||'',Qty:num(l.qty),Received:num(l.received),Price:num(l.price),'Line total':+(num(l.qty)*num(l.price)).toFixed(2)})}
  sheet(wb,rows,'PO lines',[10,13,24,11,11,12,44,16,6,8,10,11]);
  const si=[];for(const s of S.suppliers)for(const [id,v] of Object.entries(s.items||{})){const p=S.parts.get(id)||{};si.push({Supplier:s.name,'Item code':p.partNo||id,Description:p.description||'','Their part no.':v.supCode||'',Price:v.price??'','Min order':v.moq??'','Lead days':v.lead??'',Preferred:prefSup(id)===s._id?'Yes':''})}
  sheet(wb,S.suppliers.map(s=>({Supplier:s.name,ABN:s.abn||'',Phone:s.phone||'',Email:s.email||'',Address:s.address||'','Terms (days)':s.terms??'','Lead (days)':s.lead??'',Supplies:s.category||'',Contacts:(s.contacts||[]).map(k=>[k.name,k.role,k.email,k.phone].filter(Boolean).join(' / ')).join('; ')})),'Suppliers',[26,14,14,26,30,10,10,24,60]);
  sheet(wb,si,'Supplier price list',[24,12,44,16,10,9,9,9]);
  await saveWb(wb,`purchasing_${stamp(new Date().toISOString())}.xlsx`);
}

/* ---------- sales pipeline ---------- */
const STAGES=[['lead','Lead'],['quote','Quote'],['po','PO received'],['production','Production'],['ready','Ready'],['dispatched','Dispatched'],['invoiced','Invoiced'],['closed','Closed · paid'],['lost','Lost']];
const STG=Object.fromEntries(STAGES);
const GST=0.10;
const CO_DEF={name:'PCS',legal:'',abn:'',tagline:'White Label Conveyor Products',address:'',phone:'',email:'',web:'',contact:'Jack Morris',contactRole:'Operations Manager',contactPhone:'0408 081 703',contactEmail:'',deliverTo:'',quoteTerms:'Prices in AUD ex GST. Delivery ex works unless stated. Payment 30 days from invoice.',poTerms:'Please quote our PO number on all delivery dockets and invoices.',bankName:'',bankBsb:'',bankAcct:'',bankAcctName:'',xeroSales:'200',xeroPurch:'300',xeroTaxSales:'GST on Income',xeroTaxPurch:'GST on Expenses'};
const co=()=>({...CO_DEF,...(S.company||{})});
const coLine=()=>{const c=co();return [c.address,c.phone&&'Ph '+c.phone,c.email,c.web].filter(Boolean).join('  ·  ')};
const coContact=()=>{const c=co();return c.contact?[c.contact+(c.contactRole?', '+c.contactRole:''),c.contactPhone&&'M '+c.contactPhone,c.contactEmail].filter(Boolean).join('  ·  '):''};
function companyModal(){
  const c=co();const wr=canW();const root=$('#modal-root');
  const f=(k,l,o={})=>`<label class="lb ${o.full?'full':''}">${l}${o.area?`<textarea class="f" id="co-${k}" rows="3" ${wr?'':'disabled'}>${esc(c[k]||'')}</textarea>`:`<input class="f" id="co-${k}" value="${esc(c[k]||'')}" ${o.ph?`placeholder="${esc(o.ph)}"`:''} ${wr?'':'disabled'}>`}</label>`;
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="coform" novalidate>
    <div class="row" style="gap:12px"><img src="data:image/png;base64,${LOGO_B64}" alt="" width="48" height="49"><div><h2>Company details</h2><div class="note">Used on quotes and purchase orders.</div></div></div>
    <div class="fgrid">${f('name','Trading name *')}${f('legal','Legal entity name',{ph:'e.g. … Pty Ltd'})}${f('abn','ABN',{ph:'Leave blank until you have it'})}${f('tagline','Tagline')}
      ${f('address','Address',{full:true})}${f('phone','Phone')}${f('email','Email')}${f('web','Website')}${f('deliverTo','Default PO delivery address',{ph:'Defaults to the address above'})}
      ${f('contact','Quote contact name')}${f('contactRole','Contact role')}${f('contactPhone','Contact mobile')}${f('contactEmail','Contact email')}
      ${f('xeroSales','Xero sales account code')}${f('xeroPurch','Xero purchases account code')}${f('xeroTaxSales','Xero tax rate on sales')}${f('xeroTaxPurch','Xero tax rate on purchases')}
      ${f('bankAcctName','Bank account name')}${f('bankName','Bank')}${f('bankBsb','BSB')}${f('bankAcct','Account number')}
      ${f('quoteTerms','Default quote terms',{full:true,area:true})}${f('poTerms','Default note on purchase orders',{full:true,area:true})}</div>
    <div class="warn" id="co-err" hidden></div>
    <div class="row" style="justify-content:flex-end">${S.db&&S.downloads?'<button type="button" class="btn" id="co-export" title="Download every record and file as one zip, for backup or moving to another server">Export all data</button>':''}${window.PCS&&S.role==='admin'?'<button type="button" class="btn" id="co-team">Team access</button><button type="button" class="btn" id="co-bk">Backups</button>':''}${window.PCS?'<button type="button" class="btn" id="co-out">Sign out</button>':''}<span style="flex:1"></span><button type="button" class="btn" id="co-c">Close</button>${wr?'<button class="btn primary" type="submit">Save</button>':''}</div></form></div>`;
  $('#co-c').onclick=()=>root.innerHTML='';
  const cx=$('#co-export');if(cx)cx.onclick=exportAll;const ct=$('#co-team');if(ct)ct.onclick=teamModal;const cbk=$('#co-bk');if(cbk)cbk.onclick=backupsModal;const cso=$('#co-out');if(cso)cso.onclick=()=>{location.href='/api/auth/logout'};$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))root.innerHTML=''};
  $('#coform').onsubmit=async e=>{e.preventDefault();const d={};for(const k of Object.keys(CO_DEF))d[k]=$('#co-'+k).value.trim();
    if(!d.name){const er=$('#co-err');er.hidden=false;er.textContent='Trading name is required.';return}
    d.updatedAt=new Date().toISOString();if(await write(()=>S.db.doc('settings/company').set(d),'Company details saved')){S.company=d;root.innerHTML='';render()}};
}
const custName=id=>S.customers.find(c=>c._id===id)?.name||'';
const nextNo=(arr,prefix,field)=>{let mx=0;for(const x of arr){const v=String(x[field]||'');if(!v.startsWith(prefix))continue;const n=parseInt(v.slice(prefix.length),10);if(n>mx)mx=n}return prefix+String(mx+1).padStart(4,'0')};
const allQuotes=()=>S.deals.filter(d=>d.quote).map(d=>d.quote);
const docketsOf=d=>d.dockets||(d.dispatch?[d.dispatch]:[]);
const invoicesOf=d=>d.invoices||(d.invoice?[d.invoice]:[]);
const allInv=()=>S.deals.flatMap(invoicesOf);
const allDockets=()=>S.deals.flatMap(docketsOf);
const suppliedQty=(d,i)=>docketsOf(d).reduce((a,k)=>a+num(((k.lines||[]).find(l=>l.li===i)||(k.lines||[]).find((l,j)=>l.li==null&&j===i)||{}).supplied),0);
const backOrder=d=>(d.quote?.lines||[]).map((l,i)=>Math.max(0,num(l.qty)-suppliedQty(d,i)));
const hasBO=d=>backOrder(d).some(x=>x>1e-9);
const uninvoiced=d=>docketsOf(d).filter(k=>!invoicesOf(d).some(v=>v.docketNo===k.docketNo));
const unpaid=d=>invoicesOf(d).filter(v=>!v.paid).reduce((a,v)=>a+num(v.amount),0);
function qTotals(q){const sub=(q?.lines||[]).reduce((a,l)=>a+num(l.qty)*num(l.price)*(1-num(l.disc)/100),0);const gst=sub*(q?.gst===false?0:GST);return {sub,gst,total:sub+gst}}
const dealValue=d=>d.quote?.lines?.length?qTotals(d.quote).sub:num(d.value);
const dealOrders=d=>S.orders.filter(o=>o.dealId===d._id);
const todayISO=()=>new Date().toISOString().slice(0,10);
const addDays=(iso,n)=>{const d=new Date(iso||Date.now());d.setDate(d.getDate()+num(n));return d.toISOString().slice(0,10)};
const fmtDate=iso=>{if(!iso)return '—';try{return new Date(iso.length===10?iso+'T00:00':iso).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'})}catch(e){return iso}};

function salesHTML(){
  const wr=canW();
  const open=S.deals.filter(d=>!['closed','lost'].includes(d.stage));
  const m0=new Date().toISOString().slice(0,7);
  const qOut=S.deals.filter(d=>d.stage==='quote').reduce((a,d)=>a+dealValue(d),0);
  const poM=S.deals.filter(d=>String(d.po?.date||'').startsWith(m0)).reduce((a,d)=>a+num(d.po?.value||dealValue(d)),0);
  const invM=allInv().filter(v=>String(v.date||'').startsWith(m0)).reduce((a,v)=>a+num(v.amount),0);
  const owing=S.deals.reduce((a,d)=>a+unpaid(d),0);
  const head=`<div class="head">
    <div class="head-top"><div style="flex:1"><div class="pnum">One sale number from lead to payment: lead → quote → PO → production → dispatch → invoice → closed</div><h1>Sales</h1></div>
      <div class="row">${wr?(S.stab==='customers'?'<button class="btn primary" id="new-cust">+ New customer</button>':'<button class="btn primary" id="new-deal">+ New lead</button>'):''}${window.PCS&&S.xeroStatus?.connected?'<button class="btn" id="xero-sync" title="Pull payments from Xero; fully paid sales close">Sync Xero payments</button>':''}${S.downloads?`<button class="btn" id="xero-inv">${window.PCS&&S.xeroStatus?.connected?'Send invoices to Xero':'Xero invoices'}</button><button class="btn" id="exp-deals">Export</button>`:''}</div></div>
    <div class="tiles">
      <div class="tile"><div class="l">Open pipeline</div><div class="big">${money(open.reduce((a,d)=>a+dealValue(d),0))}</div><div class="note">${open.length} deal${open.length===1?'':'s'} · ex GST</div></div>
      <div class="tile"><div class="l">Quotes out</div><div class="big">${money(qOut)}</div></div>
      <div class="tile"><div class="l">POs received this month</div><div class="big">${money(poM)}</div></div>
      <div class="tile"><div class="l">Invoiced this month</div><div class="big">${money(invM)}</div><div class="note">${money(owing)} unpaid</div></div>
    </div>
    <div class="row"><div class="chips"><button class="chip" data-stab="pipeline" aria-pressed="${S.stab==='pipeline'}">Pipeline</button><button class="chip" data-stab="list" aria-pressed="${S.stab==='list'}">All deals</button><button class="chip" data-stab="history" aria-pressed="${S.stab==='history'}">Sales history (${S.deals.filter(isHist).length})</button><button class="chip" data-stab="attention" aria-pressed="${S.stab==='attention'}">Needs attention (${(window.PCS?attnMine():attnAll()).length})</button><button class="chip" data-stab="customers" aria-pressed="${S.stab==='customers'}">Customers (${S.customers.length})</button>${window.PCS?`<button class="chip" data-stab="emails" aria-pressed="${S.stab==='emails'}">Sent emails</button>`:''}</div>
      <input class="f" id="sl-q" type="search" placeholder="Search sale, customer, quote, PO, docket or invoice no." style="max-width:320px" value="${esc(S.slq)}">
      ${S.stab==='history'?(()=>{const fys=[...new Set(S.deals.filter(isHist).map(d=>fyOf(d.closedAt)).filter(Boolean))].sort((a,b)=>b-a);return `<select class="f" id="h-fy" style="max-width:170px" aria-label="Financial year"><option value="all">All years</option>${fys.map(y=>`<option value="${y}" ${String(S.hfy)===String(y)?'selected':''}>FY${y} (Jul ${y-1} – Jun ${y})</option>`).join('')}</select>${S.downloads?'<button class="btn" id="h-exp">Export history</button>':''}`})():''}
      ${S.stab==='pipeline'?`<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="sl-lost" ${S.showLost?'checked':''}> Show lost</label>`:''}</div>
  </div>`;
  const q=S.slq.toLowerCase();
  const match=d=>!q||[d.no,d.title,custName(d.customerId),d.contact,d.quote?.no,d.po?.no,...docketsOf(d).map(k=>k.docketNo),...invoicesOf(d).map(v=>v.no)].join(' ').toLowerCase().includes(q);
  let body='';
  if(S.stab==='attention')body=(window.PCS?'<div class="note" style="margin-bottom:8px">Items for you. Open the bell for everyone’s.</div>':'')+attnListHTML(window.PCS?attnMine():attnAll());
  else if(S.stab==='emails')body=emailsHTML(['quote','invoice','docket','packing','build'],q);
  else if(S.stab==='customers'){
    const cs=S.customers.filter(c=>!q||[c.name,c.abn,c.site,...(c.contacts||[]).map(x=>x.name+' '+x.email)].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a.name).localeCompare(b.name));
    body=!cs.length?`<div class="empty"><strong>No customers yet</strong>Add a customer, or create one while you add a lead.</div>`:`<div class="scroll"><table><thead><tr><th>Customer</th><th>Site / address</th><th>Main contact</th><th>Phone</th><th class="num">Open deals</th><th class="num">Won value</th></tr></thead><tbody>${cs.map(c=>{const ds=S.deals.filter(d=>d.customerId===c._id);const won=ds.filter(d=>['po','production','ready','dispatched','invoiced','closed'].includes(d.stage)).reduce((a,d)=>a+dealValue(d),0);const k=(c.contacts||[])[0]||{};return `<tr><td><button class="link" data-cust="${esc(c._id)}">${esc(c.name)}</button></td><td class="note">${esc(c.site||c.address||'')}</td><td>${esc(k.name||'')}</td><td class="note">${esc(k.phone||'')}</td><td class="num">${ds.filter(d=>!['invoiced','closed','lost'].includes(d.stage)).length||''}</td><td class="num">${won?money(won):''}</td></tr>`}).join('')}</tbody></table></div>`;
  }else if(S.stab==='history'){
    const rows=S.deals.filter(d=>isHist(d)&&match(d)&&(S.hfy==='all'||String(fyOf(d.closedAt))===String(S.hfy))).sort((a,b)=>String(b.closedAt||'').localeCompare(String(a.closedAt||''))||String(b.no).localeCompare(String(a.no),undefined,{numeric:true})).map(histRow);
    S._hrows=rows;const tv=rows.reduce((a,r)=>a+dealValue(r.d),0),ti=rows.reduce((a,r)=>a+r.inv,0);const dd=rows.filter(r=>r.days!=null);const avg=dd.length?Math.round(dd.reduce((a,r)=>a+r.days,0)/dd.length):null;
    body=`<div class="note" style="margin:0 0 10px">Sales move here automatically ${HIST_DAYS} days after they close (all invoices paid). Every record stays linked to its sale number: open a row for the full quote, PO, build, docket and invoice trail.</div>`+(!rows.length?`<div class="empty"><strong>No historic sales${q||S.hfy!=='all'?' match':' yet'}</strong>A closed sale lands here ${HIST_DAYS} days after its final payment.</div>`:`<div class="tiles" style="margin-bottom:12px"><div class="tile"><div class="l">Sales in manifest</div><div class="big">${rows.length}</div></div><div class="tile"><div class="l">Value ex GST</div><div class="big">${money(tv)}</div></div><div class="tile"><div class="l">Invoiced inc GST</div><div class="big">${money(ti)}</div></div><div class="tile"><div class="l">Avg lead to paid</div><div class="big">${avg==null?'—':avg+' days'}</div></div></div><div class="scroll"><table><thead><tr><th>Sale no.</th><th>Customer</th><th>Title</th><th>Quote</th><th>Customer PO</th><th>Dockets</th><th>Invoices</th><th class="num">Value ex GST</th><th class="num">Invoiced inc GST</th><th>Last payment</th><th>Closed</th><th class="num">Days</th></tr></thead><tbody>${rows.map(({d,inv,days})=>`<tr><td><button class="link mono" data-deal="${esc(d._id)}">${esc(d.no)}</button></td><td>${esc(custName(d.customerId))}</td><td class="desc">${esc(d.title||'')}</td><td class="mono note">${esc(d.quote?.no||'')}</td><td class="mono note">${esc(d.po?.no||'')}</td><td class="mono note">${esc(docketsOf(d).map(k=>k.docketNo).join(', '))}</td><td class="mono note">${esc(invoicesOf(d).map(v=>v.no).join(', '))}</td><td class="num">${money(dealValue(d))}</td><td class="num">${money(inv)}</td><td class="note">${esc(fmtDate(lastPaid(d)))}</td><td class="note">${esc(fmtDate(d.closedAt))}</td><td class="num">${days??''}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="7">Total</th><th class="num">${money(tv)}</th><th class="num">${money(ti)}</th><th colspan="3"></th></tr></tfoot></table></div>`);
  }else if(S.stab==='list'){
    const ds=S.deals.filter(d=>match(d)&&!isHist(d)).sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true}));
    body=!ds.length?`<div class="empty"><strong>No deals yet</strong>Add a lead to start the pipeline.</div>`:`<div class="scroll"><table><thead><tr><th>Sale no.</th><th>Stage</th><th>Customer</th><th>Title</th><th>Quote</th><th>Customer PO</th><th>Docket</th><th>Invoice</th><th class="num">Value ex GST</th><th>Next action</th></tr></thead><tbody>${ds.map(d=>`<tr><td><button class="link mono" data-deal="${esc(d._id)}">${esc(d.no)}</button></td><td><span class="tag stg-${d.stage}">${esc(STG[d.stage]||d.stage)}</span></td><td>${esc(custName(d.customerId))}</td><td class="desc">${esc(d.title||'')}</td><td class="mono note">${esc(d.quote?.no||'')}</td><td class="mono note">${esc(d.po?.no||'')}</td><td class="mono note">${esc(docketsOf(d).map(k=>k.docketNo).join(', '))}${hasBO(d)&&docketsOf(d).length?' <span class="tag st-low">Back order</span>':''}</td><td class="mono note">${esc(invoicesOf(d).map(v=>v.no+(v.paid?' ✓':'')).join(', '))}</td><td class="num">${money(dealValue(d))}</td><td class="note">${d.nextDate?esc(fmtDate(d.nextDate))+' · ':''}${esc(d.nextAction||'')}</td></tr>`).join('')}</tbody></table></div>`;
  }else{
    const cols=STAGES.filter(([k])=>k!=='lost'||S.showLost);
    body=`<div class="board">${cols.map(([k,l])=>{const ds=S.deals.filter(d=>d.stage===k&&match(d)&&(k!=='closed'||!isHist(d))).sort((a,b)=>String(a.nextDate||'9').localeCompare(String(b.nextDate||'9')));const tot=ds.reduce((a,d)=>a+dealValue(d),0);
      return `<div class="col"><div class="colh"><span>${esc(l)}</span><span class="note">${ds.length} · ${money(tot)}</span></div>${ds.map(d=>{const due=d.nextDate&&d.nextDate<todayISO();return `<button class="card" data-deal="${esc(d._id)}"><div class="row" style="justify-content:space-between;gap:6px"><span class="mono note">${esc(d.no)}</span><strong>${money(dealValue(d))}</strong></div><div class="ct">${esc(custName(d.customerId)||'No customer')}</div><div class="note">${esc(d.title||'')}</div>${dealFlag(d._id)}${d.nextAction||d.nextDate?`<div class="note ${due?'neg':''}">${d.nextDate?esc(fmtDate(d.nextDate))+' · ':''}${esc(d.nextAction||'')}</div>`:''}${k==='production'?`<div class="note">${dealOrders(d).filter(o=>o.status!=='open').length}/${dealOrders(d).length} built</div>`:''}${docketsOf(d).length&&hasBO(d)?'<div class="note"><span class="tag st-low">Back order</span></div>':''}${uninvoiced(d).length?`<div class="note">${uninvoiced(d).length} docket${uninvoiced(d).length>1?'s':''} to invoice</div>`:''}</button>`}).join('')||'<div class="note" style="padding:8px">—</div>'}</div>`}).join('')}</div>`;
  }
  return `<section class="panel">${head}<div class="tabbody">${body}</div></section>`;
}
function bindSales(){
  const m=$('#main');bindCommon(m);
  m.querySelectorAll('[data-stab]').forEach(b=>b.onclick=()=>{S.stab=b.dataset.stab;renderMain()});
  const sq=$('#sl-q');sq.oninput=()=>{S.slq=sq.value;const pos=sq.selectionStart;renderMain();const n=$('#sl-q');n.focus();n.setSelectionRange(pos,pos)};
  const sl=$('#sl-lost');if(sl)sl.onchange=()=>{S.showLost=sl.checked;renderMain()};
  const hf=$('#h-fy');if(hf)hf.onchange=()=>{S.hfy=hf.value;renderMain()};const he=$('#h-exp');if(he)he.onclick=()=>exportHistory(S._hrows||[]);
  m.querySelectorAll('[data-deal]').forEach(b=>b.onclick=()=>dealModal(b.dataset.deal));
  m.querySelectorAll('[data-cust]').forEach(b=>b.onclick=()=>customerModal(b.dataset.cust));fillNames();
  bindAttn(m,()=>render());
  const nd=$('#new-deal');if(nd)nd.onclick=()=>dealModal(null);
  const nc=$('#new-cust');if(nc)nc.onclick=()=>customerModal(null);
  const ex=$('#exp-deals');if(ex)ex.onclick=exportDeals;
  const xi=$('#xero-inv');if(xi)xi.onclick=()=>xeroModal('invoices');
  const xsy=$('#xero-sync');if(xsy)xsy.onclick=async()=>{xsy.disabled=true;try{const r=await PCS.post('/api/xero/sync',{});toast(`Xero: ${r.invoicesPaid} invoice${r.invoicesPaid===1?'':'s'} paid, ${r.salesClosed} sale${r.salesClosed===1?'':'s'} closed`)}catch(e){toast(e.message)}finally{xsy.disabled=false}};
}

/* customers */
function customerModal(cid){
  if(!canW()&&!cid)return;
  const c=cid?S.customers.find(x=>x._id===cid):{contacts:[{}]};if(!c)return;const wr=canW();
  const deals=cid?S.deals.filter(d=>d.customerId===cid):[];
  const root=$('#modal-root');
  const crow=(k,i)=>`<div class="krow" data-k="${i}"><input class="f" data-kf="name" placeholder="Name" value="${esc(k.name||'')}"><input class="f" data-kf="role" placeholder="Role" value="${esc(k.role||'')}"><input class="f" data-kf="email" placeholder="Email" value="${esc(k.email||'')}"><input class="f" data-kf="phone" placeholder="Phone" value="${esc(k.phone||'')}"><button type="button" class="btn small danger" data-kx aria-label="Remove contact">×</button></div>`;
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="cuform" novalidate>
    <h2>${cid?esc(c.name):'New customer'}</h2>
    <div class="fgrid">
      <label class="lb">Company name *<input class="f" id="cu-name" value="${esc(c.name||'')}"></label>
      <label class="lb">ABN<input class="f" id="cu-abn" value="${esc(c.abn||'')}"></label>
      <label class="lb full">Site / address<input class="f" id="cu-site" value="${esc(c.site||'')}"></label>
      <label class="lb">Payment terms (days)<input class="f num" id="cu-terms" type="number" min="0" value="${esc(c.terms??30)}"></label>
      <label class="lb">Customer type<input class="f" id="cu-type" list="cu-types" value="${esc(c.type||'')}"><datalist id="cu-types"><option>Mine site</option><option>Quarry</option><option>Port</option><option>Contractor</option><option>Distributor</option></datalist></label>
    </div>
    <div><div class="h2" style="font-size:16px;margin-bottom:6px">Contacts</div><div id="cu-k">${(c.contacts||[]).map(crow).join('')}</div><button type="button" class="btn small" id="cu-add">+ Add contact</button></div>
    <label class="lb">Notes<textarea class="f" id="cu-notes" rows="2">${esc(c.notes||'')}</textarea></label>
    ${deals.length?`<div><div class="h2" style="font-size:16px;margin-bottom:6px">Deals</div><div class="scroll"><table><tbody>${deals.map(d=>`<tr><td class="mono">${esc(d.no)}</td><td><span class="tag stg-${d.stage}">${esc(STG[d.stage])}</span></td><td>${esc(d.title||'')}</td><td class="num">${money(dealValue(d))}</td></tr>`).join('')}</tbody></table></div></div>`:''}
    <div class="warn" id="cu-err" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="cu-cancel">Close</button>${wr?'<button class="btn primary" type="submit">Save customer</button>':''}</div>
  </form></div>`;
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
  $('#cu-cancel').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const wire=()=>root.querySelectorAll('[data-kx]').forEach(b=>b.onclick=()=>b.closest('.krow').remove());wire();
  $('#cu-add').onclick=()=>{const d=document.createElement('div');d.innerHTML=crow({},Date.now());$('#cu-k').appendChild(d.firstElementChild);wire()};
  $('#cuform').onsubmit=async e=>{
    e.preventDefault();const name=$('#cu-name').value.trim();if(!name){const er=$('#cu-err');er.hidden=false;er.textContent='Company name is required.';return}
    const contacts=[...root.querySelectorAll('.krow')].map(r=>Object.fromEntries([...r.querySelectorAll('[data-kf]')].map(i=>[i.dataset.kf,i.value.trim()]))).filter(k=>k.name||k.email||k.phone);
    const doc={...(cid?c:{}),name,abn:$('#cu-abn').value.trim(),site:$('#cu-site').value.trim(),terms:num($('#cu-terms').value),type:$('#cu-type').value.trim(),contacts,notes:$('#cu-notes').value.trim(),updatedAt:new Date().toISOString()};
    delete doc._id;if(!cid){doc.createdAt=doc.updatedAt;doc.createdBy=S.me||null}
    const id=cid||S.db.collection('customers').doc().id;
    if(await write(()=>S.db.doc('customers/'+id).set(doc),'Customer saved')){const i=S.customers.findIndex(x=>x._id===id);const v={...doc,_id:id};if(i<0)S.customers.push(v);else S.customers[i]=v;close();render()}
  };
}
async function ensureCustomer(name){
  name=name.trim();if(!name)return '';
  const ex=S.customers.find(c=>c.name.toLowerCase()===name.toLowerCase());if(ex)return ex._id;
  const id=S.db.collection('customers').doc().id;const doc={name,contacts:[],terms:30,createdAt:new Date().toISOString(),createdBy:S.me||null};
  if(await write(()=>S.db.doc('customers/'+id).set(doc)))S.customers.push({...doc,_id:id});
  return id;
}

/* deals */
async function saveDeal(id,patch,note,ok){
  const cur=S.deals.find(d=>d._id===id)||{};
  const hist=[...(cur.history||[])];
  if(note)hist.push({at:new Date().toISOString(),by:S.me||null,note,stage:patch.stage||cur.stage});
  const doc={...cur,...patch,history:hist.slice(-60),updatedAt:new Date().toISOString()};delete doc._id;
  const okw=await write(()=>S.db.doc('deals/'+id).set(doc),ok);
  if(okw){const i=S.deals.findIndex(d=>d._id===id);const v={...doc,_id:id};if(i<0)S.deals.push(v);else S.deals[i]=v}
  return okw;
}
function dealModal(did){
  const wr=canW();
  const isNew=!did;let d=did?S.deals.find(x=>x._id===did):null;if(did&&!d)return;
  const root=$('#modal-root');
  if(isNew){
    root.innerHTML=`<div class="modal-back"><form class="modal" id="dnew" novalidate>
      <h2>New lead</h2>
      <div class="fgrid">
        <label class="lb full">Customer *<input class="f" id="dn-cust" list="dn-cl" placeholder="Pick or type a new company"><datalist id="dn-cl">${S.customers.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist></label>
        <label class="lb">Contact<input class="f" id="dn-contact" list="dn-kl"><datalist id="dn-kl"></datalist></label>
        <label class="lb">Source<input class="f" id="dn-src" list="dn-sl" placeholder="e.g. site visit, phone, tender"><datalist id="dn-sl"><option>Site visit</option><option>Phone enquiry</option><option>Email</option><option>Tender</option><option>Repeat customer</option><option>Referral</option></datalist></label>
        <label class="lb full">What do they need? *<input class="f" id="dn-title" placeholder="e.g. 2 × primary cleaners for CV-12, 1200 belt"></label>
        <label class="lb">Estimated value ex GST ($)<input class="f num" id="dn-val" type="number" min="0" step="1"></label>
        <label class="lb">Next action date<input class="f" id="dn-nd" type="date" value="${addDays(todayISO(),2)}"></label>
        <label class="lb full">Next action<input class="f" id="dn-na" placeholder="e.g. Measure belt and send quote"></label>
        <label class="lb full">Notes<textarea class="f" id="dn-notes" rows="2"></textarea></label>
      </div>
      <div class="warn" id="dn-err" hidden></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="dn-cancel">Cancel</button><button class="btn primary" type="submit">Add lead</button></div>
    </form></div>`;
    const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}};
    $('#dn-cancel').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
    $('#dn-cust').oninput=()=>{const c=S.customers.find(x=>x.name.toLowerCase()===$('#dn-cust').value.trim().toLowerCase());$('#dn-kl').innerHTML=(c?.contacts||[]).map(k=>`<option value="${esc(k.name)}">`).join('')};
    $('#dn-cust').focus();
    $('#dnew').onsubmit=async e=>{
      e.preventDefault();const er=$('#dn-err');const cn=$('#dn-cust').value.trim(),t=$('#dn-title').value.trim();
      if(!cn||!t){er.hidden=false;er.textContent='Customer and what they need are required.';return}
      const cid=await ensureCustomer(cn);const id=S.db.collection('deals').doc().id;const no=nextNo(S.deals,'SO-','no');
      if(await saveDeal(id,{no,customerId:cid,contact:$('#dn-contact').value.trim(),source:$('#dn-src').value.trim(),title:t,value:num($('#dn-val').value),nextDate:$('#dn-nd').value,nextAction:$('#dn-na').value.trim(),notes:$('#dn-notes').value.trim(),stage:'lead',createdAt:new Date().toISOString(),createdBy:S.me||null,owner:S.meEmail||null},'Lead created','Lead added')){close();S.view='sales';render();dealModal(id)}
    };
    return;
  }
  drawDeal(did);
}
function drawDeal(did){
  const d=S.deals.find(x=>x._id===did);if(!d)return;const wr=canW();const root=$('#modal-root');
  const c=S.customers.find(x=>x._id===d.customerId)||{};
  const q=d.quote||null;const t=qTotals(q);
  const idx=STAGES.findIndex(([k])=>k===d.stage);
  const steps=STAGES.filter(([k])=>k!=='lost').map(([k,l],i)=>`<span class="step ${d.stage==='lost'?'':i<idx?'done':i===idx?'now':''}">${esc(l)}</span>`).join('');
  const ords=dealOrders(d);
  const qLines=(q?.lines||[]);
  const lineRow=(l,i)=>{const p=l.itemId&&S.parts.get(l.itemId);return `<tr data-li="${i}">
    <td><input class="f mono" data-lf="code" list="ql-items" value="${esc(p?p.partNo:l.code||'')}" placeholder="Item code" ${wr?'':'disabled'}></td>
    <td><input class="f" data-lf="desc" value="${esc(l.desc||p?.description||'')}" ${wr?'':'disabled'}></td>
    <td><input class="f num" data-lf="qty" type="number" min="0" step="any" value="${esc(l.qty??1)}" ${wr?'':'disabled'}></td>
    <td><input class="f num" data-lf="price" type="number" min="0" step="0.01" value="${esc(l.price??'')}" ${wr?'':'disabled'}></td>
    <td><input class="f num" data-lf="disc" type="number" min="0" max="100" step="0.1" value="${esc(l.disc??'')}" placeholder="0" ${wr?'':'disabled'}></td>
    <td class="num">${money(num(l.qty)*num(l.price)*(1-num(l.disc)/100))}</td>
    <td class="note num">${p?qfmt(onHand(l.itemId)):''}</td>
    <td>${wr?'<button type="button" class="btn small danger" data-lx aria-label="Remove line">×</button>':''}</td></tr>`};
  const editableQuote=wr&&['lead','quote'].includes(d.stage);
  const quoteSec=q?`<section class="dsec"><div class="row" style="justify-content:space-between"><h3>Quote <span class="mono">${esc(q.no)}</span>${q.rev?` rev ${esc(q.rev)}`:''}</h3>
      <div class="row">${S.downloads?`<button type="button" class="btn small" data-dact="qdocx">Quote: email / print / PDF</button><button type="button" class="btn small" data-dact="qxlsx">Excel</button>`:''}</div></div>
    <div class="fgrid4">
      <label class="lb">Quote date<input class="f" id="q-date" type="date" value="${esc(q.date||todayISO())}" ${editableQuote?'':'disabled'}></label>
      <label class="lb">Valid (days)<input class="f num" id="q-valid" type="number" min="1" value="${esc(q.valid??30)}" ${editableQuote?'':'disabled'}></label>
      <label class="lb">Lead time<input class="f" id="q-lead" value="${esc(q.leadTime||'')}" placeholder="e.g. 3–4 weeks" ${editableQuote?'':'disabled'}></label>
      <label class="lb">Sent to customer<input class="f" id="q-sent" type="date" value="${esc(q.sentAt||'')}" ${editableQuote?'':'disabled'}></label>
    </div>
    <datalist id="ql-items">${sortedParts().filter(([id,p])=>p.level==='Product'||isAsm(p)||sellOf(id)).slice(0,1200).map(([id,p])=>`<option value="${esc(p.partNo)}">${esc(p.orderNo||'')} ${esc(p.description)}</option>`).join('')}</datalist>
    <div class="scroll"><table class="qt"><thead><tr><th>Item code</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Disc %</th><th class="num">Line total</th><th class="num">On hand</th><th></th></tr></thead>
      <tbody id="q-lines">${qLines.map(lineRow).join('')}</tbody>
      <tfoot><tr><td colspan="5">Subtotal</td><td class="num">${money(t.sub)}</td><td colspan="2"></td></tr><tr><td colspan="5">GST 10%</td><td class="num">${money(t.gst)}</td><td colspan="2"></td></tr><tr><td colspan="5">Total inc GST</td><td class="num">${money(t.total)}</td><td colspan="2"></td></tr></tfoot></table></div>
    ${editableQuote?`<div class="row"><button type="button" class="btn small" id="q-addl">+ Add line</button><span class="note">Pick an item code and the description and sell price fill in from the register.</span></div>`:''}
    <label class="lb">Terms &amp; notes on the quote<textarea class="f" id="q-terms" rows="3" ${editableQuote?'':'disabled'}>${esc(q.terms??co().quoteTerms)}</textarea></label>
    ${editableQuote?'<div class="row"><button type="button" class="btn" data-dact="qsave">Save quote</button><button type="button" class="btn" data-dact="qrev">Save as new revision</button></div>':''}
  </section>`:'';
  const poSec=d.po?`<section class="dsec"><h3>Purchase order</h3><dl class="kv"><div><dt>PO number</dt><dd class="mono">${esc(d.po.no)}</dd></div><div><dt>Received</dt><dd>${esc(fmtDate(d.po.date))}</dd></div><div><dt>PO value ex GST</dt><dd>${money(d.po.value)}</dd></div><div><dt>Required by</dt><dd>${esc(fmtDate(d.po.required))}</dd></div></dl></section>`:'';
  const prodSec=ords.length?`<section class="dsec"><h3>Build orders</h3><div class="scroll"><table><thead><tr><th>Order</th><th>Item</th><th class="num">Qty</th><th>Status</th><th></th></tr></thead><tbody>${ords.map(o=>`<tr><td class="mono">${esc(o.no)}</td><td><span class="mono">${esc(pn(o.itemId))}</span> <span class="note">${esc(S.parts.get(o.itemId)?.description||'')}</span></td><td class="num">${qfmt(o.qty)}</td><td><span class="tag ${o.status==='open'?'':'st-ok'}">${esc(OSTAT[o.status]||o.status)}</span></td><td>${S.downloads?`<button type="button" class="btn small" data-bsheet="${esc(o._id)}">Build sheet</button>`:''}</td></tr>`).join('')}</tbody></table></div><div class="row"><span class="note">Build these on the Orders tab. Once they are all built the sale can move to Ready.</span>${wr&&['production','ready'].includes(d.stage)?'<button type="button" class="btn small" data-dact="toprod">+ Raise build order for another line</button>':''}</div></section>`:'';
  const bo=backOrder(d);
  const dispSec=docketsOf(d).length?`<section class="dsec"><h3>Delivery dockets</h3>${docketsOf(d).map((k,ki)=>{const iv=invoicesOf(d).find(v=>v.docketNo===k.docketNo);return `<div class="dock">
    <div class="row" style="justify-content:space-between"><div><strong class="mono">${esc(k.docketNo||'')}</strong> · ${esc(fmtDate(k.date))}${k.backOrder?' · <span class="tag">Back order delivery</span>':''} ${iv?`<span class="tag st-ok">Invoiced ${esc(iv.no)}</span>`:'<span class="tag st-low">Not invoiced</span>'}</div>
      <div class="row">${S.downloads?`<button type="button" class="btn small" data-dk="${ki}">Docket: email / print</button><button type="button" class="btn small" data-pk="${ki}">Packing list</button>`:''}${wr&&!iv?`<button type="button" class="btn small primary" data-inv="${ki}">Raise invoice</button>`:''}</div></div>
    <div class="note">${esc([k.carrier,k.connote&&'Con '+k.connote,k.packages,k.weight&&k.weight+' kg',k.address&&'To '+k.address,k.attn&&'Attn '+k.attn].filter(Boolean).join(' · ')||'—')}</div>
    <div class="scroll"><table><thead><tr><th>Item code</th><th>Description</th><th class="num">Ordered</th><th class="num">Supplied on this docket</th></tr></thead><tbody>${(k.lines||[]).filter(l=>num(l.supplied)>0).map(l=>`<tr><td class="mono">${esc(l.code||'')}</td><td>${esc(l.desc||'')}</td><td class="num">${qfmt(l.ordered)}</td><td class="num">${qfmt(l.supplied)}</td></tr>`).join('')}</tbody></table></div>
    <div class="row">${k.podAssetId?`<span class="tag st-ok">Signed docket on file</span> <a class="btn small" href="/_blob/${esc(k.podAssetId)}" target="_blank" rel="noopener">Open signed docket</a>`:'<span class="tag st-low">Signed docket not yet uploaded</span>'}
      ${wr&&S.assets?`<label class="btn small" for="pod-${ki}">${k.podAssetId?'Replace':'Upload'} signed docket / POD</label><input type="file" id="pod-${ki}" data-pod="${ki}" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden>`:''}</div></div>`}).join('')}
    ${hasBO(d)?`<div class="warn" style="background:var(--rev-soft);color:var(--rev)">Back order outstanding: ${(d.quote?.lines||[]).map((l,i)=>bo[i]>0?`${esc(S.parts.get(l.itemId)?.partNo||l.code||l.desc)} ×${qfmt(bo[i])}`:'').filter(Boolean).join(', ')}</div>`:'<div class="note">Everything on the order has been delivered.</div>'}
  </section>`:'';
  const invSec=invoicesOf(d).length?`<section class="dsec"><h3>Tax invoices</h3><div class="scroll"><table><thead><tr><th>Invoice</th><th>Docket</th><th>Date</th><th class="num">Total inc GST</th><th>Due</th><th>Status</th><th>Xero</th><th></th></tr></thead><tbody>${invoicesOf(d).map((v,vi)=>`<tr><td class="mono">${esc(v.no)}</td><td class="mono note">${esc(v.docketNo||'')}</td><td class="note">${esc(fmtDate(v.date))}</td><td class="num">${money(v.amount)}</td><td class="note ${!v.paid&&v.due<todayISO()?'neg':''}">${esc(fmtDate(v.due))}</td><td>${v.paid?`<span class="tag st-ok">Paid ${esc(fmtDate(v.paidAt))}</span>`:'<span class="tag st-low">Unpaid</span>'}</td><td class="note">${v.xeroStatus?(v.xeroStatus==='PAID'?'Paid in Xero':'In Xero · '+esc(v.xeroStatus.toLowerCase())):v.xeroAt?'Exported':''}</td><td style="white-space:nowrap">${S.downloads?`<button type="button" class="btn small" data-ivd="${vi}">Email / print</button> `:''}${wr&&!v.paid?`<button type="button" class="btn small" data-paid="${vi}">Mark paid</button>`:''}</td></tr>`).join('')}</tbody></table></div></section>`:'';
  const built=ords.length&&ords.every(o=>o.status!=='open');
  const acts=!wr?'':({
    lead:`<button type="button" class="btn primary" data-dact="toquote">Create quote</button>`,
    quote:`<button type="button" class="btn primary" data-dact="topo">PO received</button>`,
    po:`<button type="button" class="btn primary" data-dact="toprod">Start production</button>`,
    production:`<button type="button" class="btn primary" data-dact="toready" ${built||!ords.length?'':'title="Some build orders are still open"'}>Mark ready${built||!ords.length?'':' (orders still open)'}</button>`,
    ready:`<button type="button" class="btn primary" data-dact="todisp">Dispatch &amp; create delivery docket</button>`,
    dispatched:(hasBO(d)?`<button type="button" class="btn primary" data-dact="todisp">Dispatch back order (new docket)</button>`:'')+(uninvoiced(d).length?`<button type="button" class="btn ${hasBO(d)?'':'primary'}" data-inv="${docketsOf(d).indexOf(uninvoiced(d)[0])}">Raise invoice for ${esc(uninvoiced(d)[0].docketNo)}</button>`:''),
    invoiced:'',
    closed:'',
    lost:`<button type="button" class="btn" data-dact="reopen">Reopen</button>`
  }[d.stage]||'')+(['lead','quote'].includes(d.stage)?`<button type="button" class="btn danger" data-dact="lost">Mark lost</button>`:'');
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="dform" novalidate>
    <div class="head-top"><div style="flex:1"><div class="pnum mono">Sale ${esc(d.no)} · <span class="tag stg-${d.stage}">${esc(STG[d.stage])}</span></div><h2>${esc(c.name||'No customer')}</h2><div>${esc(d.title||'')}</div></div><button type="button" class="btn small" id="d-close">Close</button></div>
    <div class="steps">${steps}</div>
    ${d.stage==='lost'?`<div class="warn">Lost${d.lostReason?': '+esc(d.lostReason):''}</div>`:''}${d.stage==='closed'?`<div class="warn" style="background:var(--ok-soft);color:var(--ok)">Closed ${esc(fmtDate(d.closedAt))}: delivered in full, invoiced and paid. ${isHist(d)?'Filed in Sales history.':'Moves to Sales history on '+esc(fmtDate(histDate(d)))+'.'}</div>`:''}
    <section class="dsec"><div class="fgrid4">
      <label class="lb">Contact<input class="f" id="d-contact" value="${esc(d.contact||'')}" list="d-kl" ${wr?'':'disabled'}><datalist id="d-kl">${(c.contacts||[]).map(k=>`<option value="${esc(k.name)}">${esc(k.email||'')}</option>`).join('')}</datalist></label>
      <label class="lb">Owner<input class="f" id="d-owner" list="d-ol" value="${esc(d.owner||'')}" placeholder="name@company" ${wr?'':'disabled'}><datalist id="d-ol">${(S.users||[]).map(u=>`<option value="${esc(u.email)}">${esc(u.name||'')}</option>`).join('')}</datalist></label>
      <label class="lb">Next action date<input class="f" id="d-nd" type="date" value="${esc(d.nextDate||'')}" ${wr?'':'disabled'}></label>
      <label class="lb">Next action<input class="f" id="d-na" value="${esc(d.nextAction||'')}" ${wr?'':'disabled'}></label>
      <label class="lb" style="grid-column:1/-1">What they need<input class="f" id="d-title" value="${esc(d.title||'')}" ${wr?'':'disabled'}></label>
      ${!q?`<label class="lb">Estimated value ex GST ($)<input class="f num" id="d-val" type="number" min="0" value="${esc(d.value||'')}" ${wr?'':'disabled'}></label>`:''}
    </div>${wr?'<div class="row"><button type="button" class="btn small" data-dact="savedetails">Save details</button><button type="button" class="btn small" data-dact="cust">Customer details</button></div>':''}</section>
    ${q?approvalBanner('quote',d._id,approvalInfo('quote',d)):''}${quoteSec}${poSec}${prodSec}${dispSec}${invSec}
    ${(()=>{const ps=S.pos.filter(x=>x.saleId===d._id);return ps.length?`<section class="dsec"><h3>Purchase orders for this sale</h3><div class="scroll"><table><tbody>${ps.map(x=>`<tr><td class="mono">${esc(x.no)}</td><td>${esc(supName(x.supplierId))}</td><td><span class="tag po-${x.status}">${esc(PST[x.status])}</span></td><td class="num">${money(poTotal(x))}</td><td class="note">${x.expected?'Expected '+esc(fmtDate(x.expected)):''}</td></tr>`).join('')}</tbody></table></div></section>`:''})()}
    ${(()=>{const xs=S.expenses.filter(x=>x.saleId===d._id);return xs.length||wr?`<section class="dsec"><div class="row" style="justify-content:space-between"><h3>Expenses charged to this sale</h3>${wr?'<button type="button" class="btn small" id="d-addexp">+ Add expense</button>':''}</div>${xs.length?`<div class="scroll"><table><tbody>${xs.map(x=>`<tr><td class="mono">${esc(x.no)}</td><td class="note">${esc(fmtDate(x.date))}</td><td>${esc(x.payee)}</td><td>${esc(x.description)}</td><td class="num">${money(expNet(x))} ex GST</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">Total</td><td class="num">${money(xs.reduce((a,x)=>a+expNet(x),0))} ex GST</td></tr></tfoot></table></div>`:'<div class="note">None. Freight, fuel or travel for this job can be charged here to see the true margin.</div>'}</section>`:''})()}
    <div class="row" id="d-acts">${acts}</div>
    <div id="d-form"></div>
    <details><summary class="note" style="cursor:pointer">Activity (${(d.history||[]).length})</summary><div class="scroll" style="margin-top:6px"><table><tbody>${(d.history||[]).slice().reverse().map(h=>`<tr><td class="note" style="white-space:nowrap">${esc(when(h.at))}</td><td>${esc(h.note)}</td><td><span data-uid="${esc(h.by||'')}">…</span></td></tr>`).join('')}</tbody></table></div></details>
  </form></div>`;
  fillNames();
  const close=()=>{root.innerHTML='';if(S.pending&&!S.busy){S.pending=false;render()}else render()};
  $('#d-close').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  $('#dform').onsubmit=e=>e.preventDefault();
  // quote line wiring
  const ql=$('#q-lines');
  const wireLines=()=>{if(!ql)return;ql.querySelectorAll('[data-lx]').forEach(b=>b.onclick=()=>b.closest('tr').remove());
    ql.querySelectorAll('[data-lf="code"]').forEach(inp=>inp.onchange=()=>{const tr=inp.closest('tr');const id=findByNo(inp.value);if(!id)return;const p=S.parts.get(id);const de=tr.querySelector('[data-lf="desc"]'),pr=tr.querySelector('[data-lf="price"]');de.value=p.description+(p.orderNo?' ('+p.orderNo+')':'');if(sellOf(id))pr.value=sellOf(id)})};
  wireLines();
  const addl=$('#q-addl');if(addl)addl.onclick=()=>{const tmp=document.createElement('tbody');tmp.innerHTML=lineRow({qty:1},Date.now());ql.appendChild(tmp.firstElementChild);wireLines();ql.lastElementChild.querySelector('input').focus()};
  const readQuote=()=>{const lines=[...ql.querySelectorAll('tr')].map(tr=>{const g=k=>tr.querySelector(`[data-lf="${k}"]`).value;const id=findByNo(g('code'));return {itemId:id||null,code:id?null:g('code').trim(),desc:g('desc').trim(),qty:num(g('qty')),price:num(g('price')),disc:num(g('disc'))}}).filter(l=>l.desc||l.itemId);
    return {...q,lines,date:$('#q-date').value,valid:num($('#q-valid').value)||30,leadTime:$('#q-lead').value.trim(),sentAt:$('#q-sent').value,terms:$('#q-terms').value}};
  const form=$('#d-form');
  const sub=(html,onok)=>{form.innerHTML=`<section class="dsec hl">${html}<div class="warn" id="sf-err" hidden></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="sf-cancel">Cancel</button><button type="button" class="btn primary" id="sf-ok">Confirm</button></div></section>`;form.scrollIntoView({block:'nearest'});$('#sf-cancel').onclick=()=>form.innerHTML='';$('#sf-ok').onclick=async()=>{$('#sf-ok').disabled=true;S.busy=true;const r=await onok(t=>{const e=$('#sf-err');e.hidden=false;e.textContent=t});S.busy=false;S.pending=false;if(r!==false)drawDeal(did);else $('#sf-ok').disabled=false}};
  const setDocket=async(ki,patch,note,ok)=>{const ks=docketsOf(d).map(x=>({...x}));Object.assign(ks[ki],patch);return saveDeal(did,{dockets:ks,dispatch:null},note,ok)};
  const setInvoice=async(vi,patch,note,ok)=>{const vs=invoicesOf(d).map(x=>({...x}));Object.assign(vs[vi],patch);const allPaid=vs.every(v=>v.paid)&&!hasBO(d)&&!uninvoiced(d).length;const r=await saveDeal(did,{invoices:vs,invoice:null,...(allPaid?{stage:'closed',closedAt:todayISO(),nextAction:'',nextDate:''}:{})},allPaid?note+' · all invoices paid, sale closed':note,allPaid?`${d.no} closed: all payments recorded`:ok);return r};
  const dax=$('#d-addexp');if(dax)dax.onclick=()=>expenseModal(null,{saleId:did,category:'Freight & courier'});
  root.querySelectorAll('[data-pod]').forEach(pf=>pf.onchange=async()=>{const f=pf.files[0];if(!f)return;const ki=+pf.dataset.pod;const ext=(f.name.split('.').pop()||'').toLowerCase();const ty=MIME[ext];if(!ty){toast('Upload a PDF or photo of the signed docket.');return}
    try{toast('Uploading…');const r=await S.assets.upload(f,{type:ty});await setDocket(ki,{podAssetId:r.id,podName:f.name,podAt:new Date().toISOString()},`Signed docket ${docketsOf(d)[ki].docketNo} uploaded (${f.name})`,'Signed docket saved');drawDeal(did)}catch(e){toast('Upload failed: '+(e.message||e.code||'try again'))}});
  bindApprovals(root,()=>drawDeal(did));
  root.querySelectorAll('[data-dk]').forEach(b=>b.onclick=()=>docDialog(specDocket(d,docketsOf(d)[+b.dataset.dk]),{after:()=>drawDeal(did)}));
  root.querySelectorAll('[data-pk]').forEach(b=>b.onclick=()=>docDialog(specPacking(d,docketsOf(d)[+b.dataset.pk])));
  root.querySelectorAll('[data-bsheet]').forEach(b=>b.onclick=()=>docDialog(specBuild(S.orders.find(o=>o._id===b.dataset.bsheet))));
  root.querySelectorAll('[data-ivd]').forEach(b=>b.onclick=()=>docDialog(specInvoice(d,invoicesOf(d)[+b.dataset.ivd]),{after:()=>drawDeal(did)}));
  root.querySelectorAll('[data-paid]').forEach(b=>b.onclick=async()=>{const vi=+b.dataset.paid;await setInvoice(vi,{paid:true,paidAt:todayISO()},`Invoice ${invoicesOf(d)[vi].no} paid`,'Marked paid');drawDeal(did)});
  root.querySelectorAll('[data-inv]').forEach(b=>b.onclick=()=>raiseInvoice(+b.dataset.inv));
  function raiseInvoice(ki){
    const k=docketsOf(d)[ki];if(!k)return;const no=nextNo(allInv(),'INV-','no');const terms=num(c.terms??30);
    const il=(k.lines||[]).filter(l=>num(l.supplied)>0);const sub0=il.reduce((a,l)=>a+num(l.supplied)*num(l.price)*(1-num(l.disc)/100),0);
    sub(`<h3>Raise tax invoice for docket ${esc(k.docketNo)}</h3>
      ${k.podAssetId?'':'<div class="warn" style="background:var(--rev-soft);color:var(--rev)">No signed docket uploaded for this delivery yet. You can still invoice, but upload the signed docket or proof of delivery when it comes back.</div>'}
      <div class="fgrid4"><label class="lb">Invoice number<input class="f mono" id="sf-in" value="${esc(no)}"></label><label class="lb">Invoice date<input class="f" id="sf-id" type="date" value="${todayISO()}"></label><label class="lb">Terms (days)<input class="f num" id="sf-it" type="number" min="0" value="${terms}"></label></div>
      <div class="scroll"><table><thead><tr><th>Item code</th><th>Description</th><th class="num">Supplied</th><th class="num">Unit price</th><th class="num">Disc %</th><th class="num">Line total</th></tr></thead><tbody>${il.map(l=>`<tr><td class="mono">${esc(l.code)}</td><td>${esc(l.desc)}</td><td class="num">${qfmt(l.supplied)}</td><td class="num">${money(l.price)}</td><td class="num">${l.disc||''}</td><td class="num">${money(num(l.supplied)*num(l.price)*(1-num(l.disc)/100))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">Subtotal</td><td class="num">${money(sub0)}</td></tr><tr><td colspan="5">GST 10%</td><td class="num">${money(sub0*GST)}</td></tr><tr><td colspan="5">Total inc GST</td><td class="num">${money(sub0*(1+GST))}</td></tr></tfoot></table></div>
      <div class="note">Charges what docket ${esc(k.docketNo)} says was supplied.</div>`,async err=>{const n=$('#sf-in').value.trim();if(!n){err('Enter an invoice number.');return false}
      if(allInv().some(v=>v.no===n)){err(`Invoice number ${n} is already used.`);return false}
      const date=$('#sf-id').value;const due=addDays(date,$('#sf-it').value);
      const v={no:n,date,due,docketNo:k.docketNo,lines:il,sub:+sub0.toFixed(2),gst:+(sub0*GST).toFixed(2),amount:+(sub0*(1+GST)).toFixed(2),terms:num($('#sf-it').value),paid:false};
      const vs=[...invoicesOf(d).map(x=>({...x})),v];
      const done=!hasBO(d)&&docketsOf(d).every(x=>vs.some(y=>y.docketNo===x.docketNo));
      const ok=await saveDeal(did,{invoices:vs,invoice:null,stage:done?'invoiced':'dispatched',nextAction:done?'Follow up payment':(hasBO(d)?'Dispatch back order':'Invoice remaining dockets'),nextDate:done?due:todayISO()},`Invoice ${n} raised for docket ${k.docketNo}`,`Invoice ${n} raised`);
      if(ok)docDialog(specInvoice(S.deals.find(x=>x._id===did),v),{after:()=>drawDeal(did)});
      return ok});
  }
  root.querySelectorAll('[data-dact]').forEach(b=>b.onclick=async()=>{
    const a=b.dataset.dact;
    if(a==='cust')return customerModal(d.customerId);
    if(a==='savedetails'){await saveDeal(did,{owner:$('#d-owner').value.trim().toLowerCase()||null,contact:$('#d-contact').value.trim(),nextDate:$('#d-nd').value,nextAction:$('#d-na').value.trim(),title:$('#d-title').value.trim(),...($('#d-val')?{value:num($('#d-val').value)}:{})},'Details updated','Saved');return drawDeal(did)}
    if(a==='qsave'){await saveDeal(did,{quote:readQuote()},null,'Quote saved');return drawDeal(did)}
    if(a==='qrev'){const nq=readQuote();nq.rev=String.fromCharCode(65+((q.rev?q.rev.charCodeAt(0)-64:0)));await saveDeal(did,{quote:nq},`Quote ${q.no} revised to rev ${nq.rev}`,'New revision saved');return drawDeal(did)}
    if(a==='qdocx'){if(editableQuote)await saveDeal(did,{quote:readQuote()});return docDialog(specQuote(S.deals.find(x=>x._id===did)),{after:()=>drawDeal(did)})}
    if(a==='qxlsx'){if(editableQuote)await saveDeal(did,{quote:readQuote()});return quoteXlsx(S.deals.find(x=>x._id===did))}
    if(a==='toquote'){const no=nextNo(allQuotes(),'Q-','no');await saveDeal(did,{stage:'quote',quote:{no,date:todayISO(),valid:30,lines:[],terms:co().quoteTerms},nextAction:'Send quote',nextDate:addDays(todayISO(),1)},`Quote ${no} started`,`Quote ${no} created`);return drawDeal(did)}
    if(a==='lost')return sub(`<h3>Mark as lost</h3><label class="lb">Reason<input class="f" id="sf-r" list="sf-rl" placeholder="e.g. price, lead time, went with competitor"><datalist id="sf-rl"><option>Price</option><option>Lead time</option><option>Went with competitor</option><option>Project cancelled</option><option>No response</option></datalist></label>`,async()=>saveDeal(did,{stage:'lost',lostReason:$('#sf-r').value.trim(),prevStage:d.stage},'Marked lost: '+($('#sf-r').value.trim()||'no reason'),'Marked lost'));
    if(a==='reopen'){await saveDeal(did,{stage:d.prevStage||'lead'},'Reopened','Deal reopened');return drawDeal(did)}
    if(a==='topo'){if(!q||!q.lines?.length){toast('Add quote lines before recording the PO.');return}
      return sub(`<h3>PO received</h3><div class="fgrid4"><label class="lb">PO number *<input class="f mono" id="sf-po"></label><label class="lb">Date received<input class="f" id="sf-pd" type="date" value="${todayISO()}"></label><label class="lb">PO value ex GST ($)<input class="f num" id="sf-pv" type="number" min="0" step="0.01" value="${t.sub.toFixed(2)}"></label><label class="lb">Required by<input class="f" id="sf-pr" type="date"></label></div>`,async err=>{const no=$('#sf-po').value.trim();if(!no){err('Enter the customer PO number.');return false}
        return saveDeal(did,{stage:'po',po:{no,date:$('#sf-pd').value,value:num($('#sf-pv').value),required:$('#sf-pr').value},nextAction:'Start production',nextDate:todayISO()},`PO ${no} received`,`PO ${no} recorded`)})}
    if(a==='toprod'){const ls=(q?.lines||[]).filter(l=>l.itemId&&!(d.stage!=='po'&&ords.some(o=>o.itemId===l.itemId)));if(!ls.length){toast('Every quote line already has a build order.');return}
      return sub(`<h3>Start production</h3><div class="note">Tick the lines to build. Each ticked line becomes a build order on the Orders tab; unticked lines are supplied from stock at dispatch.</div><div class="scroll"><table><thead><tr><th>Build</th><th>Item</th><th class="num">Qty</th><th class="num">On hand</th><th>BOM</th></tr></thead><tbody>${ls.map((l,i)=>{const p=S.parts.get(l.itemId);return `<tr><td><input type="checkbox" data-bl="${i}" ${isAsm(p)&&onHand(l.itemId)<num(l.qty)?'checked':''} aria-label="Build ${esc(p.partNo)}"></td><td><span class="mono">${esc(p.partNo)}</span> <span class="note">${esc(p.description)}</span></td><td class="num">${qfmt(l.qty)}</td><td class="num">${qfmt(onHand(l.itemId))}</td><td>${isAsm(p)?'<span class="tag st-ok">Yes</span>':'<span class="note">No BOM</span>'}</td></tr>`}).join('')||'<tr><td colspan="5" class="note">No register items on the quote.</td></tr>'}</tbody></table></div>`,async()=>{
        const pick=[...root.querySelectorAll('[data-bl]:checked')].map(c=>ls[+c.dataset.bl]);const made=[];
        for(const l of pick){const no=nextOrderNo();const o={no,itemId:l.itemId,qty:num(l.qty),sell:num(l.price)*(1-num(l.disc)/100),customer:c.name||'',ref:d.po?.no||'',due:d.po?.required||'',notes:'From '+d.no+(q?' / '+q.no:''),status:'open',dealId:did,createdAt:new Date().toISOString(),createdBy:S.me||null};
          if(await write(()=>S.db.doc('orders/'+no).set(o))){S.orders.push({...o,_id:no});made.push(no)}}
        return saveDeal(did,{stage:['production','ready'].includes(d.stage)&&made.length?'production':(d.stage==='po'?'production':d.stage),nextAction:made.length?'Build '+made.join(', '):'Pick from stock',nextDate:d.po?.required||''},made.length?`Production started: ${made.join(', ')}`:'Production started (all from stock)','Production started')})}
    if(a==='toready'){await saveDeal(did,{stage:'ready',nextAction:'Dispatch',nextDate:todayISO()},'Ready for dispatch','Marked ready');return drawDeal(did)}
    if(a==='todisp'){
      const ql=(q?.lines||[]);const prev=docketsOf(d);const last=prev[prev.length-1]||{};const addr=last.address||d.po?.deliverTo||c.site||'';const isBO=prev.length>0;
      return sub(`<h3>${isBO?'Dispatch back order':'Dispatch'} &amp; delivery docket</h3>
        <div class="fgrid4"><label class="lb">Dispatch date<input class="f" id="sf-dd" type="date" value="${todayISO()}"></label><label class="lb">Carrier<input class="f" id="sf-car" list="sf-carl" value="${esc(last.carrier||'')}"><datalist id="sf-carl"><option>Customer pick-up</option><option>Own vehicle</option><option>Toll</option><option>TNT</option><option>Northline</option></datalist></label><label class="lb">Consignment no.<input class="f mono" id="sf-con"></label><label class="lb">Packages<input class="f" id="sf-pk" placeholder="e.g. 2 pallets"></label>
          <label class="lb" style="grid-column:span 3">Deliver to<input class="f" id="sf-ad" value="${esc(addr)}"></label><label class="lb">Attention<input class="f" id="sf-at" value="${esc(last.attn||d.contact||'')}"></label><label class="lb">Total weight (kg)<input class="f num" id="sf-wt" type="number" min="0" step="any"></label></div>
        <div class="scroll"><table class="qt"><thead><tr><th>Item code</th><th>Description</th><th class="num">Ordered</th><th class="num">Already supplied</th><th class="num">Supply now</th><th class="num">On hand</th></tr></thead><tbody>${ql.map((l,i)=>{const p=l.itemId&&S.parts.get(l.itemId);const done=suppliedQty(d,i);const rem=Math.max(0,num(l.qty)-done);const built=ords.filter(o=>o.itemId===l.itemId&&o.status==='built').reduce((a,o)=>a+num(o.qty),0);return `<tr><td class="mono">${esc(p?p.partNo:l.code||'')}</td><td>${esc(l.desc||'')}</td><td class="num">${qfmt(l.qty)}</td><td class="num">${done?qfmt(done):''}</td><td><input class="f num" data-sup="${i}" type="number" min="0" max="${rem}" step="any" value="${rem}" style="width:80px" aria-label="Supply now" ${rem?'':'disabled'}></td><td class="note num">${p?qfmt(onHand(l.itemId))+(built?' (incl. '+qfmt(built)+' built)':''):'—'}</td></tr>`}).join('')}</tbody></table></div>
        <div class="note">Confirming creates a new delivery docket, downloads it, and takes the supplied goods out of stock. Anything not supplied stays on back order for another docket.</div>`,async err=>{
        const now=new Date().toISOString();const dno=nextNo(allDockets().map(k=>({no:k.docketNo})),'DD-','no');
        const lines=ql.map((l,i)=>{const p=l.itemId&&S.parts.get(l.itemId);const rem=Math.max(0,num(l.qty)-suppliedQty(d,i));return {li:i,itemId:l.itemId||null,code:p?p.partNo:(l.code||''),desc:l.desc||'',ordered:num(l.qty),supplied:Math.min(rem,num(root.querySelector(`[data-sup="${i}"]`)?.value)),price:num(l.price),disc:num(l.disc)}});
        if(!lines.some(l=>l.supplied>0)){err('Enter a quantity to supply on at least one line.');return false}
        const tag=`${d.no} · ${dno} · ${c.name||''}`;
        for(const l of lines){if(!l.itemId||l.supplied<=0)continue;
          let left=l.supplied;
          for(const o of ords.filter(o=>o.itemId===l.itemId&&o.status==='built')){if(left<=0)break;const q2=Math.min(left,num(o.qty));
            if(await moveStock([{id:o.itemId,qty:-q2}],'sold',`Order ${o.no} · ${tag}`)){const up={status:'sold',soldAt:now,sellTotal:+(num(o.sell)*num(o.qty)).toFixed(2)};Object.assign(o,up);await write(()=>S.db.doc('orders/'+o._id).update(up))}left-=q2}
          if(left>0)await moveStock([{id:l.itemId,qty:-left}],'sold',tag);
        }
        const k={docketNo:dno,date:$('#sf-dd').value,carrier:$('#sf-car').value.trim(),connote:$('#sf-con').value.trim(),packages:$('#sf-pk').value.trim(),weight:$('#sf-wt').value,address:$('#sf-ad').value.trim(),attn:$('#sf-at').value.trim(),backOrder:isBO,lines};
        const ks=[...prev.map(x=>({...x})),k];
        const remaining=ql.some((l,i)=>num(l.qty)-suppliedQty({...d,dockets:ks,dispatch:null},i)>1e-9);
        const ok=await saveDeal(did,{stage:'dispatched',dockets:ks,dispatch:null,nextAction:remaining?`Invoice ${dno}; back order outstanding`:`Invoice ${dno}`,nextDate:todayISO()},`Dispatched on docket ${dno}${remaining?' (back order remains)':''}`,`Delivery docket ${dno} created`);
        if(ok)docDialog(specDocket(S.deals.find(x=>x._id===did),k),{after:()=>drawDeal(did)});
        return ok})}

  });
}

/* ---------- Xero export ---------- */
const xDate=iso=>{if(!iso)return '';const [y,m,d]=String(iso).slice(0,10).split('-');return `${d}/${m}/${y}`};
function xeroRows(kind){
  const k=co();
  if(kind==='invoices')return S.deals.flatMap(d=>invoicesOf(d).map((v,vi)=>{const c=S.customers.find(x=>x._id===d.customerId)||{};const ls=v.lines||[];
    return {src:d,vi,done:!!v.xeroAt,xeroAt:v.xeroAt,date:v.date,no:v.no,who:c.name||'',total:num(v.amount),rows:ls.map(l=>({'*ContactName':c.name||'',EmailAddress:(c.contacts||[]).find(x=>x.name===d.contact)?.email||'','*InvoiceNumber':v.no,Reference:[d.po?.no,d.no,v.docketNo].filter(Boolean).join(' / '),'*InvoiceDate':xDate(v.date),'*DueDate':xDate(v.due),InventoryItemCode:'','*Description':`${l.code?l.code+' ':''}${l.desc||''}`.trim(),'*Quantity':num(l.supplied),'*UnitAmount':+num(l.price).toFixed(2),Discount:l.disc||'','*AccountCode':k.xeroSales,'*TaxType':k.xeroTaxSales,TrackingName1:'',TrackingOption1:'',Currency:'AUD'}))}}));
  if(kind==='expenses')return S.expenses.map(e=>{const d=S.deals.find(x=>x._id===e.saleId);return {src:e,done:!!e.xeroAt,xeroAt:e.xeroAt,date:e.date,no:e.ref||e.no,po:e.no,who:e.payee||'',total:expTotal(e),
    rows:[{'*ContactName':e.payee||'',EmailAddress:'','*InvoiceNumber':e.ref||e.no,Reference:[e.no,d?.no].filter(Boolean).join(' / '),'*InvoiceDate':xDate(e.date),'*DueDate':xDate(e.date),InventoryItemCode:'','*Description':e.description||'','*Quantity':1,'*UnitAmount':+expNet(e).toFixed(2),'*AccountCode':e.account||EXP_ACCT[e.category]||'429','*TaxType':e.gstFree?'GST Free Expenses':k.xeroTaxPurch,TaxAmount:+expGst(e).toFixed(2),TrackingName1:'',TrackingOption1:'',Currency:'AUD'}]}});
  return S.pos.filter(p=>(p.lines||[]).some(l=>num(l.received)>0)).map(p=>{const s0=S.suppliers.find(x=>x._id===p.supplierId)||{};
    return {src:p,done:!!p.xeroAt,date:p.supInvoiceDate||p.receivedAt||p.date,no:p.supInvoice||'',po:p.no,who:s0.name||'',total:(p.lines||[]).reduce((a,l)=>a+num(l.received)*num(l.price),0)*(1+GST),
      rows:(p.lines||[]).filter(l=>num(l.received)>0).map(l=>{const it=S.parts.get(l.itemId)||{};const dt=p.supInvoiceDate||p.receivedAt||p.date;return {'*ContactName':s0.name||'',EmailAddress:s0.email||'','*InvoiceNumber':p.supInvoice||p.no,Reference:p.no,'*InvoiceDate':xDate(dt),'*DueDate':xDate(addDays(dt,s0.terms??30)),InventoryItemCode:'','*Description':`${it.partNo||''} ${it.description||''}${l.supCode?' ('+l.supCode+')':''}`.trim(),'*Quantity':num(l.received),'*UnitAmount':+num(l.price).toFixed(2),'*AccountCode':k.xeroPurch,'*TaxType':k.xeroTaxPurch,TrackingName1:'',TrackingOption1:'',Currency:'AUD'}})}});
}
function xeroModal(kind){
  const all=xeroRows(kind).sort((a,b)=>String(b.date).localeCompare(String(a.date)));const root=$('#modal-root');const inv=kind==='invoices';const exk=kind==='expenses';
  const live=!!(window.PCS&&S.xeroStatus?.connected&&canW());const res=new Map();
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="xform" novalidate>
    <h2>Export ${inv?'sales invoices':exk?'expenses':'supplier bills'} to Xero</h2>
    <div class="note">Downloads a CSV in Xero’s ${inv?'sales invoice':'bill'} import layout. In Xero go to <strong>${inv?'Business → Invoices → Import':'Business → Bills to pay → Import'}</strong> and upload it. Xero then matches the ${inv?'customer payments':'payments to suppliers'} against your bank feed when you reconcile. ${exk?'Each expense goes in as a bill under its own account code (by category) with the GST from the receipt, so it reconciles against the bank or card line that paid it.':`Uses account ${esc(inv?co().xeroSales:co().xeroPurch)} and tax rate “${esc(inv?co().xeroTaxSales:co().xeroTaxPurch)}” (change these on the Company screen).`} When Xero asks, choose <strong>amounts are tax exclusive</strong>.</div>
    ${!inv&&!exk?'<div class="note">Bills use the supplier invoice number recorded on the purchase order, or the PO number if none is recorded yet, and only the quantities actually received.</div>':''}
    <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="x-new" checked> Only ${inv?'invoices':'bills'} not yet exported</label>
    <div class="scroll" style="max-height:46vh"><table><thead><tr><th><input type="checkbox" id="x-all" checked aria-label="Select all"></th><th>${inv?'Invoice':exk?'Receipt no.':'Supplier invoice'}</th>${inv?'':`<th>${exk?'Expense':'PO'}</th>`}<th>${inv?'Customer':exk?'Payee':'Supplier'}</th><th>Date</th><th class="num">Total inc GST</th><th>Exported</th></tr></thead><tbody id="x-rows"></tbody></table></div>
    <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="x-mark" checked> Mark these as exported so they aren’t sent twice</label>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="x-c">Close</button>${live?'<button type="button" class="btn primary" id="x-send">Send to Xero</button>':''}<button class="btn ${live?'':'primary'}" type="submit" id="x-go">Download CSV for Xero</button></div></form></div>`;
  const draw=()=>{const onlyNew=$('#x-new').checked;const rows=all.filter(r=>!onlyNew||!r.done);
    $('#x-rows').innerHTML=rows.map((r,i)=>`<tr><td><input type="checkbox" data-x="${all.indexOf(r)}" ${r.done?'':'checked'} aria-label="Include"></td><td class="mono">${esc(r.no||'—')}${!inv&&!exk&&!r.src.supInvoice?' <span class="tag st-low">No supplier invoice no.</span>':''}${exk&&!r.src.receiptId?' <span class="tag st-low">No receipt</span>':''}</td>${inv?'':`<td class="mono">${esc(r.po)}</td>`}<td>${esc(r.who)}</td><td class="note">${esc(fmtDate(r.date))}</td><td class="num">${money(r.total)}</td><td class="note">${res.has(all.indexOf(r))?(()=>{const x=res.get(all.indexOf(r));return `<span class="tag ${x.ok?'st-ok':'st-low'}">${esc(x.message)}</span>`})():r.done?esc(fmtDate(String(r.xeroAt||r.src.xeroAt).slice(0,10))):''}</td></tr>`).join('')||`<tr><td colspan="7" class="note">Nothing to export.</td></tr>`};
  draw();$('#x-new').onchange=draw;
  const xs=$('#x-send');if(xs)xs.onclick=async()=>{const idx=[...root.querySelectorAll('[data-x]:checked')].map(c=>+c.dataset.x);if(!idx.length){toast('Tick at least one.');return}
    xs.disabled=true;xs.textContent='Sending…';let ok=0,bad=0;
    try{for(let i=0;i<idx.length;i+=20){const part=idx.slice(i,i+20);const body=inv?{kind:'invoices',refs:part.map(j=>({id:all[j].src._id,vi:all[j].vi}))}:{kind:exk?'expenses':'bills',ids:part.map(j=>all[j].src._id)};
      const r=await PCS.post('/api/xero/push',body);r.results.forEach((x,k)=>{res.set(part[k],x);x.ok?ok++:bad++})}}
    catch(e){toast(e.message)}finally{xs.disabled=false;xs.textContent='Send to Xero';$('#x-new').checked=false;draw()}
    toast(`${ok} sent to Xero${bad?`, ${bad} failed (see the list)`:''}`)};$('#x-all').onchange=e=>root.querySelectorAll('[data-x]').forEach(c=>c.checked=e.target.checked);
  $('#x-c').onclick=()=>root.innerHTML='';$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))root.innerHTML=''};
  $('#xform').onsubmit=async e=>{e.preventDefault();const pick=[...root.querySelectorAll('[data-x]:checked')].map(c=>all[+c.dataset.x]);if(!pick.length){toast('Tick at least one.');return}
    const rows=pick.flatMap(r=>r.rows);
    try{await S.downloads.save({filename:`xero-${inv?'sales-invoices':exk?'expenses':'bills'}_${stamp(new Date().toISOString())}.csv`,data:csv(rows)})}catch(err){if(err.code!=='declined')toast('Could not save: '+(err.message||err.code));return}
    if($('#x-mark').checked){const now=new Date().toISOString();S.busy=true;
      for(const r of pick){if(inv){const dd=S.deals.find(x=>x._id===r.src._id);const vs=invoicesOf(dd).map(x=>({...x}));vs[r.vi].xeroAt=now;await saveDeal(dd._id,{invoices:vs,invoice:null},`Invoice ${r.no} exported to Xero`)}else if(exk){const ee={...r.src,xeroAt:now};delete ee._id;if(await write(()=>S.db.doc('expenses/'+r.src._id).set(ee)))r.src.xeroAt=now}else await savePo(r.src._id,{xeroAt:now},'Bill exported to Xero')}
      S.busy=false;S.pending=false}
    root.innerHTML='';toast(`${pick.length} ${inv?'invoice':exk?'expense':'bill'}${pick.length>1?'s':''} exported`);render()};
}

/* ---------- hosted deployment: Xero hub, team access ---------- */
async function loadXeroStatus(){if(!window.PCS)return null;try{S.xeroStatus=await PCS.api('/api/xero/status')}catch(e){S.xeroStatus=null}return S.xeroStatus}
async function xeroHub(msg){
  const root=$('#modal-root');root.innerHTML=`<div class="modal-back"><div class="modal wide"><h2>Xero</h2><div class="note">Loading…</div></div></div>`;
  const st=await loadXeroStatus();if(!st){root.innerHTML='';toast('Could not reach the server.');return}
  const admin=S.role==='admin';const x=st.settings||{};const sel=(id,v,opts)=>`<select class="f" id="${id}" ${admin?'':'disabled'}>${opts.map(([k,l])=>`<option value="${esc(k)}" ${String(v||'')===k?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const STS=[['AUTHORISED','Approved (Awaiting payment)'],['SUBMITTED','Awaiting approval'],['DRAFT','Draft']];
  const banks=[['','Not mapped: send as a bill'],...(x.bankAccounts||[]).map(b=>[b.AccountID,b.Name+(b.Code?' ('+b.Code+')':'')])];
  const msgHtml=msg?`<div class="warn" ${/^error/.test(msg)?'':'style="background:var(--ok-soft);color:var(--ok)"'}>${esc(msg==='connected'?'Xero connected. Run the setup check next.':msg==='choose'?'Xero connected. Several organisations were authorised: pick the PCS one below.':msg.replace(/^error:/,'Xero: '))}</div>`:'';
  let body='';
  if(!st.configured)body=`<div class="warn">The Xero app keys are not set on the server yet (XERO_CLIENT_ID and XERO_CLIENT_SECRET). See the deployment guide.</div>`;
  else if(!st.connected)body=`<p>Connect the PCS Xero organisation so invoices, bills and expenses go straight into Xero and payments come back to close sales.</p>${admin?'<button class="btn primary" id="xh-connect">Connect to Xero</button>':'<div class="note">Ask an admin to connect Xero.</div>'}`;
  else body=`<div class="tiles"><div class="tile"><div class="l">Organisation</div><div class="big" style="font-size:18px">${esc(st.tenant?.name||'')}</div><div class="note">${x.isDemo?'Demo company · ':''}${esc(x.orgCountry||'')} ${esc(x.baseCurrency||'')}</div></div>
      <div class="tile"><div class="l">Setup check</div><div class="big" style="font-size:18px">${x.setupAt?((x.warnings||[]).length?(x.warnings.length+' to fix'):'All good'):'Not run'}</div><div class="note">${x.setupAt?esc(fmtDate(String(x.setupAt).slice(0,10))):'Run it once after connecting'}</div></div>
      <div class="tile"><div class="l">Last payment sync</div><div class="big" style="font-size:18px">${x.lastSync?esc(when(x.lastSync)):'Never'}</div><div class="note">${x.lastSyncResult?`${x.lastSyncResult.invoicesPaid} paid · ${x.lastSyncResult.salesClosed} closed`:''}${st.webhook?' · webhook on':' · webhook not set'}</div></div></div>
    ${(st.tenants||[]).length>1&&admin?`<label class="lb">Post to organisation${sel('xh-tenant',st.tenant?.id,st.tenants.map(t=>[t.id,t.name]))}</label>`:''}
    ${(x.warnings||[]).length?`<div class="warn"><strong>Setup check</strong><ul style="margin:6px 0 0 18px;padding:0">${x.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}
    <div id="xh-out"></div>
    <div class="row">${admin?'<button class="btn" id="xh-setup">Run setup check</button><button class="btn" id="xh-create">Setup + create missing accounts</button>':''}<button class="btn" id="xh-sync">Sync payments now</button>
      <button class="btn" data-xk="invoices">Send invoices…</button><button class="btn" data-xk="bills">Send bills…</button><button class="btn" data-xk="expenses">Send expenses…</button></div>
    <section class="dsec"><h3>Posting rules</h3><div class="fgrid">
      <label class="lb">Sales invoices go in as${sel('xh-inv',x.invoiceStatus||'AUTHORISED',STS)}</label>
      <label class="lb">Supplier bills go in as${sel('xh-bill',x.billStatus||'AUTHORISED',STS)}</label>
      <label class="lb">Expense bills (not paid from a mapped account)${sel('xh-ebill',x.expenseBillStatus||'DRAFT',STS)}</label>
      <label class="lb">&nbsp;<span class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="xh-dock" ${x.attachDockets!==false?'checked':''} ${admin?'':'disabled'}> Attach signed dockets to invoices</span><span class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="xh-rcpt" ${x.attachReceipts!==false?'checked':''} ${admin?'':'disabled'}> Attach receipts to expenses</span></label>
      ${PAID_BY.filter(p=>p!=='Personal (reimburse)').map((p,i)=>`<label class="lb">Expenses paid by “${esc(p)}” → Xero bank account${sel('xh-bank'+i,(x.bankMap||{})[p],banks)}</label>`).join('')}
    </div>${admin?'<div class="row" style="justify-content:flex-end"><button class="btn primary" id="xh-save">Save posting rules</button></div>':''}</section>
    ${admin&&(st.recent||[]).length?`<section class="dsec"><h3>Recent Xero activity</h3><div class="scroll" style="max-height:200px"><table><thead><tr><th>When</th><th>Action</th><th>Ref</th><th>Result</th></tr></thead><tbody>${st.recent.map(r=>`<tr><td class="note">${esc(when(r.at))}</td><td>${esc(r.action)}</td><td class="mono">${esc(r.ref||'')}</td><td>${r.ok?'<span class="tag st-ok">OK</span>':`<span class="tag st-low">${esc(r.detail?.error||'Failed')}</span>`}</td></tr>`).join('')}</tbody></table></div></section>`:''}
    ${admin?'<div class="row" style="justify-content:flex-end"><button class="btn danger" id="xh-disc">Disconnect Xero</button></div>':''}`;
  root.innerHTML=`<div class="modal-back"><div class="modal wide"><div class="row" style="justify-content:space-between"><h2>Xero</h2><button class="btn" id="xh-c">Close</button></div>${msgHtml}${body}</div></div>`;
  const close=()=>root.innerHTML='';$('#xh-c').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const on=(id,fn)=>{const b=$('#'+id);if(b)b.onclick=fn};
  const busy=async(b,fn)=>{b.disabled=true;const t=b.textContent;b.textContent='Working…';try{await fn()}catch(e){toast(e.message||'Failed')}finally{b.disabled=false;b.textContent=t}};
  on('xh-connect',()=>{location.href='/api/xero/connect'});
  const runSetup=create=>e=>busy(e.target,async()=>{const r=await PCS.post('/api/xero/setup',{createMissing:create});await xeroHub(r.warnings.length?`error:Setup found ${r.warnings.length} thing${r.warnings.length>1?'s':''} to fix${r.created.length?' · created '+r.created.join(', '):''}`:'Setup check passed'+(r.created.length?' · created '+r.created.join(', '):''))});
  on('xh-setup',runSetup(false));on('xh-create',runSetup(true));
  on('xh-sync',e=>busy(e.target,async()=>{const r=await PCS.post('/api/xero/sync',{});await xeroHub(`Checked ${r.checked}: ${r.invoicesPaid} invoice${r.invoicesPaid===1?'':'s'} paid, ${r.salesClosed} sale${r.salesClosed===1?'':'s'} closed, ${r.billsPaid} bill${r.billsPaid===1?'':'s'} paid`)}));
  root.querySelectorAll('[data-xk]').forEach(b=>b.onclick=()=>xeroModal(b.dataset.xk));
  const tn=$('#xh-tenant');if(tn)tn.onchange=()=>busy(tn,async()=>{await PCS.post('/api/xero/tenant',{tenantId:tn.value});await xeroHub('Organisation changed. Run the setup check.')});
  on('xh-save',e=>busy(e.target,async()=>{const bankMap={};PAID_BY.filter(p=>p!=='Personal (reimburse)').forEach((p,i)=>{bankMap[p]=$('#xh-bank'+i).value});
    await PCS.post('/api/xero/settings',{invoiceStatus:$('#xh-inv').value,billStatus:$('#xh-bill').value,expenseBillStatus:$('#xh-ebill').value,attachDockets:$('#xh-dock').checked,attachReceipts:$('#xh-rcpt').checked,bankMap});toast('Posting rules saved')}));
  on('xh-disc',e=>{const b=e.target;if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent='Click again to disconnect';return}busy(b,async()=>{await PCS.post('/api/xero/disconnect',{});await xeroHub('Xero disconnected')})});
  render();
}
async function teamModal(){
  const root=$('#modal-root');let d;try{d=await PCS.api('/api/users')}catch(e){toast(e.message);return}
  const ROLES=[['','Default ('+d.rules.defaultRole+')'],['viewer','Viewer: read only'],['editor','Editor'],['admin','Admin'],['blocked','No access']];
  const opt=v=>ROLES.map(([k,l])=>`<option value="${k}" ${String(v||'')===k?'selected':''}>${esc(l)}</option>`).join('');
  root.innerHTML=`<div class="modal-back"><div class="modal wide"><h2>Team access</h2>
    <div class="note">Titles: <strong>Admin</strong> and <strong>Manager</strong> raise and send quotes and POs (same permissions). A <strong>Director</strong> approves anything over $${Number(alertCfg()?.approvals.quoteValue||20000).toLocaleString('en-AU')} and is copied when it goes out.</div>
    <div class="note">Anyone signing in with an email address at <strong>${esc(d.rules.allowedDomains||'(no domains set)')}</strong> gets the default role (${esc(d.rules.defaultRole)}). Admins from the server settings: ${esc(d.rules.adminEmails||'none')}. Set a role here to override it for one person.</div>
    <div class="scroll" style="max-height:50vh"><table><thead><tr><th>Person</th><th>Email</th><th>Last signed in</th><th>Access</th><th>Title</th></tr></thead><tbody>${d.users.map(u=>`<tr><td>${esc(u.name||'')}</td><td class="mono note">${esc(u.email)}</td><td class="note">${u.last_seen?esc(when(u.last_seen)):'—'}</td><td><select class="f" data-urole="${esc(u.email)}">${opt(u.role)}</select></td><td><select class="f" data-utitle="${esc(u.email)}" aria-label="Title">${['','Admin','Manager','Director'].map(t=>`<option value="${t}" ${titleOf(u.email)===t?'selected':''}>${t||'—'}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><input class="f" id="tm-email" placeholder="name@company.com.au" style="max-width:280px"><select class="f" id="tm-role" style="max-width:200px">${opt('editor')}</select><select class="f" id="tm-title" style="max-width:140px" aria-label="Title"><option value="">Title…</option><option>Admin</option><option>Manager</option><option>Director</option></select><button class="btn" id="tm-add">Add / set</button><span style="flex:1"></span><button class="btn" id="tm-c">Close</button></div></div></div>`;
  $('#tm-c').onclick=()=>root.innerHTML='';
  const set=async(email,role)=>{try{await PCS.post('/api/users',{email,role:role||null});toast('Access updated')}catch(e){toast(e.message)}};
  root.querySelectorAll('[data-urole]').forEach(s=>s.onchange=()=>set(s.dataset.urole,s.value));
  const setTitle=async(email,t)=>{const titles={...(alertCfg().titles||{})};if(t)titles[email]=t;else delete titles[email];
    const doc={...(S.alertSettings||{}),titles,directors:Object.entries(titles).filter(([,v])=>v==='Director').map(([e])=>e).join(', '),updatedAt:new Date().toISOString(),updatedBy:S.meEmail||null};delete doc.approvers;
    if(await write(()=>S.db.doc('settings/alerts').set(doc),t==='Director'?'Director: approves anything over the limits':'Title saved'))S.alertSettings=doc};
  root.querySelectorAll('[data-utitle]').forEach(sl=>sl.onchange=()=>setTitle(sl.dataset.utitle,sl.value));
  $('#tm-add').onclick=async()=>{const e=$('#tm-email').value.trim().toLowerCase();await set(e,$('#tm-role').value);if($('#tm-title').value&&e)await setTitle(e,$('#tm-title').value);teamModal()};
}
const EXPORT_COLLS=['catalog','parts','products','pricing','stock','moves','orders','deals','customers','suppliers','pos','expenses','documents','settings','rfqs','pricelog','alertstate'];
const snapOnce=c=>new Promise((res,rej)=>{let done=false,un=null;un=S.db.collection(c).onSnapshot(s=>{if(done)return;done=true;res(s.docs.map(d=>({id:d.id,data:d.data()})));setTimeout(()=>{try{if(typeof un==='function')un()}catch(e){}},0)},e=>{if(!done){done=true;rej(e)}})});
async function exportAll(){
  if(!S.db||!window.JSZip){toast('Export needs the database connection.');return}
  const b=$('#co-export');if(b){b.disabled=true;b.textContent='Exporting…'}
  try{
    const collections={};for(const c of EXPORT_COLLS)collections[c]=await snapOnce(c);
    const names=new Map();
    for(const d of collections.documents||[])if(d.data.assetId)names.set(d.data.assetId,{name:d.data.filedName||d.data.originalName,type:d.data.contentType});
    for(const d of collections.expenses||[])if(d.data.receiptId)names.set(d.data.receiptId,{name:d.data.receiptName});
    for(const d of collections.deals||[])for(const k of docketsOf(d.data))if(k.podAssetId)names.set(k.podAssetId,{name:k.podName});
    for(const d of collections.rfqs||[])for(const sp of d.data.suppliers||[])if(sp.quote?.assetId)names.set(sp.quote.assetId,{name:sp.quote.fileName||d.data.no+'-quote.pdf',type:'application/pdf'});
    const zip=new JSZip();const assets=[];let miss=0;
    for(const [id,meta] of names){try{const r=await fetch('/_blob/'+id);if(!r.ok)throw new Error(String(r.status));const bl=await r.blob();zip.file('files/'+id,bl);assets.push({id,file:'files/'+id,name:meta.name||id,contentType:bl.type||meta.type||'application/octet-stream'})}catch(e){miss++}}
    const data={format:'pcs-export',version:1,exportedAt:new Date().toISOString(),source:window.PCS?'vercel':'claude.ai',collections,assets};
    zip.file('data.json',JSON.stringify(data));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    await S.downloads.save({filename:`pcs-export_${stamp(data.exportedAt)}.zip`,data:blob});
    toast(`Exported ${Object.values(collections).reduce((a,x)=>a+x.length,0)} records and ${assets.length} files${miss?` (${miss} files could not be read)`:''}`);
  }catch(e){if(!(e&&e.code==='declined'))toast('Export failed: '+(e.message||e.code||e))}
  finally{if(b){b.disabled=false;b.textContent='Export all data'}}
}

/* quote documents */
const LOGO_B64='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';
function docxHead(title,P){
  const img=`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="900000" cy="918000"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="918000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="10100" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="12" w:color="000000"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1700"/><w:gridCol w:w="8400"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="1700" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p>${img}</w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="8400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${P(co().name,{b:true,sz:40})}${co().tagline?P(co().tagline.toUpperCase(),{b:true,sz:16}):''}${P([co().legal,'ABN '+(co().abn||'')].filter(Boolean).join('  ·  '),{sz:18,c:'5A6773'})}${coLine()?P(coLine(),{sz:18,c:'5A6773'}):''}${P(title,{b:true,sz:28,c:'1C5A9C'})}</w:tc></w:tr></w:tbl>`+P('');
}
async function docxBlob(doc){
  doc=doc.replace('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">');
  const zz=new JSZip();
  zz.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zz.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zz.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>');
  zz.file('word/media/logo.png',LOGO_B64,{base64:true});
  zz.file('word/document.xml',doc);
  return zz.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

const xmlEsc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function wordKit(){
  const P=(txt,o={})=>`<w:p>${o.al?`<w:pPr><w:jc w:val="${o.al}"/></w:pPr>`:''}<w:r><w:rPr>${o.b?'<w:b/>':''}${o.sz?`<w:sz w:val="${o.sz}"/>`:''}${o.c?`<w:color w:val="${o.c}"/>`:''}</w:rPr><w:t xml:space="preserve">${xmlEsc(txt)}</w:t></w:r></w:p>`;
  const cell=(txt,w,o={})=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.span?`<w:gridSpan w:val="${o.span}"/>`:''}${o.fill?`<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`:''}</w:tcPr>${Array.isArray(txt)?txt.map(t=>P(t,o)).join(''):P(txt,o)}</w:tc>`;
  const table=(cols,rows,tot=[])=>{const W=cols.map(c=>c.w);const all=W.reduce((a,b)=>a+b,0);
    const hdr=`<w:tr>${cols.map(c=>cell(c.h,c.w,{b:true,fill:'1C5A9C',c:'FFFFFF',al:c.r?'right':null})).join('')}</w:tr>`;
    const body=rows.map(r=>`<w:tr>${r.map((v,i)=>cell(v,W[i],{al:cols[i].r?'right':null})).join('')}</w:tr>`).join('');
    const tt=tot.map(([l,v,b])=>`<w:tr>${cell(l,all-W[W.length-1],{span:W.length-1,b,al:'right'})}${cell(v,W[W.length-1],{b,al:'right'})}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="${all}" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="D5DCE2"/><w:bottom w:val="single" w:sz="4" w:color="D5DCE2"/></w:tblBorders></w:tblPr><w:tblGrid>${W.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${hdr}${body}${tt}</w:tbl>`};
  const box=(pairs)=>{const W=[2400,2650,2400,2650];const rows=[];for(let i=0;i<pairs.length;i+=2){const a=pairs[i],b=pairs[i+1]||['',''];rows.push(`<w:tr>${cell(a[0],W[0],{b:true,sz:18,c:'5A6773'})}${cell(a[1],W[1])}${cell(b[0],W[2],{b:true,sz:18,c:'5A6773'})}${cell(b[1],W[3])}</w:tr>`)}
    return `<w:tbl><w:tblPr><w:tblW w:w="10100" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="E6EAEE"/></w:tblBorders></w:tblPr><w:tblGrid>${W.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`};
  const wrap=body=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return {P,cell,table,box,wrap};
}
async function saveDocx(doc,name){
  if(!window.JSZip){toast('Word export is still loading. Try again in a moment.');return}
  const blob=await docxBlob(doc);
  try{await S.downloads.save({filename:name.replace(/[^A-Za-z0-9 .\-]/g,'')+'.docx',data:blob})}catch(e){if(e.code!=='declined')toast('Could not save: '+(e.message||e.code))}
}
async function quoteXlsx(d){
  if(!xlsxReady())return;const q=d.quote;const c=S.customers.find(x=>x._id===d.customerId)||{};const t=qTotals(q);
  const aoa=[[co().legal||co().name],['ABN '+co().abn],[coLine()],['QUOTATION'],[`Quote ${q.no}${q.rev?' rev '+q.rev:''}`,'',`Date ${fmtDate(q.date)}`,'',`Valid until ${fmtDate(addDays(q.date,q.valid||30))}`],[],['To',c.name||''],['Attn',d.contact||''],['Re',d.title||''],[],['Item code','Description','Qty','Unit price','Disc %','Total']];
  q.lines.forEach(l=>{const p=l.itemId&&S.parts.get(l.itemId);aoa.push([p?p.partNo:(l.code||''),l.desc,num(l.qty),num(l.price),num(l.disc)||'',+(num(l.qty)*num(l.price)*(1-num(l.disc)/100)).toFixed(2)])});
  aoa.push([],['','','','','Subtotal',+t.sub.toFixed(2)],['','','','','GST 10%',+t.gst.toFixed(2)],['','','','','Total inc GST',+t.total.toFixed(2)],[],[q.leadTime?'Lead time: '+q.leadTime:''],...String(q.terms||'').split('\n').map(x=>[x]));
  const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:14},{wch:52},{wch:6},{wch:12},{wch:14},{wch:12}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Quote');await saveWb(wb,`${q.no}${q.rev?'-rev'+q.rev:''}.xlsx`);
}
const HIST_DAYS=60;
const histDate=d=>addDays(String(d.closedAt||d.updatedAt||'').slice(0,10),HIST_DAYS);
const isHist=d=>d.stage==='closed'&&!!(d.closedAt||d.updatedAt)&&histDate(d)<=todayISO();
const fyOf=iso=>{const y=+String(iso).slice(0,4),m=+String(iso).slice(5,7);return y?(m>=7?y+1:y):0};
const lastPaid=d=>invoicesOf(d).map(v=>v.paidAt||'').sort().pop()||'';
const histRow=d=>{const inv=invoicesOf(d).reduce((a,v)=>a+num(v.amount),0);const st=String(d.createdAt||'').slice(0,10);const cl=String(d.closedAt||'').slice(0,10);return {d,inv,days:st&&cl?Math.round((new Date(cl)-new Date(st))/864e5):null}};
async function exportHistory(rows){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  sheet(wb,rows.map(({d,inv,days})=>({'Sale no.':d.no,Customer:custName(d.customerId),Contact:d.contact||'',Title:d.title||'','Lead created':String(d.createdAt||'').slice(0,10),Quote:d.quote?.no||'','Customer PO':d.po?.no||'','Build orders':dealOrders(d).map(o=>o.no).join(', '),Dockets:docketsOf(d).map(k=>k.docketNo).join(', '),Invoices:invoicesOf(d).map(v=>v.no).join(', '),'Value ex GST':+dealValue(d).toFixed(2),'Invoiced inc GST':+inv.toFixed(2),'Last payment':lastPaid(d),Closed:d.closedAt||'','Days lead to paid':days??'','Financial year':'FY'+fyOf(d.closedAt)})),'Sales history',[9,26,18,40,11,9,14,16,18,18,12,12,11,11,10,10]);
  await saveWb(wb,`sales-history_${stamp(new Date().toISOString())}.xlsx`);
}
async function exportDeals(){
  if(!xlsxReady())return;const wb=XLSX.utils.book_new();
  sheet(wb,S.deals.slice().sort((a,b)=>String(a.no).localeCompare(String(b.no),undefined,{numeric:true})).map(d=>({'Sale no.':d.no,Stage:STG[d.stage]||d.stage,Customer:custName(d.customerId),Contact:d.contact||'',Title:d.title||'',Source:d.source||'','Value ex GST':+dealValue(d).toFixed(2),Quote:d.quote?.no||'','Quote date':d.quote?.date||'','Customer PO':d.po?.no||'','PO date':d.po?.date||'',Dockets:docketsOf(d).map(k=>k.docketNo).join(', '),'Back order':hasBO(d)&&docketsOf(d).length?'Yes':'',Dispatched:docketsOf(d).map(k=>k.date).join(', '),'Signed dockets':docketsOf(d).filter(k=>k.podAssetId).length+'/'+docketsOf(d).length,Invoices:invoicesOf(d).map(v=>v.no).join(', '),'Invoiced inc GST':invoicesOf(d).reduce((a,v)=>a+num(v.amount),0)||'','Unpaid':unpaid(d)||'','Lost reason':d.lostReason||'','Next action':d.nextAction||'','Next date':d.nextDate||''})),'Sales',[9,12,26,18,40,14,12,9,11,14,11,10,11,8,11,12,6,18,30,11]);
  sheet(wb,S.customers.map(c=>({Customer:c.name,ABN:c.abn||'',Site:c.site||'',Type:c.type||'','Terms (days)':c.terms??'',Contacts:(c.contacts||[]).map(k=>[k.name,k.role,k.email,k.phone].filter(Boolean).join(' / ')).join('; ')})),'Customers',[28,14,30,14,10,80]);
  await saveWb(wb,`sales-pipeline_${stamp(new Date().toISOString())}.xlsx`);
}

/* ---------- documents: one model → Word, PDF, print and email ---------- */
// Every outgoing document (quote, RFQ, PO, delivery docket, packing list, build sheet, invoice) is
// described once as a "spec" (blocks of paragraphs, label boxes and tables). The same spec renders
// to Word, to PDF (pdf-lib), to a print page, and is attached to emails as PDF.
const LIB={pdflib:'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',pdfjs:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs',pdfjsWorker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'};
const _libs={};
function loadScript(url){return _libs[url]||(_libs[url]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.onload=res;s.onerror=()=>{delete _libs[url];rej(new Error('Could not load '+url))};document.head.appendChild(s)}))}
function recKit(){const blocks=[];return {blocks,
  head:title=>{blocks.push({t:'head',title});return ''},
  P:(text,o={})=>{blocks.push({t:'p',text:String(text??''),o});return ''},
  table:(cols,rows,tot=[])=>{blocks.push({t:'table',cols,rows,tot});return ''},
  box:pairs=>{blocks.push({t:'box',pairs});return ''}}}
const fileSafe=s=>String(s||'').replace(/[^A-Za-z0-9 .\-]/g,'').replace(/\s+/g,' ').trim();
const firstName=s=>String(s||'').trim().split(/\s+/)[0]||'there';
const sigBlock=()=>{const c=co();return ['Kind regards,','',c.contact||c.name,c.contactRole,c.name+(c.tagline?' · '+c.tagline:''),c.contactPhone&&'M '+c.contactPhone,c.contactEmail||c.email].filter(x=>x!==undefined&&x!==null&&x!==false).join('\n').replace(/\n{3,}/g,'\n\n')};
const contactOf=(list,name)=>(list||[]).find(x=>x.name===name)||(list||[])[0]||{};

function specQuote(d){
  const K=recKit(),{P,table,head}=K;const q=d.quote;const c=S.customers.find(x=>x._id===d.customerId)||{};const t=qTotals(q);const k=(c.contacts||[]).find(x=>x.name===d.contact)||{};
  head('QUOTATION');
  P(`Quote ${q.no}${q.rev?' rev '+q.rev:''}   ·   Sale ${d.no}   ·   Date ${fmtDate(q.date)}   ·   Valid until ${fmtDate(addDays(q.date,q.valid||30))}`);P('');
  P('To',{b:true});P(c.name||'');if(c.site)P(c.site);if(d.contact)P('Attn: '+d.contact+(k.email?'  ·  '+k.email:'')+(k.phone?'  ·  '+k.phone:''));P('');
  if(d.title){P('Re: '+d.title,{b:true});P('')}
  table([{h:'Item code',w:1500},{h:'Description',w:4300},{h:'Qty',w:800,r:1},{h:'Unit price',w:1300,r:1},{h:'Disc %',w:800,r:1},{h:'Total',w:1400,r:1}],
    (q.lines||[]).map(l=>{const p=l.itemId&&S.parts.get(l.itemId);return [p?p.partNo:(l.code||''),l.desc||'',qfmt(l.qty),money(l.price),l.disc?l.disc+'%':'',money(num(l.qty)*num(l.price)*(1-num(l.disc)/100))]}),
    [['Subtotal',money(t.sub)],[q.gst===false?'GST':'GST 10%',money(t.gst)],['Total inc GST',money(t.total),true]]);
  P('');if(q.leadTime)P('Lead time: '+q.leadTime);String(q.terms||'').split('\n').filter(Boolean).forEach(x=>P(x));P('');
  P('Thank you for the opportunity to quote. Please quote '+q.no+' on your purchase order.');if(coContact())P('Contact: '+coContact());
  return {kind:'quote',label:'Quote',title:'Quotation',no:q.no+(q.rev?' rev '+q.rev:''),file:`${q.no}${q.rev?'-rev'+q.rev:''} ${fileSafe(c.name)}`,blocks:K.blocks,
    email:{to:[k.email||(c.contacts||[])[0]?.email||c.email].filter(Boolean),subject:`Quotation ${q.no} · ${d.title||d.no} · ${co().name}`,
      body:`Hi ${firstName(d.contact||k.name)},\n\nPlease find attached our quotation ${q.no}${d.title?' for '+d.title:''}, valid until ${fmtDate(addDays(q.date,q.valid||30))}.\n\nPlease quote ${q.no} on your purchase order. Let me know if you have any questions.\n\n${sigBlock()}`},
    ref:{coll:'deals',id:d._id,no:q.no,saleNo:d.no}};
}
function specPo(po){
  const K=recKit(),{P,table,head}=K;const s=S.suppliers.find(x=>x._id===po.supplierId)||{};const tot=poTotal(po);const sale=S.deals.find(x=>x._id===po.saleId);const k=contactOf(s.contacts,po.attn);
  head('PURCHASE ORDER');
  P(`${po.no}   ·   Date ${fmtDate(po.date)}${po.expected?'   ·   Required by '+fmtDate(po.expected):''}`);P('');
  P('Supplier',{b:true});P(s.name||'');if(s.address)P(s.address);if(s.account)P('Our account: '+s.account);if(po.ref)P('Your quote / ref: '+po.ref);P('');
  P('Deliver to',{b:true});P(po.deliverTo||co().name);P('');
  table([{h:'Our code',w:1300},{h:'Description',w:3700},{h:'Your part no.',w:1500},{h:'Qty',w:800,r:1},{h:'Unit price',w:1300,r:1},{h:'Total',w:1500,r:1}],
    (po.lines||[]).map(l=>{const p=S.parts.get(l.itemId)||{};return [p.partNo||'',(p.description||'')+(p.orderNo?' ('+p.orderNo+')':''),l.supCode||'',qfmt(l.qty),money(l.price),money(num(l.qty)*num(l.price))]}),
    [['Total ex GST',money(tot)],['GST 10%',money(tot*GST)],['Total inc GST',money(tot*(1+GST)),true]]);
  P('');String(po.notes||'').split('\n').filter(Boolean).forEach(x=>P(x));String(co().poTerms||'').split('\n').filter(Boolean).forEach(x=>P(x));
  if(coContact())P('Contact: '+coContact());P('PO number: '+po.no,{b:true});
  return {kind:'po',label:'Purchase order',title:'Purchase order',no:po.no,file:`${po.no} ${fileSafe(s.name)}`,blocks:K.blocks,
    email:{to:[k.email||s.email].filter(Boolean),subject:`Purchase order ${po.no} · ${co().name}`,
      body:`Hi ${firstName(k.name)},\n\nPlease find attached purchase order ${po.no}${po.ref?' against your quote '+po.ref:''}.${po.expected?' We need delivery by '+fmtDate(po.expected)+'.':''}\n\nPlease confirm receipt and quote ${po.no} on your delivery docket and invoice.\n\n${sigBlock()}`},
    ref:{coll:'pos',id:po._id,no:po.no,saleNo:sale?.no||''}};
}
function specRfq(r,sup){
  const K=recKit(),{P,table,head,box}=K;const s=S.suppliers.find(x=>x._id===sup?.supplierId)||{};const sale=S.deals.find(x=>x._id===r.saleId);const k=contactOf(s.contacts);
  head('REQUEST FOR QUOTATION');
  box([['RFQ no.',r.no],['Date',fmtDate(r.date)],['Supplier',s.name||'—'],['Quote required by',r.replyBy?fmtDate(r.replyBy):'—'],['Our reference',sale?sale.no:'Stock'],['Delivery needed by',r.needBy?fmtDate(r.needBy):'—']]);P('');
  table([{h:'Our code',w:1300},{h:'Description',w:3900},{h:'Your part no.',w:1400},{h:'Qty',w:800,r:1},{h:'Unit price ex GST',w:1400,r:1},{h:'Lead time',w:1300}],
    (r.lines||[]).map(l=>{const p=S.parts.get(l.itemId)||{};const si=supItem(s._id,l.itemId);return [p.partNo||'',(p.description||'')+(p.orderNo?' ('+p.orderNo+')':''),l.supCode||si?.supCode||'',qfmt(l.qty),'','']}));
  P('');P('Please quote your best unit price (ex GST) and lead time for each line, quoting '+r.no+' on your quotation.');
  String(r.notes||'').split('\n').filter(Boolean).forEach(x=>P(x));
  P('Deliver to: '+(co().deliverTo||[co().legal||co().name,co().address].filter(Boolean).join(', ')));if(coContact())P('Contact: '+coContact());
  return {kind:'rfq',label:'RFQ',title:'Request for quotation',no:r.no,file:`${r.no} ${fileSafe(s.name)}`,blocks:K.blocks,
    email:{to:[k.email||s.email].filter(Boolean),subject:`Request for quotation ${r.no} · ${co().name}`,
      body:`Hi ${firstName(k.name)},\n\nPlease quote the items on the attached request ${r.no}${r.replyBy?' by '+fmtDate(r.replyBy):''}, with unit prices ex GST and lead times.\n\nPlease reply with your quotation as a PDF and quote ${r.no}.\n\n${sigBlock()}`},
    ref:{coll:'rfqs',id:r._id,no:r.no,saleNo:sale?.no||'',supplierId:s._id}};
}
function specDocket(d,x){
  x=x||docketsOf(d).slice(-1)[0];if(!x)return null;const c=S.customers.find(y=>y._id===d.customerId)||{};const K=recKit(),{P,table,box,head}=K;const k=(c.contacts||[]).find(y=>y.name===(x.attn||d.contact))||{};
  head('DELIVERY DOCKET');
  box([['Docket no.',x.docketNo+(x.backOrder?' (back order)':'')],['Date',fmtDate(x.date)],['Sale no.',d.no],['Customer PO',d.po?.no||'—'],['Customer',c.name||''],['Attention',x.attn||'—'],['Deliver to',x.address||'—'],['Carrier',x.carrier||'—'],['Consignment',x.connote||'—'],['Packages / weight',[x.packages,x.weight&&x.weight+' kg'].filter(Boolean).join(' · ')||'—']]);P('');
  table([{h:'Item code',w:1500},{h:'Description',w:5200},{h:'Ordered',w:1100,r:1},{h:'Supplied',w:1100,r:1},{h:'Back order',w:1200,r:1}],(()=>{const ks=docketsOf(d);const upto=ks.slice(0,ks.findIndex(k2=>k2.docketNo===x.docketNo)+1);const sup=li=>upto.reduce((a,k2)=>a+num(((k2.lines||[]).find(l=>l.li===li)||{}).supplied),0);return (x.lines||[]).filter(l=>num(l.supplied)>0||num(l.ordered)-sup(l.li)>0).map(l=>{const prevSup=sup(l.li)-num(l.supplied);const left=Math.max(0,num(l.ordered)-sup(l.li));return [l.code||'',l.desc||'',qfmt(l.ordered)+(prevSup?` (${qfmt(prevSup)} sent earlier)`:''),qfmt(l.supplied),left?qfmt(left):'']})})());
  P('');P('Goods received in good order and condition.',{b:true});P('');
  box([['Received by (print)','____________________'],['Signature','____________________'],['Date','____________'],['Time','____________']]);P('');
  if(coContact())P('Enquiries: '+coContact(),{sz:18,c:'5A6773'});P('Please return the signed docket to '+(co().email||co().name)+'.',{sz:18,c:'5A6773'});
  return {kind:'docket',label:'Delivery docket',title:'Delivery docket',no:x.docketNo,file:`${x.docketNo} ${d.no} ${fileSafe(c.name)}`,blocks:K.blocks,
    email:{to:[k.email||(c.contacts||[])[0]?.email].filter(Boolean),subject:`Delivery docket ${x.docketNo} · PO ${d.po?.no||d.no} · ${co().name}`,
      body:`Hi ${firstName(x.attn||d.contact)},\n\nYour order ${d.po?.no||''} has been dispatched${x.carrier?' with '+x.carrier:''}${x.connote?' (con note '+x.connote+')':''}. The delivery docket ${x.docketNo} is attached.\n\n${sigBlock()}`},
    ref:{coll:'deals',id:d._id,no:x.docketNo,saleNo:d.no}};
}
function specPacking(d,x){
  x=x||docketsOf(d).slice(-1)[0];if(!x)return null;const c=S.customers.find(y=>y._id===d.customerId)||{};const K=recKit(),{P,table,box,head}=K;
  const rows=[];
  for(const l of (x.lines||[]).filter(l=>num(l.supplied)>0)){
    rows.push([l.code||'',l.desc||'',qfmt(l.supplied),'','☐']);
    const p=l.itemId&&S.parts.get(l.itemId);
    if(p&&isAsm(p))for(const k of lines(p)){const cp=S.parts.get(k.partId)||{};rows.push(['   '+(cp.partNo||k.partId),'   includes: '+(cp.description||''),qfmt(k.qty*num(l.supplied)),'','☐'])}
  }
  head('PACKING LIST');
  box([['Delivery docket',x.docketNo+(x.backOrder?' (back order)':'')],['Date',fmtDate(x.date)],['Sale no.',d.no],['Customer PO',d.po?.no||'—'],['Customer',c.name||''],['Attention',x.attn||'—'],['Deliver to',x.address||'—'],['Carrier / con note',[x.carrier,x.connote].filter(Boolean).join(' · ')||'—'],['Packages',x.packages||'____'],['Total weight',x.weight?x.weight+' kg':'____ kg']]);P('');
  table([{h:'Item code',w:1500},{h:'Description',w:5300},{h:'Qty',w:900,r:1},{h:'Package no.',w:1400},{h:'Packed',w:900}],rows);P('');
  P('Items marked “includes” are supplied fitted or packed with the product above them.',{sz:18,c:'5A6773'});P('');
  box([['Packed by','____________________'],['Date','____________'],['Checked by','____________________'],['Date','____________']]);
  return {kind:'packing',label:'Packing list',title:'Packing list',no:x.docketNo,file:`${x.docketNo} packing list ${d.no}`,blocks:K.blocks,internal:true,
    email:{to:[],subject:`Packing list ${x.docketNo} · ${d.no}`,body:`Packing list for ${x.docketNo} (${d.no}, ${c.name||''}) attached. No prices shown.\n\n${sigBlock()}`},
    ref:{coll:'deals',id:d._id,no:x.docketNo,saleNo:d.no}};
}
function specBuild(o){
  if(!o)return null;const p=S.parts.get(o.itemId)||{};const K=recKit(),{P,table,box,head}=K;const q=num(o.qty);const deal=S.deals.find(x=>x._id===o.dealId);
  const rows=explode(o.itemId).map(r=>{const c=r.part||{};const loc=stk(r.id).location||'';return [`${'   '.repeat(r.level-1)}${r.level}`,(c.partNo||r.id),`${'   '.repeat(r.level-1)}${c.description||'Missing item'}${c.orderNo?' ('+c.orderNo+')':''}`,c.level||'',r.role||'',qfmt(r.qty),qfmt(r.total*q),loc,'☐']});
  const pl=orderPlan(o.itemId,q);const pick=[...new Set([...pl.pulls.keys(),...pl.short.keys()])].sort((a,b)=>String(pn(a)).localeCompare(String(pn(b)),undefined,{numeric:true}))
    .map(id=>{const c=S.parts.get(id)||{};return [c.partNo||id,c.description||'',qfmt((pl.pulls.get(id)||0)+(pl.short.get(id)||0)),stk(id).location||'',pl.short.get(id)?'SHORT '+qfmt(pl.short.get(id)):'','☐']});
  head('BUILD SHEET');
  box([['Build order',o.no],['Date issued',fmtDate(todayISO())],['Sale no.',deal?.no||'—'],['Customer',o.customer||'—'],['Product',p.partNo||''],['Quantity to build',qfmt(q)],['Description',p.description||''],['Due',o.due?fmtDate(o.due):'—'],['Customer PO',o.ref||'—'],['Ordering no.',p.orderNo||'—']]);P('');
  P('Bill of materials',{b:true,sz:24});
  if(rows.length)table([{h:'Lvl',w:500},{h:'Item code',w:1200},{h:'Description',w:3400},{h:'Type',w:1200},{h:'Role',w:1300},{h:'Per unit',w:900,r:1},{h:'Total',w:800,r:1},{h:'Bin',w:500},{h:'✓',w:300}],rows);else P('This product has no BOM yet.',{c:'B3261E'});P('');
  P('Pick list',{b:true,sz:24});P('Items to take from stores for this build. Parts already on hand are used before building them from components.',{sz:18,c:'5A6773'});
  if(pick.length)table([{h:'Item code',w:1300},{h:'Description',w:4300},{h:'Qty to pick',w:1300,r:1},{h:'Bin',w:900},{h:'Short',w:1300},{h:'Picked',w:1000}],pick);else P('Nothing to pick.');P('');
  if(o.notes)P('Notes: '+o.notes);P('');
  box([['Built by','____________________'],['Date','____________'],['Checked by','____________________'],['Date','____________'],['Serial / batch no.','____________________'],['Qty passed QC','____________']]);
  // drawings that go with the build: latest revision of each document on the product and its first-level parts
  const ids=[o.itemId,...lines(p).map(l=>l.partId)];const extras=[];
  for(const id of ids)for(const t of TYPES){const cur=docsFor(id,t.code)[0];if(cur)extras.push({assetId:cur.assetId,name:cur.filedName,label:`${pn(id)} · ${t.label} rev ${cur.rev}`,checked:id===o.itemId&&t.code!=='OTH'})}
  return {kind:'build',label:'Build sheet',title:'Build sheet',no:o.no,file:`${o.no} build sheet ${p.partNo||''}`,blocks:K.blocks,internal:true,extras,
    email:{to:[],subject:`Build sheet ${o.no} · ${p.partNo||''} × ${qfmt(q)}${deal?' · '+deal.no:''}`,body:`Build sheet ${o.no} for ${qfmt(q)} × ${p.partNo||''} ${p.description||''}${o.due?', due '+fmtDate(o.due):''}. Drawings attached where available. No prices shown.\n\n${sigBlock()}`},
    ref:{coll:'orders',id:o._id,no:o.no,saleNo:deal?.no||''}};
}
function specInvoice(d,v){
  v=v||invoicesOf(d).slice(-1)[0];if(!v)return null;const c=S.customers.find(y=>y._id===d.customerId)||{};const K=recKit(),{P,table,box,head}=K;const k=co();
  const ls=v.lines||[];const ck=(c.contacts||[]).find(y=>y.name===d.contact)||{};
  const sub0=v.sub??ls.reduce((a,l)=>a+num(l.supplied)*num(l.price)*(1-num(l.disc)/100),0);const gst=v.gst??sub0*GST;
  const bank=[k.bankAcctName&&'Account name: '+k.bankAcctName,k.bankName&&'Bank: '+k.bankName,k.bankBsb&&'BSB: '+k.bankBsb,k.bankAcct&&'Account: '+k.bankAcct].filter(Boolean);
  head('TAX INVOICE');
  box([['Invoice no.',v.no],['Invoice date',fmtDate(v.date)],['Sale no.',d.no],['Customer PO',d.po?.no||'—'],['Delivery docket',v.docketNo||'—'],['Due date',fmtDate(v.due)],['Bill to',[c.name,c.site].filter(Boolean).join(', ')],['Customer ABN',c.abn||'—']]);P('');
  table([{h:'Item code',w:1400},{h:'Description',w:4300},{h:'Qty',w:800,r:1},{h:'Unit price',w:1300,r:1},{h:'Disc %',w:800,r:1},{h:'Total',w:1500,r:1}],ls.map(l=>[l.code||'',l.desc||'',qfmt(l.supplied),money(l.price),l.disc?l.disc+'%':'',money(num(l.supplied)*num(l.price)*(1-num(l.disc)/100))]),[['Subtotal',money(sub0)],['GST 10%',money(gst)],['Total inc GST',money(v.amount??sub0+gst),true]]);
  P('');P(`Payment terms: ${v.terms??c.terms??30} days. Please quote ${v.no} with your payment.`);
  if(bank.length){P('Payment details',{b:true});bank.forEach(b=>P(b))}else P('Payment details to be confirmed.',{c:'5A6773'});
  if(coContact())P('Enquiries: '+coContact(),{sz:18,c:'5A6773'});
  const pod=docketsOf(d).find(x=>x.docketNo===v.docketNo&&x.podAssetId);
  return {kind:'invoice',label:'Invoice',title:'Tax invoice',no:v.no,file:`${v.no} ${d.no} ${fileSafe(c.name)}`,blocks:K.blocks,
    extras:pod?[{assetId:pod.podAssetId,name:pod.podName||pod.docketNo+'-signed',label:`Signed docket ${pod.docketNo}`,checked:true}]:[],
    email:{to:[c.accountsEmail||ck.email||(c.contacts||[])[0]?.email].filter(Boolean),subject:`Tax invoice ${v.no} · PO ${d.po?.no||d.no} · ${co().name}`,
      body:`Hi ${firstName(d.contact)},\n\nPlease find attached tax invoice ${v.no} for ${money(v.amount??sub0+gst)} inc GST${d.po?.no?' against your PO '+d.po.no:''}, due ${fmtDate(v.due)}.\n\n${bank.length?'Payment details are on the invoice. ':''}Please quote ${v.no} with your payment.\n\n${sigBlock()}`},
    ref:{coll:'deals',id:d._id,no:v.no,saleNo:d.no}};
}

/* renderers */
function specXml(s){
  const {P,table,box,wrap}=wordKit();
  return wrap(s.blocks.map(b=>b.t==='head'?docxHead(b.title,P):b.t==='p'?P(b.text,b.o):b.t==='table'?table(b.cols,b.rows,b.tot):box(b.pairs)).join(''));
}
async function specDocxBlob(s){if(!window.JSZip)throw new Error('Word export is still loading. Try again in a moment.');return docxBlob(specXml(s))}
async function saveSpecDocx(s){if(!s)return;try{const b=await specDocxBlob(s);await S.downloads.save({filename:fileSafe(s.file)+'.docx',data:b})}catch(e){if(e.code!=='declined')toast('Could not save: '+(e.message||e.code))}}
const hexRgb=h=>{h=String(h||'000000').replace('#','');return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255]};
async function specPdfBytes(s){
  await loadScript(LIB.pdflib);
  const {PDFDocument,StandardFonts,rgb}=window.PDFLib;
  const doc=await PDFDocument.create();doc.setTitle(`${s.title} ${s.no}`);doc.setAuthor(co().name);doc.setCreator('PCS BOM Register');
  const F=await doc.embedFont(StandardFonts.Helvetica),FB=await doc.embedFont(StandardFonts.HelveticaBold);
  const logo=await doc.embedPng(Uint8Array.from(atob(LOGO_B64),ch=>ch.charCodeAt(0)));
  const W=595.28,H=841.89,M=40,CW=W-2*M,BLUE=rgb(...hexRgb('1C5A9C')),GREY=rgb(...hexRgb('5A6773')),RULE=rgb(...hexRgb('D5DCE2'));
  const ok=new Map();const clean=(t,f)=>Array.from(String(t??'').replace(/☐/g,'[  ]').replace(/✓/g,'OK').replace(/→/g,'->').replace(/★/g,'*').replace(/[   ]/g,' ')).map(ch=>{const key=(f===FB?'b':'r')+ch;if(!ok.has(key)){try{f.widthOfTextAtSize(ch,10);ok.set(key,true)}catch(e){ok.set(key,false)}}return ok.get(key)?ch:'?'}).join('');
  const wrapT=(t,f,sz,mw)=>{const out=[];for(const para of clean(t,f).split('\n')){const lead=(para.match(/^ */)||[''])[0];const words=para.slice(lead.length).split(' ');let line=lead;for(const w of words){const tryL=line.trim()?line+(line.endsWith(' ')&&!line.trim()?'':' ')+w:lead+w;if(f.widthOfTextAtSize(tryL,sz)<=mw||!line.trim())line=tryL;else{out.push(line);line=lead+w}
        while(f.widthOfTextAtSize(line,sz)>mw&&line.length>1){let cut=line.length-1;while(cut>1&&f.widthOfTextAtSize(line.slice(0,cut),sz)>mw)cut--;out.push(line.slice(0,cut));line=line.slice(cut)}}out.push(line)}return out};
  let page,y;const pages=[];
  const newPage=()=>{page=doc.addPage([W,H]);pages.push(page);y=H-M};
  const need=h=>{if(y-h<M+24)newPage()};
  const text=(t,x,yy,f,sz,color,align='left',w=0)=>{const tt=clean(t,f);const tw=f.widthOfTextAtSize(tt,sz);const xx=align==='right'?x+w-tw:align==='center'?x+(w-tw)/2:x;page.drawText(tt,{x:xx,y:yy,size:sz,font:f,color:color||rgb(0,0,0)})};
  newPage();
  for(const b of s.blocks){
    if(b.t==='head'){
      const c=co();const lh=58;page.drawImage(logo,{x:M,y:y-lh,width:56,height:57});let ty=y-14;const tx=M+70;
      text(c.name,tx,ty,FB,18);ty-=12;if(c.tagline){text(c.tagline.toUpperCase(),tx,ty,FB,7.5);ty-=11}
      {const lg=[c.legal,c.abn&&'ABN '+c.abn].filter(Boolean).join('  ·  ');if(lg){text(lg,tx,ty,F,8.5,GREY);ty-=11}}if(coLine()){for(const l of wrapT(coLine(),F,8.5,CW-70)){text(l,tx,ty,F,8.5,GREY);ty-=11}}
      text(b.title,tx,ty-3,FB,14,BLUE);y=Math.min(y-lh,ty-10);page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.2,color:rgb(0,0,0)});y-=14;continue}
    if(b.t==='p'){const o=b.o||{};const sz=o.sz?o.sz/2:9.5;const f=o.b?FB:F;if(!b.text.trim()){y-=sz*0.7;continue}
      for(const l of wrapT(b.text,f,sz,CW)){need(sz+3);text(l,M,y-sz,f,sz,o.c?rgb(...hexRgb(o.c)):undefined,o.al==='right'?'right':'left',CW);y-=sz+3.5}continue}
    if(b.t==='box'){const cw=[0.19,0.31,0.19,0.31].map(x=>x*CW);
      for(let i=0;i<b.pairs.length;i+=2){const cells=[b.pairs[i],b.pairs[i+1]||['','']];const ls=cells.map(([l,v],j)=>[wrapT(l,FB,7.5,cw[j*2]-6),wrapT(v,F,9,cw[j*2+1]-6)]);
        const rh=Math.max(...ls.flatMap(x=>[x[0].length*10,x[1].length*11.5]))+6;need(rh);let x=M;
        ls.forEach(([la,va],j)=>{la.forEach((l,n)=>text(l,x+2,y-10-n*10,FB,7.5,GREY));x+=cw[j*2];va.forEach((l,n)=>text(l,x+2,y-10.5-n*11.5,F,9));x+=cw[j*2+1]});
        y-=rh;page.drawLine({start:{x:M,y:y+2},end:{x:W-M,y:y+2},thickness:0.5,color:rgb(...hexRgb('E6EAEE'))})}
      y-=4;continue}
    if(b.t==='table'){const tw=b.cols.reduce((a,c)=>a+c.w,0);const cw=b.cols.map(c=>c.w/tw*CW);const sz=8.5;
      const header=()=>{const hl=b.cols.map((c,j)=>wrapT(c.h,FB,sz,cw[j]-6));const hh=Math.max(...hl.map(x=>x.length))*10.5+6;need(hh+14);
        page.drawRectangle({x:M,y:y-hh,width:CW,height:hh,color:BLUE});let x=M;hl.forEach((ls,j)=>{ls.forEach((l,n)=>text(l,x+3,y-10.5-n*10.5,FB,sz,rgb(1,1,1),b.cols[j].r?'right':'left',cw[j]-6));x+=cw[j]});y-=hh};
      header();
      for(const r of b.rows){const cl=r.map((v,j)=>wrapT(v,F,sz,cw[j]-6));const rh=Math.max(1,...cl.map(x=>x.length))*10.5+5;
        if(y-rh<M+24){newPage();header()}let x=M;cl.forEach((ls,j)=>{ls.forEach((l,n)=>text(l,x+3,y-10.5-n*10.5,F,sz,undefined,b.cols[j].r?'right':'left',cw[j]-6));x+=cw[j]});
        y-=rh;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:0.5,color:RULE})}
      for(const [l,v,bold] of b.tot||[]){need(15);const f=bold?FB:F;text(l,M,y-11,f,sz+0.5,undefined,'right',CW-cw[cw.length-1]-6);text(v,M+CW-cw[cw.length-1],y-11,f,sz+0.5,undefined,'right',cw[cw.length-1]-3);y-=15}
      y-=6;continue}
  }
  pages.forEach((pg,i)=>{const t=clean(`${co().name}  ·  ${s.title} ${s.no}  ·  Page ${i+1} of ${pages.length}`,F);pg.drawText(t,{x:W-M-F.widthOfTextAtSize(t,7.5),y:22,size:7.5,font:F,color:GREY})});
  return doc.save();
}
async function specPdfBlob(s){return new Blob([await specPdfBytes(s)],{type:'application/pdf'})}
async function saveSpecPdf(s){try{const b=await specPdfBlob(s);await S.downloads.save({filename:fileSafe(s.file)+'.pdf',data:b})}catch(e){if(e.code!=='declined')toast('Could not make the PDF: '+(e.message||e.code))}}
function specHtml(s){
  const c=co();const e=esc;
  const body=s.blocks.map(b=>{
    if(b.t==='head')return `<header><img src="data:image/png;base64,${LOGO_B64}" alt=""><div><div class="nm">${e(c.name)}</div>${c.tagline?`<div class="tg">${e(c.tagline.toUpperCase())}</div>`:''}${[c.legal,c.abn&&'ABN '+c.abn].filter(Boolean).length?`<div class="mt">${e([c.legal,c.abn&&'ABN '+c.abn].filter(Boolean).join('  ·  '))}</div>`:''}${coLine()?`<div class="mt">${e(coLine())}</div>`:''}<h1>${e(b.title)}</h1></div></header>`;
    if(b.t==='p'){const o=b.o||{};return b.text.trim()?`<p style="${o.b?'font-weight:700;':''}${o.sz?'font-size:'+(o.sz/2)+'pt;':''}${o.c?'color:#'+o.c+';':''}${o.al?'text-align:'+o.al+';':''}">${e(b.text)}</p>`:'<div class="sp"></div>'}
    if(b.t==='box'){const rows=[];for(let i=0;i<b.pairs.length;i+=2){const a=b.pairs[i],z=b.pairs[i+1]||['',''];rows.push(`<tr><th>${e(a[0])}</th><td>${e(a[1])}</td><th>${e(z[0])}</th><td>${e(z[1])}</td></tr>`)}return `<table class="box">${rows.join('')}</table>`}
    const tw=b.cols.reduce((a,x)=>a+x.w,0);
    return `<table class="t"><colgroup>${b.cols.map(x=>`<col style="width:${(x.w/tw*100).toFixed(1)}%">`).join('')}</colgroup><thead><tr>${b.cols.map(x=>`<th class="${x.r?'r':''}">${e(x.h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r=>`<tr>${r.map((v,j)=>`<td class="${b.cols[j].r?'r':''}">${e(v)}</td>`).join('')}</tr>`).join('')}</tbody>${(b.tot||[]).length?`<tfoot>${b.tot.map(([l,v,bo])=>`<tr class="${bo?'b':''}"><td colspan="${b.cols.length-1}" class="r">${e(l)}</td><td class="r">${e(v)}</td></tr>`).join('')}</tfoot>`:''}</table>`}).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(s.title+' '+s.no)}</title><style>@page{size:A4;margin:14mm}body{font:9.5pt/1.35 Helvetica,Arial,sans-serif;color:#000;margin:0}header{display:flex;gap:14px;align-items:center;border-bottom:1.5px solid #000;padding-bottom:8px;margin-bottom:10px}header img{width:62px;height:63px}.nm{font-weight:700;font-size:18pt}.tg{font-weight:700;font-size:7.5pt}.mt{color:#5A6773;font-size:8.5pt}h1{color:#1C5A9C;font-size:14pt;margin:4px 0 0}p{margin:0 0 3px;white-space:pre-wrap}.sp{height:7px}table{width:100%;border-collapse:collapse;margin:4px 0 8px}.box th{text-align:left;color:#5A6773;font-size:7.5pt;width:19%;vertical-align:top;padding:3px}.box td{width:31%;padding:3px;vertical-align:top}.box tr{border-bottom:.5px solid #E6EAEE}.t thead th{background:#1C5A9C;color:#fff;font-size:8.5pt;text-align:left;padding:4px 3px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.t td{padding:3px;font-size:8.5pt;border-bottom:.5px solid #D5DCE2;vertical-align:top;white-space:pre-wrap}.r{text-align:right!important}.t tfoot td{border:0}.t tfoot tr.b td{font-weight:700}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>${body}</body></html>`;
}
function printSpec(s){
  const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';f.setAttribute('aria-hidden','true');
  f.srcdoc=specHtml(s);f.onload=()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Printing is not available here. Download the PDF and print it instead.')}setTimeout(()=>f.remove(),60000)};document.body.appendChild(f);
}
const blobB64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(b)});
const emailOk=()=>!!(window.PCS&&S.emailCfg&&S.emailCfg.configured);
const splitEmails=v=>String(v||'').split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean);
const validEmail=x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);

/** One dialog for every document: Word, PDF, print, email. after(kind) runs after a successful email. */
function docDialog(s,opts={}){
  if(!s){toast('Nothing to show yet.');return}
  let host=$('#doc-root');if(!host){host=document.createElement('div');host.id='doc-root';document.body.appendChild(host)}
  if(!approvedToSend(s)){const rec=s.kind==='quote'?S.deals.find(x=>x._id===s.ref.id):S.pos.find(x=>x._id===s.ref.id);
    host.innerHTML=`<div class="modal-back"><div class="modal"><div class="head-top"><div style="flex:1"><div class="pnum mono">${esc(s.label)} · ${esc(s.no)}</div><h2>Approval needed</h2></div><button type="button" class="btn small" id="dd-x">Close</button></div>${approvalBanner(s.kind,s.ref.id,approvalInfo(s.kind,rec))}<div class="note">It can be emailed, printed or downloaded once it is approved.</div></div></div>`;
    $('#dd-x').onclick=()=>{host.innerHTML=''};
    bindApprovals(host,()=>{host.innerHTML='';const ns=s.kind==='quote'?specQuote(S.deals.find(x=>x._id===s.ref.id)):specPo(S.pos.find(x=>x._id===s.ref.id));if(approvedToSend(ns))docDialog(ns,opts);else if(opts.after)opts.after()});return}
  const hosted=!!window.PCS;const mail=emailOk();const me=S.meEmail||'';
  const apr=s.kind==='quote'?S.deals.find(x=>x._id===s.ref?.id)?.quote?.approval:s.kind==='po'?S.pos.find(x=>x._id===s.ref?.id)?.approval:null;
  const dirCc=apr?.status==='approved'&&String(apr.decidedBy||'').includes('@')&&apr.decidedBy!==me?apr.decidedBy:'';
  if(dirCc&&!String(opts.cc||'').includes(dirCc))opts={...opts,cc:[opts.cc,dirCc].filter(Boolean).join(', ')};
  const ex=s.extras||[];
  host.innerHTML=`<div class="modal-back"><form class="modal wide" id="dd-form" novalidate>
    <div class="head-top"><div style="flex:1"><div class="pnum mono">${esc(s.label)} · ${esc(s.no)}${s.ref?.saleNo?' · '+esc(s.ref.saleNo):''}</div><h2>${esc(s.title)} ${esc(s.no)}</h2>${s.internal?'<div class="note">Workshop document: no prices.</div>':''}</div>
      <button type="button" class="btn small" id="dd-x">Close</button></div>
    <div class="row">${S.downloads?'<button type="button" class="btn" id="dd-pdf">Download PDF</button><button type="button" class="btn" id="dd-docx">Download Word</button>':''}${hosted?'<button type="button" class="btn" id="dd-print">Print</button>':''}</div>
    <section class="dsec"><h3>Email</h3>
    ${!hosted?'<div class="note">Emailing and printing are available on the hosted PCS system. Here you can download the PDF and attach it in your email.</div>':!mail?'<div class="warn">Email is not set up on the server yet (EMAIL_PROVIDER). Download the PDF instead, or ask the developer to finish the email setup.</div>':`
      <div class="note" style="margin-bottom:6px">From: <strong>${esc(S.emailCfg?.sendAsUser&&me?`${S.meName||me} <${me}>`:(S.emailCfg?.from||'PCS'))}</strong>${S.emailCfg?.sendAsUser?'':' · replies go to '+esc(me||'you')}</div>
      <div class="fgrid">
        <label class="lb full">To<input class="f" id="dd-to" value="${esc((s.email?.to||[]).join(', '))}" placeholder="name@company.com.au, …"></label>
        <label class="lb full">Cc<input class="f" id="dd-cc" value="${esc(opts.cc||'')}" placeholder="Optional">${dirCc?`<span class="note">${esc(apr.decidedByName||dirCc)} approved this and is always copied.</span>`:''}</label>
        <label class="lb full">Subject<input class="f" id="dd-sub" value="${esc(s.email?.subject||'')}"></label>
        <label class="lb full">Message<textarea class="f" id="dd-body" rows="8">${esc(s.email?.body||'')}</textarea></label>
      </div>
      <div class="note" style="margin:6px 0 4px">Attachments</div>
      <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" checked disabled> ${esc(fileSafe(s.file))}.pdf</label>
      <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="dd-wordatt"> Also attach the Word version</label>
      ${ex.map((x,i)=>`<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ddx="${i}" ${x.checked?'checked':''}> ${esc(x.label)}</label>`).join('')}
      ${S.emailCfg?.bccSender?`<div class="note" style="margin-top:6px">You get a copy of this email automatically.</div><input type="checkbox" id="dd-me" hidden>`:`<label class="note" style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="dd-me" ${me?'checked':''}> Send me a copy${me?' ('+esc(me)+')':''}</label>`}
      <div class="warn" id="dd-err" hidden></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit" id="dd-send">Send email</button></div>`}
    </section></form></div>`;
  const close=()=>{host.innerHTML=''};
  $('#dd-x').onclick=close;host.querySelector('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};
  const on=(id,fn)=>{const b=$('#'+id);if(b)b.onclick=fn};
  on('dd-pdf',()=>saveSpecPdf(s));on('dd-docx',()=>saveSpecDocx(s));on('dd-print',()=>printSpec(s));
  const f=$('#dd-form');f.onsubmit=async e=>{e.preventDefault();if(!mail)return;
    const err=$('#dd-err');const fail=m=>{err.hidden=false;err.textContent=m};err.hidden=true;
    const to=splitEmails($('#dd-to').value),cc=splitEmails($('#dd-cc').value);if($('#dd-me').checked&&me&&!to.includes(me)&&!cc.includes(me))cc.push(me);
    const bad=[...to,...cc].filter(x=>!validEmail(x));if(!to.length)return fail('Add at least one recipient.');if(bad.length)return fail('Check these addresses: '+bad.join(', '));
    const btn=$('#dd-send');btn.disabled=true;btn.textContent='Sending…';
    try{
      const atts=[{filename:fileSafe(s.file)+'.pdf',contentType:'application/pdf',base64:await blobB64(await specPdfBlob(s))}];
      if($('#dd-wordatt').checked)atts.push({filename:fileSafe(s.file)+'.docx',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',base64:await blobB64(await specDocxBlob(s))});
      host.querySelectorAll('[data-ddx]:checked').forEach(c=>{const x=ex[+c.dataset.ddx];atts.push({assetId:x.assetId,filename:x.name})});
      const r=await PCS.post('/api/email/send',{to,cc,subject:$('#dd-sub').value.trim(),text:$('#dd-body').value,attachments:atts,ref:{...s.ref,kind:s.kind}});
      const note=`${s.label} ${s.no} emailed to ${to.join(', ')}`;
      if(s.ref?.coll==='deals')await saveDeal(s.ref.id,{},note);
      else if(s.ref?.coll==='pos'){const po=S.pos.find(p=>p._id===s.ref.id);await savePo(s.ref.id,po&&po.status==='draft'?{status:'sent',sentAt:todayISO()}:{},note)}
      else if(s.ref?.coll==='rfqs')await saveRfq(s.ref.id,cur=>{const sp=(cur.suppliers||[]).find(x=>x.supplierId===s.ref.supplierId);if(sp){sp.sentAt=todayISO();sp.emailedTo=to.join(', ')}if(cur.status==='draft')cur.status='sent';return cur},note);
      close();toast(r.status==='logged'?'Recorded (test mode: the server is not sending real email)':`Emailed to ${to.join(', ')}`);if(opts.after)opts.after(r);
    }catch(x){btn.disabled=false;btn.textContent='Send email';fail('Not sent: '+(x.message||x.code||x))}};
}

/* ---------- RFQs: request for quotation → supplier quote → price check → PO ---------- */
const RSTAT=[['draft','Draft'],['sent','Sent'],['quoted','Quote received'],['ordered','PO raised'],['cancelled','Cancelled']];
const RST=Object.fromEntries(RSTAT);
const nextRfqNo=()=>nextNo(S.rfqs,'RFQ-','no');
async function saveRfq(id,fn,note,ok){
  const cur=structuredClone(S.rfqs.find(r=>r._id===id)||{});delete cur._id;
  const next=typeof fn==='function'?fn(cur):{...cur,...fn};
  next.history=[...(next.history||[]),...(note?[{at:new Date().toISOString(),by:S.me||null,note}]:[])].slice(-60);next.updatedAt=new Date().toISOString();
  const w=await write(()=>S.db.doc('rfqs/'+id).set(next),ok);
  if(w){const i=S.rfqs.findIndex(r=>r._id===id);const v={...next,_id:id};if(i<0)S.rfqs.push(v);else S.rfqs[i]=v}
  return w;
}
async function newRfq(init={}){
  if(!canW())return;const id=S.db.collection('rfqs').doc().id;const no=nextRfqNo();
  const sups=(init.supplierIds||[]).map(supplierId=>({supplierId}));
  if(await saveRfq(id,{no,status:'draft',date:todayISO(),replyBy:addDays(todayISO(),7),needBy:'',saleId:init.saleId||null,notes:'',lines:init.lines||[],suppliers:sups,createdAt:new Date().toISOString(),createdBy:S.me||null},`${no} created`,`${no} created`)){S.view='purchasing';S.ptab2='rfqs';setViewBtns();render();rfqModal(id)}
}
function rfqListHTML(q){
  const rs=S.rfqs.filter(r=>!q||[r.no,...(r.suppliers||[]).map(s=>supName(s.supplierId)),...(r.lines||[]).map(l=>pn(l.itemId)),S.deals.find(x=>x._id===r.saleId)?.no].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true}));
  return !rs.length?`<div class="empty"><strong>No requests for quotation yet</strong>Raise an RFQ to one or more suppliers, email it, then drop their quote PDF in to check prices and turn it into a purchase order.</div>`
    :`<div class="scroll"><table><thead><tr><th>RFQ</th><th>Status</th><th>Suppliers</th><th>Sale</th><th class="num">Lines</th><th>Quotes back</th><th>Reply by</th><th>Raised</th></tr></thead><tbody>${rs.map(r=>`<tr><td><button class="link mono" data-rfq="${esc(r._id)}">${esc(r.no)}</button></td><td><span class="tag rfq-${r.status}">${esc(RST[r.status]||r.status)}</span></td><td>${esc((r.suppliers||[]).map(s=>supName(s.supplierId)).join(', '))}</td><td class="mono note">${esc(S.deals.find(x=>x._id===r.saleId)?.no||'')}</td><td class="num">${(r.lines||[]).length}</td><td class="num">${(r.suppliers||[]).filter(s=>s.quote).length}/${(r.suppliers||[]).length}</td><td class="note">${r.replyBy?esc(fmtDate(r.replyBy)):''}</td><td class="note">${esc(fmtDate(r.date))}</td></tr>`).join('')}</tbody></table></div>`;
}
function rfqModal(rid){
  const r=S.rfqs.find(x=>x._id===rid);if(!r)return;const wr=canW();const editable=wr&&r.status==='draft';const root=$('#modal-root');
  const lrow=(l)=>{const p=l.itemId&&S.parts.get(l.itemId);return `<tr class="rlrow"><td><input class="f mono" data-rf="code" list="rfq-items" value="${esc(p?p.partNo:'')}" ${editable?'':'disabled'}></td><td class="note rdesc">${esc(p?.description||'')}</td><td><input class="f num" data-rf="qty" type="number" min="0" step="any" value="${esc(l.qty??1)}" ${editable?'':'disabled'}></td><td class="num note">${p?money(buyOf(l.itemId)):''}</td><td class="num note">${p?qfmt(onHand(l.itemId)):''}</td><td>${editable?'<button type="button" class="btn small danger" data-rlx aria-label="Remove line">×</button>':''}</td></tr>`};
  const supRows=(r.suppliers||[]).map((sp,i)=>{const s=S.suppliers.find(x=>x._id===sp.supplierId)||{};const qt=sp.quote;const po=sp.poId&&S.pos.find(p=>p._id===sp.poId);
    return `<tr><td><strong>${esc(s.name||'Supplier')}</strong><div class="note">${esc(s.email||'No email on file')}</div></td>
      <td class="note">${sp.sentAt?'Sent '+esc(fmtDate(sp.sentAt))+(sp.emailedTo?' to '+esc(sp.emailedTo):''):'Not sent'}</td>
      <td>${qt?`<span class="tag st-ok">Quote ${esc(qt.ref||'')}</span> <span class="note">${money(qt.total)} ex GST</span>${qt.assetId?` <a class="btn small" href="/_blob/${esc(qt.assetId)}" target="_blank" rel="noopener">Open PDF</a>`:''}`:'<span class="note">Waiting for quote</span>'}</td>
      <td style="white-space:nowrap">${po?`<button type="button" class="btn small" data-rpo="${esc(po._id)}">${esc(po.no)}</button>`:''}
        <button type="button" class="btn small" data-rsend="${i}">${sp.sentAt?'Resend':'Send RFQ'}</button>
        ${wr&&r.status!=='cancelled'?`<button type="button" class="btn small ${qt?'':'primary'}" data-rquote="${i}">${qt?'Review quote':'Record quote'}</button>`:''}
        ${editable?`<button type="button" class="btn small danger" data-rsx="${i}" aria-label="Remove supplier">×</button>`:''}</td></tr>`}).join('');
  const quoted=(r.suppliers||[]).filter(s=>s.quote);
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="rfqform" novalidate>
    <div class="head-top"><div style="flex:1"><div class="pnum mono">${esc(r.no)} · <span class="tag rfq-${r.status}">${esc(RST[r.status])}</span></div><h2>Request for quotation</h2><div class="note">Email the RFQ, drop each supplier's quote PDF in to compare against your buy prices, then raise the purchase order.</div></div>
      <button type="button" class="btn small" id="rfq-close">Close</button></div>
    <div class="fgrid4">
      <label class="lb">Date<input class="f" id="rf-date" type="date" value="${esc(r.date||'')}" ${editable?'':'disabled'}></label>
      <label class="lb">Quotes needed by<input class="f" id="rf-reply" type="date" value="${esc(r.replyBy||'')}" ${editable?'':'disabled'}></label>
      <label class="lb">Delivery needed by<input class="f" id="rf-need" type="date" value="${esc(r.needBy||'')}" ${editable?'':'disabled'}></label>
      <label class="lb">For sale (optional)<select class="f" id="rf-sale" ${editable?'':'disabled'}><option value="">Stock</option>${S.deals.filter(x=>!['closed','lost'].includes(x.stage)||x._id===r.saleId).sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true})).map(x=>`<option value="${esc(x._id)}" ${r.saleId===x._id?'selected':''}>${esc(x.no)} · ${esc(custName(x.customerId))}</option>`).join('')}</select></label>
    </div>
    <datalist id="rfq-items">${sortedParts().filter(([,p])=>p.level!=='Product').slice(0,2500).map(([id,p])=>`<option value="${esc(p.partNo)}">${esc(p.orderNo||'')} ${esc(p.description)}</option>`).join('')}</datalist>
    <div class="scroll"><table class="qt"><thead><tr><th>Item code</th><th>Description</th><th class="num">Qty</th><th class="num">Current buy</th><th class="num">On hand</th><th></th></tr></thead><tbody id="rf-lines">${(r.lines||[]).map(lrow).join('')}</tbody></table></div>
    ${editable?'<div class="row"><button type="button" class="btn small" id="rf-addl">+ Add item</button></div>':''}
    <label class="lb">Notes to suppliers<textarea class="f" id="rf-notes" rows="2" ${editable?'':'disabled'}>${esc(r.notes||'')}</textarea></label>
    <section class="dsec"><h3>Suppliers</h3>
      ${supRows?`<div class="scroll"><table><tbody>${supRows}</tbody></table></div>`:'<div class="note">Add the suppliers you want prices from.</div>'}
      ${editable?`<div class="row"><select class="f" id="rf-addsup" style="max-width:320px"><option value="">Add a supplier…</option>${S.suppliers.filter(s=>!(r.suppliers||[]).some(x=>x.supplierId===s._id)).sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${esc(s._id)}">${esc(s.name)}</option>`).join('')}</select></div>`:''}
      ${quoted.length>1?`<div class="note" style="margin-top:8px"><strong>Comparison:</strong> ${quoted.slice().sort((a,b)=>a.quote.total-b.quote.total).map((s,i)=>`${esc(supName(s.supplierId))} ${money(s.quote.total)}${i===0?' (lowest)':''}`).join(' · ')}</div>`:''}
    </section>
    <div class="row">${editable?'<button type="button" class="btn" data-ra="save">Save</button>':''}${wr&&!['ordered','cancelled'].includes(r.status)?'<button type="button" class="btn danger" data-ra="cancel">Cancel RFQ</button>':''}</div>
    <details><summary class="note" style="cursor:pointer">Activity (${(r.history||[]).length})</summary><div class="scroll" style="margin-top:6px"><table><tbody>${(r.history||[]).slice().reverse().map(h=>`<tr><td class="note" style="white-space:nowrap">${esc(when(h.at))}</td><td>${esc(h.note)}</td><td><span data-uid="${esc(h.by||'')}">…</span></td></tr>`).join('')}</tbody></table></div></details>
  </form></div>`;
  fillNames();
  const close=()=>{root.innerHTML='';render()};$('#rfq-close').onclick=close;$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))close()};$('#rfqform').onsubmit=e=>e.preventDefault();
  const tb=$('#rf-lines');
  const wire=()=>{tb.querySelectorAll('[data-rlx]').forEach(b=>b.onclick=()=>b.closest('tr').remove());tb.querySelectorAll('[data-rf="code"]').forEach(i=>i.onchange=()=>{const id=findByNo(i.value);i.closest('tr').querySelector('.rdesc').textContent=id?S.parts.get(id).description:'Not found'})};wire();
  const al=$('#rf-addl');if(al)al.onclick=()=>{const t=document.createElement('tbody');t.innerHTML=lrow({qty:1});tb.appendChild(t.firstElementChild);wire();tb.lastElementChild.querySelector('input').focus()};
  const read=()=>{const ls=[];const bad=[];for(const tr of tb.querySelectorAll('.rlrow')){const code=tr.querySelector('[data-rf="code"]').value.trim();if(!code)continue;const id=findByNo(code);if(!id){bad.push(code);continue}ls.push({itemId:id,qty:num(tr.querySelector('[data-rf="qty"]').value)||1})}
    return {bad,patch:{lines:ls,date:$('#rf-date').value,replyBy:$('#rf-reply').value,needBy:$('#rf-need').value,saleId:$('#rf-sale').value||null,notes:$('#rf-notes').value}}};
  const saveDraft=async()=>{if(!editable)return true;const x=read();if(x.bad.length){toast('Item code not found: '+x.bad.join(', '));return false}return saveRfq(rid,x.patch)};
  const as=$('#rf-addsup');if(as)as.onchange=async()=>{if(!as.value)return;if(!await saveDraft())return;await saveRfq(rid,cur=>{cur.suppliers=[...(cur.suppliers||[]),{supplierId:as.value}];return cur},`${supName(as.value)} added`);rfqModal(rid)};
  root.querySelectorAll('[data-rsx]').forEach(b=>b.onclick=async()=>{await saveDraft();await saveRfq(rid,cur=>{cur.suppliers.splice(+b.dataset.rsx,1);return cur},'Supplier removed');rfqModal(rid)});
  root.querySelectorAll('[data-rsend]').forEach(b=>b.onclick=async()=>{if(!await saveDraft())return;const cur=S.rfqs.find(x=>x._id===rid);if(!(cur.lines||[]).length){toast('Add at least one item first.');return}
    const sp=cur.suppliers[+b.dataset.rsend];docDialog(specRfq(cur,sp),{after:()=>rfqModal(rid)});
    if(!emailOk()&&wr){const mk=document.createElement('button');mk.type='button';mk.className='btn';mk.textContent='Mark as sent';mk.onclick=async()=>{await saveRfq(rid,c=>{const s2=c.suppliers[+b.dataset.rsend];s2.sentAt=todayISO();if(c.status==='draft')c.status='sent';return c},`${cur.no} sent to ${supName(sp.supplierId)}`);$('#doc-root').innerHTML='';rfqModal(rid)};$('#dd-form .row')?.appendChild(mk)}});
  root.querySelectorAll('[data-rquote]').forEach(b=>b.onclick=async()=>{if(!await saveDraft())return;quoteIntake(rid,+b.dataset.rquote)});
  root.querySelectorAll('[data-rpo]').forEach(b=>b.onclick=()=>poModal(b.dataset.rpo));
  root.querySelectorAll('[data-ra]').forEach(b=>b.onclick=async()=>{const a=b.dataset.ra;
    if(a==='save'){if(await saveDraft())toast('Saved');return rfqModal(rid)}
    if(a==='cancel'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to cancel';return}await saveRfq(rid,{status:'cancelled'},'Cancelled','RFQ cancelled');return close()}});
}

/* supplier quote PDF → text → line prices */
async function pdfLines(file){
  const pdfjs=await import(LIB.pdfjs);pdfjs.GlobalWorkerOptions.workerSrc=LIB.pdfjsWorker;
  const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;const out=[];
  for(let p=1;p<=Math.min(doc.numPages,15);p++){const pg=await doc.getPage(p);const tc=await pg.getTextContent();const rows=new Map();
    for(const it of tc.items){if(!it.str||!it.str.trim())continue;const yk=Math.round(it.transform[5]/3);if(!rows.has(yk))rows.set(yk,[]);rows.get(yk).push({x:it.transform[4],s:it.str})}
    [...rows.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,items])=>out.push(items.sort((a,b)=>a.x-b.x).map(i=>i.s.trim()).join('  ')))}
  return out;
}
const MONEY_RE=/\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\$?\s?\d+\.\d{2,4}|\$\s?\d+/g;
const moneyNums=s=>(String(s).match(MONEY_RE)||[]).map(x=>parseFloat(x.replace(/[$,\s]/g,''))).filter(n=>isFinite(n));
function matchQuote(textLines,r,sp){
  const norm=s=>String(s||'').toLowerCase();const full=textLines.join('\n');
  const refM=[...full.matchAll(/\b(?:quot(?:e|ation)|our\s+ref(?:erence)?)[ \t]*(?:no\.?|number|#|ref)?[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9\-\/]{2,})/gi)].find(m=>/\d/.test(m[1]));
  const leadM=full.match(/lead\s*time\s*[:\-]?\s*([^\n]{2,40})/i);
  const validM=full.match(/valid\s*(?:until|to|for)\s*[:\-]?\s*([^\n]{2,30})/i);
  const used=new Set();
  const lines2=(r.lines||[]).map((l,li)=>{const p=S.parts.get(l.itemId)||{};const si=supItem(sp.supplierId,l.itemId);
    const keys=[p.partNo,p.orderNo,si?.supCode,l.supCode].filter(k=>k&&String(k).length>=3).map(norm);
    let idx=textLines.findIndex((t,i)=>!used.has(i)&&keys.some(k=>norm(t).includes(k)));
    let how='code';
    if(idx<0){const words=norm(p.description).split(/[^a-z0-9]+/).filter(w=>w.length>2);let best=-1,score=0;textLines.forEach((t,i)=>{if(used.has(i))return;const tl=norm(t);const sc=words.filter(w=>tl.includes(w)).length/(words.length||1);if(sc>score&&moneyNums(t).length){score=sc;best=i}});if(score>=0.6){idx=best;how='description'}}
    let price=null,conf='none';
    if(idx>=0){used.add(idx);let nums=moneyNums(textLines[idx]);if(!nums.length&&textLines[idx+1])nums=moneyNums(textLines[idx+1]);
      const q=num(l.qty);let pair=null;for(const a of nums)for(const b of nums)if(a!==b&&q>0&&Math.abs(a*q-b)<0.05*Math.max(1,b))pair=[a,b];
      if(pair){price=pair[0];conf='high'}else if(nums.length){const cand=nums.filter(n=>!(q&&Math.abs(n-q)<1e-9));price=cand.length?Math.min(...cand):nums[0];conf=how==='code'?'medium':'low'}}
    return {li,itemId:l.itemId,qty:num(l.qty),price,conf,how:idx>=0?how:'',line:idx>=0?textLines[idx]:''}});
  return {ref:refM?refM[1]:'',lead:leadM?leadM[1].trim():'',valid:validM?validM[1].trim():'',lines:lines2,readable:textLines.length>0};
}
/** Products and parts whose cost changes if these buy prices change: [{id, before, after}] */
function costRollup(changes){
  const anc=new Set();const walk=id=>{for(const p of (S.usedBy.get(id)||[]))if(!anc.has(p)){anc.add(p);walk(p)}};for(const id of changes.keys())walk(id);
  costMemo=new Map();const before=new Map([...anc].map(a=>[a,unitCost(a)]));
  const saved=new Map();for(const [id,b] of changes){saved.set(id,S.price.get(id));S.price.set(id,{...(S.price.get(id)||{}),buy:b})}
  costMemo=new Map();const after=new Map([...anc].map(a=>[a,unitCost(a)]));
  for(const [id,v] of saved){if(v===undefined)S.price.delete(id);else S.price.set(id,v)}costMemo=new Map();
  const rank={Product:0,Part:1,Component:2,Item:3};
  return [...anc].map(a=>({id:a,before:before.get(a),after:after.get(a)})).filter(x=>Math.abs(x.after-x.before)>1e-6).sort((a,b)=>(rank[S.parts.get(a.id)?.level]??9)-(rank[S.parts.get(b.id)?.level]??9)||String(pn(a.id)).localeCompare(String(pn(b.id)),undefined,{numeric:true}));
}
function quoteIntake(rid,si){
  const r=S.rfqs.find(x=>x._id===rid);const sp=r.suppliers[si];const s=S.suppliers.find(x=>x._id===sp.supplierId)||{};const root=$('#modal-root');
  const prev=sp.quote||null;
  let st={assetId:prev?.assetId||null,fileName:prev?.fileName||'',ref:prev?.ref||'',lead:prev?.lead||'',valid:prev?.valid||'',date:prev?.date||todayISO(),
    lines:(r.lines||[]).map((l,li)=>{const pq=(prev?.lines||[]).find(x=>x.li===li);return {li,itemId:l.itemId,qty:num(l.qty),price:pq?pq.price:null,upd:pq?.upd,conf:pq?'saved':'none',how:'',line:''}}),parsed:false,msg:''};
  const draw=()=>{
    const ch=new Map();st.lines.forEach((l,i)=>{const cb=$('#qi-upd-'+i);if((cb?cb.checked:(l.upd??true))&&l.price!=null&&Math.abs(l.price-buyOf(l.itemId))>1e-9)ch.set(l.itemId,l.price)});
    const incs=[...ch].map(([id,pr])=>{const c0=buyOf(id);return c0>0?(pr-c0)/c0*100:0});const maxInc=Math.max(0,...incs);
    const psig=JSON.stringify([...ch].filter(([id,pr])=>pr>buyOf(id)).sort());const curQ=(S.rfqs.find(x=>x._id===rid)?.suppliers||[])[si]?.quote;
    const pinf=approvalInfo('price',null,{maxInc,sig:psig,pa:curQ?.priceApproval});st.pinf=pinf;st.psig=psig;
    const roll=costRollup(ch);const total=st.lines.reduce((a,l)=>a+num(l.price)*l.qty,0);
    root.innerHTML=`<div class="modal-back"><form class="modal wide" id="qiform" novalidate>
      <div class="head-top"><div style="flex:1"><div class="pnum mono">${esc(r.no)} · ${esc(s.name||'')}</div><h2>Supplier quote</h2><div class="note">Drop the supplier's quote PDF in. Prices are read from it and checked against your current buy prices; tick the ones to update in the BOM before raising the PO.</div></div><button type="button" class="btn small" id="qi-back">Back to RFQ</button></div>
      <label class="drop" id="qi-drop" for="qi-file" style="display:block;border:2px dashed var(--line,#ccd);border-radius:10px;padding:18px;text-align:center;cursor:pointer">
        ${st.fileName?`<strong>${esc(st.fileName)}</strong>${st.assetId?` · <a href="/_blob/${esc(st.assetId)}" target="_blank" rel="noopener">open</a>`:''}<div class="note">Drop another PDF to replace it</div>`:'<strong>Drop the quote PDF here</strong><div class="note">or click to choose a file</div>'}</label>
      <input type="file" id="qi-file" accept=".pdf,application/pdf" hidden>
      ${st.msg?`<div class="warn" ${/^Read/.test(st.msg)?'style="background:var(--ok-soft);color:var(--ok)"':''}>${esc(st.msg)}</div>`:''}
      <div class="fgrid4">
        <label class="lb">Their quote no.<input class="f mono" id="qi-ref" value="${esc(st.ref)}"></label>
        <label class="lb">Quote date<input class="f" id="qi-date" type="date" value="${esc(st.date)}"></label>
        <label class="lb">Valid until<input class="f" id="qi-valid" value="${esc(st.valid)}" placeholder="e.g. 30 days"></label>
        <label class="lb">Lead time<input class="f" id="qi-lead" value="${esc(st.lead)}" placeholder="e.g. 2 weeks"></label>
      </div>
      <div class="scroll"><table class="qt"><thead><tr><th>Item code</th><th>Description</th><th class="num">Qty</th><th class="num">Current buy</th><th class="num">Quoted unit price</th><th class="num">Change</th><th>Update BOM buy price</th><th>Read from PDF</th></tr></thead><tbody>
        ${st.lines.map((l,i)=>{const p=S.parts.get(l.itemId)||{};const cur=buyOf(l.itemId);const d=l.price!=null&&cur?((l.price-cur)/cur*100):null;const diff=l.price!=null&&Math.abs(l.price-cur)>1e-9;
          return `<tr><td class="mono">${esc(p.partNo||'')}</td><td class="note">${esc(p.description||'')}</td><td class="num">${qfmt(l.qty)}</td><td class="num">${cur?money(cur):'<span class="note">none</span>'}</td>
          <td><input class="f num" data-qp="${i}" type="number" min="0" step="0.0001" value="${l.price??''}" placeholder="Enter price"></td>
          <td class="num">${d==null?'':`<span class="${d>0?'neg':''}">${d>0?'+':''}${d.toFixed(1)}%</span>`}</td>
<td>${diff?`<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="qi-upd-${i}" ${(l.upd??true)?'checked':''}> ${money(cur)} → ${money(l.price)}</label>`:l.price!=null?'<span class="note">Same as now</span>':''}</td>
          <td class="note">${l.conf==='high'?'<span class="tag st-ok">Matched</span>':l.conf==='medium'?'<span class="tag st-low">Check</span>':l.conf==='low'?'<span class="tag st-low">Best guess</span>':l.conf==='saved'?'Saved':st.parsed?'<span class="tag st-out">Not found</span>':''}${l.line?`<div class="note" title="${esc(l.line)}" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.line)}</div>`:''}</td></tr>`}).join('')}
      </tbody><tfoot><tr><td colspan="4">Quote total ex GST</td><td class="num">${money(total)}</td><td colspan="3"></td></tr></tfoot></table></div>
      <section class="dsec"><h3>Cost roll-up</h3>${!ch.size?'<div class="note">No buy price changes ticked, so no product or part costs change.</div>':!roll.length?'<div class="note">These items are not used in any BOM, so only their own buy price changes.</div>':`
        <div class="note">${roll.length===1?'1 product or part changes':roll.length+' products and parts change'} cost when the ticked prices are applied.</div>
        <div class="scroll" style="max-height:260px"><table><thead><tr><th>Item</th><th>Description</th><th>Type</th><th class="num">Cost now</th><th class="num">New cost</th><th class="num">Change</th><th class="num">Sell</th><th class="num">Margin now → new</th></tr></thead><tbody>${roll.slice(0,200).map(x=>{const p=S.parts.get(x.id)||{};const sp2=sellOf(x.id);const mb=sp2?(sp2-x.before)/sp2*100:null,ma=sp2?(sp2-x.after)/sp2*100:null;return `<tr><td class="mono">${esc(p.partNo||x.id)}</td><td class="note">${esc(p.description||'')}</td><td class="note">${esc(p.level||'')}</td><td class="num">${money(x.before)}</td><td class="num">${money(x.after)}</td><td class="num"><span class="${x.after>x.before?'neg':''}">${x.after>x.before?'+':''}${money(x.after-x.before)}</span></td><td class="num">${sp2?money(sp2):'—'}</td><td class="num">${mb==null?'—':mfmt(mb)+' → '+mfmt(ma)}</td></tr>`}).join('')}</tbody></table></div>${roll.length>200?`<div class="note">Showing 200 of ${roll.length}.</div>`:''}`}</section>
      <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="qi-suplist" checked> Also update ${esc(s.name||'the supplier')}'s price list with these prices</label>
      ${['needed','pending','rejected','approved'].includes(pinf.state)?(pinf.state==='needed'?`<div class="warn">${amApprover()?`You are approving a ${esc(pinf.reason)} by applying these prices.`:`A ${esc(pinf.reason)} needs approval before the prices are applied.`}</div>`:approvalBanner('price',rid,{...pinf,state:pinf.state==='needed'?'needed':pinf.state},si).replace(/<button[^>]*data-apact="request"[^>]*>Request approval<\/button>/,'')):''}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-qa="save">Save quote</button>${['none','approved'].includes(pinf.state)||amApprover()?'<button type="button" class="btn primary" data-qa="po">Apply prices &amp; create PO</button>':pinf.state==='pending'?'<button type="button" class="btn" disabled>Waiting for approval</button>':'<button type="button" class="btn primary" data-qa="req">Save &amp; request approval</button>'}</div>
    </form></div>`;
    const keep=()=>{st.ref=$('#qi-ref').value.trim();st.date=$('#qi-date').value;st.valid=$('#qi-valid').value.trim();st.lead=$('#qi-lead').value.trim();st.lines.forEach((l,i)=>{const v=$(`[data-qp="${i}"]`).value;l.price=v===''?null:num(v);const cb=$('#qi-upd-'+i);if(cb)l.upd=cb.checked})};
    root.querySelectorAll('[data-qp]').forEach(inp=>inp.onchange=()=>{keep();draw()});
    root.querySelectorAll('[id^="qi-upd-"]').forEach(cb=>cb.onchange=()=>{keep();draw()});
    $('#qi-back').onclick=()=>rfqModal(rid);$('#qiform').onsubmit=e=>e.preventDefault();
    const handle=async file=>{if(!file)return;if(!/pdf$/i.test(file.type)&&!/\.pdf$/i.test(file.name)){toast('Drop a PDF file.');return}keep();
      st.fileName=file.name;st.msg='Reading the quote…';draw();
      try{if(S.assets){const res=await S.assets.upload(file,{type:'application/pdf'});st.assetId=res.id}}catch(e){st.msg='The PDF could not be stored ('+(e.message||e.code)+'). Prices can still be read.';}
      try{const tl=await pdfLines(file);const m=matchQuote(tl,r,sp);st.parsed=true;
        if(!m.readable){st.msg='No text could be read from this PDF (it may be a scan). Enter the prices from the quote below.'}
        else{const found=m.lines.filter(x=>x.price!=null).length;st.msg=`Read ${found} of ${m.lines.length} line price${m.lines.length>1?'s':''} from the PDF. Check each one against the quote before applying.`;
          st.ref=st.ref||m.ref;st.lead=st.lead||m.lead;st.valid=st.valid||m.valid;m.lines.forEach(x=>{const l=st.lines[x.li];if(x.price!=null){l.price=x.price;l.conf=x.conf;l.how=x.how;l.line=x.line;l.upd=true}else if(l.conf!=='saved'){l.conf='none'}})}}
      catch(e){st.msg='Could not read the PDF: '+(e.message||e)+'. Enter the prices below.'}
      draw()};
    $('#qi-file').onchange=e=>handle(e.target.files[0]);
    const dz=$('#qi-drop');dz.ondragover=e=>{e.preventDefault();dz.style.background='var(--accent-soft,#eef4fb)'};dz.ondragleave=()=>{dz.style.background=''};dz.ondrop=e=>{e.preventDefault();dz.style.background='';handle(e.dataTransfer.files[0])};
    bindApprovals(root,()=>quoteIntake(rid,si));
    root.querySelectorAll('[data-qa]').forEach(b=>b.onclick=async()=>{keep();const toPo=b.dataset.qa==='po';const toReq=b.dataset.qa==='req';
      if(toPo&&st.lines.some(l=>l.price==null)){toast('Enter a price for every line first.');return}
      b.disabled=true;S.busy=true;
      const quote={ref:st.ref,date:st.date,valid:st.valid,lead:st.lead,assetId:st.assetId,fileName:st.fileName,receivedAt:prev?.receivedAt||new Date().toISOString(),lines:st.lines.map(l=>({li:l.li,itemId:l.itemId,price:l.price,upd:l.upd??true})),priceSig:st.psig,pendingReason:st.pinf?.reason||'',priceApproval:(curApproval=>curApproval&&curApproval.sig===st.psig?curApproval:null)((S.rfqs.find(x=>x._id===rid)?.suppliers||[])[si]?.quote?.priceApproval),total:st.lines.reduce((a,l)=>a+num(l.price)*l.qty,0)};
      await saveRfq(rid,cur=>{cur.suppliers[si].quote=quote;if(['draft','sent'].includes(cur.status))cur.status='quoted';return cur},`Quote ${quote.ref||''} from ${s.name||'supplier'} recorded (${money(quote.total)} ex GST)`);
      if(toReq){S.busy=false;S.pending=false;await decideApproval('price',rid,'request','',si);return quoteIntake(rid,si)}
      if(!toPo){S.busy=false;S.pending=false;toast('Quote saved');return rfqModal(rid)}
      if(st.pinf&&st.pinf.state!=='none'&&st.pinf.state!=='approved'){if(!amApprover()){S.busy=false;toast('Needs approval first.');return quoteIntake(rid,si)}await decideApproval('price',rid,'approve','Approved when applying',si)}
      // apply ticked buy price changes, log them with the cost roll-up
      const changes=new Map(st.lines.filter(l=>l.upd!==false&&l.price!=null&&Math.abs(l.price-buyOf(l.itemId))>1e-9).map(l=>[l.itemId,l.price]));
      const roll=costRollup(changes);const src=`${r.no} · ${s.name||''} quote ${st.ref||''}`.trim();
      for(const [id,price] of changes){const mine=roll.filter(x=>{const st2=new Set();const w=k=>{for(const p of (S.usedBy.get(k)||[]))if(!st2.has(p)){st2.add(p);w(p)}};w(id);return st2.has(x.id)});
        await setPrice(id,{buy:price},{source:src,rollup:mine.slice(0,40).map(x=>({id:x.id,from:+x.before.toFixed(4),to:+x.after.toFixed(4)})),rollupCount:mine.length})}
      if($('#qi-suplist').checked&&s._id){const items={...(s.items||{})};for(const l of st.lines)if(l.price!=null)items[l.itemId]={...(items[l.itemId]||{}),price:l.price};const sd={...s,items};delete sd._id;await write(()=>S.db.doc('suppliers/'+s._id).set(sd))}
      const pid=S.db.collection('pos').doc().id;const no=nextPurNo();
      const poLines=st.lines.map(l=>{const sit=supItem(s._id,l.itemId);return {itemId:l.itemId,qty:l.qty,price:l.price,supCode:sit?.supCode||'',received:0}});
      const ok=await savePo(pid,{no,supplierId:s._id,status:'draft',date:todayISO(),expected:r.needBy||(s.lead?addDays(todayISO(),s.lead):''),ref:st.ref,rfqId:rid,saleId:r.saleId||null,lines:poLines,deliverTo:co().deliverTo||[co().legal||co().name,co().address].filter(Boolean).join(', '),notes:st.lead?'Lead time quoted: '+st.lead:'',createdAt:new Date().toISOString(),createdBy:S.me||null},`${no} created from ${r.no} (quote ${st.ref||'—'})`,`${no} created`);
      if(ok)await saveRfq(rid,cur=>{cur.suppliers[si].poId=pid;cur.status='ordered';return cur},`${no} raised for ${s.name||''}${changes.size?` · ${changes.size} buy price${changes.size>1?'s':''} updated, ${roll.length} cost${roll.length===1?'':'s'} rolled up`:''}`);
      S.busy=false;S.pending=false;costMemo=new Map();
      toast(`${changes.size?changes.size+' buy price'+(changes.size>1?'s':'')+' updated · ':''}${no} ready to send`);
      if(ok){S.view='purchasing';S.ptab2='open';setViewBtns();render();poModal(pid)}});
  };
  draw();
}

/* buy price log */
async function logPrice(entries){
  const mid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);const en={};for(const e of entries)en[mid()]=e;
  const ref=S.db.doc('pricelog/'+monthNow());
  return write(async()=>{try{await ref.update({entries:en})}catch(e){if(e&&e.code==='invalid_argument'){const g=await ref.get();if(g.exists)throw e;await ref.set({month:monthNow(),entries:en})}else throw e}});
}
function priceLogHTML(q,itemId){
  const rows=S.priceLog.filter(e=>(!itemId||e.itemId===itemId)&&(!q||[pn(e.itemId),S.parts.get(e.itemId)?.description,e.source].join(' ').toLowerCase().includes(q))).slice(0,itemId?50:500);
  if(!rows.length)return `<div class="${itemId?'note':'empty'}">${itemId?'No buy price changes logged yet.':'<strong>No buy price changes logged yet</strong>Changes made from supplier quotes, receipts and edits are logged here with the cost roll-up.'}</div>`;
  return `<div class="scroll"><table><thead><tr><th>When</th>${itemId?'':'<th>Item</th><th>Description</th>'}<th class="num">Buy price</th><th>Source</th><th>Cost roll-up</th><th>By</th></tr></thead><tbody>${rows.map(e=>`<tr><td class="note" style="white-space:nowrap">${esc(when(e.at))}</td>${itemId?'':`<td><button class="link mono" data-go="${esc(e.itemId)}">${esc(pn(e.itemId))}</button></td><td class="note desc">${esc(S.parts.get(e.itemId)?.description||'')}</td>`}<td class="num" style="white-space:nowrap">${e.from==null?'—':money(e.from)} → <strong>${money(e.to)}</strong>${e.from?` <span class="note ${e.to>e.from?'neg':''}">${e.to>e.from?'+':''}${((e.to-e.from)/e.from*100).toFixed(1)}%</span>`:''}</td><td class="note">${esc(e.source||'')}</td><td class="note">${e.rollupCount?`${e.rollupCount} cost${e.rollupCount>1?'s':''} changed${(e.rollup||[]).length?': '+esc(e.rollup.slice(0,3).map(x=>`${pn(x.id)} ${money(x.from)}→${money(x.to)}`).join(', '))+(e.rollupCount>3?'…':''):''}`:'—'}</td><td><span data-uid="${esc(e.by||'')}">…</span></td></tr>`).join('')}</tbody></table></div>`;
}

/* sent emails (hosted) */
function emailsHTML(kinds,q){
  if(!window.PCS)return '<div class="empty"><strong>Email log</strong>Emails are sent and logged on the hosted PCS system.</div>';
  const rows=S.emails.filter(e=>kinds.includes(e.ref?.kind)&&(!q||[e.ref?.no,e.ref?.saleNo,(e.to||[]).join(' '),e.subject].join(' ').toLowerCase().includes(q))).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  if(!rows.length)return '<div class="empty"><strong>Nothing emailed yet</strong>Use Email on a document; every email sent is listed here.</div>';
  const KL={quote:'Quote',invoice:'Invoice',docket:'Delivery docket',packing:'Packing list',build:'Build sheet',rfq:'RFQ',po:'Purchase order'};
  return `<div class="scroll"><table><thead><tr><th>Sent</th><th>Document</th><th>Sale</th><th>To</th><th>Subject</th><th>Attachments</th><th>Status</th><th>By</th></tr></thead><tbody>${rows.map(e=>`<tr><td class="note" style="white-space:nowrap">${esc(when(e.at))}</td><td>${esc(KL[e.ref?.kind]||e.ref?.kind||'')} <span class="mono">${esc(e.ref?.no||'')}</span></td><td class="mono note">${esc(e.ref?.saleNo||'')}</td><td class="note">${esc((e.to||[]).join(', '))}${(e.cc||[]).length?'<br>cc '+esc(e.cc.join(', ')):''}</td><td class="note">${esc(e.subject||'')}</td><td class="note">${esc((e.attachments||[]).join(', '))}</td><td>${e.status==='sent'?'<span class="tag st-ok">Sent</span>':e.status==='logged'?'<span class="tag st-low">Test mode</span>':`<span class="tag st-out" title="${esc(e.error||'')}">Failed</span>`}</td><td><span data-uid="${esc(e.by||'')}">…</span></td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- needs attention: stuck sales, approvals, owners ---------- */
// Rules live in lib/rules.mjs (shared with the server's hourly check and 7am summary email), loaded as window.PCSRules.
const RL=()=>window.PCSRules;
const alertCfg=()=>RL()?RL().settingsOf(S.alertSettings):null;
const todayLocal=()=>RL()?RL().localDate(alertCfg().timezone):todayISO();
let _attn=null;
function attnAll(){
  if(!RL())return [];
  if(_attn)return _attn;
  const t=todayLocal();
  _attn=RL().activeItems(RL().attention({deals:S.deals,orders:S.orders,rfqs:S.rfqs,pos:S.pos,customers:S.customers,suppliers:S.suppliers,stock:[...S.stock],parts:{get:id=>S.parts.get(id)},alertSettings:S.alertSettings,today:t}),S.alertStates,t);
  return _attn;
}
const attnMine=()=>window.PCS?attnAll().filter(i=>RL().itemFor(i,S.meEmail,S.role,S.alertSettings)):attnAll();
const amApprover=()=>!window.PCS||(RL()&&RL().isApprover(S.meEmail,S.role,S.alertSettings));
const titleOf=e=>(alertCfg()?.titles||{})[String(e||'').toLowerCase()]||'';
const whoName=e=>{if(!e)return '—';const u=(S.users||[]).find(x=>x.email===e);const t=titleOf(e);return (u?.name||e)+(t?` (${t})`:'')};
const SEV={approval:['Approval','rfq-sent'],overdue:['Overdue','st-out'],due:['Due','st-low']};
function updateBell(){
  _attn=null;const b=$('#btn-alerts');if(!b)return;const n=attnMine().length;const ap=attnMine().filter(i=>i.severity==='approval').length;
  b.innerHTML=`🔔<span class="sr">Needs attention</span>${n?`<span class="badge ${ap?'ap':''}">${n}</span>`:''}`;b.title=n?`${n} item${n>1?'s':''} need attention${ap?` (${ap} approval${ap>1?'s':''})`:''}`:'Nothing needs attention';
}
function dealFlag(id){const it=attnAll().find(i=>i.coll==='deals'&&i.id===id);return it?`<div class="note"><span class="tag ${SEV[it.severity][1]}">⚑ ${esc(it.label)}</span></div>`:''}
function attnListHTML(items){
  if(!items.length)return '<div class="empty"><strong>Nothing needs attention</strong>Sales, approvals, builds, RFQs and supplier deliveries are all on track.</div>';
  return `<div class="scroll"><table><thead><tr><th></th><th>What</th><th>Record</th><th>Detail</th><th>Owner</th><th class="num">Days</th><th></th></tr></thead><tbody>${items.map(i=>`<tr>
    <td><span class="tag ${SEV[i.severity][1]}">${esc(SEV[i.severity][0])}</span>${i.escalate?' <span class="tag st-out" title="Past the escalation limit">Escalated</span>':''}</td>
    <td><strong>${esc(i.label)}</strong></td><td><button class="link mono" data-aopen="${esc(i.key)}">${esc(i.title)}</button></td><td class="note">${esc(i.detail)}</td>
    <td class="note">${esc(i.severity==='approval'?'Director':whoName(i.owner))}</td><td class="num">${i.age||''}</td>
    <td style="white-space:nowrap">${canW()?`<select class="f" data-asnooze="${esc(i.key)}" style="width:auto;display:inline-block;padding:2px 6px" aria-label="Snooze"><option value="">Snooze…</option><option value="1">1 day</option><option value="3">3 days</option><option value="7">1 week</option><option value="14">2 weeks</option></select> <button class="btn small" data-adismiss="${esc(i.key)}">Dismiss</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function openItem(it){
  if(!it)return;
  if(S.view==='tasks'&&['deals','pos','rfqs'].includes(it.coll)){({deals:dealModal,pos:poModal,rfqs:rfqModal})[it.coll](it.id);return}
  if(it.coll==='deals'){S.view='sales';setViewBtns();render();dealModal(it.id)}
  else if(it.coll==='pos'){S.view='purchasing';setViewBtns();render();poModal(it.id)}
  else if(it.coll==='rfqs'){S.view='purchasing';S.ptab2='rfqs';setViewBtns();render();rfqModal(it.id)}
  else if(it.coll==='orders'){S.view='orders';S.sel=it.id;setViewBtns();render()}
  else if(it.coll==='items'){select(it.id,'stock')}
}
async function setAlertState(it,patch){
  const id=RL().stateId(it.key);const doc={key:it.key,rule:it.rule,title:it.title,label:it.label,...patch,by:S.meEmail||S.me||null,at:new Date().toISOString()};
  const ok=await write(()=>S.db.doc('alertstate/'+id).set(doc));
  if(ok){const i=S.alertStates.findIndex(x=>x.key===it.key);const v={...doc,_id:id};if(i<0)S.alertStates.push(v);else S.alertStates[i]=v;_attn=null}
  return ok;
}
function bindAttn(root,after){
  const find=k=>attnAll().find(i=>i.key===k);
  root.querySelectorAll('[data-aopen]').forEach(b=>b.onclick=()=>{const it=find(b.dataset.aopen);$('#modal-root').innerHTML='';openItem(it)});
  root.querySelectorAll('[data-asnooze]').forEach(sl=>sl.onchange=async()=>{if(!sl.value)return;const it=find(sl.dataset.asnooze);const until=addDays(todayLocal(),+sl.value);if(await setAlertState(it,{snoozedUntil:until}))toast(`Snoozed until ${fmtDate(until)}`);after()});
  root.querySelectorAll('[data-adismiss]').forEach(b=>b.onclick=()=>{const it=find(b.dataset.adismiss);const td=b.parentElement;
    td.innerHTML=`<input class="f" placeholder="Reason (e.g. customer on leave)" style="width:200px;display:inline-block"> <button class="btn small primary">Dismiss</button>`;const inp=td.querySelector('input');inp.focus();
    td.querySelector('button').onclick=async()=>{if(await setAlertState(it,{dismissed:true,reason:inp.value.trim()}))toast('Dismissed until something changes');after()}});
}
function attnModal(tab){
  const root=$('#modal-root');const hosted=!!window.PCS;tab=tab||(hosted?'mine':'all');
  const items=tab==='mine'?attnMine():attnAll();const hidden=S.alertStates.filter(s=>s.dismissed||(s.snoozedUntil&&s.snoozedUntil>todayLocal()));
  root.innerHTML=`<div class="modal-back"><div class="modal wide"><div class="head-top"><div style="flex:1"><div class="pnum">Stuck sales, approvals, overdue builds, RFQs and deliveries</div><h2>Needs attention</h2></div>
    <div class="row">${!hosted||S.role==='admin'?'<button class="btn small" id="at-set">Alert &amp; approval settings</button>':''}<button class="btn small" id="at-c">Close</button></div></div>
    ${hosted?`<div class="chips"><button class="chip" data-atab="mine" aria-pressed="${tab==='mine'}">For me (${attnMine().length})</button><button class="chip" data-atab="all" aria-pressed="${tab==='all'}">Everyone (${attnAll().length})</button></div>`:''}
    ${attnListHTML(items)}
    ${hidden.length?`<details><summary class="note" style="cursor:pointer">Snoozed or dismissed (${hidden.length})</summary><div class="scroll"><table><tbody>${hidden.map(s=>`<tr><td>${esc(s.label||'')}</td><td class="mono">${esc(s.title||'')}</td><td class="note">${s.dismissed?'Dismissed'+(s.reason?': '+esc(s.reason):''):'Snoozed until '+esc(fmtDate(s.snoozedUntil))}</td><td>${canW()?`<button class="btn small" data-aun="${esc(s._id)}">Restore</button>`:''}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    ${hosted?`<div class="note">A summary of your items is emailed each morning at ${alertCfg()?.digestHour??7}:00; approval requests and escalations are emailed straight away.</div>`:''}
  </div></div>`;
  $('#at-c').onclick=()=>{root.innerHTML='';render()};$('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back')){root.innerHTML='';render()}};
  root.querySelectorAll('[data-atab]').forEach(b=>b.onclick=()=>attnModal(b.dataset.atab));
  const st=$('#at-set');if(st)st.onclick=alertSettingsModal;
  root.querySelectorAll('[data-aun]').forEach(b=>b.onclick=async()=>{if(await write(()=>S.db.doc('alertstate/'+b.dataset.aun).delete())){S.alertStates=S.alertStates.filter(x=>x._id!==b.dataset.aun);_attn=null}attnModal(tab)});
  bindAttn(root,()=>{updateBell();attnModal(tab)});
}
function alertSettingsModal(){
  const c=alertCfg();const root=$('#modal-root');const ed=!window.PCS||S.role==='admin';const dis=ed?'':'disabled';
  root.innerHTML=`<div class="modal-back"><form class="modal wide" id="asform" novalidate><h2>Alert &amp; approval settings</h2>
    <section class="dsec"><h3>When something counts as stuck</h3><div class="scroll"><table><thead><tr><th>On</th><th>Rule</th><th class="num">Limit</th><th></th></tr></thead><tbody>
      ${RL().RULE_DEFS.map(r=>`<tr><td><input type="checkbox" data-ron="${r.id}" ${c.rules[r.id]?.on!==false?'checked':''} ${dis}></td><td>${esc(r.label)}</td><td><input class="f num" data-rdays="${r.id}" type="number" min="0" value="${esc(c.rules[r.id]?.days??r.days)}" style="width:80px" ${dis}></td><td class="note">${esc(r.unit)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="dsec"><h3>Approvals</h3><div class="fgrid4">
      <label class="lb">Quotes over ($ ex GST)<input class="f num" id="as-qv" type="number" min="0" value="${esc(c.approvals.quoteValue)}" ${dis}></label>
      <label class="lb">Quote discount over (%)<input class="f num" id="as-qd" type="number" min="0" value="${esc(c.approvals.quoteDiscount)}" ${dis}></label>
      <label class="lb">Purchase orders over ($ ex GST)<input class="f num" id="as-pv" type="number" min="0" value="${esc(c.approvals.poValue)}" ${dis}></label>
      <label class="lb">Buy price increase over (%)<input class="f num" id="as-pi" type="number" min="0" value="${esc(c.approvals.priceIncrease)}" ${dis}></label>
      <div class="lb full">Directors (approve)<div class="note" style="padding-top:4px">${c.directors?esc(c.directors.split(/[,;\s]+/).filter(Boolean).map(whoName).join(', ')):'None yet: admins approve until a Director is named.'}${window.PCS?' Set titles in Company → Team access.':''}</div></div>
    </div><div class="note"><strong>Admin</strong> and <strong>Manager</strong> raise and send (same permissions, just a title). Anything over the limits needs a <strong>Director</strong>, who is copied on the email when it goes out. Set a limit to 0 to switch it off. Editing an approved quote or PO needs approval again.</div></section>
    <section class="dsec"><h3>Escalation &amp; daily summary</h3><div class="fgrid4">
      <label class="lb full">Managers (get escalations and unassigned items)<input class="f" id="as-mg" value="${esc(c.managers)}" ${dis}></label>
      <label class="lb">Escalate after (days past limit)<input class="f num" id="as-esc" type="number" min="0" value="${esc(c.escalateDays)}" ${dis}></label>
      <label class="lb">Daily summary at (hour, 0–23)<input class="f num" id="as-hr" type="number" min="0" max="23" value="${esc(c.digestHour)}" ${dis}></label>
      <label class="lb">Time zone<input class="f" id="as-tz" value="${esc(c.timezone)}" ${dis}></label>
    </div></section>
    <div class="warn" id="as-err" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="as-c">Back</button>${ed?'<button class="btn primary" type="submit">Save settings</button>':''}</div></form></div>`;
  $('#as-c').onclick=()=>attnModal();
  $('#asform').onsubmit=async e=>{e.preventDefault();
    const rules={};RL().RULE_DEFS.forEach(r=>{rules[r.id]={on:$(`[data-ron="${r.id}"]`).checked,days:num($(`[data-rdays="${r.id}"]`).value)}});
    const tz=$('#as-tz').value.trim()||'Australia/Perth';try{new Intl.DateTimeFormat('en',{timeZone:tz})}catch(x){const er=$('#as-err');er.hidden=false;er.textContent='Unknown time zone. Use a name like Australia/Perth.';return}
    const doc={rules,approvals:{quoteValue:num($('#as-qv').value),quoteDiscount:num($('#as-qd').value),poValue:num($('#as-pv').value),priceIncrease:num($('#as-pi').value)},titles:c.titles||{},directors:c.directors,managers:$('#as-mg').value.trim(),escalateDays:num($('#as-esc').value),digestHour:Math.min(23,Math.max(0,Math.round(num($('#as-hr').value)))),timezone:tz,updatedAt:new Date().toISOString(),updatedBy:S.meEmail||S.me||null};
    if(await write(()=>S.db.doc('settings/alerts').set(doc),'Alert settings saved')){S.alertSettings=doc;_attn=null;attnModal()}};
}

/* approvals on quotes, purchase orders and supplier price increases */
function approvalInfo(kind,rec,extra){
  if(!RL())return {state:'none'};const s=S.alertSettings;
  if(kind==='quote'){const q=rec.quote;const reason=RL().quoteNeedsApproval(q,s);return {reason,state:RL().approvalState(q?.approval,RL().quoteSig(q),reason),a:q?.approval}}
  if(kind==='po'){const reason=RL().poNeedsApproval(rec,s);return {reason,state:RL().approvalState(rec.approval,RL().poSig(rec),reason),a:rec.approval}}
  if(kind==='price'){const {maxInc,sig,pa}=extra;const lim=num(alertCfg().approvals.priceIncrease);const reason=lim>0&&maxInc>lim?`buy price increase of ${maxInc.toFixed(1)}% (limit ${lim}%)`:null;return {reason,state:RL().approvalState(pa,sig,reason),a:pa}}
  return {state:'none'};
}
async function decideApproval(kind,id,action,comment,si){
  const by=S.meEmail||S.me||null,byName=S.meName||'';const now=new Date().toISOString();
  const verb=action==='request'?'requested':action==='approve'?'approved':'rejected';
  const make=(prev,reason,sig)=>action==='request'?{status:'pending',requestedBy:by,requestedByName:byName,requestedAt:now,reason,sig}:{...(prev||{}),status:action==='approve'?'approved':'rejected',decidedBy:by,decidedByName:byName,decidedAt:now,comment:comment||'',sig,reason:prev?.reason||reason};
  let ok=false;
  if(kind==='quote'){const d=S.deals.find(x=>x._id===id);const q={...d.quote};const inf=approvalInfo('quote',d);q.approval=make(q.approval,inf.reason,RL().quoteSig(q));ok=await saveDeal(id,{quote:q},`Quote ${q.no} approval ${verb}${comment?': '+comment:''}`)}
  else if(kind==='po'){const po=S.pos.find(x=>x._id===id);const inf=approvalInfo('po',po);ok=await savePo(id,{approval:make(po.approval,inf.reason,RL().poSig(po))},`PO approval ${verb}${comment?': '+comment:''}`)}
  else if(kind==='price'){ok=await saveRfq(id,cur=>{const qt=cur.suppliers[si].quote;qt.priceApproval=make(qt.priceApproval,qt.pendingReason||'',qt.priceSig);return cur},`Price increase approval ${verb}${comment?': '+comment:''}`)}
  if(ok&&window.PCS)PCS.post('/api/notify',{type:action==='request'?'approval_request':'approval_decision',kind,coll:kind==='quote'?'deals':kind==='po'?'pos':'rfqs',id,si}).catch(()=>{});
  if(ok)toast(action==='request'?'Approval requested':action==='approve'?'Approved':'Rejected');
  _attn=null;return ok;
}
function approvalBanner(kind,id,inf,si){
  if(!inf||inf.state==='none')return '';
  const a=inf.a||{};const ap=amApprover()&&canW();const k=`data-apk="${kind}" data-apid="${esc(id)}" ${si!=null?`data-apsi="${si}"`:''}`;
  const style={approved:'background:var(--ok-soft);color:var(--ok)',pending:'background:var(--accent-soft);color:var(--accent)',rejected:'',needed:''}[inf.state];
  const what=kind==='quote'?'This quote':kind==='po'?'This purchase order':'This price change';
  const txt={needed:`${what} needs a Director's approval before it goes out: ${esc(inf.reason)}.`,pending:`Waiting for a Director to approve (${esc(inf.reason)}), requested by ${esc(a.requestedByName||whoName(a.requestedBy))} ${esc(when(a.requestedAt))}.`,rejected:`Rejected by ${esc(a.decidedByName||whoName(a.decidedBy))}${a.comment?': “'+esc(a.comment)+'”':''}. Change it and request approval again.`,approved:`Approved by ${esc(a.decidedByName||whoName(a.decidedBy))} ${esc(when(a.decidedAt))}${a.comment?': “'+esc(a.comment)+'”':''}.${kind!=='price'&&window.PCS?' They are copied when it is emailed.':''}`}[inf.state];
  const btns=inf.state==='approved'?'':`<span style="flex:1"></span>${(inf.state==='needed'||inf.state==='rejected')&&canW()?`<button type="button" class="btn small primary" ${k} data-apact="request">Ask a Director to approve</button>`:''}${(inf.state==='pending'||inf.state==='needed')&&ap?`<input class="f" data-apcomment placeholder="Comment (optional)" style="max-width:220px"><button type="button" class="btn small primary" ${k} data-apact="approve">Approve</button><button type="button" class="btn small danger" ${k} data-apact="reject">Reject</button>`:''}`;
  return `<div class="warn row" style="${style};align-items:center;gap:8px;flex-wrap:wrap">${txt}${btns}</div>`;
}
function bindApprovals(root,after){
  root.querySelectorAll('[data-apact]').forEach(b=>b.onclick=async()=>{const c=b.parentElement.querySelector('[data-apcomment]');
    if(b.dataset.apact==='reject'&&c&&!c.value.trim()){c.focus();c.placeholder='Say why it is rejected';toast('Add a comment saying why.');return}
    b.disabled=true;await decideApproval(b.dataset.apk,b.dataset.apid,b.dataset.apact,c?.value.trim(),b.dataset.apsi!=null?+b.dataset.apsi:undefined);after()});
}
/** Blocks sending/printing a quote or PO until it is approved. Returns true if it may go out. */
function approvedToSend(s){
  if(!s||!RL())return true;
  if(s.kind==='quote'){const d=S.deals.find(x=>x._id===s.ref?.id);return !d||['none','approved'].includes(approvalInfo('quote',d).state)}
  if(s.kind==='po'){const po=S.pos.find(x=>x._id===s.ref?.id);return !po||['none','approved'].includes(approvalInfo('po',po).state)}
  return true;
}

/* ---------- Tasks dashboard: everything the rules say needs doing, as prompts ---------- */
const TASK_ACT={approval:'Review & approve',lead_idle:'Prepare the quote',quote_followup:'Follow up the customer',quote_expiring:'Extend or re-quote',po_not_started:'Start production',build_overdue:'Check the build',ready_not_dispatched:'Dispatch it',not_invoiced:'Raise the invoice',payment_overdue:'Chase payment',rfq_no_reply:'Chase the supplier',po_late:'Chase the delivery',next_action:'Do the next action',stock_low:'Order more',sale_short:'Order for the sale'};
function taskAction(i){
  if(i.severity==='approval')return amApprover()?'Review & approve':'Waiting on a Director';
  if(i.rule==='next_action'){const d=S.deals.find(x=>x._id===i.id);return d?.nextAction||TASK_ACT.next_action}
  return TASK_ACT[i.rule]||'Open';
}
async function loadBackup(){if(!window.PCS)return;try{S.backup=await PCS.api('/api/admin/backups')}catch(e){}}
async function backupsModal(){
  const root=$('#modal-root');root.innerHTML='<div class="modal-back"><div class="modal wide"><h2>Backups</h2><div class="note">Loading…</div></div></div>';
  await loadBackup();const b=S.backup||{runs:[],targets:[]};const T={s3:'S3 storage',onedrive:'Microsoft 365 OneDrive / SharePoint',email:'Email copy'};
  root.innerHTML=`<div class="modal-back"><div class="modal wide"><div class="head-top"><div style="flex:1"><div class="pnum">Every Sunday night, plus on demand</div><h2>Off-site backups</h2></div><button class="btn small" id="bk-c">Close</button></div>
    ${!b.targets.length?'<div class="warn">No backup destination is set up yet. The developer adds S3, OneDrive/SharePoint or an email address in the server settings (see the deployment guide).</div>':`<div class="note">Backing up to: <strong>${esc(b.targets.map(t=>T[t]||t).join(', '))}</strong>. Each backup holds every record; uploaded drawings, receipts and dockets are copied once to the files folder.</div>`}
    ${b.overdue?`<div class="warn">${b.lastOk?'The last successful backup was '+esc(when(b.lastOk))+', more than a week ago.':'No successful backup yet.'}</div>`:`<div class="warn" style="background:var(--ok-soft);color:var(--ok)">Last successful backup ${esc(when(b.lastOk))}.</div>`}
    <div class="row"><button class="btn primary" id="bk-now" ${b.targets.length?'':'disabled'}>Back up now</button></div>
    <div class="scroll"><table><thead><tr><th>When</th><th>Type</th><th>Result</th><th class="num">Records</th><th class="num">New files</th><th class="num">Size</th><th>Where</th></tr></thead><tbody>${(b.runs||[]).map(r=>`<tr><td class="note" style="white-space:nowrap">${esc(when(r.at))}</td><td>${esc(r.trigger)}</td><td>${r.ok?'<span class="tag st-ok">OK</span>':`<span class="tag st-out" title="${esc(r.error||'')}">Failed</span> <span class="note">${esc((r.error||'').slice(0,80))}</span>`}</td><td class="num">${r.documents??''}</td><td class="num">${r.files_new??''}</td><td class="num">${r.bytes?(r.bytes/1024).toFixed(0)+' KB':''}</td><td class="note">${esc(r.location||'')}</td></tr>`).join('')||'<tr><td colspan="7" class="note">No backups yet.</td></tr>'}</tbody></table></div>
    <div class="note">To restore, the developer runs <span class="mono">npm run db:import -- &lt;backup zip&gt; --files &lt;files folder&gt;</span> against a fresh database.</div></div></div>`;
  $('#bk-c').onclick=()=>{root.innerHTML='';render()};
  const bn=$('#bk-now');bn.onclick=async()=>{bn.disabled=true;bn.textContent='Backing up…';try{const r=await PCS.post('/api/admin/backups',{});toast(r.ok?`Backed up ${r.documents} records${r.filesNew?` and ${r.filesNew} files`:''}`:'Backup failed: '+r.error)}catch(e){toast(e.message)}backupsModal()};
}
function tasksHTML(){
  const hosted=!!window.PCS;const mine=S.ttab!=='all'&&hosted;const items=mine?attnMine():attnAll();
  const ap=items.filter(i=>i.severity==='approval'),od=items.filter(i=>i.severity==='overdue'),du=items.filter(i=>i.severity==='due');
  const h=new Date().getHours();const hi=h<12?'Good morning':h<17?'Good afternoon':'Good evening';const first=(S.meName||'').split(' ')[0];
  const open=S.deals.filter(d=>!['closed','lost'].includes(d.stage));
  const card=i=>`<div class="tk ${i.severity}"><div class="tk-main"><div class="tk-what"><span class="tag ${SEV[i.severity][1]}">${esc(i.label)}</span>${i.escalate?' <span class="tag st-out">Escalated</span>':''}<span class="note">${i.age?` · ${i.age} day${i.age===1?'':'s'}`:''}</span></div>
      <div class="tk-title">${esc(i.title)}</div><div class="note">${esc(i.detail)}${i.severity!=='approval'&&hosted&&!mine?' · '+esc(whoName(i.owner)):''}</div></div>
    <div class="tk-acts"><button class="btn primary" data-aopen="${esc(i.key)}">${esc(taskAction(i))} →</button>${canW()?`<select class="f" data-asnooze="${esc(i.key)}" aria-label="Snooze"><option value="">Snooze…</option><option value="1">Tomorrow</option><option value="3">3 days</option><option value="7">1 week</option></select><button class="btn small" data-adismiss="${esc(i.key)}">Dismiss</button>`:''}</div></div>`;
  const group=(t,list,empty)=>list.length?`<h2 class="h2 tk-h">${t} <span class="note">${list.length}</span></h2>${list.map(card).join('')}`:'';
  return `<section class="panel"><div class="head"><div class="head-top"><div style="flex:1"><div class="pnum">${esc(fmtDate(todayISO()))} · from the rules that keep the pipeline moving</div><h1>${hi}${first?', '+esc(first):''}</h1>
      <div class="tk-lede">${items.length?`<strong>${items.length} task${items.length>1?'s':''}</strong> need${items.length>1?'':'s'} ${mine?'you':'attention'}${ap.length?` · ${ap.length} approval${ap.length>1?'s':''} waiting`:''}${od.length?` · ${od.length} overdue`:''}.`:'Nothing needs you right now. The pipeline is moving.'}</div></div>
      <div class="row">${!hosted||S.role==='admin'?'<button class="btn" id="tk-set">Rules &amp; limits</button>':''}</div></div>
    <div class="tiles">
      <button class="tile dtile" data-tkgo="approval"><div class="l">Approvals</div><div class="big">${ap.length}</div><div class="note">${amApprover()?'waiting for you':'waiting on a Director'}</div></button>
      <button class="tile dtile" data-tkgo="overdue"><div class="l">Overdue</div><div class="big ${od.length?'neg':''}">${od.length}</div><div class="note">past the limit</div></button>
      <button class="tile dtile" data-tkgo="due"><div class="l">Coming up</div><div class="big">${du.length}</div><div class="note">due soon</div></button>
      <button class="tile dtile" data-tkgo="sales"><div class="l">Open pipeline</div><div class="big">${money(open.reduce((a,d)=>a+dealValue(d),0))}</div><div class="note">${open.length} sale${open.length===1?'':'s'}</div></button></div>
    ${hosted?`<div class="chips"><button class="chip" data-ttab="mine" aria-pressed="${mine}">My tasks (${attnMine().length})</button><button class="chip" data-ttab="all" aria-pressed="${!mine}">Everyone (${attnAll().length})</button></div>`:''}</div>
    <div class="tabbody">${S.backup?.overdue&&(S.role==='admin')?`<div class="tk overdue"><div class="tk-main"><div class="tk-what"><span class="tag st-out">Backup</span></div><div class="tk-title">${S.backup.lastOk?'No backup for over a week':'The system has never been backed up'}</div><div class="note">${S.backup.targets?.length?'The weekly backup has not completed. Check the backup history and run one now.':'No off-site backup destination is set up yet.'}</div></div><div class="tk-acts"><button class="btn primary" id="tk-bk">Check backups →</button></div></div>`:''}${items.length?`<div id="tk-approval">${group('Approvals',ap)}</div><div id="tk-overdue">${group('Overdue',od)}</div><div id="tk-due">${group('Coming up',du)}</div>`:'<div class="empty"><strong>All clear ✓</strong>New tasks appear here as soon as a sale, build, supplier or payment goes past its limit.</div>'}
    <div class="tk-stages">${STAGES.filter(([k])=>!['closed','lost'].includes(k)).map(([k,l])=>{const n=open.filter(d=>d.stage===k).length;const st=new Set(attnAll().filter(i=>i.coll==='deals'&&S.deals.find(d=>d._id===i.id)?.stage===k).map(i=>i.id)).size;return `<button class="tk-stage" data-tkgo="sales"><span class="note">${esc(l)}</span><strong>${n}</strong>${st?`<span class="tag st-out">${st} stuck</span>`:'<span class="note">on track</span>'}</button>`}).join('')}</div></div></section>`;
}
function bindTasks(){
  const m=$('#main');bindCommon(m);
  bindAttn(m,()=>{updateBell();renderMain()});
  m.querySelectorAll('[data-ttab]').forEach(b=>b.onclick=()=>{S.ttab=b.dataset.ttab;renderMain()});
  m.querySelectorAll('[data-tkgo]').forEach(b=>b.onclick=()=>{const g=b.dataset.tkgo;if(g==='sales'){S.view='sales';setViewBtns();render();return}const el=$('#tk-'+g);if(el&&el.firstElementChild)el.scrollIntoView({behavior:'smooth',block:'start'})});
  const st=$('#tk-set');if(st)st.onclick=alertSettingsModal;
  const tb=$('#tk-bk');if(tb)tb.onclick=backupsModal;
}

const quoteDocx=d=>saveSpecDocx(specQuote(d)),poDocx=po=>saveSpecDocx(specPo(po)),docketDocx=(d,x)=>saveSpecDocx(specDocket(d,x)),
  buildSheetDocx=o=>saveSpecDocx(specBuild(o)),packingDocx=(d,x)=>saveSpecDocx(specPacking(d,x)),invoiceDocx=(d,v)=>saveSpecDocx(specInvoice(d,v));

/* ---------- boot ---------- */
setViewBtns();render();
(async()=>{
  if(!window.claude||!claude.use){$('#status').textContent='Open this page on claude.ai to load the shared BOM.';return}
  const [db,assets,downloads,user]=await Promise.all(['db','assets','downloads','user'].map(n=>claude.use(n).catch(()=>null)));
  S.db=db;S.assets=assets;S.downloads=downloads;S.user=user;
  if(!db){$('#status').textContent='Sign in to claude.ai to see the shared BOM.';Object.keys(S.loaded).forEach(k=>S.loaded[k]=true);render();return}
  if(user){try{S.me=await user.id();S.canWrite=await user.can('data.write')}catch(e){}}
  if(window.PCS){try{const m=await PCS.me();S.role=m.role;S.meEmail=m.email||'';S.meName=m.name||'';S.emailCfg=m.email_cfg||null}catch(e){}
    PCS.api('/api/users/directory').then(r=>{S.users=r.users||[]}).catch(()=>{});
    if(S.role==='admin')loadBackup().then(()=>schedule());
    {const op=new URLSearchParams(location.search).get('open');if(op){history.replaceState(null,'',location.pathname);const [c,id]=op.split(':');let n=0;const t=setInterval(()=>{const ready={deals:S.deals,pos:S.pos,rfqs:S.rfqs,orders:S.orders}[c]?.some(x=>x._id===id);if(ready||++n>40){clearInterval(t);if(ready)openItem({coll:c,id})}},250)}}
    loadXeroStatus().then(()=>{schedule();const xp=new URLSearchParams(location.search).get('xero');if(xp){history.replaceState(null,'',location.pathname);xeroHub(xp)}})}
  if(S.canWrite===false){$('#btn-new').hidden=true}
  try{const s=localStorage.getItem('bom.sel');if(s)S.selected=s;const pp=localStorage.getItem('bom.prod');if(pp)S.product=pp}catch(e){}
  const status=()=>{$('#status').textContent=allLoaded()?`${S.products.size} product types · ${S.parts.size.toLocaleString()} items · live`:'Loading…'};
  const pickDefaults=()=>{if(!S.products.has(S.product))S.product=[...S.products.keys()][0]||null};
  db.collection('catalog').onSnapshot(snap=>{
    const items={},products={};snap.docs.slice().sort((a,b)=>num(a.data().seq)-num(b.data().seq)).forEach(d=>{const x=d.data();Object.assign(items,x.items||{});Object.assign(products,x.products||{})});
    S.catalog={items,products};S.loaded.catalog=true;rebuild();pickDefaults();status();schedule();
  },()=>{$('#status').textContent='Connection lost. Reload to reconnect.'});
  db.collection('parts').onSnapshot(snap=>{
    S.over.parts=new Map(snap.docs.map(d=>[d.id,d.data()]));S.loaded.parts=true;rebuild();status();schedule();
  },()=>{$('#status').textContent='Connection lost. Reload to reconnect.'});
  db.collection('products').onSnapshot(snap=>{
    S.over.products=new Map(snap.docs.map(d=>[d.id,d.data()]));S.loaded.products=true;rebuild();pickDefaults();status();schedule();
  },()=>{});
  db.doc('settings/company').onSnapshot(d=>{S.company=d.exists?d.data():null;schedule()},()=>{});
  db.collection('expenses').onSnapshot(snap=>{S.expenses=snap.docs.map(d=>({...d.data(),_id:d.id}));schedule()},()=>{});
  db.collection('suppliers').onSnapshot(snap=>{S.suppliers=snap.docs.map(d=>({...d.data(),_id:d.id}));schedule()},()=>{});
  db.collection('pos').onSnapshot(snap=>{S.pos=snap.docs.map(d=>({...d.data(),_id:d.id}));_oo=null;schedule()},()=>{});
  db.collection('deals').onSnapshot(snap=>{S.deals=snap.docs.map(d=>({...d.data(),_id:d.id}));schedule()},()=>{});
  db.collection('customers').onSnapshot(snap=>{S.customers=snap.docs.map(d=>({...d.data(),_id:d.id}));schedule()},()=>{});
  db.collection('orders').onSnapshot(snap=>{S.orders=snap.docs.map(d=>({...d.data(),_id:d.id}));schedule()},()=>{});
  db.collection('pricing').onSnapshot(snap=>{const m=new Map();snap.docs.forEach(d=>{for(const [k,v] of Object.entries(d.data().items||{}))m.set(k,v)});S.price=m;S.loaded.pricing=true;costMemo=new Map();schedule()},()=>{});
  db.collection('stock').onSnapshot(snap=>{const m=new Map();snap.docs.forEach(d=>{for(const [k,v] of Object.entries(d.data().items||{}))m.set(k,v)});S.stock=m;S.loaded.stock=true;schedule()},()=>{});
  const since=new Date();since.setMonth(since.getMonth()-11);const mfrom=since.toISOString().slice(0,7);
  db.collection('moves').where('month','>=',mfrom).onSnapshot(snap=>{const a=[];snap.docs.forEach(d=>{for(const [k,v] of Object.entries(d.data().entries||{}))a.push({...v,_id:k})});a.sort((x,y)=>x.at<y.at?1:-1);S.moves=a;schedule()},()=>{});
  db.doc('settings/alerts').onSnapshot(d=>{S.alertSettings=d.exists?d.data():null;_attn=null;schedule()},()=>{});
  db.collection('alertstate').onSnapshot(snap=>{S.alertStates=snap.docs.map(d=>({...d.data(),_id:d.id}));_attn=null;schedule()},()=>{});
  db.collection('rfqs').onSnapshot(snap=>{S.rfqs=snap.docs.map(d=>({...d.data(),_id:d.id}));schedule()},()=>{});
  db.collection('pricelog').where('month','>=',mfrom).onSnapshot(snap=>{const a=[];snap.docs.forEach(d=>{for(const [k,v] of Object.entries(d.data().entries||{}))a.push({...v,_id:k})});a.sort((x,y)=>x.at<y.at?1:-1);S.priceLog=a;schedule()},()=>{});
  if(window.PCS)db.collection('emails').onSnapshot(snap=>{S.emails=snap.docs.map(d=>({...d.data(),_id:d.id}));schedule()},()=>{});
  db.collection('documents').onSnapshot(snap=>{S.docs=snap.docs.map(d=>({...d.data(),_id:d.id}));S.loaded.docs=true;schedule()},()=>{});
})();
})();
