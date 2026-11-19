import { Pause, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { eta, stopJob, useJobs } from '../store/jobs';

const PIPELINE = ['Read reference', 'Search Crossref & OpenAlex', 'Match details', 'Check retractions', 'Verdict'];

/** Progress of the reference check that is running, with Pause and Stop. Renders nothing for any other check. */
export function JobProgress({ id }: { id: string }) {
  const job = useJobs((s) => (s.job?.id === id ? s.job : null));
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!job) return;
    // The steps are the same for every reference, so they simply cycle while the check runs.
    const tick = setInterval(() => setStep((n) => (n + 1) % PIPELINE.length), 700);
    return () => clearInterval(tick);
  }, [!!job]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return null;
  const pct = Math.round((job.done / job.total) * 100);
  const left = job.total - job.done;
  return (
    <div className="progress">
      <div className="ptrack" role="progressbar" aria-label="Checking references" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="ptext" aria-live="polite">
        {job.stop === 'pause'
          ? `Pausing after the current references… (${job.done} of ${job.total} checked)`
          : job.stop === 'cancel'
            ? `Stopping after the current references… (${job.done} of ${job.total} checked)`
            : `Checking ${job.done.toLocaleString()} of ${job.total.toLocaleString()}… ${left > 30 ? `(${eta(left)} left)` : ''}`}
      </div>
      <div className="jobctl">
        <button type="button" className="ghost sm" disabled={!!job.stop} onClick={() => stopJob('pause')}>
          <Pause className="ic" aria-hidden="true" /> Pause
        </button>
        <button type="button" className="link danger" disabled={!!job.stop} onClick={() => stopJob('cancel')}>
          <Square className="ic" aria-hidden="true" /> Stop and keep the results so far
        </button>
      </div>
      <ol className="pipe" aria-hidden="true">
        {PIPELINE.map((name, i) => (
          <li className={i < step ? 'done' : i === step ? 'on' : ''} key={name}>
            {name}
          </li>
        ))}
      </ol>
    </div>
  );
}
