/* Siyasat free full-text reader: Europe PMC open-access XML, then Unpaywall, else DOI link. Browser-only, no keys. */
const READER=(()=>{
const EMAIL='jpmcarnaje@gmail.com', cache={};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function get(u,type){const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),20000);
  try{const r=await fetch(u,{signal:ctl.signal});if(r.status===404)return null;if(!r.ok)throw new Error('HTTP '+r.status);return type==='xml'?await r.text():await r.json();}finally{clearTimeout(t);}}
const clean=d=>String(d||'').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'');
/* turn inline JATS into safe HTML */
function inline(n){let h='';n.childNodes.forEach(c=>{if(c.nodeType===3){h+=E(c.nodeValue);return;}if(c.nodeType!==1)return;const t=c.localName;
  if(t==='italic')h+='<i>'+inline(c)+'</i>';else if(t==='bold')h+='<b>'+inline(c)+'</b>';else if(t==='sup')h+='<sup>'+inline(c)+'</sup>';else if(t==='sub')h+='<sub>'+inline(c)+'</sub>';
  else if(t==='xref'&&c.getAttribute('ref-type')==='bibr')h+='<span class="rd-x">'+inline(c)+'</span>';
  else if(['fig','table-wrap','disp-formula','graphic','inline-graphic','alternatives','tex-math','mml:math','math'].includes(t)){if(t==='disp-formula'||t==='tex-math')h+=' [equation] ';}
  else h+=inline(c);});return h;}
function block(n,depth){let h='';n.childNodes.forEach(c=>{if(c.nodeType!==1)return;const t=c.localName;
  if(t==='p')h+='<p>'+inline(c)+'</p>';
  else if(t==='sec'){const ti=[...c.children].find(x=>x.localName==='title');const lv=Math.min(6,depth+3);h+=(ti?`<h${lv}>${inline(ti)}</h${lv}>`:'')+block(c,depth+1);}
  else if(t==='list'){const tag=c.getAttribute('list-type')==='order'?'ol':'ul';h+=`<${tag}>`+[...c.children].filter(x=>x.localName==='list-item').map(li=>'<li>'+block(li,depth)+'</li>').join('')+`</${tag}>`;}
  else if(t==='fig'||t==='table-wrap'){const lab=[...c.children].find(x=>x.localName==='label'),cap=[...c.children].find(x=>x.localName==='caption');
    h+=`<figure class="rd-fig"><figcaption><b>${lab?inline(lab):(t==='fig'?'Figure':'Table')}.</b> ${cap?inline(cap):''} <span class="meta">(${t==='fig'?'image':'table'} not shown here; see the original)</span></figcaption></figure>`;}
  else if(t==='disp-quote')h+='<blockquote>'+block(c,depth)+'</blockquote>';
  else if(t==='boxed-text'||t==='statement'||t==='def-list')h+=block(c,depth);
});return h;}
function parse(xml){const d=new DOMParser().parseFromString(xml,'application/xml');if(d.getElementsByTagName('parsererror').length)throw new Error('bad XML');
  const q=s=>d.getElementsByTagName(s)[0];const title=q('article-title');const secs=[];
  const abs=[...d.getElementsByTagName('abstract')].filter(a=>!a.getAttribute('abstract-type')||a.getAttribute('abstract-type')==='structured');
  if(abs[0])secs.push({title:'Abstract',html:block(abs[0],1)||'<p>'+inline(abs[0])+'</p>'});
  const body=q('body');
  if(body){let loose='';[...body.children].forEach(c=>{if(c.localName==='sec'){if(loose){secs.push({title:secs.length>1?'More text':'Main text',html:loose});loose='';}
      const ti=[...c.children].find(x=>x.localName==='title');secs.push({title:ti?ti.textContent.trim():'Section',html:block(c,1)});}
    else loose+=block({childNodes:[c]},1);});if(loose)secs.push({title:'Main text',html:loose});}
  const lic=q('license');return {title:title?inline(title):'',secs,hasBody:!!(body&&body.textContent.trim().length>200),license:lic?lic.textContent.trim().slice(0,240):''};}
async function lookup(doiIn){const doi=clean(doiIn);if(cache[doi])return cache[doi];const out={doi,errors:[]};
  try{const s=await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent('DOI:"'+doi+'"')}&resultType=core&format=json`);
    const hit=s&&s.resultList&&s.resultList.result.find(x=>(x.doi||'').toLowerCase()===doi.toLowerCase())||(s&&s.resultList&&s.resultList.result[0]);
    if(hit){out.meta={title:hit.title,journal:hit.journalInfo&&hit.journalInfo.journal&&hit.journalInfo.journal.title,year:hit.pubYear,authors:hit.authorString};
      if(hit.pmcid&&(hit.isOpenAccess==='Y'||hit.inEPMC==='Y')){const xml=await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/${hit.pmcid}/fullTextXML`,'xml');
        if(xml){const p=parse(xml);if(p.hasBody){Object.assign(out,{kind:'pmc',pmcid:hit.pmcid,...p});return cache[doi]=out;}}}}}
  catch(e){out.errors.push('Europe PMC');}
  try{const u=await get(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${EMAIL}`);
    if(u){out.meta=out.meta||{title:u.title,journal:u.journal_name,year:u.year};const b=u.best_oa_location;
      if(b&&(b.url_for_pdf||b.url)){Object.assign(out,{kind:'oa',pdf:b.url_for_pdf,url:b.url_for_landing_page||b.url,version:b.version,host:b.host_type,license:b.license});return cache[doi]=out;}}}
  catch(e){out.errors.push('Unpaywall');}
  out.kind='none';if(!out.errors.length)cache[doi]=out;return out;}
const VER={publishedVersion:'the published version',acceptedVersion:"the author's accepted manuscript (same content, before the journal's final formatting)",submittedVersion:'a preprint (an earlier draft, before peer review, so it may differ from the final paper)'};
const SPIN=`<div class="rd-tip" role="note"><b>💡 Read past the abstract.</b> Abstracts sometimes sound more certain than the actual findings ("spin"). Before you cite a claim, jump to <b>Results</b> and <b>Discussion</b> and check the paper really says it, including any limits the authors mention.</div>`;
function jumpKey(t){return /result|finding/i.test(t)?1:/discussion|conclusion|limitation/i.test(t)?2:0;}
function render(o){const doiLink=`<a href="https://doi.org/${E(o.doi)}" target="_blank" rel="noopener">doi.org/${E(o.doi)}<span class="sr"> (opens in new tab)</span></a>`;
  const m=o.meta||{};const head=`<p class="meta">${m.authors?E(m.authors)+' · ':''}${m.journal?E(m.journal)+' · ':''}${m.year?E(m.year)+' · ':''}${doiLink}</p>`;
  if(o.kind==='pmc'){const jl=o.secs.map((s,i)=>`<li><a href="#" data-jump="rd-s${i}" class="${['','key-r','key-d'][jumpKey(s.title)]}">${E(s.title)}</a></li>`).join('');
    return `<h1 class="rd-title">${o.title||E(m.title||'Full text')}</h1>${head}<p class="rd-src"><span class="badge verified">Free full text</span> From Europe PMC (${E(o.pmcid)}). <a href="https://europepmc.org/article/PMC/${E(o.pmcid)}" target="_blank" rel="noopener">Open on Europe PMC<span class="sr"> (opens in new tab)</span></a></p>${SPIN}
    <div class="rd-wrap"><nav class="rd-jump" aria-label="Jump to section"><b>Jump to</b><ol>${jl}</ol></nav><article class="rd-body">${o.secs.map((s,i)=>`<section id="rd-s${i}" tabindex="-1"><h2>${E(s.title)}</h2>${s.html}</section>`).join('')}
    ${o.license?`<p class="meta rd-lic">License: ${E(o.license)}</p>`:''}<p class="meta">Figures, tables and equations aren't shown here. Open the original to see them.</p></article></div>`;}
  if(o.kind==='oa'){const link=o.pdf||o.url;
    return `<h1 class="rd-title">${E(m.title||'Free version found')}</h1>${head}<p class="rd-src"><span class="badge verified">Free version found</span> Found through Unpaywall. This copy is ${E(VER[o.version]||'a free copy')}${o.host==='repository'?', kept in a university or public repository':''}.</p>${SPIN}
    <p><a class="rd-open" href="${E(link)}" target="_blank" rel="noopener">📄 Open free ${o.pdf?'PDF':'version'}<span class="sr"> (opens in new tab)</span></a> ${o.pdf&&o.url&&o.url!==o.pdf?`<a href="${E(o.url)}" target="_blank" rel="noopener" style="margin-left:10px">Article page<span class="sr"> (opens in new tab)</span></a>`:''}</p>
    ${o.pdf?`<details class="rd-prev" open><summary>Preview here</summary><p class="meta">Some websites don't allow previews inside other sites. If the box below is blank or shows an error, use the <b>Open free PDF</b> button above.</p><iframe src="${E(o.pdf)}" title="PDF preview" loading="lazy" referrerpolicy="no-referrer"></iframe></details>`:''}`;}
  const err=o.errors.length?`<p class="meta">Note: we couldn't reach ${E(o.errors.join(' and '))} just now (check your internet). <button type="button" class="ghost" data-retry>Try again</button></p>`:'';
  return `<h1 class="rd-title">${E(m.title||'No free full text found')}</h1>${head}<div class="rd-none"><p><b>No free full text found — this paper may be paywalled.</b></p><p>You can still open the publisher's page. Your university library (or the author, by email) can often give you a copy.</p><p><a class="rd-open" href="https://doi.org/${E(o.doi)}" target="_blank" rel="noopener">Go to the paper's page<span class="sr"> (opens in new tab)</span></a></p>${err}</div>${SPIN}`;}
function bind(root){root.querySelectorAll('[data-jump]').forEach(a=>a.onclick=e=>{e.preventDefault();const s=document.getElementById(a.dataset.jump);if(s){s.scrollIntoView({behavior:'smooth',block:'start'});s.focus({preventScroll:true});}});}
async function show(root,doi){root.innerHTML=`<p class="rd-load" role="status"><span class="spin" aria-hidden="true"></span> Looking for a free full text… (this can take a few seconds)</p>`;
  let o;try{o=await lookup(doi);}catch(e){o={doi:clean(doi),kind:'none',errors:['the search services']};}
  if(!root.isConnected)return;root.innerHTML=render(o);bind(root);const r=root.querySelector('[data-retry]');if(r)r.onclick=()=>{delete cache[clean(doi)];show(root,doi);};}
const btn=(doi,label)=>doi?`<a class="readbtn" href="#/read/${encodeURIComponent(clean(doi))}">📖 ${label||'Read full text'}</a>`:'';
return {lookup,parse,show,btn,clean};})();
if(typeof module!=='undefined')module.exports=READER;
