/* Starting a reference check from a form. The dashboard's quick box and the New check page share this. */
import { splitEntries, type RefsCheck } from '@siyasat/core';
import { useState, type ReactNode } from 'react';
import { go, paths } from '../lib/nav';
import { saveCheck } from '../store/checks';
import { notice } from '../store/dialog';
import { setCorpusFile, setForm, useForms } from '../store/forms';
import { activeJob, eta, runJob, SOFT_LIMIT } from '../store/jobs';

export function useReferenceRun(type: 'refs' | 'corpus') {
  const [message, setMessage] = useState<ReactNode>(null);
  const [starting, setStarting] = useState(false);

  /** Check the references in the form. A very long list first asks whether to check all of it. */
  const run = async (force?: 'all' | 'first'): Promise<void> => {
    const { forms, corpusFile } = useForms.getState();
    const form = forms[type];
    if (activeJob()) {
      void notice('A check is already running', 'Wait for it to finish, or pause it on its results page, then start this one.');
      return;
    }
    let entries = splitEntries(form.input);
    setMessage(null);
    if (!entries.length) {
      setMessage(
        <div className="msg info">
          {type === 'refs' ? (
            <>
              Paste at least one reference first, or use <b>Try an example</b>.
            </>
          ) : (
            'Choose a file first, or paste records into the box.'
          )}
        </div>,
      );
      return;
    }
    if (entries.length > SOFT_LIMIT && !force) {
      setMessage(
        <div className="msg info">
          <b>{entries.length.toLocaleString()} references is a big check.</b> Checking all of them takes {eta(entries.length)}. We check in
          batches and save as we go, so you can pause, close the tab and resume later.
          <div className="choice">
            <button type="button" className="primary sm" autoFocus onClick={() => void run('all')}>
              Check all {entries.length.toLocaleString()} ({eta(entries.length)})
            </button>
            <button type="button" className="ghost sm" onClick={() => void run('first')}>
              Check the first {SOFT_LIMIT} only
            </button>
          </div>
        </div>,
      );
      return;
    }
    if (force === 'first') entries = entries.slice(0, SOFT_LIMIT);
    setStarting(true);
    const check: RefsCheck = {
      id: crypto.randomUUID(),
      name: form.name.trim() || (type === 'refs' ? 'Reference check ' : 'Corpus check ') + new Date().toLocaleDateString(),
      type,
      date: new Date().toISOString(),
      inputs: entries,
      total: entries.length,
      results: [],
      score: 0,
      status: 'running',
      ...(type === 'corpus' && corpusFile ? { file: corpusFile.file } : {}),
    };
    await saveCheck(check);
    // The form has done its job. Results appear on the check's own page as they come in.
    setForm(type, { name: '', input: '' });
    if (type === 'corpus') setCorpusFile(null);
    go(paths.results(check.id));
    void runJob(check.id, entries);
  };

  return { run, message, setMessage, starting };
}
