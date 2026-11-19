import type { CheckType } from '@siyasat/core';
import { Library, ListChecks, PenLine, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../lib/nav';

export const TYPE_ICON: Record<CheckType, LucideIcon> = { refs: ListChecks, corpus: Library, draft: PenLine };

const TYPES: [CheckType, string, string][] = [
  ['refs', 'Reference list', 'Check that each source in your bibliography is real, correct and not retracted.'],
  ['corpus', 'Review corpus', 'Upload a library export (.ris, .bib or .csv) and check every record before screening.'],
  ['draft', 'Draft check', 'See what each cited source actually says next to the sentence you cited it for.'],
];

/** The three kinds of check, as links (on the dashboard) or as a choice (in the New check form). */
export function TypeCards({ selected, onSelect }: { selected?: CheckType; onSelect?: (type: CheckType) => void }) {
  const body = (id: CheckType, title: string, description: string) => {
    const Icon = TYPE_ICON[id];
    return (
      <>
        <span className="ti" aria-hidden="true">
          <Icon />
        </span>
        <span>
          <b>{title}</b>
          <small>{description}</small>
        </span>
      </>
    );
  };
  if (!onSelect) {
    return (
      <div className="types">
        {TYPES.map(([id, title, description]) => (
          <Link className="type" to={paths.newCheck(id)} key={id}>
            {body(id, title, description)}
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div className="types" role="radiogroup" aria-label="Type of check">
      {TYPES.map(([id, title, description]) => (
        <button className="type" type="button" role="radio" aria-checked={selected === id} onClick={() => onSelect(id)} key={id}>
          {body(id, title, description)}
        </button>
      ))}
    </div>
  );
}
