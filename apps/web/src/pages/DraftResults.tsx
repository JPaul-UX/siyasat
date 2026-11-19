import { closest, compare, countVerdicts, terms, type Claim, type CiteRef, type DraftCheck, type Judgment } from '@siyasat/core';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  ExternalLink,
  Eye,
  Pencil,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge, Chevron, External, Marked, PageHead, plainTitle, ReadButton, VerdictIcon } from '../components/bits';
import { DraftStats } from '../components/DraftStats';
import { ReportButtons } from '../components/ReportButtons';
import { draftText, recheckClaim } from '../lib/draftCheck';
import { bareLabel, claimEvidence, claimPill, quote, sourceNote, sourceView, tallyClaims } from '../lib/draftView';
import { fmtDate, JUDGMENT } from '../lib/labels';
import { paths } from '../lib/nav';
import { getCheck, patchCheck } from '../store/checks';
import { startEditing } from '../store/forms';
import { runUndo, toast, useToast } from '../store/toast';

const webUrl = (u?: string | null): string | null => (u && /^https?:\/\//i.test(u) ? u : null);

const JUDGE_ICON: Record<Judgment, LucideIcon> = { match: CircleCheck, nomatch: CircleX, unsure: CircleHelp };

/** Change one claim of a saved draft check. Answers false when the claim is no longer there. */
function setClaim(id: string, index: number, change: Partial<Claim>): boolean {
  const c = getCheck(id);
  if (!c || c.type !== 'draft' || !c.claims[index]) return false;
  const claims = c.claims.map((cl, i) => {
    if (i !== index) return cl;
    const next = { ...cl, ...change };
    if (!next.note) delete next.note;
    return next;
  });
  patchCheck(id, { claims });
  return true;
}

function Pill({ c, claim }: { c: DraftCheck; claim: Claim }) {
  const p = claimPill(c, claim);
  return (
    <span className={`pill ${p.cls}`}>
      {p.text}
      {p.yours && <span className="yc"> · your call</span>}
    </span>
  );
}

/* ---------- Summary shown above the claims of an uploaded draft ---------- */

function ComboSummary({ c, toClaims }: { c: DraftCheck; toClaims: () => void }) {
  const refs = c.refResults ?? [];
  const k = countVerdicts(refs);
  const waiting = c.claims.filter((x) => !x.judgment).length;
  const refsPath = paths.results(c.id, true);
  const jump = (e: React.MouseEvent) => {
    e.preventDefault();
    toClaims();
  };
  const tiles: [keyof typeof k, string][] = [
    ['verified', 'Looks good'],
    ['correction', 'Fix details'],
    ['not_found', 'AI-hallucination'],
    ['retracted', 'Retracted'],
  ];
  return (
    <section className="card combo" aria-labelledby="cmbH">
      <h2 id="cmbH">Summary of {c.file || c.name}</h2>
      <p className="help">
        We checked <b>{refs.length} references</b> and <b>{c.claims.length} cited sentences</b>.
      </p>
      <div className="combo-grid">
        {tiles.map(([v, label]) => (
          <Link className={`ctile v-${v}`} to={refsPath} key={v}>
            <b>{k[v] || 0}</b>
            <span className={`badge ${v}`}>
              <VerdictIcon verdict={v} />
              {label}
            </span>
          </Link>
        ))}
        {k.uncertain > 0 && (
          <Link className="ctile" to={refsPath}>
            <b>{k.uncertain}</b>
            <span className="badge uncertain">
              <VerdictIcon verdict="uncertain" />
              Double-check
            </span>
          </Link>
        )}
        <a className="ctile wait" href="#claims" onClick={jump}>
          <b>{waiting}</b>
          <span>Claims waiting for your call</span>
        </a>
      </div>
      <div className="actions">
        <Link className="btn primary" to={refsPath}>
          See reference results <ArrowRight className="ic" aria-hidden="true" />
        </Link>
        <a className="btn ghost" href="#claims" onClick={jump}>
          Go to claims <ArrowDown className="ic" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

/* ---------- One cited source, inside the claim's detail panel ---------- */

function SourceBlock({ c, claim, cite }: { c: DraftCheck; claim: Claim; cite: CiteRef }) {
  const x = sourceView(c, cite.key);
  const m = x.match;
  const ab = x.abstractInfo;
  const cmp = compare(claim.sentence, x.abstract);
  const best = x.abstract ? closest(claim.sentence, x.abstract) : null;
  const nums = terms(claim.sentence).nums;
  const title = m ? plainTitle(m.title) : '';

  const rows: [string, ReactNode, ReactNode][] = [
    [
      'Source',
      bareLabel(cite.label),
      m ? (
        <>
          {title}
          {m.venue && (
            <>
              {' '}
              · <i>{m.venue}</i>
            </>
          )}
          {x.recordYear ? ` (${x.recordYear})` : ''} <Badge verdict={x.result.verdict} />
        </>
      ) : x.flag ? (
        <span className={`pill ${x.flag.cls}`}>{x.flag.t}</span>
      ) : (
        '—'
      ),
    ],
  ];
  if (x.result.linked && m) {
    rows.push([
      'How we linked it',
      'No reference list entry',
      x.result.weak ? (
        <>
          <span className="val-bad">Possible match only</span> (same author and year, few shared words)
        </>
      ) : (
        "Matched by author + year search. Confirm it's the paper you meant"
      ),
    ]);
  }
  if (m && x.recordYear) {
    rows.push([
      'Year',
      String(x.citedYear || '—'),
      x.yearDiffers ? (
        <>
          <span className="val-fix">{x.recordYear}</span> <span className="meta">(in-text year should be {x.recordYear})</span>
        </>
      ) : (
        <>
          <Check className="ic val-fix" aria-label="Matches:" /> {x.recordYear}
        </>
      ),
    ]);
  }
  if (nums.length) {
    rows.push([
      'Numbers',
      nums.join(', '),
      !x.abstract ? (
        'No abstract to compare'
      ) : cmp.missing.length ? (
        <span className="val-bad">Not in abstract: {cmp.missing.join(', ')}</span>
      ) : (
        <>
          <Check className="ic val-fix" aria-hidden="true" /> Found in the abstract
        </>
      ),
    ]);
  }
  if (x.abstract) {
    rows.push([
      'Closest abstract sentence',
      <span className="meta">by shared words</span>,
      best ? (
        <span className="cl">
          <Marked segments={compare(claim.sentence, best.text).abstract} />
        </span>
      ) : (
        <span className="meta">No sentence shares words with your claim</span>
      ),
    ]);
  }

  const links: [string, string][] = [];
  if (m?.doi) links.push(['DOI record', 'https://doi.org/' + m.doi]);
  const openalex = webUrl(ab.openalex);
  const oaUrl = webUrl(ab.oaUrl);
  if (openalex) links.push(['OpenAlex record', openalex]);
  if (oaUrl) links.push(['Free full text', oaUrl]);

  return (
    <section className="dsrc">
      <h3>Source · {bareLabel(cite.label)}</h3>
      <table className="diff">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Your draft</th>
            <th scope="col">The record</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, draft, record]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{draft}</td>
              <td>{record}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="d-note">{sourceNote(x)}</p>
      {m?.doi && (
        <div style={{ margin: '10px 0' }}>
          <ReadButton doi={m.doi} />
        </div>
      )}
      {links.length > 0 && (
        <div className="d-links">
          {links.map(([label, href]) => (
            <External href={href} key={label}>
              {label} <ExternalLink className="ic" aria-hidden="true" />
              <span className="sr"> (opens in a new tab)</span>
            </External>
          ))}
        </div>
      )}
      {x.abstract && (
        <div className="abstract">
          <div className="rd-h">
            Abstract {ab.isOA && <span className="rp-oa">Open access</span>}
            <span className="rp-src">via {ab.from}</span>
          </div>
          {m && (
            <div className="rd-t">
              {title}
              {x.recordYear ? ` (${x.recordYear})` : ''}
            </div>
          )}
          <div className="rd-sec">
            <p tabIndex={0} aria-label="Source abstract">
              <Marked segments={cmp.abstract} />
            </p>
          </div>
          <div className="rd-foot">
            Only the abstract is free to show here. To read the results and discussion (where abstracts sometimes oversell),{' '}
            {oaUrl ? (
              <>
                open the <External href={oaUrl}>free full text</External>
              </>
            ) : (
              'open the article'
            )}
            . Reading stays your job; Siyasat just removes the friction.
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- The detail panel for one claim ---------- */

function EditSentence({ id, index, sentence }: { id: string; index: number; sentence: string }) {
  const [text, setText] = useState(sentence);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const recheck = async () => {
    setBusy(true);
    setMessage('Checking…');
    const outcome = await recheckClaim(id, index, text.trim());
    setBusy(false);
    setMessage(outcome.ok ? '' : outcome.message);
  };
  return (
    <details className="d-edit">
      <summary>
        <Chevron /> <Pencil className="ic" aria-hidden="true" /> Edit this sentence
      </summary>
      <label htmlFor="csent" className="sr">
        Edit the sentence
      </label>
      <textarea id="csent" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="actions" style={{ marginTop: 6 }}>
        <button type="button" className="primary sm" disabled={busy} onClick={() => void recheck()}>
          Re-check this claim
        </button>
        <button type="button" className="link" onClick={() => setText(sentence)}>
          Reset text
        </button>
        <span className="meta" aria-live="polite">
          {message}
        </span>
      </div>
      <p className="meta">Keep the citation in the sentence, e.g. (Ji et al., 2023). Your draft text is updated too.</p>
    </details>
  );
}

function ClaimDrawer({ c, index, onClose, onGo }: { c: DraftCheck; index: number; onClose: () => void; onGo: (index: number) => void }) {
  const claim = c.claims[index]!;
  const panel = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  const last = useToast((s) => s.last);
  const number = index + 1;

  useEffect(() => {
    // Rendered off-screen first so that it slides in.
    const frame = requestAnimationFrame(() => setShown(true));
    panel.current?.querySelector<HTMLElement>('.d-close')?.focus();
    return () => cancelAnimationFrame(frame);
  }, []);

  // Stepping to another claim starts reading from the top again.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep keyboard focus inside the panel while it is open.
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button, a[href], textarea, input, select, summary, [tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const end = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const judge = (k: Judgment) => {
    const from = claim.judgment || null;
    const to = from === k ? null : k;
    setClaim(c.id, index, { judgment: to });
    toast(to ? `Marked claim ${number} ${JUDGMENT[to].t}` : `Cleared the verdict on claim ${number}`, {
      label: to ? `marked claim ${number} ${JUDGMENT[to].t}` : `cleared the verdict on claim ${number}`,
      run: () => setClaim(c.id, index, { judgment: from }),
      judgment: { checkId: c.id, claim: index, to },
    });
  };
  const saveNote = (value: string) => {
    const from = claim.note || '';
    const to = value.trim();
    if (from === to) return;
    setClaim(c.id, index, { note: to });
    toast(to ? 'Note saved' : 'Note removed', {
      label: to ? `edited the note on claim ${number}` : `removed the note on claim ${number}`,
      run: () => setClaim(c.id, index, { note: from }),
    });
  };

  // The last thing done was a verdict on this claim: offer to take it back right where it was given.
  const inlineUndo = last?.judgment && !last.used && last.judgment.checkId === c.id && last.judgment.claim === index ? last : null;
  const abstracts = claim.cites
    .map((ct) => sourceView(c, ct.key).abstract)
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer${shown ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dTitle" ref={panel}>
        <div className="drawer-bar">
          <b>
            Claim {number} of {c.claims.length}
          </b>
          <button type="button" className="icon-btn" disabled={index === 0} onClick={() => onGo(index - 1)} aria-label="Previous claim" title="Previous claim">
            <ChevronLeft className="ic" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={index >= c.claims.length - 1}
            onClick={() => onGo(index + 1)}
            aria-label="Next claim"
            title="Next claim"
          >
            <ChevronRight className="ic" aria-hidden="true" />
          </button>
          <button className="icon-btn d-close" type="button" aria-label="Close details" title="Close" onClick={onClose}>
            <X className="ic" aria-hidden="true" />
          </button>
        </div>
        <div className="drawer-inner">
          <Pill c={c} claim={claim} />
          <p className="d-cite" id="dTitle">
            <Marked segments={compare(claim.sentence, abstracts).sentence} />
          </p>
          <p className="d-verdict">{claimEvidence(c, claim)}</p>
          <div className="judge" role="group" aria-label="Your verdict for this claim">
            <span className="jq">Your verdict: does the source back up your sentence?</span>
            {(Object.keys(JUDGMENT) as Judgment[]).map((k) => {
              const Icon = JUDGE_ICON[k];
              return (
                <button type="button" data-j={k} aria-pressed={claim.judgment === k} onClick={() => judge(k)} key={k}>
                  <b>
                    <Icon className="ic" aria-hidden="true" />
                    {JUDGMENT[k].t}
                  </b>
                  <small>{JUDGMENT[k].help}</small>
                </button>
              );
            })}
            <span className="meta">Siyasat never decides this for you. Click again to clear it.</span>
            <div className="d-undo" aria-live="polite">
              {inlineUndo && (
                <button type="button" className="link" aria-label={`Undo: ${inlineUndo.label}`} onClick={() => runUndo(inlineUndo)}>
                  <Undo2 className="ic" aria-hidden="true" /> Undo {inlineUndo.judgment!.to ? JUDGMENT[inlineUndo.judgment!.to].t : 'clearing the verdict'}
                </button>
              )}
            </div>
          </div>
          {/* Keyed by the sentence so the editor starts from the new text after a re-check or an undo. */}
          <EditSentence key={claim.sentence} id={c.id} index={index} sentence={claim.sentence} />
          <div className="d-note-box">
            <label htmlFor="cnote" className="jq">
              Your note <span className="meta">(optional, e.g. "check Table 2")</span>
            </label>
            <textarea
              id="cnote"
              key={claim.note ?? ''}
              rows={2}
              placeholder="Write a reminder for yourself…"
              defaultValue={claim.note || ''}
              onBlur={(e) => saveNote(e.target.value)}
            />
          </div>
          {claim.cites.map((ct) => (
            <SourceBlock c={c} claim={claim} cite={ct} key={ct.key} />
          ))}
        </div>
      </aside>
    </>
  );
}

/* ---------- The page ---------- */

/** A draft check: each cited sentence next to what its source says, for the author to judge. */
export function DraftResults({ check: c, picker }: { check: DraftCheck; picker: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(null);
  const stats = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);

  const close = () => {
    // Put focus back on the row the panel was opened from.
    const row = open == null ? null : rows.current?.querySelectorAll<HTMLElement>('.drow')[open];
    setOpen(null);
    row?.focus();
  };
  const edit = () => {
    const text = draftText(c);
    startEditing({ id: c.id, name: c.name, input: text.input, refsIn: text.refsIn });
    navigate(paths.newCheck('draft'));
  };

  const tally = tallyClaims(c.claims);
  const reviewed = tally.claims - tally.waiting;

  return (
    <>
      <PageHead
        title={c.name}
        lead={
          <>
            Draft check · {fmtDate(c.date)} · {c.claims.length} claims
            {(c.version ?? 1) > 1 && (
              <>
                {' '}
                · <span className="pill na">Version {c.version}</span>
              </>
            )}
          </>
        }
      >
        {picker}
        <ReportButtons id={c.id} name={c.name} jsonLabel="Data (JSON)" />
        <button type="button" className="primary sm editbtn" onClick={edit}>
          <Pencil className="ic" aria-hidden="true" /> Edit draft
        </button>
      </PageHead>
      {c.combo && c.refResults && <ComboSummary c={c} toClaims={() => stats.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />}
      <p className="oneline">
        <Eye className="ic" aria-hidden="true" />
        <span>Siyasat shows you what each source actually says. You decide if it backs up your sentence. The verdicts below are yours.</span>
      </p>
      <div className="stats" ref={stats}>
        <DraftStats claims={c.claims} />
      </div>
      <div className="reviewbar">
        <span>
          <b>{reviewed}</b> of {tally.claims} claims reviewed
        </span>
        <div className="revbar" role="progressbar" aria-label="Claims reviewed" aria-valuemin={0} aria-valuemax={tally.claims} aria-valuenow={reviewed}>
          <i style={{ width: `${tally.claims ? (reviewed / tally.claims) * 100 : 0}%` }} />
        </div>
      </div>
      {!!c.orphans?.length && (
        <div className="msg info" style={{ margin: '0 0 12px' }}>
          <b>Cited but not in your reference list:</b> {c.orphans.map((o) => o.label).join(', ')}. We matched these by author and year. Add
          them to your reference list to confirm.
        </div>
      )}
      {!!c.uncited?.length && (
        <div className="msg info" style={{ margin: '0 0 12px' }}>
          <b>In your reference list but never cited in the text:</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {c.uncited.map((u, i) => (
              <li key={i}>{u.slice(0, 140)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="drows" ref={rows}>
        {c.claims.map((cl, i) => (
          <button type="button" className="drow" aria-haspopup="dialog" onClick={() => setOpen(i)} key={i}>
            <span className="num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="r-cite">
              <span className="r-quote">{quote(cl.sentence)}</span> <span className="r-by">· cites {cl.cites.map((x) => bareLabel(x.label)).join('; ')}</span>
              <span className="r-verdict">
                {cl.judgment && <b>Your verdict. </b>}
                {claimEvidence(c, cl)}
              </span>
            </span>
            <span className="r-side">
              <Pill c={c} claim={cl} />
              <span className="r-open">
                Details <ChevronRight className="ic" aria-hidden="true" />
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="help" style={{ marginTop: 12 }}>
        Open a claim to read the source's abstract next to your sentence and give your verdict. <mark>Highlighted words</mark> appear in both;{' '}
        <mark className="num">numbers</mark> are highlighted when they match. Shared words are a reading aid, not proof.
      </p>
      {open != null && c.claims[open] && <ClaimDrawer c={c} index={open} onClose={close} onGo={setOpen} />}
    </>
  );
}
