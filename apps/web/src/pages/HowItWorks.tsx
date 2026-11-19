/*
 * "How Siyasat works": the method, step by step.
 *
 * Nothing here is written from memory of how the checker behaves. The numbers come from the same table the
 * checker reads (SCORING), and every worked example is computed on the page by the checker's own functions,
 * so the explanation cannot drift away from the code.
 */
import {
  abbreviateJournal,
  CITATION_STYLES,
  diffs,
  evidenceFromText,
  integrityFromCounts,
  parse,
  score,
  SCORING,
  sentenceCase,
  titleCase,
  withoutStops,
  type Candidate,
  type Verdict,
} from '@siyasat/core';
import {
  ArrowRight,
  BookOpenCheck,
  CaseSensitive,
  Database,
  FileSearch,
  FlaskConical,
  Gauge,
  Library,
  ListChecks,
  Quote,
  Scale,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge, PageHead } from '../components/bits';
import { LABEL } from '../lib/labels';
import { paths } from '../lib/nav';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const fixed = (n: number) => n.toFixed(2);

/* ---------- Building blocks ---------- */

function Step({ n, id, icon: Icon, title, lead, children }: { n: number; id: string; icon: LucideIcon; title: string; lead: string; children: ReactNode }) {
  return (
    <section className="card hw-step" id={id} aria-labelledby={`${id}-h`}>
      <header className="hw-step-h">
        <span className="hw-num" aria-hidden="true">
          {n}
        </span>
        <div>
          <h2 id={`${id}-h`}>
            <Icon className="ic" aria-hidden="true" /> {title}
          </h2>
          <p className="help">{lead}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** A box that shows the checker doing the thing just described, on text the reader can change. */
function TryIt({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hw-try">
      <div className="hw-try-h">
        <FlaskConical className="ic" aria-hidden="true" /> {label}
      </div>
      {children}
    </div>
  );
}

/** An ordered list in which each item is tried only if the one before did not settle the matter. */
function Ladder({ items }: { items: [title: string, text: ReactNode][] }) {
  return (
    <ol className="hw-ladder">
      {items.map(([title, text], i) => (
        <li key={title}>
          <span className="hw-rung" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <b>{title}</b>
            <p>{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- 1. Reading ---------- */

const READ_SAMPLE = 'K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image recognition," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit., 2016, pp. 770–778.';
const STYLE_NAME: Record<string, string> = {
  apa: 'APA',
  harvard: 'Harvard',
  mla: 'MLA',
  chicago: 'Chicago',
  ieee: 'IEEE',
  vancouver: 'Vancouver / AMA',
  acs: 'ACS',
  'author-date': 'author–date',
};

function ReadDemo() {
  const [text, setText] = useState(READ_SAMPLE);
  const p = useMemo(() => parse(text.trim()), [text]);
  const rows: [string, string | undefined][] = [
    ['Laid out as', p.style ? STYLE_NAME[p.style] : undefined],
    ['Authors', p.surnames.length ? p.surnames.join(', ') : undefined],
    ['Year', p.year ? String(p.year) : undefined],
    ['Title', p.title],
    ['Journal or book', p.venue],
    ['Volume', p.volume],
    ['Issue', p.issue],
    ['Pages', p.pages],
    ['DOI', p.doi],
  ];
  return (
    <TryIt label="Try it: paste any reference">
      <textarea className="hw-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="A reference to read" spellCheck={false} />
      <dl className="hw-fields">
        {rows.map(([name, value]) => (
          <div key={name} className={value ? '' : 'none'}>
            <dt>{name}</dt>
            <dd>{value || 'not found'}</dd>
          </div>
        ))}
      </dl>
    </TryIt>
  );
}

/* ---------- 3. Scoring ---------- */

const RECORD: Candidate = {
  source: 'Crossref',
  doi: '10.1038/nature14539',
  title: 'Deep learning',
  authors: [
    { family: 'LeCun', given: 'Yann' },
    { family: 'Bengio', given: 'Yoshua' },
    { family: 'Hinton', given: 'Geoffrey' },
  ],
  year: 2015,
  venue: 'Nature',
  volume: '521',
  issue: '7553',
  pages: '436-444',
  type: 'journal-article',
  cites: 60000,
  retracted: false,
};
const CITED = 'Smith, J., & Bengio, Y. (2012). Deep learning. Nature, 521(7553), 436–444.';

function ScoreExample() {
  const p = parse(CITED);
  const s = score(p, RECORD);
  const found = diffs(p, RECORD);
  const w = SCORING.weights;
  const parts: [name: string, weight: number, value: number, why: string][] = [
    ['Title', w.title, s.tSim, 'The same words'],
    ['Authors', w.authors, s.aOk, 'Bengio is on the record; Smith is not'],
    ['Year', w.year, s.yOk, '2012 is not 2015, and not within a year of it'],
    ['Journal', w.venue, s.vOk, 'The same journal'],
  ];
  return (
    <div className="hw-example">
      <div className="hw-pair">
        <div>
          <span className="hw-tag">What was written</span>
          <p className="hw-ref">{CITED}</p>
        </div>
        <ArrowRight className="hw-arrow" aria-hidden="true" />
        <div>
          <span className="hw-tag">The record found</span>
          <p className="hw-ref">LeCun, Y., Bengio, Y., &amp; Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.</p>
        </div>
      </div>
      <div className="hw-scroll">
      <table className="hw-table">
        <thead>
          <tr>
            <th>Part</th>
            <th>Agreement</th>
            <th>Weight</th>
            <th>Counts for</th>
          </tr>
        </thead>
        <tbody>
          {parts.map(([name, weight, value, why]) => (
            <tr key={name}>
              <td>
                <b>{name}</b>
                <small>{why}</small>
              </td>
              <td>
                <span className="hw-bar" aria-hidden="true">
                  <i style={{ width: pct(value) }} />
                </span>
                {fixed(value)}
              </td>
              <td>× {fixed(weight)}</td>
              <td>{fixed(weight * value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Match score</td>
            <td>
              <b>{fixed(s.total)}</b>
            </td>
          </tr>
        </tfoot>
      </table>
      </div>
      <p className="hw-result">
        {fixed(s.total)} is above the bar of {fixed(SCORING.accept)}, so this is the same paper. It is real, but {found.length} details differ (
        {found.map((d) => d.field.toLowerCase()).join(' and ')}), so the verdict is <Badge verdict="correction" />.
      </p>
    </div>
  );
}

/* ---------- 4. Verdicts ---------- */

const VERDICT_RULES: [Verdict, ReactNode][] = [
  ['verified', 'A record was found and nothing you wrote disagrees with it.'],
  ['correction', 'A record was found, but an author, the year, the title, the journal, the volume, the pages or the DOI differs. The differences are listed and a corrected reference is written.'],
  [
    'uncertain',
    <>
      The title was found, but only on a later record that looks like a repost: a preprint dated after the year you gave, or a record more than {SCORING.repost.yearsLater} years later that has
      been cited fewer than {SCORING.repost.citationsBelow} times. The original may not be indexed, so your year is kept and you are asked to check.
    </>,
  ],
  [
    'not_found',
    <>
      The best record scores under {fixed(SCORING.accept)}, or its title is less than {pct(SCORING.titleFloor)} alike and the DOI does not settle it. No real publication matches.
    </>,
  ],
  ['retracted', 'The matched paper has been withdrawn. This overrides every other verdict, even when all the details are right.'],
  ['error', 'A database did not answer, so nothing can be said. A reference is never called made-up because of an outage.'],
];

/* ---------- 6. Integrity score ---------- */

const SAMPLE_COUNTS: Partial<Record<Verdict, number>> = { verified: 14, correction: 3, uncertain: 1, not_found: 2 };

function IntegrityExample() {
  const entries = Object.entries(SAMPLE_COUNTS) as [Verdict, number][];
  const total = entries.reduce((n, [, k]) => n + k, 0);
  const points = entries.reduce((n, [v, k]) => n + k * SCORING.integrity[v], 0);
  return (
    <div className="hw-example">
      <p className="hw-sum">
        A list of {total} references:{' '}
        {entries.map(([v, k], i) => (
          <span key={v}>
            {i > 0 && ' + '}
            {k} × {SCORING.integrity[v]}
          </span>
        ))}{' '}
        = {points.toFixed(1)} points out of {total}, which is a score of <b>{integrityFromCounts(SAMPLE_COUNTS)}</b>.
      </p>
    </div>
  );
}

/* ---------- 7. Capitals and abbreviations ---------- */

const CASE_TITLE = 'Academic Stress Among Filipino Nursing Students During COVID-19: Evidence From Kalawit and Iligan City';
const CASE_ABSTRACT = 'We surveyed 412 nursing students in Kalawit and in Iligan City about academic stress during the pandemic.';

function CaseDemo() {
  const [title, setTitle] = useState(CASE_TITLE);
  const [abstract, setAbstract] = useState(CASE_ABSTRACT);
  const evidence = useMemo(() => evidenceFromText(abstract), [abstract]);
  const names = [...evidence.phrases.map((p) => p.join(' ')), ...[...evidence.proper.values()].filter((w) => !evidence.phrases.some((p) => p.includes(w)))];
  const rows: [string, string][] = [
    ['APA, IEEE', sentenceCase(title, { evidence })],
    ['Harvard, Vancouver', sentenceCase(title, { evidence, subtitle: 'lower' })],
    ['MLA', titleCase(title, { evidence, rules: 'mla' })],
    ['Chicago', titleCase(title, { evidence, rules: 'chicago' })],
  ];
  return (
    <TryIt label="Try it: a title, and a sentence from its abstract">
      <label className="hw-label">
        Title as the database holds it
        <input className="hw-input" value={title} onChange={(e) => setTitle(e.target.value)} spellCheck={false} />
      </label>
      <label className="hw-label">
        Abstract (clear it to see what is lost without one)
        <textarea className="hw-input" rows={2} value={abstract} onChange={(e) => setAbstract(e.target.value)} spellCheck={false} />
      </label>
      <p className="hw-note">{names.length ? <>Names the abstract shows: {names.join(', ')}.</> : 'No abstract: only the word’s shape and the list of names are left to go on.'}</p>
      <dl className="hw-out">
        {rows.map(([style, text]) => (
          <div key={style}>
            <dt>{style}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </TryIt>
  );
}

function JournalDemo() {
  const [name, setName] = useState('Philippine Journal of Science');
  const short = abbreviateJournal(name);
  return (
    <TryIt label="Try it: the standard’s rules on any journal name">
      <input className="hw-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="A journal name" spellCheck={false} />
      <dl className="hw-out">
        <div>
          <dt>IEEE</dt>
          <dd>{short}</dd>
        </div>
        <div>
          <dt>Vancouver</dt>
          <dd>{withoutStops(short)}</dd>
        </div>
      </dl>
    </TryIt>
  );
}

/* ---------- The page ---------- */

const CONTENTS: [id: string, title: string][] = [
  ['read', 'Reading the reference'],
  ['lookup', 'Looking it up'],
  ['score', 'Scoring the match'],
  ['verdict', 'Deciding the verdict'],
  ['retraction', 'Checking for retraction'],
  ['integrity', 'The integrity score'],
  ['write', 'Writing the corrected reference'],
  ['draft', 'Checking a draft'],
  ['limits', 'What it cannot do'],
];

export function HowItWorks() {
  const w = SCORING.weights;
  return (
    <div className="hw">
      <PageHead
        eyebrow={
          <>
            <Workflow className="ic" aria-hidden="true" /> The method
          </>
        }
        title="How Siyasat works"
        lead="Siyasat does not ask an AI whether a source is real. It looks every reference up in the open scholarly record and compares what it finds with what you wrote, by fixed rules. This page sets those rules out, with the real numbers."
      />

      <div className="hw-principles">
        <div>
          <Database className="ic" aria-hidden="true" />
          <b>Looked up, not guessed</b>
          <p>Every verdict rests on a record in Crossref or OpenAlex that you can open and read yourself.</p>
        </div>
        <div>
          <Scale className="ic" aria-hidden="true" />
          <b>The same rules every time</b>
          <p>The same reference always gets the same verdict. There is no model to have a good or a bad day.</p>
        </div>
        <div>
          <ShieldCheck className="ic" aria-hidden="true" />
          <b>Careful with accusations</b>
          <p>If a database is down, the answer is “couldn’t check”. A source is never called made-up for lack of an answer.</p>
        </div>
      </div>

      <nav className="hw-toc" aria-label="On this page">
        <ol>
          {CONTENTS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`}>{title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Step n={1} id="read" icon={ScanText} title="Reading the reference" lead="First the reference is taken apart into authors, year, title, journal, volume, pages and DOI.">
        <p>
          References are laid out differently in each citation style, so Siyasat recognises a reference by its shape: where the year sits, whether the title is in quotation marks, whether
          initials come before or after surnames. It reads APA, Harvard, MLA, Chicago, IEEE, Vancouver, AMA and ACS, and falls back on a looser author–date reading for anything else.
        </p>
        <p>A part that cannot be read is simply left out. It then counts as unknown in the next steps, neither for the reference nor against it.</p>
        <ReadDemo />
      </Step>

      <Step n={2} id="lookup" icon={FileSearch} title="Looking it up" lead="Then the databases are searched, in an order that stops as soon as the answer is clear.">
        <Ladder
          items={[
            ['The DOI, if you gave one', 'Crossref is asked for that exact record. A DOI names one publication, so this is the strongest evidence there is.'],
            ['Crossref, by the whole reference', 'Crossref’s search takes the reference as you wrote it and returns its five closest records.'],
            [
              'OpenAlex, when Crossref is not convincing',
              <>
                If the best record so far scores under {fixed(SCORING.askOpenAlexBelow)}, OpenAlex is searched by title. It indexes more preprints, theses and regional journals than Crossref does.
              </>,
            ],
            [
              'OpenAlex again, when the title matches but details disagree',
              'Some papers have several records: the article, a preprint, a repost. A second search looks for the one that agrees with what you wrote.',
            ],
          ]}
        />
        <p>
          When several records share the title, the one that disagrees with you least is preferred. Each disagreement has a cost: a wrong author or year costs{' '}
          {SCORING.disagreement.authorsOrYear}, any other detail {SCORING.disagreement.otherDetail}, being a preprint {SCORING.disagreement.preprint}, and being dated much later than you said{' '}
          {SCORING.disagreement.muchLater}. A heavily cited record earns a little back, because the version of record is the one people cite.
        </p>
      </Step>

      <Step n={3} id="score" icon={Gauge} title="Scoring the match" lead="Each record is given a score from 0 to 1 for how well it matches what you wrote.">
        <div className="hw-formula" role="img" aria-label={`Score equals ${w.title} times title, plus ${w.authors} times authors, plus ${w.year} times year, plus ${w.venue} times journal`}>
          <span>score</span> = <b>{w.title}</b> × title + <b>{w.authors}</b> × authors + <b>{w.year}</b> × year + <b>{w.venue}</b> × journal
        </div>
        <ul className="hw-list">
          <li>
            <b>Title</b> is the share of words the two titles have in common (twice the shared words, over the words in both). It carries most of the weight because a title is the hardest part
            to get right by accident.
          </li>
          <li>
            <b>Authors</b> is the share of the surnames you wrote that are on the record. Particles and double surnames are allowed for: “Walt” matches “van der Walt”.
          </li>
          <li>
            <b>Year</b> is 1 for the same year, {SCORING.yearOffByOne} for one year out (online and print dates often differ), and 0 otherwise.
          </li>
          <li>
            <b>Journal</b> is how alike the two names are, counting an abbreviation as the name it stands for.
          </li>
          <li>
            A part that could not be read from your reference counts as {SCORING.unknown}: unknown, not wrong.
          </li>
          <li>
            A matching <b>DOI</b> lifts the score to at least {fixed(SCORING.doiFloor)} whatever else differs, because then it is certainly the same publication.
          </li>
        </ul>
        <h3>A worked example</h3>
        <ScoreExample />
      </Step>

      <Step n={4} id="verdict" icon={ListChecks} title="Deciding the verdict" lead="The best record’s score, and what differs from it, decide one of six verdicts.">
        <p>
          A record is accepted as the cited work when it scores {fixed(SCORING.accept)} or more and its title is at least {pct(SCORING.titleFloor)} alike (or the DOI matches). Then each detail is
          compared in turn.
        </p>
        <div className="hw-verdicts">
          {VERDICT_RULES.map(([verdict, rule]) => (
            <div key={verdict}>
              <Badge verdict={verdict} />
              <p>{rule}</p>
            </div>
          ))}
        </div>
        <p className="help">
          You can overrule any verdict and note why. Siyasat’s own verdict is kept beside yours, and reports show both.
        </p>
      </Step>

      <Step n={5} id="retraction" icon={ShieldAlert} title="Checking for retraction" lead="A real paper with perfect details can still be one you must not cite.">
        <p>Every matched record is checked for retraction in three independent ways, and any one of them is enough:</p>
        <ul className="hw-list">
          <li>Crossref’s own record says the paper has been updated by a retraction.</li>
          <li>Crossref holds a separate retraction notice that points at the paper’s DOI.</li>
          <li>OpenAlex, which draws on the Retraction Watch database, marks the paper as retracted.</li>
        </ul>
      </Step>

      <Step n={6} id="integrity" icon={Gauge} title="The integrity score" lead="One number from 0 to 100 for a whole reference list.">
        <p>Each reference earns points by its verdict, and the score is the average, as a percentage.</p>
        <div className="hw-weights">
          {(Object.entries(SCORING.integrity) as [Verdict, number][]).map(([verdict, points]) => (
            <div key={verdict}>
              <Badge verdict={verdict} />
              <b>{points}</b>
            </div>
          ))}
        </div>
        <IntegrityExample />
        <p className="help">
          A reference that could not be checked earns {SCORING.integrity.error}: it is not counted as good, and not held against you either. Check it again when the databases answer.
        </p>
      </Step>

      <Step n={7} id="write" icon={Quote} title="Writing the corrected reference" lead="The matched record is written out in the citation style you choose.">
        <p>A style is three decisions: how names, dates and numbers are arranged; how the title is capitalised; and whether the journal is named in full.</p>
        <div className="hw-scroll">
          <table className="hw-table">
            <thead>
              <tr>
                <th>Style</th>
                <th>List order</th>
                <th>Article titles</th>
                <th>Journal names</th>
              </tr>
            </thead>
            <tbody>
              {CITATION_STYLES.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td>{s.numbered ? 'Numbered, in the order cited' : 'A to Z by author'}</td>
                  <td>{s.titles === 'sentence' ? 'Sentence case' : 'Title Case'}</td>
                  <td>{s.abbreviates ? 'Abbreviated' : 'In full'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Journal articles, books, chapters, conference papers and preprints each have their own layout. What the databases do not hold, such as a book’s editors, is left out and never invented.</p>

        <h3>
          <CaseSensitive className="ic" aria-hidden="true" /> Capitalising the title
        </h3>
        <p>
          Databases hold a title however its publisher typed it. Putting it in Title Case is mechanical. Putting it in sentence case is not, because a Title Case title does not say which of
          its capitals are real: “Bayesian Learning in Python” must become “Bayesian learning in Python”. So each capitalised word is decided on evidence, strongest first:
        </p>
        <Ladder
          items={[
            ['The word’s own shape', '“NumPy”, “mRNA”, “COVID-19” and “BERT” carry capitals or digits that no ordinary word has. They are kept exactly.'],
            [
              'The abstract',
              'Running text shows how words are really written. A word the abstract writes small is ordinary. A word it writes with a capital in mid-sentence is a name, and a run of them (“Mindanao State University”) is one name. Words capitalised only to introduce an abbreviation, as in “Artificial Intelligence (AI)”, are seen through.',
            ],
            [
              'Another copy of the same title',
              'If you typed the title in sentence case, or a second database record has it that way, its mid-sentence capitals were put there on purpose and are believed. Missing capitals are not copied.',
            ],
            ['A list of names', 'Countries, peoples, languages, Philippine provinces and cities, and people whose names became terms (“Bayesian”, “Likert”). A place also lends its capital to “City” or “University” after it.'],
            ['Otherwise, lower case', 'With no sign that a word is a name, it is taken to be an ordinary word.'],
          ]}
        />
        <p>A title that is not in English is left exactly as it is, since other languages have other rules.</p>
        <CaseDemo />

        <h3>
          <Library className="ic" aria-hidden="true" /> Abbreviating the journal
        </h3>
        <p>
          Vancouver and IEEE cite journals by abbreviation: “N Engl J Med”, not “The New England Journal of Medicine”. The abbreviation a journal goes by is a fact, so it is looked up before
          it is worked out:
        </p>
        <Ladder
          items={[
            ['The NLM Catalog', 'The U.S. National Library of Medicine catalogues journals with their official abbreviations. The journal is found there by its ISSN.'],
            ['The publisher’s own short title', 'What the publisher registered with Crossref, when it is a real abbreviation and not the name given again.'],
            [
              'The international standard, ISO 4',
              'Articles and prepositions are dropped, each remaining word is shortened as the standard’s word list says (“Journal” to “J.”, “Medicine” to “Med.”), and a one-word name is never shortened. A word not on the list is kept whole.',
            ],
          ]}
        />
        <JournalDemo />
      </Step>

      <Step n={8} id="draft" icon={BookOpenCheck} title="Checking a draft" lead="For a whole paper, Siyasat also looks at the sentences that cite each source.">
        <ul className="hw-list">
          <li>The draft is split into its text and its reference list, and every in-text citation, such as “(Santos &amp; Cruz, 2021)” or “[4]”, is tied to an entry in the list.</li>
          <li>Each cited source is checked as above. A citation with no entry in the list is searched for by first author and year.</li>
          <li>
            The source’s abstract is fetched, and the sentence in it that shares the most words with yours is shown beside your sentence. Shared words are marked, and so is any number in your
            sentence that the abstract does not contain.
          </li>
          <li>
            <b>You</b> then decide whether the source supports the sentence. Siyasat does not judge meaning; it puts the evidence in front of you.
          </li>
        </ul>
      </Step>

      <section className="card hw-step hw-limits" id="limits" aria-labelledby="limits-h">
        <header className="hw-step-h">
          <span className="hw-num warn" aria-hidden="true">
            <TriangleAlert />
          </span>
          <div>
            <h2 id="limits-h">What it cannot do</h2>
            <p className="help">A checker you can trust says where it stops.</p>
          </div>
        </header>
        <ul className="hw-list">
          <li>
            <b>Not everything is indexed.</b> Some books, theses, reports, and local or older journals are in neither database. A real source of that kind comes back as “{LABEL.not_found}”. Find it
            yourself and overrule the verdict.
          </li>
          <li>
            <b>It does not read the paper.</b> It confirms that a source exists and is cited correctly, not that it says what you claim. That judgment is yours.
          </li>
          <li>
            <b>Capitals are decided on evidence, and evidence can be thin.</b> With no abstract, a rare name that is on no list is written small in sentence case. Read the corrected reference
            before you paste it.
          </li>
          <li>
            <b>Abbreviations outside the catalogue are worked out by rule</b> from a list of the commonest words, so an unusual journal name may be left partly unabbreviated.
          </li>
          <li>
            <b>It is only as right as the databases.</b> A mistake in a publisher’s record shows up as a “difference” in a reference that was in fact correct.
          </li>
        </ul>
        <Link className="btn primary" to={paths.newCheck()}>
          Check your references <ArrowRight className="ic" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
