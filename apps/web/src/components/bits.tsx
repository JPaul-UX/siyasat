/* Small pieces of interface used on several pages. */
import { stripTags, type Segment, type Verdict } from '@siyasat/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LABEL } from '../lib/labels';
import { paths } from '../lib/nav';

/** A "?" that shows a short explanation on hover or focus. */
export function Tip({ text }: { text: string }) {
  return (
    <button className="tip" type="button" aria-label={text}>
      ?<span aria-hidden="true">{text}</span>
    </button>
  );
}

export function Badge({ verdict, title, children }: { verdict: Verdict; title?: string; children?: ReactNode }) {
  return (
    <span className={`badge ${verdict}`} title={title}>
      {children ?? LABEL[verdict]}
    </span>
  );
}

export const NewTab = () => <span className="sr"> (opens in new tab)</span>;

/** A link that opens somewhere else, in a new tab. */
export function External({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** A link to the built-in full-text reader. */
export function ReadButton({ doi, label = 'Read full text' }: { doi?: string | null; label?: string }) {
  if (!doi) return null;
  return (
    <Link className="readbtn" to={paths.read(doi)}>
      📖 {label}
    </Link>
  );
}

/** Text with the words and numbers it shares with another text highlighted. */
export function Marked({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.m === 'n' ? (
          <mark className="num" key={i}>
            {s.t}
          </mark>
        ) : s.m === 'w' ? (
          <mark key={i}>{s.t}</mark>
        ) : (
          s.t
        ),
      )}
    </>
  );
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });

/**
 * An APA reference. The stored string marks the venue and volume with <i> tags, and record titles from
 * Crossref sometimes carry simple markup of their own. Only italics, bold, subscript and superscript are
 * rendered; every other tag is dropped, so nothing from a database record can run as HTML.
 */
export function ApaText({ html }: { html: string }) {
  const out: ReactNode[] = [];
  const open: string[] = [];
  let key = 0;
  const wrap = (text: string): ReactNode => open.reduceRight<ReactNode>((child, tag) => {
    const Tag = tag as 'i' | 'b' | 'sub' | 'sup';
    return <Tag>{child}</Tag>;
  }, text);
  for (const part of html.split(/(<[^>]+>)/)) {
    if (!part) continue;
    const tag = /^<(\/?)([a-z]+)[^>]*>$/i.exec(part);
    if (!tag) {
      out.push(<span key={key++}>{wrap(decode(part))}</span>);
      continue;
    }
    const name = { i: 'i', em: 'i', b: 'b', strong: 'b', sub: 'sub', sup: 'sup' }[tag[2]!.toLowerCase()];
    if (!name) continue;
    if (!tag[1]) open.push(name);
    else if (open.lastIndexOf(name) >= 0) open.splice(open.lastIndexOf(name), 1);
  }
  return <>{out}</>;
}

/** A record's title as plain text. */
export const plainTitle = (title?: string | null): string => decode(stripTags(title));

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

export function Empty({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {icon && (
        <span className="big" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </div>
  );
}
