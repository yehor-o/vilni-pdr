import { useLayoutEffect } from 'react';
import { useProgress, type ThemePref } from './storage';

/** Page background of each theme (--bg in styles/tokens.css): the phone's status bar colour. */
const BAR_COLOR = { light: '#FFF7EA', dark: '#171B24' } as const;

/**
 * Applies the theme choice to the document. 'system' leaves the colours to
 * prefers-color-scheme (styles/tokens.css); 'light' / 'dark' override it via
 * data-theme on <html>. index.html has one theme-color meta per scheme; a fixed
 * choice gives both the colour of that theme.
 */
export function applyTheme(pref: ThemePref, doc: Document = document): void {
  const root = doc.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;

  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = BAR_COLOR[pref === 'system' ? scheme : pref];
  }
}

/** Keeps the document theme in sync with the saved setting. */
export function useThemeSync(): void {
  const { theme } = useProgress().data.settings;
  useLayoutEffect(() => applyTheme(theme), [theme]);
}
