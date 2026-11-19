import { describe, expect, it } from 'vitest';
import { findByAuthorYear, type AuthorYearLookups } from '../src/index.js';

const src = { authors: 'Vaswani et al.', first: 'vaswani', year: 2017 };
const claim = 'Transformer architectures, which rely on attention rather than recurrence, underpin most modern language models (Vaswani et al., 2017).';
const none: AuthorYearLookups = { crossrefAuthorYear: async () => [], openalexAuthorYear: async () => [] };

describe('findByAuthorYear', () => {
  it('picks the paper whose title fits the citing sentence', async () => {
    const lk: AuthorYearLookups = {
      ...none,
      crossrefAuthorYear: async () => [
        { doi: '10.1/unrelated', title: 'Protein folding in yeast', firstFamily: 'Vaswani' },
        { doi: '10.1/attention', title: 'Attention rather than recurrence in language models', firstFamily: 'Vaswani' },
        { doi: '10.1/other-author', title: 'Attention in language models', firstFamily: 'Smith' },
      ],
    };
    expect(await findByAuthorYear(src, claim, lk)).toEqual({ doi: '10.1/attention', title: 'Attention rather than recurrence in language models', strength: 'strong' });
  });

  it('reports a weak hit when the author and year match but no title fits', async () => {
    const lk: AuthorYearLookups = { ...none, crossrefAuthorYear: async () => [{ doi: '10.1/unrelated', title: 'Protein folding in yeast', firstFamily: 'Vaswani' }] };
    expect(await findByAuthorYear(src, claim, lk)).toMatchObject({ doi: '10.1/unrelated', strength: 'weak' });
  });

  it('finds nothing when both indexes answer with no match', async () => {
    expect(await findByAuthorYear(src, claim, none)).toBeNull();
  });

  it('says the search was partial when only OpenAlex is unavailable', async () => {
    const lk: AuthorYearLookups = { ...none, openalexAuthorYear: async () => null };
    expect(await findByAuthorYear(src, claim, lk)).toEqual({ strength: 'weak', partial: true });
  });

  it('fails, rather than guessing, when Crossref cannot be reached', async () => {
    const down: AuthorYearLookups = { crossrefAuthorYear: async () => null, openalexAuthorYear: async () => null };
    await expect(findByAuthorYear(src, claim, down)).rejects.toThrow('busy');
    // OpenAlex answering with nothing relevant does not make up for Crossref being away.
    const onlyOpenAlex: AuthorYearLookups = { crossrefAuthorYear: async () => null, openalexAuthorYear: async () => [] };
    await expect(findByAuthorYear(src, claim, onlyOpenAlex)).rejects.toThrow('busy');
  });

  it('still accepts a clear match from OpenAlex while Crossref is away', async () => {
    const lk: AuthorYearLookups = {
      crossrefAuthorYear: async () => null,
      openalexAuthorYear: async () => [{ doi: 'https://doi.org/10.1/attention', title: 'Attention in language models', firstAuthor: 'Ashish Vaswani' }],
    };
    expect(await findByAuthorYear(src, claim, lk)).toEqual({ doi: '10.1/attention', title: 'Attention in language models', strength: 'strong' });
  });
});
