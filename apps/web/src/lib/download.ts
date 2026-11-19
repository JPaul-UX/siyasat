/** Save text as a file on the user's device. */
export function download(name: string, data: string, type: string): void {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const reportFileName = (c: { name: string; date: string }, ext: string): string =>
  `siyasat-report-${c.name.replace(/[^\w-]+/g, '-').slice(0, 40)}-${c.date.replace(/[:.]/g, '-')}.${ext}`;

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers, and pages without clipboard permission.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
