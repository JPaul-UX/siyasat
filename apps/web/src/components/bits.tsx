/* Small pieces of interface used on several pages. */
import { MAIN_VERDICTS } from '../lib/labels';
import { stripTags, type Segment, type Verdict, type VerdictCounts } from '@siyasat/core';
import {
  BookOpenText,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  ChevronRight,
  Copy,
  PenLine,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { copyText } from '../lib/download';
import { LABEL } from '../lib/labels';
import { paths } from '../lib/nav';

export { Logo } from './Logo';

const VERDICT_ICON: Record<Verdict, LucideIcon> = {
  verified: CircleCheck,
  correction: PenLine,
  uncertain: CircleHelp,
  not_found: CircleX,
  retracted: TriangleAlert,
  error: CircleAlert,
};

export function VerdictIcon({ verdict }: { verdict: Verdict }) {
  const Icon = VERDICT_ICON[verdict];
  return <Icon aria-hidden="true" />;
}

export function Badge({ verdict, title, children }: { verdict: Verdict; title?: string; children?: ReactNode }) {
  return (
    <span className={`badge ${verdict}`} title={title}>
      <VerdictIcon verdict={verdict} />
      {children ?? LABEL[verdict]}
    </span>
  );
}

/** A "?" that shows a short explanation on hover or focus. */
export function Tip({ text }: { text: string }) {
  return (
    <button className="tip" type="button" aria-label={text}>
      <CircleHelp aria-hidden="true" />
      <span aria-hidden="true">{text}</span>
    </button>
  );
}

/** The arrow in front of something that opens and closes. It turns when its <details> is open. */
export const Chevron = () => <ChevronRight className="ic chev" aria-hidden="true" />;

/** The title block at the top of a page, with room for buttons on the right. */
export function PageHead({ title, lead, eyebrow, children }: { title: ReactNode; lead?: ReactNode; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-h">{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

/** The integrity score as a ring that fills up to the score. */
export function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const around = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="ring" role="img" aria-label={`Integrity score ${score} out of 100`}>
      <svg viewBox="0 0 120 120">
        <circle className="track" cx="60" cy="60" r={r} />
        <circle className="arc" cx="60" cy="60" r={r} strokeDasharray={around} strokeDashoffset={around * (1 - filled)} />
      </svg>
      <div className="val">
        <b>{score}</b>
        <small>out of 100</small>
      </div>
    </div>
  );
}

/** One bar split by verdict, to show at a glance how a list of references turned out. */
export function DistBar({ counts }: { counts: VerdictCounts }) {
  const shown = [...MAIN_VERDICTS, 'error' as const].filter((v) => counts[v] > 0);
  const label = shown.map((v) => `${counts[v]} ${LABEL[v]}`).join(', ');
  return (
    <div className="dist" role="img" aria-label={label || 'No references checked yet'}>
      {shown.map((v) => (
        <i key={v} className={v} style={{ flexGrow: counts[v] }} title={`${counts[v]} ${LABEL[v]}`} />
      ))}
    </div>
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
      <BookOpenText className="ic" aria-hidden="true" /> {label}
    </Link>
  );
}

/** A button that copies some text and says so for a moment. */
export function CopyButton({ text, label, className = 'link' }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }}
    >
      {copied ? <Check className="ic" aria-hidden="true" /> : <Copy className="ic" aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </button>
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
  const wrap = (text: string): ReactNode =>
    open.reduceRight<ReactNode>((child, tag) => {
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

/** An APA reference as plain text, for the clipboard. */
export const plainApa = (html: string): string => decode(stripTags(html));

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

/** What a page shows when there is nothing to show yet. */
export function Empty({ icon: Icon, title, children }: { icon?: LucideIcon; title?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="big" aria-hidden="true">
          <Icon />
        </span>
      )}
      {title && <b>{title}</b>}
      {children}
    </div>
  );
}
