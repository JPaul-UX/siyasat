/* Siyasat exports: CSV, BibTeX, RIS, EndNote (.enw), and the screened library for reviews */
const EXP = (() => {
const strip = s => String(s||'').replace(/<[^>]+>/g,'');
const good = r => r.match && (r.verdict==='verified' || r.verdict==='correction');
const recs = (c, screened) => { const seen=new Set();
  return c.results.filter(r => screened ? good(r) : (r.match && !['not_found','retracted','error'].includes(r.verdict)))
    .filter(r => { const k=r.match.doi||r.match.title; if(seen.has(k)) return false; seen.add(k); return true; }); };
const au = m => (m.authors||[]).filter(a=>a.family);
const risType = t => /book-chapter/.test(t||'')?'CHAP':/book/.test(t||'')?'BOOK':/proceedings/.test(t||'')?'CONF':/posted|preprint/.test(t||'')?'UNPB':'JOUR';
const pg = p => String(p||'').split(/[–-]/);
function csvCell(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
function csv(c){ const L={verified:'Looks good (verified)',correction:'Fix details (minor error)',uncertain:'Double-check',not_found:"Can't find it (possible AI hallucination)",retracted:'Retracted',error:"Couldn't check"};
  const head=['#','You wrote','Verdict','Overridden by you','Your note','Match confidence','DOI','DOI link','Title','Authors','Year','Venue','Volume','Issue','Pages','Differences','Open-access link','APA 7'];
  const rows=c.results.map((r,i)=>{const m=r.match||{};const v=m.ven||{};return [ (r.i!=null?r.i:i)+1, r.raw, L[r.verdict]||r.verdict, r.auto?('yes (was '+(L[r.auto]||r.auto)+')'):'', r.ovNote||'',
    r.confidence!=null?Math.round(r.confidence*100)+'%':'', m.doi||'', m.doi?'https://doi.org/'+m.doi:'', m.title||'', au(m).map(a=>a.family+(a.given?', '+a.given:'')).join('; '), m.year||'', m.venue||v.name||'', m.volume||'', m.issue||'', m.pages||'',
    (r.diffs||[]).map(d=>d.field+': '+d.cited+' → '+d.actual).join(' | '), v.oaUrl||'', strip(r.apa)]; });
  return '\ufeff'+[head].concat(rows).map(r=>r.map(csvCell).join(',')).join('\r\n'); }
function bibtex(c, screened){ const used={};
  return recs(c,screened).map(r=>{const m=r.match;let k=((au(m)[0]||{}).family||'ref').replace(/[^A-Za-z]/g,'')+(m.year||'');used[k]=(used[k]||0)+1;if(used[k]>1)k+=String.fromCharCode(95+used[k]);
    const t=risType(m.type), typ=t==='BOOK'?'book':t==='CHAP'?'incollection':t==='CONF'?'inproceedings':t==='UNPB'?'unpublished':'article';
    const f=[['author',au(m).map(a=>a.family+(a.given?', '+a.given:'')).join(' and ')],['title',m.title],[typ==='article'?'journal':'booktitle',m.venue],['year',m.year],['volume',m.volume],['number',m.issue],['pages',String(m.pages||'').replace('–','--')],['doi',m.doi],['url',m.doi?'https://doi.org/'+m.doi:'']].filter(x=>x[1]);
    return `@${typ}{${k},\n${f.map(([a,b])=>`  ${a} = {${String(b).replace(/[{}]/g,'')}}`).join(',\n')}\n}`;}).join('\n\n')+'\n'; }
function ris(c, screened){ return recs(c,screened).map(r=>{const m=r.match;const [sp,ep]=pg(m.pages);const L=[['TY',risType(m.type)]];
    au(m).forEach(a=>L.push(['AU',a.family+(a.given?', '+a.given:'')]));L.push(['TI',m.title],['T2',m.venue],['PY',m.year],['VL',m.volume],['IS',m.issue],['SP',sp],['EP',ep],['DO',m.doi],['UR',m.doi?'https://doi.org/'+m.doi:'']);
    if(screened) L.push(['N1','Screened by Siyasat: '+(r.verdict==='verified'?'verified':'real source, details corrected')]);
    return L.filter(x=>x[1]).map(([a,b])=>`${a}  - ${b}`).join('\r\n')+'\r\nER  - ';}).join('\r\n\r\n')+'\r\n'; }
function enw(c){ return recs(c).map(r=>{const m=r.match;const t=risType(m.type);const L=[['%0',t==='BOOK'?'Book':t==='CHAP'?'Book Section':t==='CONF'?'Conference Proceedings':'Journal Article']];
    au(m).forEach(a=>L.push(['%A',a.family+(a.given?', '+a.given:'')]));L.push(['%T',m.title],[t==='JOUR'?'%J':'%B',m.venue],['%D',m.year],['%V',m.volume],['%N',m.issue],['%P',m.pages],['%R',m.doi],['%U',m.doi?'https://doi.org/'+m.doi:'']);
    return L.filter(x=>x[1]).map(([a,b])=>`${a} ${b}`).join('\n');}).join('\n\n')+'\n'; }
function buttons(c, isCorpus){ const id=c._combo?c.id+'/refs':c.id; const n=recs(c).length, sn=recs(c,true).length;
  return `<div class="exports" role="group" aria-label="Download your results">
   <button class="ghost" data-exp="csv" data-eid="${id}">⬇ Spreadsheet (.csv)</button>
   <button class="ghost" data-exp="bib" data-eid="${id}" ${n?'':'disabled'}>⬇ BibTeX (.bib)</button>
   <button class="ghost" data-exp="ris" data-eid="${id}" ${n?'':'disabled'}>⬇ RIS (Zotero, Mendeley)</button>
   <button class="ghost" data-exp="enw" data-eid="${id}" ${n?'':'disabled'}>⬇ EndNote (.enw)</button>
   ${isCorpus?`<button class="primary" data-exp="screened" data-eid="${id}" ${sn?'':'disabled'}>⬇ Screened library (.ris) · ${sn} kept</button>`:''}
  </div><p class="help">Reference-manager files include only real sources we matched, with the official details and DOI.${isCorpus?' The <b>screened library</b> keeps only “Looks good” and “Fix details” records, so made-up, retracted and unchecked items are left out of your review.':''}</p>`; }
function run(kind, c, dl){ const base=`siyasat-${c.name.replace(/[^\w-]+/g,'-').slice(0,40)}`;
  if(kind==='csv') dl(base+'.csv', csv(c), 'text/csv;charset=utf-8');
  if(kind==='bib') dl(base+'.bib', bibtex(c), 'application/x-bibtex');
  if(kind==='ris') dl(base+'.ris', ris(c), 'application/x-research-info-systems');
  if(kind==='enw') dl(base+'.enw', enw(c), 'application/x-endnote-refer');
  if(kind==='screened') dl(base+'-screened.ris', ris(c,true), 'application/x-research-info-systems'); }
return {csv, bibtex, ris, enw, buttons, run, recs};
})();
if (typeof module !== 'undefined') module.exports = EXP;
