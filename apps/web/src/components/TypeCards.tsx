import type { CheckType } from '@siyasat/core';
import { Link } from 'react-router';
import { paths } from '../lib/nav';

const TYPES: [CheckType, string, string, string][] = [
  ['refs', '📚', 'Reference list', 'Check that each source in your bibliography is real, correct and not retracted.'],
  ['corpus', '🗂️', 'Review corpus', 'Upload a library export (.ris, .bib or .csv) and check every record before screening.'],
  ['draft', '✍️', 'Draft check', 'See what each cited source actually says next to the sentence you cited it for.'],
];

/** The three kinds of check, as links (on the dashboard) or as a choice (in the New check form). */
export function TypeCards({ selected, onSelect }: { selected?: CheckType; onSelect?: (type: CheckType) => void }) {
  const body = (icon: string, title: string, description: string) => (
    <>
      <span className="tag on">Ready</span>
      <b>
        <span aria-hidden="true">{icon}</span> {title}
      </b>
      <small>{description}</small>
    </>
  );
  if (!onSelect) {
    return (
      <div className="types">
        {TYPES.map(([id, icon, title, description]) => (
          <Link className="type" to={paths.newCheck(id)} key={id}>
            {body(icon, title, description)}
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div className="types" role="radiogroup" aria-label="Type of check">
      {TYPES.map(([id, icon, title, description]) => (
        <button className="type" type="button" role="radio" aria-checked={selected === id} onClick={() => onSelect(id)} key={id}>
          {body(icon, title, description)}
        </button>
      ))}
    </div>
  );
}
