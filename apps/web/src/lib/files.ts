/* Reading the files people upload. Everything is parsed in the browser: a draft never leaves the device as a file. */
import { cleanText } from '@siyasat/core';

/** An error whose message is written for the person using the app. */
export class FriendlyError extends Error {}

export interface PdfText {
  text: string;
  pages: number;
  /** How many DOI hyperlinks were read from the PDF. */
  links: number;
}

/**
 * PDF → text with pdf.js, loaded only when needed. Also reads DOI hyperlinks, so a DOI that the layout
 * split across two lines can be put back together.
 */
export async function pdfText(file: File): Promise<PdfText> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = '';
  const dois = new Set<string>();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      // A change in vertical position means a new line.
      const y = Math.round(item.transform[5] as number);
      if (lastY !== null && Math.abs(y - lastY) > 2 && line) {
        text += line.replace(/\s+$/, '') + '\n';
        line = '';
      }
      line += item.str;
      lastY = y;
      if (item.hasEOL) {
        text += line.replace(/\s+$/, '') + '\n';
        line = '';
        lastY = null;
      }
    }
    if (line) text += line + '\n';
    text += '\n';
    try {
      for (const a of await page.getAnnotations()) {
        const url: string = a.url || a.unsafeUrl || '';
        const d = url.match(/10\.\d{4,9}\/[^\s"<>]+/);
        if (d) dois.add(decodeURIComponent(d[0]).replace(/[.,;)]+$/, ''));
      }
    } catch {
      /* a page without readable annotations */
    }
  }
  text = cleanText(text);
  // Where a linked DOI appears in the text with stray spaces or line breaks inside it, restore it.
  dois.forEach((d) => {
    if (text.toLowerCase().includes(d.toLowerCase())) return;
    const spaced = d
      .split('')
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
      .join('\\s*');
    text = text.replace(new RegExp(spaced, 'i'), d);
  });
  return { text, pages: doc.numPages, links: dois.size };
}

async function docxText(file: File): Promise<string> {
  let mammoth: typeof import('mammoth');
  try {
    const mod = await import('mammoth/mammoth.browser.js');
    mammoth = (mod as { default?: typeof import('mammoth') }).default ?? (mod as unknown as typeof import('mammoth'));
  } catch {
    throw new FriendlyError("We couldn't load the Word reader. Check your internet and try again.");
  }
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
}

export interface UploadedText {
  text: string;
  kind: string;
  pages?: number;
  links?: number;
}

/** Read any file the "Upload & check" box accepts into plain text. */
export async function readUpload(file: File): Promise<UploadedText> {
  const name = file.name.toLowerCase();
  if (!file.size) throw new FriendlyError('This file is empty. Choose the file that has your paper or reference list in it.');
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const r = await pdfText(file);
    if (r.text.replace(/\s/g, '').length < 40) {
      throw new FriendlyError(
        "This PDF has no readable text. It's probably scanned (a picture of the pages). Open it, copy the text, and paste it into New check → Draft check instead.",
      );
    }
    return { text: r.text, kind: 'pdf', pages: r.pages, links: r.links };
  }
  if (name.endsWith('.docx')) return { text: await docxText(file), kind: 'docx' };
  if (name.endsWith('.doc')) {
    throw new FriendlyError("Old Word files (.doc) can't be read here. In Word, choose File → Save As → .docx, then upload that.");
  }
  if (/\.(txt|md|ris|bib|bibtex|nbib|enw)$/.test(name) || /^text\//.test(file.type)) {
    return { text: await file.text(), kind: name.split('.').pop()! };
  }
  throw new FriendlyError(`Siyasat can't read "${file.name}". Please upload a PDF, Word (.docx), .txt, .ris or .bib file.`);
}

/** Read a library export (.ris, .bib, .csv) as text, with a clear message when it is some other kind of file. */
export async function readLibraryText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
    throw new FriendlyError(
      'This is a PDF, not a library export. Export your references from Zotero, Mendeley, EndNote or your database as .ris, .bib or .csv.',
    );
  }
  if (head[0] === 0x50 && head[1] === 0x4b) {
    throw new FriendlyError('This looks like a Word, Excel or zip file. Please save or export it as .ris, .bib or .csv first.');
  }
  let text = new TextDecoder('utf-8').decode(buf);
  // Many replacement characters mean the file is not UTF-8; older exports are usually Windows-1252.
  if ((text.match(/�/g) || []).length > 5) text = new TextDecoder('windows-1252').decode(buf);
  return text;
}
