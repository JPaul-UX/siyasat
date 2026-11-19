/*
 * Citation styles, in both directions: reading a reference written in any of the common styles, and writing
 * a matched record out in the style the author needs.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tidyPerson, correctedReference,
  CITATION_STYLES,
  formatReference,
  fromCrossref,
  parse,
  splitEntries,
  verify,
  type Candidate,
  type Citable,
  type Lookups,
} from '../src/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const golden: any = JSON.parse(readFileSync(new URL('./fixtures/legacy-golden.json', import.meta.url), 'utf8'));

/** The same real paper, as each style writes it. */
const LECUN = {
  apa: 'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.',
  harvard: "LeCun, Y., Bengio, Y. and Hinton, G. (2015) 'Deep learning', Nature, 521(7553), pp. 436–444.",
  harvardCurly: 'LeCun, Y., Bengio, Y. and Hinton, G. (2015) ‘Deep learning’, Nature, 521(7553), pp. 436–444.',
  mla: 'LeCun, Yann, et al. "Deep Learning." Nature, vol. 521, no. 7553, 2015, pp. 436–44.',
  chicagoAuthorDate: 'LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. "Deep Learning." Nature 521 (7553): 436–44.',
  chicagoNotes: 'LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. "Deep Learning." Nature 521, no. 7553 (2015): 436–44.',
  ieee: '[1] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436–444, May 2015.',
  vancouver: 'LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-44.',
  vancouverDated: 'LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015 May 28;521(7553):436-44.',
  ama: 'LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-444. doi:10.1038/nature14539',
  acs: 'LeCun, Y.; Bengio, Y.; Hinton, G. Deep Learning. Nature 2015, 521 (7553), 436–444.',
};

describe('reading other styles', () => {
  it.each(Object.entries(LECUN))('%s: every field is read', (_style, raw) => {
    const p = parse(raw);
    expect(p.surnames).toEqual(raw.includes('et al') ? ['lecun'] : ['lecun', 'bengio', 'hinton']);
    expect(p.year).toBe(2015);
    expect(p.title?.toLowerCase()).toBe('deep learning');
    expect(p.venue).toBe('Nature');
    expect(p.volume).toBe('521');
    expect(p.issue).toBe('7553');
    expect(p.pages).toMatch(/^436–44(4)?$/);
  });

  it('says which style it recognised', () => {
    const styles = Object.fromEntries(Object.entries(LECUN).map(([k, raw]) => [k, parse(raw).style]));
    expect(styles).toEqual({
      apa: 'apa', harvard: 'harvard', harvardCurly: 'harvard', mla: 'mla', chicagoAuthorDate: 'chicago', chicagoNotes: 'chicago',
      ieee: 'ieee', vancouver: 'vancouver', vancouverDated: 'vancouver', ama: 'vancouver', acs: 'acs',
    });
  });

  it('does not take an issue number in brackets for the year', () => {
    for (const raw of [LECUN.vancouver, LECUN.ama, LECUN.acs, LECUN.chicagoAuthorDate]) expect(parse(raw).year).toBe(2015);
  });

  it('reads MLA and IEEE references the original only skimmed', () => {
    expect(parse('Ji, Ziwei, et al. “Survey of Hallucination in Natural Language Generation.” ACM Computing Surveys, vol. 55, no. 12, 2023, pp. 1–38.')).toMatchObject({
      style: 'mla', surnames: ['ji'], year: 2023, title: 'Survey of Hallucination in Natural Language Generation',
      venue: 'ACM Computing Surveys', volume: '55', issue: '12', pages: '1–38',
    });
    expect(parse('[12] K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image recognition," in Proc. IEEE CVPR, 2016, pp. 770-778.')).toMatchObject({
      style: 'ieee', surnames: ['he', 'zhang', 'ren', 'sun'], year: 2016, title: 'Deep residual learning for image recognition',
      venue: 'Proc. IEEE CVPR', pages: '770–778',
    });
  });

  it('reads names with particles and two-word surnames', () => {
    expect(parse('Harris CR, Millman KJ, van der Walt SJ. Array programming with NumPy. Nature. 2020;585(7825):357-62.').surnames).toEqual(['harris', 'millman', 'van der walt']);
    expect(parse('J. P. Dela Cruz and M. Santos, "AI tools in literature review work," Mindanao J. Educ., vol. 4, no. 1, pp. 1–15, 2022.').surnames).toEqual(['dela cruz', 'santos']);
    expect(parse('Dela Cruz, Juan, and Maria Santos. "AI Tools in Literature Review Work." Mindanao Journal of Education, vol. 4, no. 1, 2022, pp. 1–15.').surnames).toEqual(['dela cruz', 'santos']);
  });

  it('keeps an APA title that merely opens with a quoted phrase', () => {
    const p = parse('Smith, J. (2020). "New normal" learning in schools. Journal of Things, 3(1), 1–9.');
    expect(p).toMatchObject({ style: 'apa', title: '"New normal" learning in schools', venue: 'Journal of Things' });
  });

  it('reads a book in author-date form', () => {
    expect(parse('Goodfellow, Ian, Yoshua Bengio, and Aaron Courville. 2016. Deep Learning. Cambridge, MA: MIT Press.')).toMatchObject({
      style: 'author-date', surnames: ['goodfellow', 'bengio', 'courville'], year: 2016, title: 'Deep Learning',
    });
  });
});

/* ---------- Checking: the same verdict whatever the style ---------- */

const candidatesFor = (raw: string): Candidate[] =>
  golden.fixtures[`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(raw)}&rows=5`].body.message.items.map(fromCrossref);
const deepLearning = candidatesFor(golden.refs[1]);
const lookups = (found: Candidate[]): Lookups => ({
  crossrefByDoi: async (doi) => found.find((c) => c.doi === doi.toLowerCase()) ?? null,
  crossrefSearch: async () => found.map((c) => ({ ...c })),
  openalexSearch: async () => null,
  enrich: async () => ({ ven: null }),
  crossrefRetractionNotice: async () => false,
});

describe('checking references in other styles', () => {
  it.each(Object.entries(LECUN))('%s: a correct reference is confirmed', async (_style, raw) => {
    const r = await verify(raw, lookups(deepLearning));
    expect(r.diffs).toEqual([]);
    expect(r.verdict).toBe('verified');
    expect(r.match?.doi).toBe('10.1038/nature14539');
  });

  it.each([
    ['Harvard, wrong year', LECUN.harvard.replace('(2015)', '(2012)'), 'Year', '2012', '2015'],
    ['Vancouver, wrong volume', LECUN.vancouver.replace(';521(', ';512('), 'Volume', '512', '521'],
    ['IEEE, wrong pages', LECUN.ieee.replace('436–444', '463–444'), 'Pages', '463–444', '436–444'],
    ['MLA, wrong year', LECUN.mla.replace('2015', '2016'), 'Year', '2016', '2015'],
    ['Chicago, wrong volume', LECUN.chicagoAuthorDate.replace('Nature 521', 'Nature 512'), 'Volume', '512', '521'],
    ['ACS, wrong year', LECUN.acs.replace('Nature 2015', 'Nature 2013'), 'Year', '2013', '2015'],
  ])('%s is caught', async (_name, raw, field, cited, actual) => {
    const r = await verify(raw, lookups(deepLearning));
    expect(r.verdict).toBe('correction');
    expect(r.diffs).toEqual([expect.objectContaining({ field, cited, actual })]);
  });

  it('catches a wrong author in a style that writes initials first', async () => {
    const r = await verify(LECUN.ieee.replace('Y. Bengio', 'J. Smith'), lookups(deepLearning));
    expect(r.verdict).toBe('correction');
    expect(r.diffs?.map((d) => d.field)).toEqual(['Authors']);
  });

  it('does not call a shortened page range or an abbreviated journal an error', async () => {
    const abbreviated = 'LeCun Y, Bengio Y, Hinton G. Deep learning. Nat. 2015;521(7553):436-44.';
    expect((await verify(abbreviated, lookups(deepLearning))).diffs).toEqual([]);
  });

  it('accepts a compound surname with or without its particles', async () => {
    const paper: Candidate = {
      source: 'Crossref', doi: '10.1/numpy', title: 'Array programming with NumPy', year: 2020, venue: 'Nature', volume: '585', issue: '7825',
      pages: '357–362', cites: 1, retracted: false,
      authors: [{ family: 'Harris', given: 'Charles R.' }, { family: 'Millman', given: 'K. Jarrod' }, { family: 'van der Walt', given: 'Stéfan J.' }],
    };
    for (const raw of [
      'Harris, C. R., Millman, K. J., & van der Walt, S. J. (2020). Array programming with NumPy. Nature, 585(7825), 357–362.',
      'Harris, C. R., Millman, K. J., & Walt, S. J. (2020). Array programming with NumPy. Nature, 585(7825), 357–362.',
      'Harris CR, Millman KJ, van der Walt SJ. Array programming with NumPy. Nature. 2020;585(7825):357-62.',
    ]) {
      expect((await verify(raw, lookups([paper]))).verdict, raw).toBe('verified');
    }
    // A different person whose surname merely ends the same way is still a wrong author.
    const wrong = await verify('Harris, C. R., Millman, K. J., & Smith, S. J. (2020). Array programming with NumPy. Nature, 585(7825), 357–362.', lookups([paper]));
    expect(wrong.diffs?.map((d) => d.field)).toEqual(['Authors']);
    const doubleBarrelled: Candidate = { ...paper, authors: [{ family: 'Walker-Smith', given: 'J. A.' }] };
    const smith = await verify('Smith, J. A. (2020). Array programming with NumPy. Nature, 585(7825), 357–362.', lookups([doubleBarrelled]));
    expect(smith.diffs?.map((d) => d.field)).toEqual(['Authors']);
  });

});

describe('splitting a pasted list', () => {
  it('takes one reference per line, in any style', () => {
    const list = [LECUN.vancouver, 'Harris CR, Millman KJ, van der Walt SJ. Array programming with NumPy. Nature. 2020;585(7825):357-62.', LECUN.mla, LECUN.ieee.replace('[1] ', '')];
    expect(splitEntries(list.join('\n'))).toEqual(list);
  });

  it('takes one reference per DOI in a list of DOIs', () => {
    expect(splitEntries('10.1038/nature14539\nhttps://doi.org/10.1038/s41586-020-2649-2\ndoi:10.1109/cvpr.2016.90')).toEqual([
      '10.1038/nature14539', 'https://doi.org/10.1038/s41586-020-2649-2', 'doi:10.1109/cvpr.2016.90',
    ]);
  });

  it('still joins a DOI on its own line to the reference above it', () => {
    expect(splitEntries(`${LECUN.apa}\nhttps://doi.org/10.1038/nature14539\n${LECUN.acs}`)).toEqual([
      `${LECUN.apa} https://doi.org/10.1038/nature14539`, LECUN.acs,
    ]);
  });

  it('takes blank-line separated references whose lines are wrapped, in any style', () => {
    const wrapped = 'LeCun Y, Bengio Y, Hinton G. Deep learning.\nNature. 2015;521(7553):436-44.\n\nHarris CR, Millman KJ, van der Walt SJ. Array programming\nwith NumPy. Nature. 2020;585(7825):357-62.';
    expect(splitEntries(wrapped)).toEqual([
      'LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-44.',
      'Harris CR, Millman KJ, van der Walt SJ. Array programming with NumPy. Nature. 2020;585(7825):357-62.',
    ]);
  });
});

/* ---------- Writing ---------- */

const article: Citable = {
  authors: [{ family: 'LeCun', given: 'Yann' }, { family: 'Bengio', given: 'Yoshua' }, { family: 'Hinton', given: 'Geoffrey' }],
  year: 2015, title: 'Deep learning', venue: 'Nature', volume: '521', issue: '7553', pages: '436–444', doi: '10.1038/nature14539',
};
const many = (n: number): Citable => ({ ...article, authors: Array.from({ length: n }, (_, i) => ({ family: `Author${i + 1}`, given: 'Ana Maria' })) });

describe('writing a reference in each style', () => {
  it('a journal article with three authors', () => {
    expect(Object.fromEntries(CITATION_STYLES.map((s) => [s.id, formatReference(article, s.id)]))).toEqual({
      apa: 'LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. <i>Nature</i>, <i>521</i>(7553), 436–444. https://doi.org/10.1038/nature14539',
      mla: 'LeCun, Yann, et al. “Deep Learning.” <i>Nature</i>, vol. 521, no. 7553, 2015, pp. 436–444, https://doi.org/10.1038/nature14539.',
      chicago: 'LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. “Deep Learning.” <i>Nature</i> 521 (7553): 436–444. https://doi.org/10.1038/nature14539.',
      harvard: 'LeCun, Y., Bengio, Y. and Hinton, G. (2015) ‘Deep learning’, <i>Nature</i>, 521(7553), pp. 436–444. Available at: https://doi.org/10.1038/nature14539.',
      ieee: 'Y. LeCun, Y. Bengio, and G. Hinton, “Deep learning,” <i>Nature</i>, vol. 521, no. 7553, pp. 436–444, 2015, doi: 10.1038/nature14539.',
      vancouver: 'LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-44. doi: 10.1038/nature14539.',
    });
  });

  it('one and two authors', () => {
    const one = { ...article, authors: article.authors.slice(0, 1) };
    const two = { ...article, authors: article.authors.slice(0, 2) };
    expect(formatReference(one, 'mla')).toMatch(/^LeCun, Yann\. “/);
    expect(formatReference(two, 'mla')).toMatch(/^LeCun, Yann, and Yoshua Bengio\. “/);
    expect(formatReference(two, 'chicago')).toMatch(/^LeCun, Yann, and Yoshua Bengio\. 2015\./);
    expect(formatReference(two, 'harvard')).toMatch(/^LeCun, Y\. and Bengio, Y\. \(2015\)/);
    expect(formatReference(two, 'ieee')).toMatch(/^Y\. LeCun and Y\. Bengio, “/);
    expect(formatReference(one, 'vancouver')).toMatch(/^LeCun Y\. Deep learning\./);
  });

  it('long author lists are cut the way each style says', () => {
    expect(formatReference(many(4), 'harvard')).toMatch(/^Author1, A\.M\. <i>et al\.<\/i> \(2015\)/);
    expect(formatReference(many(7), 'ieee')).toMatch(/^A\. M\. Author1 <i>et al\.<\/i>, “/);
    expect(formatReference(many(6), 'ieee')).toContain('A. M. Author5, and A. M. Author6, “');
    expect(formatReference(many(7), 'vancouver')).toMatch(/^Author1 AM, .*Author6 AM, et al\. Deep learning\./);
    expect(formatReference(many(11), 'chicago')).toMatch(/Ana Maria Author7, et al\. 2015\./);
    expect(formatReference(many(10), 'chicago')).toContain('and Ana Maria Author10. 2015.');
  });

  it('copes with what a record may lack', () => {
    const bare: Citable = { authors: [], year: null, title: 'Does it work?', venue: '', doi: '' };
    expect(formatReference(bare, 'apa')).toBe('(n.d.). <i>Does it work?</i>');
    expect(formatReference(bare, 'mla')).toBe('<i>Does It Work?</i>');
    expect(formatReference(bare, 'chicago')).toBe('n.d. <i>Does It Work?</i>');
    expect(formatReference(bare, 'harvard')).toBe('(no date) <i>Does it work?</i>');
    expect(formatReference(bare, 'ieee')).toBe('<i>Does It Work?</i>.');
    expect(formatReference(bare, 'vancouver')).toBe('Does it work?');
    const question = { ...article, title: 'Can language models be too big?', issue: undefined, pages: '610' };
    expect(formatReference(question, 'ieee')).toContain('“Can language models be too big?” <i>Nature</i>, vol. 521, p. 610, 2015');
    expect(formatReference(question, 'mla')).toContain('“Can Language Models Be Too Big?” <i>Nature</i>, vol. 521, 2015, p. 610,');
    expect(formatReference(question, 'chicago')).toContain('<i>Nature</i> 521: 610.');
    expect(formatReference(question, 'vancouver')).toContain('Can language models be too big? Nature. 2015;521:610.');
  });

  it('drops a "RETRACTED:" prefix from the title, as the APA form does', () => {
    for (const s of CITATION_STYLES) expect(formatReference({ ...article, title: 'RETRACTED: Deep learning' }, s.id)).not.toContain('RETRACTED');
  });

  const A = (family: string, given: string) => ({ family, given });
  const all = (record: Citable) => Object.fromEntries(CITATION_STYLES.map((s) => [s.id, formatReference(record, s.id)]));

  it('a book, with its publisher and place', () => {
    const book: Citable = { authors: [A('Goodfellow', 'Ian'), A('Bengio', 'Yoshua'), A('Courville', 'Aaron')], year: 2016, title: 'Deep Learning', venue: '', publisher: 'MIT Press', place: 'Cambridge, MA', doi: '', type: 'book' };
    expect(all(book)).toEqual({
      apa: 'Goodfellow, I., Bengio, Y., & Courville, A. (2016). <i>Deep learning.</i> MIT Press.',
      mla: 'Goodfellow, Ian, et al. <i>Deep Learning.</i> MIT Press, 2016.',
      chicago: 'Goodfellow, Ian, Yoshua Bengio, and Aaron Courville. 2016. <i>Deep Learning.</i> Cambridge, MA: MIT Press.',
      harvard: 'Goodfellow, I., Bengio, Y. and Courville, A. (2016) <i>Deep learning.</i> Cambridge, MA: MIT Press.',
      ieee: 'I. Goodfellow, Y. Bengio, and A. Courville, <i>Deep Learning</i>. Cambridge, MA: MIT Press, 2016.',
      vancouver: 'Goodfellow I, Bengio Y, Courville A. Deep learning. Cambridge, MA: MIT Press; 2016.',
    });
  });

  it('a chapter, inside its book and with its editors', () => {
    const chapter: Citable = {
      authors: [A('Rumelhart', 'David E.'), A('Hinton', 'Geoffrey E.')], year: 1986, title: 'Learning Internal Representations by Error Propagation',
      venue: 'Parallel distributed processing', publisher: 'MIT Press', place: 'Cambridge, MA', editors: [A('Rumelhart', 'David E.'), A('McClelland', 'James L.')],
      pages: '318-362', doi: '10.7551/mitpress/5236.003.0012', type: 'book-chapter',
    };
    expect(all(chapter)).toEqual({
      apa: 'Rumelhart, D. E., & Hinton, G. E. (1986). Learning internal representations by error propagation. In D. E. Rumelhart & J. L. McClelland (Eds.), <i>Parallel distributed processing</i> (pp. 318–362). MIT Press. https://doi.org/10.7551/mitpress/5236.003.0012',
      mla: 'Rumelhart, David E., and Geoffrey E. Hinton. “Learning Internal Representations by Error Propagation.” <i>Parallel Distributed Processing</i>, edited by David E. Rumelhart and James L. McClelland, MIT Press, 1986, pp. 318–362, https://doi.org/10.7551/mitpress/5236.003.0012.',
      chicago: 'Rumelhart, David E., and Geoffrey E. Hinton. 1986. “Learning Internal Representations by Error Propagation.” In <i>Parallel Distributed Processing</i>, edited by David E. Rumelhart and James L. McClelland, 318–362. Cambridge, MA: MIT Press. https://doi.org/10.7551/mitpress/5236.003.0012.',
      harvard: 'Rumelhart, D.E. and Hinton, G.E. (1986) ‘Learning internal representations by error propagation’, in Rumelhart, D.E. and McClelland, J.L. (eds.) <i>Parallel distributed processing</i>. Cambridge, MA: MIT Press, pp. 318–362. Available at: https://doi.org/10.7551/mitpress/5236.003.0012.',
      ieee: 'D. E. Rumelhart and G. E. Hinton, “Learning internal representations by error propagation,” in <i>Parallel Distributed Processing</i>, D. E. Rumelhart and J. L. McClelland, Eds. Cambridge, MA: MIT Press, 1986, pp. 318–362, doi: 10.7551/mitpress/5236.003.0012.',
      vancouver: 'Rumelhart DE, Hinton GE. Learning internal representations by error propagation. In: Rumelhart DE, McClelland JL, editors. Parallel distributed processing. Cambridge, MA: MIT Press; 1986. p. 318-62. doi: 10.7551/mitpress/5236.003.0012.',
    });
    // What the database does not hold is left out, not invented.
    expect(formatReference({ ...chapter, editors: [], publisher: undefined, place: undefined }, 'apa')).toBe(
      'Rumelhart, D. E., & Hinton, G. E. (1986). Learning internal representations by error propagation. In <i>Parallel distributed processing</i> (pp. 318–362). https://doi.org/10.7551/mitpress/5236.003.0012',
    );
  });

  it('a conference paper, as part of its proceedings', () => {
    const paper: Citable = {
      authors: [A('He', 'Kaiming'), A('Zhang', 'Xiangyu')], year: 2016, title: 'Deep Residual Learning for Image Recognition',
      venue: '2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)', publisher: 'IEEE', pages: '770-778', doi: '10.1109/cvpr.2016.90', type: 'proceedings-article',
    };
    expect(formatReference(paper, 'apa')).toBe(
      'He, K., & Zhang, X. (2016). Deep residual learning for image recognition. In <i>2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)</i> (pp. 770–778). IEEE. https://doi.org/10.1109/cvpr.2016.90',
    );
    expect(formatReference(paper, 'ieee')).toBe('K. He and X. Zhang, “Deep residual learning for image recognition,” in <i>2016 IEEE Conf. Comput. Vis. Pattern Recognit.</i>, 2016, pp. 770–778, doi: 10.1109/cvpr.2016.90.');
    expect(formatReference(paper, 'vancouver')).toContain('In: 2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR). IEEE; 2016. p. 770-8.');
    // The volume of proceedings itself is named after the conference, which keeps its capitals.
    const volume: Citable = { authors: [], year: 2021, title: 'Proceedings of the 2021 ACM Conference on Fairness, Accountability, and Transparency', venue: '', publisher: 'ACM', doi: '10.1145/3442188', type: 'proceedings' };
    expect(formatReference(volume, 'apa')).toBe('(2021). <i>Proceedings of the 2021 ACM Conference on Fairness, Accountability, and Transparency.</i> ACM. https://doi.org/10.1145/3442188');
  });

  it('a preprint, with the server that holds it', () => {
    const preprint: Citable = { authors: [A('Vaswani', 'Ashish')], year: 2017, title: 'Attention Is All You Need', venue: '', publisher: 'arXiv', doi: '10.48550/arxiv.1706.03762', type: 'posted-content' };
    expect(all(preprint)).toEqual({
      apa: 'Vaswani, A. (2017). <i>Attention is all you need.</i> arXiv. https://doi.org/10.48550/arxiv.1706.03762',
      mla: 'Vaswani, Ashish. “Attention Is All You Need.” arXiv, 2017, https://doi.org/10.48550/arxiv.1706.03762.',
      chicago: 'Vaswani, Ashish. 2017. “Attention Is All You Need.” arXiv. https://doi.org/10.48550/arxiv.1706.03762.',
      harvard: 'Vaswani, A. (2017) ‘Attention is all you need’. arXiv. Available at: https://doi.org/10.48550/arxiv.1706.03762.',
      ieee: 'A. Vaswani, “Attention is all you need,” arXiv, 2017, doi: 10.48550/arxiv.1706.03762.',
      vancouver: 'Vaswani A. Attention is all you need. arXiv; 2017. doi: 10.48550/arxiv.1706.03762.',
    });
  });

  it('capitalises the title the way each style asks, whatever the database holds', () => {
    const titled = { ...article, title: 'The NumPy Array: A Structure for Efficient Numerical Computation' };
    const sentence = { ...article, title: 'The NumPy array: a structure for efficient numerical computation' };
    for (const record of [titled, sentence]) {
      expect(formatReference(record, 'apa')).toContain('The NumPy array: A structure for efficient numerical computation.');
      expect(formatReference(record, 'ieee')).toContain('“The NumPy array: A structure for efficient numerical computation,”');
      expect(formatReference(record, 'harvard')).toContain('‘The NumPy array: a structure for efficient numerical computation’');
      expect(formatReference(record, 'vancouver')).toContain('The NumPy array: a structure for efficient numerical computation.');
      expect(formatReference(record, 'mla')).toContain('“The NumPy Array: A Structure for Efficient Numerical Computation.”');
      expect(formatReference(record, 'chicago')).toContain('“The NumPy Array: A Structure for Efficient Numerical Computation.”');
    }
    // A title the checker has already settled, using the abstract, is what every style starts from.
    const settled = { ...article, title: 'A Survey of Students in Santo Tomas', titleSentence: 'A survey of students in Santo Tomas' };
    expect(formatReference(settled, 'apa')).toContain('A survey of students in Santo Tomas.');
    expect(formatReference(settled, 'mla')).toContain('“A Survey of Students in Santo Tomas.”');
  });

  it('a corrected reference learns names from the way the author typed the title', () => {
    const match = { ...article, title: 'Flood Risk in Kalawit and Labason', source: 'Crossref' as const, type: 'journal-article' };
    const typed = 'Reyes, A. (2015). Flood risk in Kalawit and Labason. Nature, 521(7553), 436–444.';
    expect(correctedReference({ raw: typed, verdict: 'verified', match }, 'apa')).toContain('Flood risk in Kalawit and Labason.');
    expect(correctedReference({ raw: typed.replace('Flood risk in Kalawit and Labason', 'Flood Risk in Kalawit and Labason'), verdict: 'verified', match }, 'apa')).toContain('Flood risk in kalawit and labason.');
    expect(correctedReference({ raw: typed, verdict: 'not_found', match: null }, 'apa')).toBeNull();
  });

  it('writes a name the database holds in capitals the usual way', () => {
    const shouting = { ...article, authors: [A('RUMELHART', 'D.E.'), A('VAN DER WALT', 'STEFAN J.'), A('LI', 'WEI')] };
    expect(formatReference(shouting, 'apa')).toMatch(/^Rumelhart, D\. E\., van der Walt, S\. J\., & Li, W\. \(2015\)/);
    expect(formatReference(shouting, 'chicago')).toMatch(/^Rumelhart, D\.E\., Stefan J\. van der Walt, and Wei Li\./);
    // Names with lower-case letters are as their owners write them.
    expect(formatReference({ ...article, authors: [A('LeCun', 'Yann'), A('de la Cruz', 'J')] }, 'apa')).toMatch(/^LeCun, Y\., & de la Cruz, J\./);
    expect(tidyPerson(A('HE', 'K')) ).toEqual(A('HE', 'K'));
  });

  it('writes what it reads: each style round-trips through the reader', () => {
    for (const s of CITATION_STYLES) {
      const p = parse(formatReference(article, s.id).replace(/<\/?i>/g, ''));
      expect(p, s.id).toMatchObject({ year: 2015, venue: 'Nature', volume: '521', issue: '7553', doi: '10.1038/nature14539' });
      expect(p.title?.toLowerCase(), s.id).toBe('deep learning');
      expect(p.surnames[0], s.id).toBe('lecun');
    }
  });
});
