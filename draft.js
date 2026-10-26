/* Siyasat Draft check: citation extraction, claim linking, abstracts. Reading aid only — never judges support. */
const DRAFT = (() => {
const MAILTO='siyasat-checker@example.org';
const HEAD=/^\s*(references|reference list|bibliography|works cited|sources|literature cited)\s*:?\s*$/im;
function splitDraft(text){ text=(text||'').replace(/\r/g,''); const m=text.match(HEAD); if(!m) return {prose:text.trim(), refs:''};
  return {prose:text.slice(0,m.index).trim(), refs:text.slice(m.index+m[0].length).trim()}; }
function refList(txt){ txt=(txt||'').replace(/\r/g,'').trim(); if(!txt) return [];
  const parts=/\n\s*\n/.test(txt)?txt.split(/\n\s*\n/):txt.split('\n'); let numbered=false;
  const out=parts.map((p,i)=>{p=p.replace(/\s*\n\s*/g,' ').trim(); const n=p.match(/^\s*\[?(\d{1,3})[\].)]\s+/); if(n){numbered=true;p=p.slice(n[0].length);}
    const pr=SIY.parse(p); return {num:n?+n[1]:i+1, raw:p, first:(pr.surnames[0]||'').toLowerCase(), year:pr.year, cited:false};}).filter(r=>r.raw.length>8);
  out.numbered=numbered; return out; }
const PROT=[[/\bet al\./g,'et al§'],[/\be\.g\./g,'e§g§'],[/\bi\.e\./g,'i§e§'],[/\bcf\./g,'cf§'],[/\bpp?\./g,'p§'],[/\bvs\./g,'vs§'],[/\b([A-Z])\.(?=\s?[A-Z]?\.?\s?[A-Z][a-z])/g,'$1§']];
function sentences(prose){ let t=prose.replace(/\s*\n\s*/g,' '); PROT.forEach(([re,s])=>t=t.replace(re,s));
  return t.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(\[])/).map(s=>s.replace(/§/g,'.').trim()).filter(Boolean); }
const NAME="[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)?";
function citations(sent, numbered){
  const out=[], push=(authors,year,label)=>{const first=(authors.match(/[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+/)||[''])[0]; if(!first||/^(In|See|The|Table|Figure)$/.test(first)) return;
    out.push({label, authors:authors.trim(), first:first.toLowerCase(), year:+year.slice(0,4), key:first.toLowerCase()+'|'+year.slice(0,4)});};
  // parenthetical (A & B, 2020; C et al., 2019)
  for(const m of sent.matchAll(/\(([^()]*?\b(?:19|20)\d{2}[a-z]?[^()]*)\)/g)){
    m[1].split(/;\s*/).forEach(part=>{ const p=part.replace(/^(see|e\.g\.,?|cf\.|also)\s+/i,'').trim();
      const a=p.match(new RegExp('^('+NAME+'(?:,?\\s+(?:&|and)\\s+'+NAME+'|\\s+et al\\.?|(?:,\\s*'+NAME+')*,?\\s*(?:&|and)\\s*'+NAME+')?),?\\s+((?:19|20)\\d{2}[a-z]?)'));
      if(a) push(a[1],a[2],'('+p.replace(/,\s*pp?\.\s*[\d–-]+$/,'')+')'); }); }
  // narrative: Navarro and Kim (2020), Smith et al. (2019)
  for(const m of sent.matchAll(new RegExp('('+NAME+'(?:(?:,\\s+'+NAME+')*,?\\s+(?:&|and)\\s+'+NAME+'|\\s+et al\\.)?)\\s+\\(((?:19|20)\\d{2}[a-z]?)(?:,[^)]*)?\\)','g')))
    { const au=m[1].replace(/^(As|In|By|According to|While|Unlike|Following)\s+/,''); push(au,m[2],au+' ('+m[2]+')'); }
  if(numbered) for(const m of sent.matchAll(/\[(\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\]/g)){
    m[1].split(/\s*,\s*/).forEach(r=>{const [a,b]=r.split(/\s*[-–]\s*/).map(Number); for(let n=a;n<=(b||a)&&n-a<50;n++) out.push({label:'['+n+']',num:n,key:'#'+n});}); }
  const seen=new Set(); return out.filter(c=>!seen.has(c.key)&&seen.add(c.key)); }
function analyze(text, extraRefs){
  const sp=splitDraft(text); const refs=refList(extraRefs&&extraRefs.trim()?extraRefs:sp.refs);
  const claims=[]; sentences(sp.prose).forEach(s=>{const cs=citations(s,refs.numbered); if(cs.length) claims.push({sentence:s, cites:cs, judgment:null});});
  const sources={}, orphans=[];
  claims.forEach(cl=>cl.cites.forEach(c=>{ let ref=null;
    if(c.num!=null) ref=refs.find(r=>r.num===c.num);
    else ref=refs.find(r=>r.first===c.first && r.year===c.year) || refs.find(r=>r.first===c.first && r.year && Math.abs(r.year-c.year)<=0 && r.raw.toLowerCase().includes(c.first));
    if(ref){ref.cited=true; c.ref=ref.raw;} else if(refs.length){ if(!orphans.some(o=>o.key===c.key)) orphans.push({label:c.label,key:c.key}); }
    if(!sources[c.key]) sources[c.key]={key:c.key,label:c.label,ref:c.ref||null,authors:c.authors,year:c.year,first:c.first}; }));
  return {claims, sources:Object.values(sources), orphans, uncited:refs.filter(r=>!r.cited).map(r=>r.raw), hasRefs:refs.length>0};
}
async function j(u){ for(let i=0;i<2;i++){ try{const r=await fetch(u); if(r.status===404) return null; if(r.ok) return await r.json();}catch(e){} await new Promise(r=>setTimeout(r,700)); } return null; }
const fold=s=>(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
async function findByAuthorYear(src, claim){
  const words=claim.replace(/\([^)]*\)/g,' ').replace(/\[[^\]]*\]/g,' ').slice(0,220);
  const ct=terms(claim).stems, fam0=fold(src.first);
  const fit=title=>{const tt=[...terms(title||'').stems];if(!tt.length)return 0;return tt.filter(x=>ct.has(x)).length/tt.length;};
  const surname=src.authors.replace(/\s+et al\.?/,'').split(/\s*(?:,|&|\band\b)\s*/)[0];
  let weak=null;
  for(const slack of [0,1]){
    const d=await j(`https://api.crossref.org/works?query.author=${encodeURIComponent(surname)}&query.bibliographic=${encodeURIComponent(words)}&filter=from-pub-date:${src.year-slack},until-pub-date:${src.year+slack}&rows=15&select=DOI,title,author,issued&mailto=${MAILTO}`);
    const items=((d&&d.message&&d.message.items)||[]).filter(w=>(w.author||[]).some((a,k)=>k<1&&fold(a.family).includes(fam0)));
    const sc=items.map(w=>({w,f:fit((w.title||[''])[0])})).sort((x,y)=>y.f-x.f);
    if(sc[0]&&sc[0].f>=0.3) return {doi:sc[0].w.DOI,title:(sc[0].w.title||[''])[0],strength:'strong'};
    if(!weak&&items[0]) weak={doi:items[0].DOI,title:(items[0].title||[''])[0],strength:'weak'};
  }
  const oa=await j(`https://api.openalex.org/works?search=${encodeURIComponent(surname+' '+words)}&filter=publication_year:${src.year-1}-${src.year+1}&per-page=10&select=doi,title,authorships&mailto=${MAILTO}`);
  const hit=oa&&oa.results&&oa.results.map(p=>({p,f:fit(p.title)})).filter(x=>(x.p.authorships||[]).slice(0,1).some(a=>fold(a.author&&a.author.display_name).includes(fam0))).sort((x,y)=>y.f-x.f)[0];
  if(hit&&hit.f>=0.25&&hit.p.doi) return {doi:hit.p.doi.replace('https://doi.org/',''),title:hit.p.title,strength:'strong'};
  if(!oa&&!weak) return {strength:'weak',partial:true};
  return weak; }
async function abstract(doi){
  if(!doi) return null; let info={};
  const oa=await j(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=id,open_access,abstract_inverted_index&mailto=${MAILTO}`);
  if(oa){ info={openalex:oa.id||null, isOA:!!(oa.open_access&&oa.open_access.is_oa), oaUrl:(oa.open_access&&oa.open_access.oa_url)||null}; }
  if(oa&&oa.abstract_inverted_index){ const w=[]; for(const [k,ps] of Object.entries(oa.abstract_inverted_index)) ps.forEach(p=>w[p]=k); const t=w.filter(x=>x!=null).join(' ').trim(); if(t.length>40) return {text:t,from:'OpenAlex',...info}; }
  const cr=await j(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=${MAILTO}`);
  const a=cr&&cr.message.abstract; if(a){ const t=a.replace(/<jats:title>[^<]*<\/jats:title>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); if(t.length>40) return {text:t,from:'Crossref',...info}; }
  const ep=await j(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent('DOI:"'+doi+'"')}&resultType=core&format=json`);
  const er=ep&&ep.resultList&&ep.resultList.result&&ep.resultList.result[0];
  if(er&&er.abstractText){ const t=er.abstractText.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); if(t.length>40) return {text:t,from:'Europe PMC',...info}; }
  const ss=await j(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=abstract`);
  if(ss&&ss.abstract&&ss.abstract.length>40) return {text:ss.abstract,from:'Semantic Scholar',...info};
  return info.openalex?{text:null,from:null,...info}:null; }
/* hasRefs: the draft came with a reference list (so a missing entry is an "orphan") */
async function checkSource(src, claim, hasRefs){
  let input=src.ref, res, linked=null;
  if(!input){ const hit=await findByAuthorYear(src, claim);
    if(!hit) return {result:{raw:`${src.label} (no reference list entry)`,verdict:'not_found',confidence:0,orphan:!!hasRefs,
      note:`We searched Crossref and OpenAlex for a paper by ${src.authors} from ${src.year} (and a year either side) and found nothing plausible. It may be a local thesis or report that global indexes don't cover, or it may not exist. Check your university repository or library.`},abstract:null};
    if(hit.strength==='weak') return {result:{raw:`${src.label} (no reference list entry)`,verdict:'uncertain',confidence:0,linked:'author-year',weak:true,orphan:!!hasRefs,
      note:hit.partial?`OpenAlex was unavailable, so we could only search Crossref, which found no match for ${src.authors} (${src.year}). Try again later or add it to your reference list.`:`We found papers by ${src.authors} from ${src.year}, but none clearly matches this sentence.`},abstract:null};
    input=hit.doi; linked=hit.strength; }
  res=await SIY.verify(input);
  if(linked){ res.linked='author-year'; res.weak=linked==='weak'; res.orphan=!!hasRefs; if(res.weak&&res.verdict==='verified') res.verdict='uncertain'; }
  const ab=(res.match&&res.verdict!=='not_found')?await abstract(res.match.doi):null;
  return {result:res, abstract:ab}; }
/* reading aid: shared terms + numbers */
const STOP=new Set('about above after again against also among an and any are because been before being between both but can could did does doing during each few from further had has have having here into its itself more most much must only other ought over same should some such than that their them then there these they this those through under until very was were what when where which while who whom why will with would your our we us found show shows shown study studies research results paper report reports suggest suggests using used use based however across within without among'.split(' '));
const stem=w=>w.toLowerCase().replace(/[’']s$/,'').replace(/(ies)$/,'y').replace(/(ing|ed|es|s)$/,'');
function terms(sentence){ const s=sentence.replace(/\([^()]*\b(19|20)\d{2}[^()]*\)/g,' ').replace(/\[[\d,\s–-]+\]/g,' ');
  const words=(s.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{3,}/g)||[]).filter(w=>!STOP.has(w.toLowerCase()));
  const nums=(s.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?\s?%?|\d+(?:\.\d+)?\s?%?/g)||[]).map(n=>n.replace(/\s/g,'')).filter(n=>!/^(19|20)\d{2}$/.test(n));
  return {stems:new Set(words.map(stem)), nums:[...new Set(nums)], clean:s}; }
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function highlight(text, stems, nums){ return esc(text).replace(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?\s?%?|\d+(?:\.\d+)?\s?%?)|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{3,})/g,(m,n,w)=>{
  if(n){ const k=n.replace(/\s/g,''); return nums.some(x=>x===k||x.replace('%','')===k.replace('%',''))?`<mark class="num">${m}</mark>`:m; }
  return stems.has(stem(w))&&!STOP.has(w.toLowerCase())?`<mark>${m}</mark>`:m; }); }
function compare(sentence, abs){
  const t=terms(sentence); const at=abs?terms(abs):{stems:new Set(),nums:[]};
  const shared=new Set([...t.stems].filter(x=>at.stems.has(x)));
  const absNums=(abs||'').match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?\s?%?|\d+(?:\.\d+)?\s?%?/g)||[]; const an=absNums.map(n=>n.replace(/\s/g,'').replace('%',''));
  const missing=t.nums.filter(n=>!an.includes(n.replace('%','')));
  const presentNums=t.nums.filter(n=>!missing.includes(n));
  return {sentenceHTML:highlight(sentence,shared,presentNums), abstractHTML:abs?highlight(abs,shared,presentNums):'', shared:[...shared].length, missing}; }
function closest(sentence, abs){ if(!abs) return null; const st=terms(sentence).stems; let best=null,bs=0;
  sentences(abs).forEach(x=>{const n=[...terms(x).stems].filter(w=>st.has(w)).length; if(n>bs){bs=n;best=x;}}); return best?{text:best,shared:bs}:null; }
return {analyze, checkSource, compare, closest, terms, splitDraft, sentences, citations, abstract};
})();
