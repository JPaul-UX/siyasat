/* Abbreviating journal names by ISO 4, for when no catalogue has recorded an abbreviation. */
import { describe, expect, it } from 'vitest';
import { abbreviateJournal, formatReference, isAbbreviated, withoutStops, withStops, type Citable } from '../src/index.js';

describe('ISO 4 abbreviation', () => {
  it.each([
    ['The New England Journal of Medicine', 'N. Engl. J. Med.'],
    ['Journal of the American Medical Association', 'J. Am. Med. Assoc.'],
    ['IEEE Transactions on Pattern Analysis and Machine Intelligence', 'IEEE Trans. Pattern Anal. Mach. Intell.'],
    ['Proceedings of the National Academy of Sciences', 'Proc. Natl. Acad. Sci.'],
    ['International Journal of Environmental Research and Public Health', 'Int. J. Environ. Res. Public Health'],
    ['Journal of Machine Learning Research', 'J. Mach. Learn. Res.'],
    ['Philippine Journal of Science', 'Philipp. J. Sci.'],
    ['Asia Pacific Journal of Multidisciplinary Research', 'Asia Pac. J. Multidiscip. Res.'],
    ['Computers & Education', 'Comput. Educ.'],
    ['BMC Medical Education', 'BMC Med. Educ.'],
    ['Annals of Internal Medicine', 'Ann. Intern. Med.'],
    ['Neural Networks', 'Neural Netw.'],
  ])('%s', (name, want) => {
    expect(abbreviateJournal(name)).toBe(want);
  });

  it('never abbreviates a name of one word, with or without its article', () => {
    expect(abbreviateJournal('Nature')).toBe('Nature');
    expect(abbreviateJournal('The Lancet')).toBe('Lancet');
    expect(abbreviateJournal('Science')).toBe('Science');
  });

  it('keeps names written in capitals', () => {
    expect(abbreviateJournal('PLOS ONE')).toBe('PLOS ONE');
  });

  it('leaves a name whole when none of its words is on the list', () => {
    expect(abbreviateJournal('Kritika Kultura')).toBe('Kritika Kultura');
    expect(abbreviateJournal('Tambara of the Ateneo')).toBe('Tambara of the Ateneo');
  });

  it('writes an abbreviation with or without its full stops', () => {
    expect(withoutStops('J. Am. Med. Assoc.')).toBe('J Am Med Assoc');
    expect(withStops('N Engl J Med', 'The New England Journal of Medicine')).toBe('N. Engl. J. Med.');
    expect(withStops('IEEE Trans Pattern Anal Mach Intell', 'IEEE Transactions on Pattern Analysis and Machine Intelligence')).toBe('IEEE Trans. Pattern Anal. Mach. Intell.');
    // A word that was contracted rather than cut short is still shortened; one given whole gets no stop.
    expect(withStops('Proc Natl Acad Sci', 'Proceedings of the National Academy of Sciences')).toBe('Proc. Natl. Acad. Sci.');
    expect(withStops('Int J Environ Res Public Health', 'International Journal of Environmental Research and Public Health')).toBe('Int. J. Environ. Res. Public Health');
    expect(withStops('Nature', 'Nature')).toBe('Nature');
  });

  it('tells a real abbreviation from the name given again', () => {
    expect(isAbbreviated('N Engl J Med', 'New England Journal of Medicine')).toBe(true);
    expect(isAbbreviated('Neural Networks', 'Neural Networks')).toBe(false);
    expect(isAbbreviated('', 'Nature')).toBe(false);
    expect(isAbbreviated(undefined, 'Nature')).toBe(false);
  });
});

describe('which abbreviation a reference uses', () => {
  const base: Citable = {
    authors: [{ family: 'Hochreiter', given: 'Sepp' }, { family: 'Schmidhuber', given: 'Jürgen' }],
    year: 1997, title: 'Long Short-Term Memory', venue: 'Neural Computation', volume: '9', issue: '8', pages: '1735-1780', doi: '', type: 'journal-article',
  };

  it('the catalogued one first, then the publisher’s, then the standard’s rules', () => {
    expect(formatReference({ ...base, venueNlm: 'Neural Comput', venueShort: 'Neur. Comp.' }, 'vancouver')).toContain('memory. Neural Comput. 1997;9(8):1735-80.');
    expect(formatReference({ ...base, venueShort: 'Neur. Comp.' }, 'vancouver')).toContain('memory. Neur Comp. 1997;');
    // A "short title" that is only the name again is not an abbreviation.
    expect(formatReference({ ...base, venueShort: 'Neural Computation' }, 'vancouver')).toContain('memory. Neural Comput. 1997;');
    expect(formatReference(base, 'vancouver')).toContain('memory. Neural Comput. 1997;');
  });

  it('IEEE writes the same abbreviation with full stops', () => {
    expect(formatReference({ ...base, venueNlm: 'Neural Comput' }, 'ieee')).toContain('“Long short-term memory,” <i>Neural Comput.</i>, vol. 9, no. 8, pp. 1735–1780, 1997.');
  });

  it('the styles that name journals in full are unaffected', () => {
    for (const style of ['apa', 'mla', 'chicago', 'harvard'] as const) expect(formatReference({ ...base, venueNlm: 'Neural Comput' }, style)).toContain('<i>Neural Computation</i>');
  });
});
