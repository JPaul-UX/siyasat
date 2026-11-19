import { analyze, cleanText, parseLibraryFile, splitDraft, splitEntries, type CheckType, type RefsCheck } from '@siyasat/core';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Spinner } from '../components/bits';
import { JobProgress } from '../components/JobProgress';
import { TypeCards } from '../components/TypeCards';
import { UploadZone } from '../components/UploadZone';
import { MAX_DRAFT_SOURCES, runDraftCheck, type DraftProblem } from '../lib/draftCheck';
import { FriendlyError, pdfText, readLibraryText } from '../lib/files';
import { DRAFT_STAGES, SAMPLE_DRAFT, SAMPLE_DRAFT_WITH_REFS, SAMPLE_REFS } from '../lib/labels';
import { paths } from '../lib/nav';
import { saveCheck } from '../store/checks';
import { resetForms, setCorpusFile, setForm, setFormType, stopEditing, useForms } from '../store/forms';
import { eta, runJob, SOFT_LIMIT, useJobs } from '../store/jobs';
import { toast } from '../store/toast';

const TYPES: CheckType[] = ['refs', 'corpus', 'draft'];
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function Steps({ second, running }: { second: string; running: boolean }) {
  return (
    <ol className="steps" aria-label="Progress">
      <li className="done">Choose type</li>
      <li className={running ? 'done' : 'on'}>{second}</li>
      <li className={running ? 'on' : ''}>Verify</li>
    </ol>
  );
}

/** "Start over": clear everything typed, after checking that nothing is running and the user means it. */
function useStartOver(): () => void {
  const navigate = useNavigate();
  return () => {
    const { forms, type, corpusFile } = useForms.getState();
    const dirty = forms[type].input.trim() || forms[type].refsIn.trim() || corpusFile;
    if (useJobs.getState().job) {
      alert('A check is still running. Pause or cancel it first.');
      return;
    }
    if (dirty && !confirm('Start over? This clears everything you added on this page.')) return;
    resetForms();
    navigate(paths.newCheck());
    setTimeout(() => {
      const heading = document.querySelector<HTMLElement>('#main h2');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }, 0);
  };
}

/* ---------- Reference list, and review corpus ---------- */

const FILE_ICON = (
  <svg viewBox="0 0 24 24" width="30" height="30">
    <path d="M6 2h8l6 6v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="#fff" stroke="#771712" strokeWidth="1.6" />
    <path d="M14 2v6h6" fill="#FDF4D9" stroke="#771712" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8 13h8M8 16.5h8M8 9.5h3" stroke="#B8860B" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

function RefsForm({ type, onType }: { type: 'refs' | 'corpus'; onType: (t: CheckType) => void }) {
  const refs = type === 'refs';
  const form = useForms((s) => s.forms[type]);
  const corpusFile = useForms((s) => s.corpusFile);
  const jobId = useJobs((s) => s.job?.id);
  const [started, setStarted] = useState<string | null>(null);
  const [message, setMessage] = useState<ReactNode>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const startOver = useStartOver();
  const running = !!started && jobId === started;
  // Counted from the text as it was a moment ago, so a long list does not slow typing.
  const typedText = useDeferredValue(form.input);
  const detected = useMemo(() => splitEntries(typedText).length, [typedText]);

  const run = async (force?: 'all' | 'first') => {
    if (useJobs.getState().job) return;
    let entries = splitEntries(form.input);
    setMessage(null);
    if (!entries.length) {
      setMessage(
        <div className="msg info">
          {refs ? (
            <>
              Paste at least one reference first, or click <b>Try an example</b>.
            </>
          ) : (
            'Choose a file first, or paste records into the box.'
          )}
        </div>,
      );
      input.current?.focus();
      return;
    }
    if (entries.length > SOFT_LIMIT && !force) {
      setMessage(
        <div className="msg info">
          <b>{entries.length.toLocaleString()} references is a big check.</b> Checking all of them takes {eta(entries.length)}. We check in
          batches and save as we go, so you can pause, close the tab and resume later.
          <div className="choice">
            <button type="button" className="primary" autoFocus onClick={() => void run('all')}>
              Check all {entries.length.toLocaleString()} ({eta(entries.length)})
            </button>
            <button type="button" className="ghost" onClick={() => void run('first')}>
              Check the first {SOFT_LIMIT} only
            </button>
          </div>
        </div>,
      );
      return;
    }
    if (force === 'first') entries = entries.slice(0, SOFT_LIMIT);
    const check: RefsCheck = {
      id: crypto.randomUUID(),
      name: form.name.trim() || (refs ? 'Reference check ' : 'Corpus check ') + new Date().toLocaleDateString(),
      type,
      date: new Date().toISOString(),
      inputs: entries,
      total: entries.length,
      results: [],
      score: 0,
      status: 'running',
      ...(!refs && corpusFile ? { file: corpusFile.file } : {}),
    };
    setStarted(check.id);
    await saveCheck(check);
    void runJob(check.id, entries);
  };

  const loadFile = async (f: File) => {
    setMessage(<div className="msg info">Reading {f.name}…</div>);
    let records: string[] = [];
    let problem = '';
    try {
      const text = await readLibraryText(f);
      if (!text.trim()) throw new FriendlyError('This file is empty.');
      records = parseLibraryFile(f.name, text);
      if (!records.length) {
        problem =
          /^\s*TY\s{1,2}-/m.test(text) || /\.ris$/i.test(f.name)
            ? "We read the file but found no records with a title or DOI. Make sure it's a RIS export with TI (title) or DO (DOI) lines."
            : /@\w+\s*\{/.test(text)
              ? 'We read the BibTeX file but no entry had a title or DOI.'
              : "We couldn't recognise this file. Siyasat reads .ris, .bib (BibTeX) and .csv files with a Title column.";
      }
    } catch (e) {
      problem = e instanceof Error ? e.message : 'The file could not be read.';
    }
    if (problem) {
      setMessage(
        <div className="msg err">
          <b>We couldn't use {f.name}.</b> {problem}
        </div>,
      );
      return;
    }
    // Name the check after the file, unless the user has typed a name of their own.
    const { forms, corpusFile: previous } = useForms.getState();
    const name = forms.corpus.name;
    const follow = !name.trim() || (previous?.autoName != null && name === previous.autoName);
    const autoName = follow ? f.name.replace(/\.(ris|bib|bibtex|csv|txt)$/i, '') : null;
    setCorpusFile({ file: f.name, sizeLabel: `${plural(records.length, 'record')} found · ${(f.size / 1024).toFixed(0)} KB`, autoName });
    setForm('corpus', { name: autoName ?? name, input: records.join('\n') });
    setMessage(
      <div className="msg ok">
        Found <b>{records.length.toLocaleString()}</b> record{records.length > 1 ? 's' : ''} in {f.name}.{' '}
        {records.length > SOFT_LIMIT ? "This is a big file, so we'll check it in batches. " : ''}Click <b>Check my references</b>.
      </div>,
    );
  };
  const removeFile = () => {
    setForm('corpus', { input: '', ...(corpusFile?.autoName != null && form.name === corpusFile.autoName ? { name: '' } : {}) });
    setCorpusFile(null);
    setMessage(null);
  };
  const pick = () => {
    if (file.current) {
      file.current.value = '';
      file.current.click();
    }
  };
  const drag = (e: DragEvent, on: boolean) => {
    e.preventDefault();
    setOver(on);
  };

  return (
    <>
      <h1 className="page-h">New check</h1>
      <p className="lead">Three quick steps. Results arrive in seconds.</p>
      <UploadZone compact />
      <p className="or">— or choose step by step —</p>
      <Steps second="Add sources" running={running} />
      <section className="card">
        <h2>Step 1 · What are you checking?</h2>
        <TypeCards selected={type} onSelect={onType} />
      </section>
      <section className="card">
        <h2>Step 2 · {refs ? 'Paste your references' : 'Upload your library export'}</h2>
        <label className="big" htmlFor="name">
          Name this check <span className="meta">(optional)</span>
        </label>
        <input
          type="text"
          id="name"
          placeholder="e.g. Thesis chapter 2 references"
          value={form.name}
          onChange={(e) => setForm(type, { name: e.target.value })}
        />
        {refs ? (
          <>
            <p className="help" style={{ marginTop: 12 }}>
              Any citation style works (APA, MLA, Chicago…). Put each reference on its own line. A DOI by itself (like 10.1038/nature14539)
              works too.
            </p>
            <label className="big" htmlFor="input">
              Your reference list
            </label>
          </>
        ) : (
          <>
            <p className="help" style={{ marginTop: 12 }}>
              Export your search results or library from Zotero, Mendeley, EndNote, Scopus or Google Scholar as <b>.ris</b>, <b>.bib</b>{' '}
              (BibTeX) or <b>.csv</b>. Each record is checked like a reference.
            </p>
            <input
              ref={file}
              type="file"
              className="sr"
              tabIndex={-1}
              aria-hidden="true"
              accept=".ris,.bib,.bibtex,.csv,.txt,.nbib,.enw"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
              }}
            />
            {corpusFile ? (
              <div className="chip">
                <span className="ficon" aria-hidden="true">
                  {FILE_ICON}
                </span>
                <div className="chipt">
                  <b>{corpusFile.file}</b>
                  <small>
                    <span className="ready">✓ Ready</span> <span>{corpusFile.sizeLabel}</span>
                  </small>
                </div>
                <button type="button" className="ghost" onClick={pick}>
                  Change file
                </button>
                <button type="button" className="link quiet" onClick={removeFile}>
                  ✕ Remove file
                </button>
              </div>
            ) : (
              <div
                className={`drop${over ? ' over' : ''}`}
                role="button"
                tabIndex={0}
                aria-describedby="dropHelp"
                aria-label="Choose a file, or drag and drop it here"
                onClick={pick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick();
                  }
                }}
                onDragEnter={(e) => drag(e, true)}
                onDragOver={(e) => drag(e, true)}
                onDragLeave={(e) => drag(e, false)}
                onDrop={(e) => {
                  drag(e, false);
                  const f = e.dataTransfer.files[0];
                  if (f) void loadFile(f);
                }}
              >
                <span className="dicon" aria-hidden="true">
                  📂
                </span>
                <span>
                  <b>Drag your file here</b> or <span className="fakebtn">Choose a file</span>
                </span>
                <small id="dropHelp">.ris, .bib (BibTeX) or .csv · any size</small>
              </div>
            )}
            <label className="big" htmlFor="input" style={{ marginTop: 12 }}>
              Records found in your file <span className="meta">(you can edit them)</span>
            </label>
          </>
        )}
        <textarea
          id="input"
          ref={input}
          value={form.input}
          onChange={(e) => setForm(type, { input: e.target.value })}
          placeholder={
            refs
              ? 'Example:\nLeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.'
              : 'Records from your file will appear here.'
          }
        />
        <div className="actions">
          <button type="button" className="primary" disabled={running} onClick={() => void run()}>
            {running ? 'Checking…' : 'Check my references'}
          </button>
          {refs && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setForm('refs', { input: SAMPLE_REFS, ...(form.name ? {} : { name: 'Example references' }) });
                setMessage(null);
              }}
            >
              Try an example
            </button>
          )}
          <button
            type="button"
            className="link"
            onClick={() => {
              setForm(type, { input: '' });
              setMessage(null);
              input.current?.focus();
            }}
          >
            {refs ? 'Clear' : 'Clear records'}
          </button>
          <button type="button" className="link" onClick={startOver}>
            ↺ Start over
          </button>
          <span className="count" aria-live="polite">
            {detected} {detected === 1 ? 'reference' : 'references'} detected
          </span>
        </div>
        <div role="alert">{message}</div>
        {started && <JobProgress id={started} />}
      </section>
    </>
  );
}

/* ---------- Draft check ---------- */

interface Snapshot {
  input: string;
  refsIn: string;
}

/**
 * Undo and redo for the draft's two text boxes together. A step is recorded at the end of each word or
 * after a pause in typing, which is finer than a browser's own undo once the text has been set by code.
 */
function useTextHistory(apply: (s: Snapshot) => void) {
  const read = (): Snapshot => {
    const { input, refsIn } = useForms.getState().forms.draft;
    return { input, refsIn };
  };
  const history = useRef<{ steps: Snapshot[]; at: number; timer?: ReturnType<typeof setTimeout> }>({ steps: [read()], at: 0 });
  const [, repaint] = useState(0);

  const record = () => {
    const h = history.current;
    clearTimeout(h.timer);
    h.timer = undefined;
    const now = read();
    const last = h.steps[h.at];
    if (!last || last.input !== now.input || last.refsIn !== now.refsIn) {
      h.steps = [...h.steps.slice(0, h.at + 1), now].slice(-200);
      h.at = h.steps.length - 1;
    }
    repaint((n) => n + 1);
  };
  const move = (by: number) => {
    const h = history.current;
    if (h.timer) record();
    const to = h.at + by;
    if (to < 0 || to >= h.steps.length) return;
    h.at = to;
    apply(h.steps[to]!);
    repaint((n) => n + 1);
    toast(by < 0 ? 'Text change undone' : 'Text change redone');
  };
  /** Call after each keystroke: record now at a word boundary, otherwise after a short pause. */
  const typed = (el: HTMLTextAreaElement, inputType?: string) => {
    const h = history.current;
    clearTimeout(h.timer);
    if (/[\s.,;]$/.test(el.value.slice(0, el.selectionStart)) && inputType !== 'deleteContentBackward') record();
    else h.timer = setTimeout(record, 700);
  };
  useEffect(() => () => clearTimeout(history.current.timer), []);

  const h = history.current;
  return { record, typed, undo: () => move(-1), redo: () => move(1), canUndo: h.at > 0, canRedo: h.at < h.steps.length - 1 };
}

const PROBLEMS: Record<DraftProblem, ReactNode> = {
  empty: (
    <div className="msg info">
      Paste a paragraph with citations first, or click <b>Try the example</b>.
    </div>
  ),
  'no-citations': (
    <div className="msg info">
      We couldn't find any in-text citations. Siyasat looks for forms like <b>(Ji et al., 2023)</b>, <b>Dela Cruz (2022)</b>, or <b>[1]</b>{' '}
      with a numbered reference list.
    </div>
  ),
  'too-many': <div className="msg info">That draft cites more than {MAX_DRAFT_SOURCES} sources. Please check one section at a time.</div>,
  unreachable: <div className="msg err">We couldn't reach the databases. Check your internet connection and try again in a minute.</div>,
};

function DraftForm({ onType }: { onType: (t: CheckType) => void }) {
  const navigate = useNavigate();
  const form = useForms((s) => s.forms.draft);
  const editing = useForms((s) => s.editing);
  const running = useForms((s) => s.draftRunning);
  const [message, setMessage] = useState<ReactNode>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState('');
  const [fileNote, setFileNote] = useState<ReactNode>(null);
  const [refsOpen, setRefsOpen] = useState(() => !!form.refsIn);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const startOver = useStartOver();
  const history = useTextHistory((s) => setForm('draft', s));

  const text = useDeferredValue(form.input);
  const refsText = useDeferredValue(form.refsIn);
  const count = useMemo(() => {
    const a = analyze(text, refsText);
    const cites = a.claims.reduce((sum, c) => sum + c.cites.length, 0);
    const paragraphs = splitDraft(text)
      .prose.split(/\n\s*\n/)
      .filter((x) => x.trim()).length;
    return `${cites} in-text citation${cites === 1 ? '' : 's'} detected in ${paragraphs} paragraph${paragraphs === 1 ? '' : 's'}${a.hasRefs ? ' · reference list found' : ''}`;
  }, [text, refsText]);

  /** Replace the text from code (an example, a file, "Clear") and make it one undo step. */
  const fill = (patch: Partial<Snapshot> & { name?: string }) => {
    setForm('draft', patch);
    setMessage(null);
    history.record();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      history.redo();
    }
  };
  const onText = (field: keyof Snapshot) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setForm('draft', { [field]: e.target.value });
    history.typed(e.target, (e.nativeEvent as InputEvent).inputType);
  };

  const loadFile = async (f: File) => {
    setFileNote(
      <>
        <Spinner /> Reading {f.name}…
      </>,
    );
    try {
      const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      const read = isPdf ? await pdfText(f) : { text: await f.text(), pages: 0, links: 0 };
      const draft = cleanText(read.text)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      fill({ input: draft, refsIn: '', ...(useForms.getState().forms.draft.name ? {} : { name: f.name.replace(/\.[^.]+$/, '') }) });
      const a = analyze(draft, '');
      setFileNote(
        <>
          <span className="filechip-ok">✓ {f.name}</span> {read.pages ? `${read.pages} page${read.pages > 1 ? 's' : ''} · ` : ''}
          {a.claims.length} cited sentences ·{' '}
          {a.hasRefs ? (
            'reference list found'
          ) : (
            <>
              <b>no References heading found</b>, paste the list in "My reference list is separate"
            </>
          )}
          {read.links ? ` · ${read.links} DOI link${read.links > 1 ? 's' : ''} read from the PDF` : ''}
        </>,
      );
    } catch (e) {
      console.error(e);
      setFileNote(
        <>
          <span className="val-bad">Couldn't read that file.</span> If it's a scanned PDF (a picture of text), copy the text from it instead
          and paste it below.
        </>,
      );
    }
  };

  const run = async () => {
    if (running) return;
    setMessage(null);
    setFailed(false);
    useForms.setState({ draftRunning: true });
    const outcome = await runDraftCheck(useForms.getState().forms.draft, editing, {
      // Each stage has its own line of status, until a more specific one replaces it.
      stage: (i) => {
        setStage(i);
        setStatus('');
      },
      status: setStatus,
    });
    useForms.setState({ draftRunning: false });
    setStatus('');
    if (!outcome.ok) {
      setMessage(PROBLEMS[outcome.problem]);
      if (outcome.problem === 'empty') input.current?.focus();
      if (outcome.problem === 'unreachable') setFailed(true);
      return;
    }
    const { check, updated } = outcome;
    if (updated) stopEditing();
    navigate(paths.results(check.id));
    if (updated) {
      // Shown once the results page is up, with a way back to the previous version.
      setTimeout(() => toast(`Updated to version ${check.version} · ${updated.kept} verdict${updated.kept === 1 ? '' : 's'} kept`, updated.undo), 50);
    }
  };

  return (
    <>
      <h1 className="page-h">New check</h1>
      <p className="lead">Choose what you're verifying, paste it, and run.</p>
      <Steps second="Add your sources" running={running} />
      <section className="card">
        <h2>Step 1 · What are you checking?</h2>
        <TypeCards selected="draft" onSelect={onType} />
      </section>
      {editing && (
        <div className="editbar" role="region" aria-label="Editing a saved check">
          <div>
            <b>✏️ Editing your draft: {editing.name}</b>
            <span>
              Change anything below, then press <b>Check again</b>. Your verdicts are kept for sentences you don't change.
            </span>
          </div>
          <button
            type="button"
            className="link"
            onClick={() => {
              stopEditing();
              navigate(paths.results(editing.id));
            }}
          >
            Cancel editing
          </button>
        </div>
      )}
      <section className="card">
        <h2>Step 2 · {editing ? 'Edit your draft' : 'Paste your draft'}</h2>
        <p className="oneline">Siyasat shows you what each source actually says. You decide if it backs up your sentence.</p>
        <label className="big" htmlFor="name">
          Name this check <span className="meta">(optional)</span>
        </label>
        <input
          type="text"
          id="name"
          placeholder="e.g. Results section draft"
          value={form.name}
          onChange={(e) => setForm('draft', { name: e.target.value })}
        />
        <p className="help" style={{ marginTop: 12 }}>
          Paste prose with in-text citations, like <b>(Ji et al., 2023)</b>, <b>Dela Cruz (2022)</b> or <b>[1]</b>. A reference list under a{' '}
          <b>References</b> heading makes matching more reliable, but it's optional.
        </p>
        <div className="edtools" role="toolbar" aria-label="Text undo and redo">
          <button type="button" className="ghost ub" disabled={!history.canUndo} onClick={history.undo}>
            ↶ Undo typing
          </button>
          <button type="button" className="ghost ub" disabled={!history.canRedo} onClick={history.redo}>
            ↷ Redo typing
          </button>
          {editing && (
            <button
              type="button"
              className="ghost ub"
              disabled={form.input === editing.input && form.refsIn === editing.refsIn}
              onClick={() => {
                fill({ input: editing.input, refsIn: editing.refsIn });
                toast('Restored your original draft');
              }}
            >
              ⟲ Undo all changes
            </button>
          )}
          <span className="meta ukeys">Applies to the text boxes only</span>
        </div>
        <div className="pdfup">
          <button type="button" className="ghost" onClick={() => file.current?.click()}>
            📄 Upload your draft (PDF or .txt)
          </button>
          <input
            ref={file}
            type="file"
            className="sr"
            tabIndex={-1}
            aria-hidden="true"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void loadFile(f);
            }}
          />
          <span className="meta" aria-live="polite">
            {fileNote ?? 'or paste the text below. A PDF works best when its References section is included.'}
          </span>
        </div>
        <label className="big" htmlFor="input">
          Your draft
        </label>
        <textarea
          id="input"
          ref={input}
          style={{ minHeight: 220 }}
          spellCheck={false}
          placeholder="Paste your paragraphs here…"
          value={form.input}
          onChange={onText('input')}
          onKeyDown={onKeyDown}
        />
        <details style={{ marginTop: 10 }} open={refsOpen} onToggle={(e) => setRefsOpen(e.currentTarget.open)}>
          <summary style={{ cursor: 'pointer', fontWeight: 650, color: 'var(--maroon)' }}>My reference list is separate (optional)</summary>
          <label className="big" htmlFor="refsIn" style={{ marginTop: 8 }}>
            Reference list
          </label>
          <textarea
            id="refsIn"
            style={{ minHeight: 120 }}
            placeholder="One reference per line"
            value={form.refsIn}
            onChange={onText('refsIn')}
            onKeyDown={onKeyDown}
          />
        </details>
        <div className="actions wiz-run">
          <button type="button" className="primary" disabled={running} onClick={() => void run()}>
            {running ? 'Checking…' : failed ? 'Try again' : editing ? 'Check again' : 'Check claims'}
          </button>
          <span className="count hint" aria-live="polite">
            {count}
          </span>
        </div>
        <div className="actions" style={{ marginTop: 4 }}>
          <button type="button" className="ghost" onClick={() => fill({ input: SAMPLE_DRAFT, refsIn: '', ...(form.name ? {} : { name: 'Results section draft' }) })}>
            Try the example
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => fill({ input: SAMPLE_DRAFT_WITH_REFS, refsIn: '', ...(form.name ? {} : { name: 'Example draft' }) })}
          >
            Example with a reference list
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              fill({ input: '', refsIn: '' });
              input.current?.focus();
            }}
          >
            Clear
          </button>
          <button type="button" className="link" onClick={startOver}>
            ↺ Start over
          </button>
        </div>
        <div role="alert">{message}</div>
        {running && (
          <div className="stepper" aria-hidden="true">
            {DRAFT_STAGES.map(([name], i) => (
              <div className={`step${i < stage ? ' done' : i === stage ? ' active' : ''}`} key={name}>
                <div className="track">
                  <i />
                </div>
                <div className="name">{name}</div>
              </div>
            ))}
          </div>
        )}
        <div className="stage-status" aria-live="polite">
          {running && (
            <>
              <Spinner />
              {status || DRAFT_STAGES[stage]?.[1]}
            </>
          )}
        </div>
      </section>
    </>
  );
}

/* ---------- The page ---------- */

export function NewCheck() {
  const params = useParams();
  const navigate = useNavigate();
  const stored = useForms((s) => s.type);
  const fromUrl = TYPES.includes(params.type as CheckType) ? (params.type as CheckType) : null;
  const type = fromUrl ?? stored;

  // The address decides which form is shown; remember it for the next visit to plain /new.
  useEffect(() => {
    if (fromUrl) setFormType(fromUrl);
  }, [fromUrl]);

  const onType = (t: CheckType) => {
    setFormType(t);
    navigate(paths.newCheck(t));
  };
  return type === 'draft' ? <DraftForm onType={onType} /> : <RefsForm key={type} type={type} onType={onType} />;
}
