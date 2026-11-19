import { Check } from 'lucide-react';
import { PageHead } from '../components/bits';
import { UploadZone } from '../components/UploadZone';
import { clearUpload, UPLOAD_STEPS, useUpload } from '../store/upload';

/** Progress of an "Upload & check" that is under way. */
export function UploadPage() {
  const job = useUpload((s) => s.job);
  if (!job) {
    return (
      <>
        <PageHead title="Upload & check" lead="Drop your paper or reference file, and Siyasat checks everything in it." />
        <UploadZone />
      </>
    );
  }
  return (
    <>
      <PageHead
        title={`Checking ${job.file}`}
        lead={
          job.mode === 'combo'
            ? "Your draft: we're checking every citation and every reference."
            : job.mode === 'refs'
              ? "Your reference list: we're checking every reference."
              : 'Getting started…'
        }
      />
      <section className="card up-prog">
        <ol className="up-steps">
          {UPLOAD_STEPS.map((name, i) => (
            <li className={i < job.step ? 'done' : i === job.step ? 'on' : ''} key={name}>
              <span aria-hidden="true">{i < job.step ? <Check className="ic" /> : i + 1}</span>
              {name}
            </li>
          ))}
        </ol>
        <div className="pbar" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.pct}>
          <i style={{ width: `${job.pct}%` }} />
        </div>
        <p className="ptext" aria-live="polite">
          {job.text}
        </p>
        {job.error ? (
          <>
            <div className="msg err">{job.error}</div>
            <div className="actions">
              <button type="button" className="primary" onClick={clearUpload}>
                Try another file
              </button>
            </div>
          </>
        ) : (
          <p className="meta" style={{ marginTop: 6 }}>
            You can keep this tab open while we work. Usually under a minute.
          </p>
        )}
      </section>
    </>
  );
}
