/* Siyasat verification engine — runs in browser and in node */
const SIY = (() => {
const MAILTO = 'siyasat-checker@example.org';
const norm = s => (s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/<[^>]+>/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const STOP = new Set('a an the of and in on for to with by from at as is are or'.split(' '));
const toks = s => norm(s).split(' ').filter(w => w && !STOP.has(w));
function sim(a,b){ const A=toks(a),B=toks(b); if(!A.length||!B.length) return 0;
  const sa=new Set(A),sb=new Set(B); let i=0; sa.forEach(w=>{if(sb.has(w))i++}); return 2*i/(sa.size+sb.size); }
function coverage(title, text){ const T=[...new Set(toks(title))], X=new Set(toks(text)); if(!T.length) return 0; return T.filter(w=>X.has(w)).length/T.length; }
function splitEntries(txt){
  txt = txt.replace(/\r/g,'').trim(); if(!txt) return [];
  const parts = /\n\s*\n/.test(txt) ? txt.split(/\n\s*\n/) : txt.split('\n');
  return parts.map(p=>p.replace(/\s*\n\s*/g,' ').replace(/^\s*(\[\d+\]|\d+[.)](?=\s))\s*/,'').trim()).filter(p=>p.length>8);
}
function parse(raw){
  const r = {raw};
  const d = raw.match(/10\.\d{4,9}\/[^\s"<>]+/i); if(d) r.doi = d[0].replace(/[.,;)\]]+$/,'');
  const y = raw.match(/\((\d{4})[a-z]?\)/) || raw.match(/\b(19|20)\d{2}\b/); if(y) r.year = +(y[1].length===4?y[1]:y[0]);
  const apa = raw.match(/^(.+?)\s*\((\d{4})[a-z]?[^)]*\)\.?\s*(.+?[.?!])\s+(.*)$/);
  if(apa){ r.authorsText=apa[1]; r.title=apa[3].replace(/\.$/,''); r.rest=apa[4]; }
  else { const q = raw.match(/[“"](.+?)[,.]?[”"]/); if(q) r.title=q[1]; }
  const a = (r.authorsText||raw.split(/[.(]/)[0]||'');
  r.surnames = (a.match(/[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?=,\s*[A-Z]\.)/g)||[]).map(s=>s.toLowerCase());
  if(!r.surnames.length){ const m=a.match(/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+/); if(m) r.surnames=[m[0].toLowerCase()]; }
  if(r.rest){ const v=r.rest.match(/^(.+?),\s*(\d+)\s*(?:\((\w+)\))?\s*,\s*([\dA-Za-z]+(?:\s*[–-]\s*[\dA-Za-z]+)?)/);
    if(v){ r.venue=v[1]; r.volume=v[2]; r.issue=v[3]; r.pages=v[4].replace(/\s/g,'').replace('-','–'); } else r.venue=r.rest.split(/[,.]/)[0]; }
  return r;
}
async function getJSON(url, fetchFn){ for(let i=0;i<3;i++){ try{ const res=await fetchFn(url); if(res.status===404) return null; if(res.ok) return await res.json(); }catch(e){} await new Promise(r=>setTimeout(r,800*(i+1))); } throw new Error('Network error contacting '+new URL(url).host); }
function fromCrossref(w){ return { source:'Crossref', doi:(w.DOI||'').toLowerCase(), title:(w.title||[''])[0], authors:(w.author||[]).map(a=>({family:a.family||a.name||'', given:a.given||''})),
  year:((w.issued||w['published-print']||w['published-online']||{})['date-parts']||[[null]])[0][0], venue:(w['container-title']||[''])[0], volume:w.volume, issue:w.issue, pages:(w.page||'').replace('-','–'), type:w.type, cites:w['is-referenced-by-count']||0,
  retracted: !!((w['updated-by']||[]).some(u=>/retract/i.test(u.type)) || /^retracted\b/i.test((w.title||[''])[0])), raw:w }; }
function fromOpenAlex(w){ const b=w.biblio||{}; return { source:'OpenAlex', doi:(w.doi||'').replace('https://doi.org/','').toLowerCase(), title:w.title||'',
  authors:(w.authorships||[]).map(a=>{const n=(a.author&&a.author.display_name)||''; const p=n.trim().split(/\s+/); return {family:p.pop()||'', given:p.join(' ')}}), year:w.publication_year,
  venue:(w.primary_location&&w.primary_location.source&&w.primary_location.source.display_name)||'', volume:b.volume, issue:b.issue, pages:b.first_page?(b.first_page+(b.last_page&&b.last_page!==b.first_page?'–'+b.last_page:'')):'', retracted:!!w.is_retracted, type:w.type, cites:w.cited_by_count||0 }; }
function score(p, c){
  const tSim = p.title ? sim(p.title, c.title) : coverage(c.title, p.raw);
  const fam = c.authors.map(a=>norm(a.family));
  const aOk = p.surnames.length ? p.surnames.filter(s=>fam.includes(norm(s))).length/p.surnames.length : 0.5;
  const yOk = p.year && c.year ? (Math.abs(p.year-c.year)===0?1:Math.abs(p.year-c.year)<=1?0.6:0) : 0.5;
  const vOk = p.venue && c.venue ? Math.max(sim(p.venue,c.venue), coverage(c.venue,p.raw)) : 0.5;
  const doiOk = p.doi && c.doi && p.doi.toLowerCase()===c.doi ? 1 : 0;
  return { total: doiOk ? Math.max(0.9, tSim) : 0.6*tSim+0.2*aOk+0.1*yOk+0.1*vOk, tSim, aOk, yOk, vOk, doiOk };
}
async function checkRetraction(c, fetchFn){
  if(c.retracted) return true; if(!c.doi) return false;
  const n = await getJSON(`https://api.crossref.org/works?filter=updates:${encodeURIComponent(c.doi)}&rows=5&mailto=${MAILTO}`, fetchFn).catch(()=>null);
  if(n && n.message.items.some(it=>(it['update-to']||[]).some(u=>/retract/i.test(u.type) && u.DOI.toLowerCase()===c.doi))) return true;
  const oa = await getJSON(`https://api.openalex.org/works/doi:${c.doi}?mailto=${MAILTO}`, fetchFn).catch(()=>null);
  return !!(oa && oa.is_retracted);
}
function diffs(p, c){
  const out=[]; const fam=c.authors.map(a=>norm(a.family));
  if(p.surnames.length){ const miss=p.surnames.filter(s=>!fam.includes(norm(s)));
    if(miss.length || (c.authors[0] && norm(p.surnames[0])!==norm(c.authors[0].family))) out.push({field:'Authors', cited:p.authorsText||p.surnames.join(', '), actual:c.authors.slice(0,6).map(a=>a.family+(a.given?', '+a.given[0]+'.':'')).join('; ')+(c.authors.length>6?' et al.':'')}); }
  if(p.year && c.year && p.year!==c.year) out.push({field:'Year', cited:String(p.year), actual:String(c.year), suspect: c.year>p.year && (/^(posted-content|preprint|other|dataset)$/.test(c.type||'') || (c.year-p.year>2 && (c.cites||0)<50)), note: (c.year>p.year && (/^(posted-content|preprint|other|dataset)$/.test(c.type||'') || (c.year-p.year>2 && (c.cites||0)<50)))?'The only record found is a much later repost or preprint. The original is probably not indexed, so your year may be right. Please double-check.':''});
  if(p.title && sim(p.title,c.title)<0.9) out.push({field:'Title', cited:p.title, actual:c.title});
  if(p.venue && c.venue && sim(p.venue,c.venue)<0.6 && coverage(c.venue,p.raw)<0.8) out.push({field:'Venue', cited:p.venue, actual:c.venue});
  if(p.volume && c.volume && p.volume!==String(c.volume)) out.push({field:'Volume', cited:p.volume, actual:String(c.volume)});
  if(p.pages && c.pages && norm(p.pages)!==norm(c.pages)) out.push({field:'Pages', cited:p.pages, actual:c.pages});
  if(p.doi && c.doi && p.doi.toLowerCase()!==c.doi) out.push({field:'DOI', cited:p.doi, actual:c.doi});
  return out;
}
function apa(c){
  const au=c.authors.filter(a=>a.family); const fmt=a=>a.family+(a.given?', '+a.given.split(/[\s-]+/).filter(Boolean).map(g=>g[0].toUpperCase()+'.').join(' '):'');
  let A = au.length===0?'' : au.length===1?fmt(au[0]) : au.length<=20? au.slice(0,-1).map(fmt).join(', ')+', & '+fmt(au[au.length-1]) : au.slice(0,19).map(fmt).join(', ')+', … '+fmt(au[au.length-1]);
  let s = (A?A+' ':'')+`(${c.year||'n.d.'}). ${c.title.replace(/^RETRACTED:\s*/i,'')}${/[?!.]$/.test(c.title)?'':'.'}`;
  if(c.venue){ s+=` <i>${c.venue}</i>`; if(c.volume) s+=`, <i>${c.volume}</i>`; if(c.issue) s+=`(${c.issue})`; if(c.pages) s+=`, ${c.pages}`; s+='.'; }
  if(c.doi) s+=` https://doi.org/${c.doi}`; return s;
}
async function verify(raw, fetchFn = (u)=>fetch(u)){
  const p = parse(raw); let cands=[];
  if(p.doi){ const w = await getJSON(`https://api.crossref.org/works/${encodeURIComponent(p.doi)}?mailto=${MAILTO}`, fetchFn).catch(()=>null); if(w) cands.push(fromCrossref(w.message)); }
  const q = raw.replace(/https?:\/\/\S+|10\.\d{4,9}\/\S+/g,'').slice(0,400);
  if(q.replace(/\W/g,'').length>15){
    const cr = await getJSON(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=5&mailto=${MAILTO}`, fetchFn);
    cands.push(...cr.message.items.filter(i=>i.title).map(fromCrossref));
  }
  let best=null,bs=null; const pick=()=>{ for(const c of cands){ const s=score(p,c); if(!bs||s.total>bs.total){best=c;bs=s;} } };
  pick();
  if(!bs || bs.total<0.8){ const t=p.title||q; const oa = await getJSON(`https://api.openalex.org/works?search=${encodeURIComponent(t.slice(0,250))}&per-page=5&mailto=${MAILTO}`, fetchFn).catch(()=>null);
    if(oa) cands.push(...oa.results.filter(r=>r.title).map(fromOpenAlex)); pick(); }
  if(best && bs.tSim>=0.85 && diffs(p,best).length && !cands.some(c=>c.source==='OpenAlex')){
    const oa = await getJSON(`https://api.openalex.org/works?search=${encodeURIComponent((p.title||best.title).slice(0,250))}&per-page=5&mailto=${MAILTO}`, fetchFn).catch(()=>null);
    if(oa) cands.push(...oa.results.filter(r=>r.title).map(fromOpenAlex)); }
  if(best && bs.tSim>=0.85){ // among strong title matches, prefer the record that agrees with the citation most
    const strong=cands.map(c=>({c,s:score(p,c)})).filter(x=>x.s.tSim>=0.85 && x.s.total>=bs.total-0.15);
    const W=c=>(p.year&&c.year&&c.year-p.year>2?3:0)+(c.type==='posted-content'?1:0)+diffs(p,c).reduce((n,d)=>n+(/Authors|Year/.test(d.field)?2:1),0)-Math.log10(1+(c.cites||0))*0.5;
    strong.sort((x,y)=>W(x.c)-W(y.c)); if(strong.length){best=strong[0].c;bs=strong[0].s;} }
  const res = {raw, parsed:p, match:best, score:bs};
  if(!best || bs.total<0.62 || (bs.tSim<0.6 && !bs.doiOk)){ res.verdict='not_found'; res.confidence=bs?bs.total:0;
    res.note = best ? `Closest record in Crossref/OpenAlex is a different work ("${best.title}"), title similarity ${(bs.tSim*100|0)}%. No real publication matches this citation.` : 'No candidate records found.'; res.match=null; res.closest=best; return res; }
  res.retracted = await checkRetraction(best, fetchFn); res.diffs = diffs(p,best); res.apa = apa(best); res.confidence=bs.total;
  const real = res.diffs.filter(d=>!d.suspect);
  if(!res.retracted && res.diffs.some(d=>d.suspect)){ res.apa = apa({...best, year:p.year}); res.diffs = real.concat(res.diffs.filter(d=>d.suspect)); res.confidence=Math.min(res.confidence,0.6);
    res.verdict = 'uncertain'; res.note='We found this title, but only as a much later repost or preprint, so we could not confirm the original publication details. Check it yourself before citing.'; return res; }
  res.verdict = res.retracted ? 'retracted' : res.diffs.length ? 'correction' : 'verified';
  return res;
}
function integrity(results){ if(!results.length) return 0; const w={verified:1,correction:0.6,uncertain:0.7,retracted:0,not_found:0,error:0.5}; return Math.round(100*results.reduce((s,r)=>s+(w[r.verdict]??0),0)/results.length); }
return {verify, parse, splitEntries, integrity, apa, sim};
})();
if (typeof module!=='undefined') module.exports = SIY;
