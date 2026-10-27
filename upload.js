/* Siyasat one-step "Upload & check": read any file, detect what it is, run every check that fits, save as ONE check. */
const UP=(()=>{
const LIB={pdf:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/',docx:'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js'};
const STEPS=['Reading file','Finding citations','Checking sources','Done'];
let S=null; // current job state
function zone(compact){return `<section class="card updrop-card${compact?' compact':''}" aria-labelledby="upH"><div class="updrop" id="updrop" tabindex="0" role="button" aria-describedby="upHelp">
  <div class="up-ico" aria-hidden="true">⬆️</div><h2 id="upH">Upload &amp; check</h2>
  <p id="upHelp">Drop your paper or reference file here, or <b>tap to choose a file</b>. Siyasat reads it and checks everything automatically.</p>
  <p class="meta">PDF · Word (.docx) · .txt · .ris · .bib — stays on your device, nothing is uploaded to a server</p>
  <input type="file" id="upFile" class="sr" tabindex="-1" aria-hidden="true" accept=".pdf,.docx,.txt,.md,.ris,.bib,.bibtex,.nbib,.enw,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
  </div><div id="upErr" aria-live="polite"></div></section>`;}
function bind(){const z=$('updrop');if(!z)return;const f=$('upFile');z.onclick=()=>f.click();z.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f.click();}};
  f.onchange=()=>{const x=f.files[0];f.value='';if(x)start(x);};
  ['dragenter','dragover'].forEach(t=>z.addEventListener(t,e=>{e.preventDefault();z.classList.add('over');}));['dragleave','drop'].forEach(t=>z.addEventListener(t,e=>{e.preventDefault();z.classList.remove('over');}));
  z.addEventListener('drop',e=>{const x=e.dataTransfer.files[0];if(x)start(x);});}
const err=(t)=>{const e=new Error(t);e.friendly=true;return e;};
async function readFile(file){const n=file.name.toLowerCase();
  if(!file.size)throw err('This file is empty. Choose the file that has your paper or reference list in it.');
  if(n.endsWith('.pdf')||file.type==='application/pdf'){const r=await pdfText(file);if(r.text.replace(/\s/g,'').length<40)throw err("This PDF has no readable text. It's probably scanned (a picture of the pages). Open it, copy the text, and paste it into New check → Draft check instead.");return {text:r.text,kind:'pdf',pages:r.pages,links:r.links};}
  if(n.endsWith('.docx')){if(!window.mammoth)await new Promise((ok,no)=>{const s=document.createElement('script');s.src=LIB.docx;s.onload=ok;s.onerror=()=>no(err("We couldn't load the Word reader. Check your internet and try again."));document.head.appendChild(s);});
    const r=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return {text:r.value,kind:'docx'};}
  if(n.endsWith('.doc'))throw err('Old Word files (.doc) can\'t be read here. In Word, choose File → Save As → .docx, then upload that.');
  if(/\.(txt|md|ris|bib|bibtex|nbib|enw)$/.test(n)||/^text\//.test(file.type)){return {text:await file.text(),kind:n.split('.').pop()};}
  throw err(`Siyasat can't read "${file.name}". Please upload a PDF, Word (.docx), .txt, .ris or .bib file.`);}
function detect(name,text){const t=SIY.cleanText(text);if(!t.trim())throw err('We couldn\'t find any text in this file.');
  if(/^\s*TY\s{1,2}-/m.test(t)||/@\w+\s*\{/.test(t)){const es=parseFile(name.replace(/\.(pdf|docx)$/i,'.txt'),t);if(es.length)return {mode:'refs',entries:es};}
  const a=DRAFT.analyze(t,'');if(a.claims.length)return {mode:'combo',text:t,a};
  const sp=DRAFT.splitDraft(t);const es=SIY.splitEntries(sp.refs||t).filter(e=>/(19|20)\d{2}|10\.\d{4}/.test(e));
  if(es.length)return {mode:'refs',entries:es};
  throw err("We couldn't find any citations like (Author, 2020) or a reference list in this file. Check that it's the right file, or paste the text into New check.");}
function page(){if(!S)return `<h1 class="page-h">Upload &amp; check</h1>${zone()}`;
  return `<h1 class="page-h">Checking ${esc(S.file)}</h1><p class="lead">${S.mode==='combo'?'Your draft: we\'re checking every citation and every reference.':S.mode==='refs'?'Your reference list: we\'re checking every reference.':'Getting started…'}</p>
  <section class="card up-prog"><ol class="up-steps">${STEPS.map((s,i)=>`<li class="${i<S.step?'done':i===S.step?'on':''}"><span aria-hidden="true">${i<S.step?'✓':i+1}</span>${s}</li>`).join('')}</ol>
  <div class="pbar" id="upbar" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${S.pct}"><i id="upfill" style="width:${S.pct}%"></i></div>
  <p class="meta" id="upText" aria-live="polite">${esc(S.text)}</p>${S.error?`<div class="msg err">${esc(S.error)}</div><div class="actions"><button class="primary" id="upAgain">Try another file</button></div>`:'<p class="meta">You can keep this tab open while we work. Usually under a minute.</p>'}</section>`;}
function paint(){if(location.hash!=='#/upload')return;if(!$('upbar')){route();return;}$('upfill').style.width=S.pct+'%';$('upbar').setAttribute('aria-valuenow',S.pct);$('upText').textContent=S.text;
  M.querySelectorAll('.up-steps li').forEach((l,i)=>{l.className=i<S.step?'done':i===S.step?'on':'';l.firstChild.textContent=i<S.step?'✓':i+1;});}
function bindPage(){bind();if($('upAgain'))$('upAgain').onclick=()=>{S=null;route();};}
async function pool(items,fn,onDone,n=3){let k=0;const out=new Array(items.length);await Promise.all(Array.from({length:n},async()=>{while(k<items.length){const i=k++;out[i]=await fn(items[i],i);onDone();}}));return out;}
async function start(file){if(S&&S.running){alert('A check is already running. Please wait for it to finish.');return;}
  S={file:file.name,step:0,pct:3,text:'Opening your file…',running:true};location.hash='#/upload';if(location.hash==='#/upload')route();
  try{const r=await readFile(file);S.pct=12;S.step=1;S.text='Finding citations and references…';paint();
    const d=detect(file.name,r.text);S.mode=d.mode;route();
    const name=file.name.replace(/\.[^.]+$/,'');
    if(d.mode==='refs'){if(d.entries.length>SOFT){S.running=false;const c={id:Date.now().toString(36),name,type:'refs',date:new Date().toISOString(),inputs:d.entries,total:d.entries.length,results:[],score:0,status:'running',file:file.name};
        const cs=load();cs.unshift(c);trySave(cs);location.replace('#/results/'+c.id);setTimeout(()=>runJob(c.id,d.entries),50);S=null;return;}
      S.step=2;let done=0;const tot=d.entries.length;const upd=()=>{done++;S.pct=15+Math.round(80*done/tot);S.text=`Checking reference ${done} of ${tot}…`;paint();};
      const res=await pool(d.entries,async(e,i)=>{let x;try{x=slim(await SIY.verify(e));}catch(er){x={raw:e,verdict:'error',note:er.message};}x.i=i;return x;},upd);
      if(res.every(x=>x.verdict==='error'))throw err("We couldn't reach the databases. Check your internet connection and try again in a minute.");
      const c={id:Date.now().toString(36),name,type:'refs',date:new Date().toISOString(),total:res.length,results:res,score:SIY.integrity(res),status:'done',file:file.name};
      finish(c);return;}
    const a=d.a;if(a.sources.length>80)throw err('That draft cites more than 80 sources. Please upload one chapter or section at a time.');
    const sp=DRAFT.splitDraft(d.text);const refsAll=SIY.splitEntries(sp.refs);
    const tot=a.sources.length+refsAll.length;let done=0;S.step=2;const upd=lab=>()=>{done++;S.pct=15+Math.round(80*Math.min(1,done/Math.max(1,tot)));S.text=`Checking sources… ${done} of ${tot}`;paint();};
    await pool(a.sources,async s=>{const claim=a.claims.find(c=>c.cites.some(x=>x.key===s.key)).sentence;try{const r=await DRAFT.checkSource(s,claim,a.hasRefs);s.result=dslim(r.result);s.abstract=r.abstract;}catch(e){s.result={raw:s.ref||s.label,verdict:'error',note:e.message};}},upd());
    if(a.sources.every(s=>s.result.verdict==='error'))throw err("We couldn't reach the databases. Check your internet connection and try again in a minute.");
    const refResults=await buildRefResults(refsAll,a.sources,null,upd());
    const results=a.sources.map(s=>s.result);
    const c={id:Date.now().toString(36),name,type:'draft',v:2,combo:true,file:file.name,date:new Date().toISOString(),input:d.text,refsIn:'',
      results,score:SIY.integrity(results),claims:a.claims.map(cl=>({sentence:cl.sentence,cites:cl.cites.map(x=>({label:x.label,key:x.key})),judgment:null})),
      sources:a.sources.map(s=>({key:s.key,label:s.label,ref:s.ref,year:s.year,abstract:s.abstract})),orphans:a.orphans,uncited:a.uncited,hasRefs:a.hasRefs,refResults,refScore:SIY.integrity(refResults)};
    finish(c);}
  catch(e){S.error=e.friendly?e.message:'Something went wrong while reading this file. Try again, or paste the text into New check instead.';S.running=false;S.text='Stopped.';if(location.hash==='#/upload')route();else alert(S.error);}}
async function buildRefResults(entries,sources,prev,onDone){const n=s=>(s||'').replace(/\s+/g,' ').trim();
  return pool(entries,async(e,i)=>{const s=sources.find(x=>x.ref&&n(x.ref)===n(e));let r=s&&s.result&&s.result.verdict!=='error'?{...s.result}:null;
    if(!r&&prev){const p=prev.find(x=>n(x.raw)===n(e)&&x.verdict!=='error');if(p)r={...p};}
    if(!r){try{r=slim(await SIY.verify(e));}catch(er){r={raw:e,verdict:'error',note:er.message};}}r.raw=e;r.i=i;return r;},onDone||(()=>{}));}
function finish(c){S.step=4;S.pct=100;S.text='Done!';S.running=false;paint();const cs=load();cs.unshift(c);trySave(cs);
  setTimeout(()=>{S=null;if(location.hash==='#/upload')location.replace('#/results/'+c.id);toast(`Checked ${c.file}`);},500);}
/* summary card shown on top of a combined check */
function summary(c){if(!c.combo||!c.refResults)return '';const k=counts(c.refResults);const w=c.claims.filter(x=>!x.judgment).length;
  return `<section class="card combo" aria-labelledby="cmbH"><h2 id="cmbH">Summary of ${esc(c.file||c.name)}</h2>
  <p class="help">We checked <b>${c.refResults.length} references</b> and <b>${c.claims.length} cited sentences</b>.</p>
  <div class="combo-grid">${[['verified','Looks good'],['correction','Fix details'],['not_found',"Can't find it"],['retracted','Retracted']].map(([v,l])=>`<a class="ctile v-${v}" href="#/results/${c.id}/refs"><b>${k[v]||0}</b><span class="badge ${v}">${l}</span></a>`).join('')}
   ${k.uncertain?`<a class="ctile" href="#/results/${c.id}/refs"><b>${k.uncertain}</b><span class="badge uncertain">Double-check</span></a>`:''}
   <a class="ctile wait" href="#claims"><b>${w}</b><span>Claims waiting for your call</span></a></div>
  <div class="actions"><a class="btn primary" href="#/results/${c.id}/refs">See reference results →</a><a class="btn ghost" href="#claims" data-goclaims>Go to claims ↓</a></div></section>`;}
return {zone,bind,page,bindPage,summary,buildRefResults,start};})();
