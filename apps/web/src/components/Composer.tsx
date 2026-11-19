import { splitEntries } from '@siyasat/core';
import { ArrowRight, ClipboardList, CloudUpload, PenLine } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { SAMPLE_REFS } from '../lib/labels';
import { paths } from '../lib/nav';
import { setForm, useForms } from '../store/forms';
import { Spinner } from './bits';
import { useReferenceRun } from './referenceRun';
import { UploadZone } from './UploadZone';

/** The quick way in, on the dashboard: paste a reference list or drop a file, and check it. */
export function Composer() {
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const form = useForms((s) => s.forms.refs);
  const { run, message, setMessage, starting } = useReferenceRun('refs');
  const typed = useDeferredValue(form.input);
  const detected = useMemo(() => splitEntries(typed).length, [typed]);

  return (
    <section className="card composer" aria-label="Start a check">
      <div className="composer-head">
        <div className="seg" role="tablist" aria-label="How to add your sources">
          <button type="button" role="tab" aria-selected={tab === 'paste'} onClick={() => setTab('paste')}>
            <ClipboardList className="ic" aria-hidden="true" /> Paste references
          </button>
          <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')}>
            <CloudUpload className="ic" aria-hidden="true" /> Upload a file
          </button>
        </div>
        <Link className="link" to={paths.newCheck('draft')}>
          <PenLine className="ic" aria-hidden="true" /> Check a draft instead
        </Link>
      </div>
      <div className="composer-body">
        {tab === 'paste' ? (
          <>
            <label className="sr" htmlFor="quickRefs">
              Your reference list
            </label>
            <textarea
              id="quickRefs"
              value={form.input}
              onChange={(e) => setForm('refs', { input: e.target.value })}
              placeholder={'Paste your reference list here. Any citation style works, one reference per line.\n\nLeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.'}
            />
            <div className="composer-foot">
              <span className="count" aria-live="polite">
                {detected ? `${detected.toLocaleString()} ${detected === 1 ? 'reference' : 'references'} detected` : 'Nothing pasted yet'}
              </span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setForm('refs', { input: SAMPLE_REFS, ...(form.name ? {} : { name: 'Example references' }) });
                  setMessage(null);
                }}
              >
                Try an example
              </button>
              <button type="button" className="primary" disabled={starting} onClick={() => void run()}>
                {starting ? <Spinner /> : null}
                Check my references <ArrowRight className="ic" aria-hidden="true" />
              </button>
            </div>
            <div role="alert">{message}</div>
          </>
        ) : (
          <UploadZone />
        )}
      </div>
    </section>
  );
}
