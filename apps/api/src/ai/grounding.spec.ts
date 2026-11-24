import { describe, expect, it } from 'vitest';
import { record } from '../../test/ai-fakes.js';
import { authorsText, cleanDoi, confirmsReference, groundReport, normalizeUrl, SeenPages, type GroundingContext, type Report } from './grounding.js';

const REF = 'Santos, A., & Reyes, B. (2021). Mangrove loss and coastal flooding in Eastern Samar. Journal of Philippine Ecology, 14(2), 33–51.';
const NOW = new Date('2026-11-24T00:00:00Z');

function ctx(over: Partial<GroundingContext> = {}): GroundingContext {
  const seen = new SeenPages();
  seen.add('https://www.example.edu/repo/mangrove-loss?utm_source=x#top', 'Mangrove loss and coastal flooding in Eastern Samar');
  return { reference: REF, seen, searchesDone: 2, queries: ['"Mangrove loss and coastal flooding"'], model: 'test/model', now: NOW, ...over };
}

const report = (over: Partial<Report> = {}): Report => ({
  outcome: 'found',
  summary: 'It is in the university repository.',
  work: { title: 'Mangrove loss and coastal flooding in Eastern Samar', url: 'http://example.edu/repo/mangrove-loss/' },
  sources: ['https://example.edu/repo/mangrove-loss'],
  ...over,
});

describe('web addresses', () => {
  it('compare equal whatever the scheme, www, tracking, fragment or trailing slash', () => {
    const forms = ['https://www.Example.edu/a/b/?utm_campaign=z#x', 'http://example.edu/a/b', 'https://example.edu/a/b/'];
    expect(new Set(forms.map(normalizeUrl)).size).toBe(1);
  });

  it('keep the query that identifies a page', () => {
    expect(normalizeUrl('https://books.google.com/books?id=abc')).not.toBe(normalizeUrl('https://books.google.com/books?id=xyz'));
  });

  it('are refused when they are not web addresses', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
    expect(normalizeUrl('ftp://example.org/file')).toBeNull();
  });
});

describe('DOIs', () => {
  it('are read out of whatever the model wrote', () => {
    expect(cleanDoi('https://doi.org/10.1038/Nature14539.')).toBe('10.1038/nature14539');
    expect(cleanDoi('doi:10.1000/xyz123)')).toBe('10.1000/xyz123');
    expect(cleanDoi('no doi here')).toBeNull();
    expect(cleanDoi(undefined)).toBeNull();
  });

  it('confirm the reference only when the record has its title', () => {
    expect(confirmsReference(REF, record({ title: 'Mangrove loss and coastal flooding in Eastern Samar' }))).toBe(true);
    expect(confirmsReference(REF, record({ title: 'Deep learning' }))).toBe(false);
  });
});

describe('authors', () => {
  it('are named briefly', () => {
    const a = (...families: string[]) => record({ authors: families.map((family) => ({ family, given: '' })) });
    expect(authorsText(a('Lee'))).toBe('Lee');
    expect(authorsText(a('Lee', 'Park'))).toBe('Lee & Park');
    expect(authorsText(a('Lee', 'Park', 'Cruz', 'Tan'))).toBe('Lee, Park, Cruz et al.');
    expect(authorsText(a())).toBeUndefined();
  });
});

describe('grounding the report', () => {
  it('keeps a "found" backed by a page the searches returned, with that page’s own title', () => {
    const finding = groundReport(report(), ctx());
    expect(finding.outcome).toBe('found');
    expect(finding.sources).toEqual([{ url: 'https://www.example.edu/repo/mangrove-loss?utm_source=x#top', title: 'Mangrove loss and coastal flooding in Eastern Samar' }]);
    expect(finding.work?.url).toBe('https://www.example.edu/repo/mangrove-loss?utm_source=x#top');
    expect(finding.adjusted).toBeUndefined();
  });

  it('lists each page once', () => {
    const finding = groundReport(report({ sources: ['https://example.edu/repo/mangrove-loss', 'http://www.example.edu/repo/mangrove-loss/'] }), ctx());
    expect(finding.sources).toHaveLength(1);
  });

  it('turns "found" with nothing to show into "inconclusive"', () => {
    const finding = groundReport(report({ sources: ['https://invented.example/x'], work: { title: 'Mangrove loss and coastal flooding in Eastern Samar' } }), ctx());
    expect(finding.outcome).toBe('inconclusive');
    expect(finding.sources).toEqual([]);
    expect(finding.adjusted).toBe(
      '1 address the AI gave did not come from its searches and was left out. The AI said it found the work but could not point to a page that shows it.',
    );
  });

  it('turns "found" without saying what was found into "inconclusive"', () => {
    expect(groundReport(report({ work: undefined }), ctx()).outcome).toBe('inconclusive');
  });

  it('does not call a work with another title the cited one', () => {
    const finding = groundReport(report({ work: { title: 'Seagrass meadows of Palawan', url: 'https://example.edu/repo/mangrove-loss' } }), ctx());
    expect(finding.outcome).toBe('inconclusive');
    expect(finding.adjusted).toMatch(/different title/);
  });

  it('accepts a confirmed DOI as evidence on its own, and takes the details from Crossref', () => {
    const crossref = record({ doi: '10.5555/jpe.2021.14.2.33', title: 'Mangrove loss and coastal flooding in Eastern Samar', authors: [{ family: 'Santos', given: 'A.' }, { family: 'Reyes', given: 'B.' }], year: 2021, venue: 'Journal of Philippine Ecology' });
    const finding = groundReport(report({ sources: [], work: { title: 'Mangrove Loss', year: 2020, doi: '10.5555/jpe.2021.14.2.33' } }), ctx({ confirmedDoi: { doi: crossref.doi, record: crossref } }));
    expect(finding.outcome).toBe('found');
    expect(finding.work).toEqual({ title: crossref.title, authors: 'Santos & Reyes', year: 2021, venue: 'Journal of Philippine Ecology', doi: '10.5555/jpe.2021.14.2.33' });
  });

  it('does not trust "not found" when no search worked', () => {
    const finding = groundReport(report({ outcome: 'not_found', sources: [], work: undefined }), ctx({ searchesDone: 0 }));
    expect(finding.outcome).toBe('inconclusive');
  });

  it('shows no work for "not found"', () => {
    const finding = groundReport(report({ outcome: 'not_found' }), ctx());
    expect(finding.outcome).toBe('not_found');
    expect(finding.work).toBeUndefined();
  });

  it('drops impossible years and tidies long text', () => {
    const finding = groundReport(
      report({ summary: `  ${'word '.repeat(300)} `, work: { title: 'Mangrove loss and coastal flooding in Eastern Samar', year: 2099, authors: '  ', url: 'https://example.edu/repo/mangrove-loss' } }),
      ctx(),
    );
    expect(finding.work?.year).toBeUndefined();
    expect(finding.work?.authors).toBeUndefined();
    expect(finding.summary.length).toBeLessThanOrEqual(700);
    expect(finding.summary.endsWith('…')).toBe(true);
  });
});
