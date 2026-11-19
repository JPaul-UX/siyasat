/* Turning a JATS article (the XML Europe PMC serves for open-access papers) into safe, readable HTML. */
import { DOMParser } from '@xmldom/xmldom';
import type { FullTextSection } from '@siyasat/core';

/* The slice of the DOM this file relies on; xmldom's own types are stricter than its runtime needs here. */
interface XNode {
  nodeType: number;
  nodeValue: string | null;
  localName: string | null;
  textContent: string | null;
  childNodes: { length: number; item(i: number): XNode | null };
  getAttribute?(name: string): string | null;
}
interface XDocument {
  getElementsByTagName(name: string): { length: number; item(i: number): XNode | null };
}

const TEXT = 3;
const ELEMENT = 1;

const esc = (s: unknown) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const kids = (n: XNode): XNode[] => Array.from({ length: n.childNodes.length }, (_, i) => n.childNodes.item(i)!);
const elements = (n: XNode): XNode[] => kids(n).filter((c) => c.nodeType === ELEMENT);
const child = (n: XNode, name: string) => elements(n).find((c) => c.localName === name);
const attr = (n: XNode, name: string) => (n.getAttribute ? n.getAttribute(name) : null);

/** Elements that cannot be shown as text. */
const SKIPPED = ['fig', 'table-wrap', 'disp-formula', 'graphic', 'inline-graphic', 'alternatives', 'tex-math', 'math'];

/** Inline JATS → HTML. Only the tags written here can appear in the output; all text is escaped. */
function inline(n: XNode): string {
  let h = '';
  for (const c of kids(n)) {
    if (c.nodeType === TEXT) {
      h += esc(c.nodeValue);
      continue;
    }
    if (c.nodeType !== ELEMENT) continue;
    const t = c.localName ?? '';
    if (t === 'italic') h += '<i>' + inline(c) + '</i>';
    else if (t === 'bold') h += '<b>' + inline(c) + '</b>';
    else if (t === 'sup') h += '<sup>' + inline(c) + '</sup>';
    else if (t === 'sub') h += '<sub>' + inline(c) + '</sub>';
    else if (t === 'xref' && attr(c, 'ref-type') === 'bibr') h += '<span class="rd-x">' + inline(c) + '</span>';
    else if (SKIPPED.includes(t)) {
      if (t === 'disp-formula' || t === 'tex-math') h += ' [equation] ';
    } else h += inline(c);
  }
  return h;
}

/** Block-level JATS → HTML, for a list of sibling nodes. */
function blocks(nodes: XNode[], depth: number): string {
  let h = '';
  for (const c of nodes) {
    if (c.nodeType !== ELEMENT) continue;
    const t = c.localName ?? '';
    if (t === 'p') h += '<p>' + inline(c) + '</p>';
    else if (t === 'sec') {
      const title = child(c, 'title');
      const level = Math.min(6, depth + 3);
      h += (title ? `<h${level}>${inline(title)}</h${level}>` : '') + blocks(kids(c), depth + 1);
    } else if (t === 'list') {
      const tag = attr(c, 'list-type') === 'order' ? 'ol' : 'ul';
      const items = elements(c).filter((x) => x.localName === 'list-item');
      h += `<${tag}>` + items.map((li) => '<li>' + blocks(kids(li), depth) + '</li>').join('') + `</${tag}>`;
    } else if (t === 'fig' || t === 'table-wrap') {
      const label = child(c, 'label');
      const caption = child(c, 'caption');
      h += `<figure class="rd-fig"><figcaption><b>${label ? inline(label) : t === 'fig' ? 'Figure' : 'Table'}.</b> ${caption ? inline(caption) : ''} <span class="meta">(${t === 'fig' ? 'image' : 'table'} not shown here; see the original)</span></figcaption></figure>`;
    } else if (t === 'disp-quote') h += '<blockquote>' + blocks(kids(c), depth) + '</blockquote>';
    else if (t === 'boxed-text' || t === 'statement' || t === 'def-list') h += blocks(kids(c), depth);
  }
  return h;
}

export interface ParsedArticle {
  title: string;
  secs: FullTextSection[];
  hasBody: boolean;
  license: string;
}

/** Parse a JATS article into titled sections of sanitised HTML. Throws when the XML cannot be read. */
export function parseJats(xml: string): ParsedArticle {
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') throw new Error('bad XML: ' + message);
    },
  }).parseFromString(xml, 'application/xml') as unknown as XDocument;
  const first = (name: string) => doc.getElementsByTagName(name).item(0);
  const all = (name: string) => {
    const list = doc.getElementsByTagName(name);
    return Array.from({ length: list.length }, (_, i) => list.item(i)!);
  };

  const secs: FullTextSection[] = [];
  const abstract = all('abstract').find((a) => !attr(a, 'abstract-type') || attr(a, 'abstract-type') === 'structured');
  if (abstract) secs.push({ title: 'Abstract', html: blocks(kids(abstract), 1) || '<p>' + inline(abstract) + '</p>' });

  const body = first('body');
  if (body) {
    // Paragraphs that sit outside any section are gathered under a heading of their own.
    let loose = '';
    for (const c of elements(body)) {
      if (c.localName === 'sec') {
        if (loose) {
          secs.push({ title: secs.length > 1 ? 'More text' : 'Main text', html: loose });
          loose = '';
        }
        const title = child(c, 'title');
        secs.push({ title: title ? (title.textContent ?? '').trim() : 'Section', html: blocks(kids(c), 1) });
      } else loose += blocks([c], 1);
    }
    if (loose) secs.push({ title: 'Main text', html: loose });
  }

  const title = first('article-title');
  const license = first('license');
  return {
    title: title ? inline(title) : '',
    secs,
    hasBody: !!body && (body.textContent ?? '').trim().length > 200,
    license: license ? (license.textContent ?? '').trim().slice(0, 240) : '',
  };
}
