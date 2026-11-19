import { SearchCheck } from 'lucide-react';

const TONES = {
  /** For maroon backgrounds: the sidebar, the top bar, a report's header. */
  gold: { fill: '#F3D558', ring: 'rgba(126, 1, 8, 0.3)', glyph: '#7E0108' },
  /** For light backgrounds. */
  maroon: { fill: '#941A1E', ring: 'rgba(243, 213, 88, 0.6)', glyph: '#F3D558' },
};

/**
 * The Siyasat mark. "Siyasat" means to look into something closely, so the mark is a magnifying glass that
 * has found a check: Lucide's search-check glyph, set in a seal in MSU-IIT's maroon and gold.
 * public/favicon.svg and public/logo.svg are the same drawing as files.
 */
export function Logo({ tone = 'gold', size = 40 }: { tone?: keyof typeof TONES; size?: number }) {
  const c = TONES[tone];
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="13.5" fill={c.fill} />
      <rect x="3.5" y="3.5" width="41" height="41" rx="10.5" fill="none" stroke={c.ring} strokeWidth="1.25" />
      <SearchCheck x={9.5} y={9.5} size={29} color={c.glyph} strokeWidth={2.4} />
    </svg>
  );
}
