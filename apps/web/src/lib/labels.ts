import type { Judgment, Verdict } from '@siyasat/core';

export const LABEL: Record<Verdict, string> = {
  verified: 'Looks good',
  correction: 'Fix details',
  uncertain: 'Double-check',
  not_found: 'AI-hallucination',
  retracted: 'Retracted',
  error: "Couldn't check",
};

export const EXPLAIN: Record<Verdict, string> = {
  verified: 'This source is real and the details you wrote match the official record.',
  correction: 'This source is real, but some details are wrong. Use the corrected version below.',
  uncertain: "We found a similar record but couldn't confirm the original publication. Check it yourself before citing.",
  not_found:
    "We searched Crossref and OpenAlex and found no paper that matches. This is the classic sign of an AI hallucination (a made-up source). Don't cite it unless you can find the real source.",
  retracted: "This paper was officially withdrawn by its journal. Don't use it as evidence in your work.",
  error: "We couldn't reach the databases for this one. Check your internet connection and try again.",
};

/** The verdicts shown as tiles, legends and choices. `error` is not one a person picks. */
export const MAIN_VERDICTS: Verdict[] = ['verified', 'correction', 'uncertain', 'not_found', 'retracted'];

/* The author's own verdict on a claim. The author picks it, never Siyasat. */
export const JUDGMENT: Record<Judgment, { t: string; cls: string; help: string }> = {
  match: { t: 'Supported', cls: 'ok', help: 'The source says what my sentence says' },
  nomatch: { t: 'Contradicted', cls: 'bad', help: 'The source says something different or the opposite' },
  unsure: { t: 'Unverifiable', cls: 'na', help: "I can't tell from what's available" },
};

export const SAMPLE_REFS = `Navarro, R. T., & Kim, S. (2020). Psychological distress and depressive symptoms during COVID-19 lockdowns: A longitudinal study of twelve countries. International Journal of Pandemic Mental Health, 8(2), 145–162.
LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.
Smith, J., & Bengio, Y. (2012). Deep learning. Nature, 521(7553), 436–444.
10.1038/s41586-020-2649-2
Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.
Wakefield, A. J., Murch, S. H., Anthony, A., et al. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351(9103), 637–641.`;

export const SAMPLE_DRAFT =
  'Recent surveys show that fine-tuning on domain data eliminates hallucination entirely in large language models (Ji et al., 2023). Transformer architectures, which rely on attention rather than recurrence, underpin most modern language models (Vaswani et al., 2017). Scaling these models further raises documented environmental and bias concerns (Bender et al., 2021). Locally, Dela Cruz (2022) reports that over 40% of Filipino graduate students now use AI tools in literature review work.';

export const SAMPLE_DRAFT_WITH_REFS = `During COVID-19 lockdowns, depressive symptoms rose by 27% across twelve countries (Navarro & Kim, 2020). Deep learning allows computational models that are composed of multiple processing layers to learn representations of data with multiple levels of abstraction (LeCun et al., 2015). Deep learning has already replaced every traditional method in speech recognition and drug discovery (LeCun et al., 2015). Some early clinical work linked the MMR vaccine to developmental disorders in 12 children (Wakefield et al., 1998). Array programming with NumPy underpins most scientific computing in Python (Harris et al., 2020).

References
Navarro, R. T., & Kim, S. (2020). Psychological distress and depressive symptoms during COVID-19 lockdowns: A longitudinal study of twelve countries. International Journal of Pandemic Mental Health, 8(2), 145–162.
LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.
Wakefield, A. J., Murch, S. H., Anthony, A., et al. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351(9103), 637–641.
Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.`;

/** The stages shown while a draft is checked: [name, what is happening]. */
export const DRAFT_STAGES: [string, string][] = [
  ['1 · Parse', 'Extracting sentences and their in-text citations…'],
  ['2 · Link', 'Linking citations to resolved references…'],
  ['3 · Retrieve', 'Retrieving abstracts (OpenAlex, Crossref, Europe PMC, Semantic Scholar)…'],
  ['4 · Lay out', 'Putting each claim next to what its source says, for you to judge…'],
  ['5 · Report', 'Compiling report…'],
];

export const fmtDate = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
