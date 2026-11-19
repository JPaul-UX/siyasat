/* Choices that belong to the person, not to a check, remembered in this browser. */
import { CITATION_STYLES, type CitationStyle } from '@siyasat/core';
import { create } from 'zustand';

const STYLE_KEY = 'siyasat.style';

function storedStyle(): CitationStyle {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (CITATION_STYLES.some((s) => s.id === saved)) return saved as CitationStyle;
  } catch {
    /* storage blocked */
  }
  return 'apa';
}

/** The citation style corrected references are written in. */
export const usePrefs = create<{ style: CitationStyle }>(() => ({ style: storedStyle() }));

export function setStyle(style: CitationStyle): void {
  usePrefs.setState({ style });
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
}
