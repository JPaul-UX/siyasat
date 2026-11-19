/*
 * Every number the checker decides with, in one place. The "How it works" page in the web app shows these
 * same values, so what it explains is what the code does.
 */
export const SCORING = {
  /** How much each part of a reference counts when a database record is compared with it. They add up to 1. */
  weights: { title: 0.6, authors: 0.2, year: 0.1, venue: 0.1 },
  /** The score given to a part that cannot be compared, such as the year of a reference that gives none. */
  unknown: 0.5,
  /** The year score when the two years are one apart. A year off by more scores 0. */
  yearOffByOne: 0.6,
  /** A record with the very DOI that was cited scores at least this much. */
  doiFloor: 0.9,

  /** Below this, Crossref's best record is not convincing and OpenAlex is searched as well. */
  askOpenAlexBelow: 0.8,
  /** A record whose title is this similar is the cited work; among several, the one that disagrees least is taken. */
  sameTitle: 0.85,
  /** How far below the best score a same-title record may be and still be considered. */
  sameTitleWindow: 0.15,

  /** Below this total, no record is the cited work: the reference is not found. */
  accept: 0.62,
  /** Whatever the total, a title less similar than this is a different work, unless the DOI is the same. */
  titleFloor: 0.6,

  /** A cited title less similar than this to the record's title is reported as a difference. */
  titleDiffBelow: 0.9,
  /** A cited venue is reported as different only when it fails all three of these. */
  venueDiff: { similarity: 0.6, coverage: 0.8, abbreviation: 0.6 },
  /** A record this many years later than cited, with fewer citations than this, is taken for a repost. */
  repost: { yearsLater: 2, citationsBelow: 50 },

  /** When several records have the cited title, each disagreement counts against a record like this. */
  disagreement: { muchLater: 3, preprint: 1, authorsOrYear: 2, otherDetail: 1, perTenfoldCitations: 0.5 },

  /** What each verdict contributes to the integrity score, which is the average over a list, times 100. */
  integrity: { verified: 1, uncertain: 0.7, correction: 0.6, error: 0.5, not_found: 0, retracted: 0 },

  /** Draft check: how well a record's title must fit the citing sentence to be taken as the cited paper. */
  authorYearFit: { crossref: 0.3, openalex: 0.25 },
} as const;
