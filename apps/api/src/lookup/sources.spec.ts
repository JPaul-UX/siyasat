import { describe, expect, it, vi } from 'vitest';
import { SourcesService } from './sources.service.js';
import type { UpstreamService } from '../upstream/upstream.service.js';

/** A catalogue that answers from a fixed set of records. */
function catalogue(records: Record<string, { medlineta: string; issnlist: { issn: string }[] }>, working = true) {
  const getJsonSoft = vi.fn(async (url: string) => {
    if (!working) return null;
    if (url.includes('esearch')) return { esearchresult: { idlist: Object.keys(records) } };
    return { result: { uids: Object.keys(records), ...records } };
  });
  return { sources: new SourcesService({ getJsonSoft } as unknown as UpstreamService), getJsonSoft };
}

describe('journal abbreviations from the NLM Catalog', () => {
  const NEJM = { medlineta: 'N Engl J Med', issnlist: [{ issn: '0028-4793' }, { issn: '1533-4406' }] };
  // A search by ISSN can bring back a related record that does not list that ISSN at all.
  const OVERSEAS = { medlineta: 'N Engl J Med Overseas Ed', issnlist: [] };

  it('takes each record only for the ISSNs it lists itself', async () => {
    const { sources } = catalogue({ '1': OVERSEAS, '2': NEJM });
    expect(await sources.journalAbbreviations(['0028-4793'])).toEqual({ '0028-4793': 'N Engl J Med' });
  });

  it('answers null for a journal the catalogue does not hold, and ignores what is not an ISSN', async () => {
    const { sources } = catalogue({ '2': NEJM });
    expect(await sources.journalAbbreviations(['0028-4793', '2094-1064', 'not an issn', ''])).toEqual({ '0028-4793': 'N Engl J Med', '2094-1064': null });
  });

  it('asks once for many journals, and not again for ones it knows', async () => {
    const { sources, getJsonSoft } = catalogue({ '2': NEJM });
    await sources.journalAbbreviations(['0028-4793', '2094-1064', '0028-4793']);
    expect(getJsonSoft).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(getJsonSoft.mock.calls[0]![0])).toContain('"0028-4793"[ISSN] OR "2094-1064"[ISSN]');
    await sources.journalAbbreviations(['0028-4793', '2094-1064']);
    expect(getJsonSoft).toHaveBeenCalledTimes(2);
  });

  it('leaves out what it could not look up, so that it is asked for again', async () => {
    const { sources, getJsonSoft } = catalogue({ '2': NEJM }, false);
    expect(await sources.journalAbbreviations(['0028-4793'])).toEqual({});
    await sources.journalAbbreviations(['0028-4793']);
    expect(getJsonSoft).toHaveBeenCalledTimes(2);
  });
});
