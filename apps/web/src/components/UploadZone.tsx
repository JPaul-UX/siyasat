import { CloudUpload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { startUpload } from '../store/upload';

const ACCEPT =
  '.pdf,.docx,.txt,.md,.ris,.bib,.bibtex,.nbib,.enw,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

/** The "Upload & check" box: drop a paper or a reference file and everything in it is checked. */
export function UploadZone({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const stop = (e: DragEvent) => e.preventDefault();

  return (
    <section className={`updrop-card${compact ? ' compact' : ''}`} aria-labelledby="upH">
      <div
        className={`updrop${over ? ' over' : ''}`}
        tabIndex={0}
        role="button"
        aria-describedby="upHelp"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragEnter={(e) => {
          stop(e);
          setOver(true);
        }}
        onDragOver={(e) => {
          stop(e);
          setOver(true);
        }}
        onDragLeave={(e) => {
          stop(e);
          setOver(false);
        }}
        onDrop={(e) => {
          stop(e);
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void startUpload(file);
        }}
      >
        <div className="up-ico" aria-hidden="true">
          <CloudUpload />
        </div>
        <div>
          <h2 id="upH">Upload &amp; check</h2>
          <p id="upHelp">
            Drop your paper or reference file here, or <b>choose a file</b>. Siyasat reads it and checks everything in it.
          </p>
          <p className="meta">PDF · Word (.docx) · .txt · .ris · .bib</p>
        </div>
        <input
          ref={input}
          type="file"
          className="sr"
          tabIndex={-1}
          aria-hidden="true"
          accept={ACCEPT}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void startUpload(file);
          }}
        />
      </div>
    </section>
  );
}
