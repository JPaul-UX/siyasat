import { Braces, FileDown } from 'lucide-react';
import { useState } from 'react';
import { download, reportFileName } from '../lib/download';
import { loadCheck } from '../store/checks';
import { toast } from '../store/toast';

/**
 * "Download report" and "JSON" for a check. The report builder is loaded on first use; it is only needed
 * by people who download one.
 */
export function ReportButtons({
  id,
  name,
  refsView = false,
  reportClass = 'ghost sm',
  jsonLabel = 'JSON',
}: {
  id: string;
  name: string;
  /** For an uploaded draft: report on its reference list instead of its claims. */
  refsView?: boolean;
  reportClass?: string;
  jsonLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const save = async (kind: 'html' | 'json') => {
    setBusy(true);
    try {
      const [check, report] = await Promise.all([loadCheck(id), import('../lib/report')]);
      if (!check) throw new Error('missing');
      if (kind === 'html') download(reportFileName(check, 'html'), report.buildReport(check, refsView), 'text/html');
      else download(reportFileName(check, 'json'), report.buildJson(check, refsView), 'application/json');
    } catch (e) {
      console.error(e);
      toast("Couldn't build that report. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={reportClass} disabled={busy} onClick={() => void save('html')}>
        <FileDown className="ic" aria-hidden="true" /> Download report<span className="sr"> for {name}</span>
      </button>
      <button type="button" className="link" disabled={busy} onClick={() => void save('json')}>
        <Braces className="ic" aria-hidden="true" /> {jsonLabel}
        <span className="sr"> for {name}</span>
      </button>
    </>
  );
}
