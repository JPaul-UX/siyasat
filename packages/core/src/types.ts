/** What Siyasat concluded about one reference. `error` means the lookup itself failed. */
export type Verdict = 'verified' | 'correction' | 'uncertain' | 'not_found' | 'retracted' | 'error';

export const VERDICTS: readonly Verdict[] = ['verified', 'correction', 'uncertain', 'not_found', 'retracted', 'error'];

export interface Author {
  family: string;
  given: string;
}

/** Venue and open-access signals from OpenAlex. Any field may be empty. */
export interface VenueInfo {
  name: string;
  publisher: string;
  type: string;
  doaj: boolean;
  oaVenue: boolean;
  isOa: boolean;
  oaUrl: string;
  cites?: number;
}

/** A reference as the author wrote it, split into the fields we can recognise. */
export interface ParsedRef {
  raw: string;
  doi?: string;
  year?: number;
  authorsText?: string;
  title?: string;
  rest?: string;
  surnames: string[];
  venue?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}

/** A record found in Crossref or OpenAlex that might be the cited work. */
export interface Candidate {
  source: 'Crossref' | 'OpenAlex';
  doi: string;
  title: string;
  authors: Author[];
  year: number | null;
  venue: string;
  volume?: string;
  issue?: string;
  pages: string;
  type?: string;
  cites: number;
  retracted: boolean;
  /** `undefined` means venue info has not been fetched yet; `null` means it was tried and unavailable. */
  ven?: VenueInfo | null;
}

export interface MatchScore {
  total: number;
  tSim: number;
  aOk: number;
  yOk: number;
  vOk: number;
  doiOk: number;
}

export interface Diff {
  field: 'Authors' | 'Year' | 'Title' | 'Venue' | 'Volume' | 'Pages' | 'DOI';
  cited: string;
  actual: string;
  /** The "official" value is probably a later repost or preprint, so it should not be treated as a correction. */
  suspect?: boolean;
  note?: string;
}

/** The matched record, as stored with a result. */
export interface Match {
  doi: string;
  title: string;
  source: 'Crossref' | 'OpenAlex';
  authors: Author[];
  year: number | null;
  venue: string;
  volume?: string;
  issue?: string;
  pages?: string;
  type?: string;
  ven?: VenueInfo | null;
}

/** The stored outcome of checking one reference. */
export interface RefResult {
  raw: string;
  verdict: Verdict;
  confidence?: number;
  note?: string;
  diffs?: Diff[];
  /** APA 7 reference built from the matched record. May contain <i> tags. */
  apa?: string;
  match?: Match | null;
  /** Position of this reference in the list that was checked. */
  i?: number;
  /** Siyasat's own verdict, kept when the author overrides it. */
  auto?: Verdict;
  ovNote?: string;
  /** Draft check only: found by author and year because the draft had no reference list entry. */
  linked?: 'author-year' | null;
  orphan?: boolean;
  weak?: boolean;
}

export interface AbstractInfo {
  text: string | null;
  from: string | null;
  openalex?: string | null;
  isOA?: boolean;
  oaUrl?: string | null;
}

/* ---------- Draft check ---------- */

export type Judgment = 'match' | 'nomatch' | 'unsure';

export interface CiteRef {
  label: string;
  key: string;
}

/** An in-text citation found in a sentence. */
export interface Citation extends CiteRef {
  authors?: string;
  first?: string;
  year?: number;
  num?: number;
  ref?: string;
}

export interface Claim {
  sentence: string;
  cites: CiteRef[];
  judgment: Judgment | null;
  note?: string;
}

/** A distinct source cited in a draft, before it has been looked up. */
export interface SourceInput {
  key: string;
  label: string;
  ref: string | null;
  authors?: string;
  year?: number;
  first?: string;
}

export interface DraftSource {
  key: string;
  label: string;
  ref?: string | null;
  year?: number;
  abstract?: AbstractInfo | null;
}

export interface DraftAnalysis {
  claims: { sentence: string; cites: Citation[]; judgment: null }[];
  sources: SourceInput[];
  orphans: CiteRef[];
  uncited: string[];
  hasRefs: boolean;
}

/* ---------- Saved checks ---------- */

export type CheckType = 'refs' | 'corpus' | 'draft';
export type CheckStatus = 'running' | 'paused' | 'done';

interface CheckBase {
  id: string;
  name: string;
  /** ISO timestamp of when the check ran. */
  date: string;
  score: number;
  results: RefResult[];
  /** Name of the uploaded file, when the check started from one. */
  file?: string;
}

export interface RefsCheck extends CheckBase {
  type: 'refs' | 'corpus';
  total: number;
  status: CheckStatus;
  /** The references still to check. Dropped once the check finishes. */
  inputs?: string[] | null;
  stoppedEarly?: boolean;
}

export interface DraftCheck extends CheckBase {
  type: 'draft';
  v: 2;
  claims: Claim[];
  /** `sources[i]` was looked up as `results[i]`. */
  sources: DraftSource[];
  orphans: CiteRef[];
  uncited: string[];
  hasRefs: boolean;
  input: string;
  refsIn: string;
  /** Came from "Upload & check": the reference list was checked as well. */
  combo?: boolean;
  refResults?: RefResult[];
  refScore?: number;
  version?: number;
  created?: string;
}

export type Check = RefsCheck | DraftCheck;

export type VerdictCounts = Record<Verdict, number>;

/** What the dashboard and lists need to know about a check, without its results. */
export interface CheckSummary {
  id: string;
  name: string;
  type: CheckType;
  date: string;
  score: number;
  counts: VerdictCounts;
  resultCount: number;
  total?: number;
  status?: CheckStatus;
  stoppedEarly?: boolean;
  hasInputs?: boolean;
  file?: string;
  combo?: boolean;
  version?: number;
  draft?: {
    claims: number;
    sources: number;
    match: number;
    nomatch: number;
    unsure: number;
  };
}

/* ---------- Full-text reader ---------- */

export interface FullTextMeta {
  title?: string;
  journal?: string;
  year?: string | number;
  authors?: string;
}

export interface FullTextSection {
  title: string;
  /** Sanitised HTML built from a whitelist of JATS elements. */
  html: string;
}

export interface FullText {
  doi: string;
  kind: 'pmc' | 'oa' | 'none';
  meta?: FullTextMeta;
  /** Services that could not be reached. */
  errors: string[];
  /* kind === 'pmc' */
  pmcid?: string;
  title?: string;
  secs?: FullTextSection[];
  license?: string | null;
  /* kind === 'oa' */
  pdf?: string | null;
  url?: string | null;
  version?: string | null;
  host?: string | null;
}
