// Phantom — Terminal display settings floating popover
// Author: Subash Karki
import { createSignal } from 'solid-js';
import { getSession, getAllSessions, getTerminalUserPrefs } from '@/core/terminal/registry';
import { setPref } from '@/core/signals/preferences';
import { TERMINAL_THEMES, APP_THEME_DEFAULT_ID } from '@/core/terminal/themes';
import { activeTerminalThemeId, applyTerminalTheme } from '@/core/terminal/theme-manager';
import * as styles from './TerminalSettings.css';

interface TerminalSettingsProps {
  paneId: string;
  onClose: () => void;
}

const DEFAULT_FONT = 'Hack';
const DEFAULTS = { fontSize: 12, fontWeight: 300, fontWeightBold: 400, lineHeight: 1.18, letterSpacing: 0.2, brightness: 100 };

export default function TerminalSettings(props: TerminalSettingsProps) {
  const session = () => getSession(props.paneId);
  const opts = () => session()?.terminal.options;

  // Theme cycling — "Use App Theme" first, then all downloaded themes alphabetically
  const themeList = [
    { id: APP_THEME_DEFAULT_ID, name: 'Use App Theme' },
    ...TERMINAL_THEMES.map((t) => ({ id: t.id, name: t.name })),
  ];
  const [themeIdx, setThemeIdx] = createSignal(
    Math.max(0, themeList.findIndex((t) => t.id === activeTerminalThemeId())),
  );
  const cycleTheme = (dir: number) => {
    const next = (themeIdx() + dir + themeList.length) % themeList.length;
    setThemeIdx(next);
    applyTerminalTheme(themeList[next].id);
  };

  const FONTS = ['Hack', 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo', 'Cascadia Code'] as const;

  const currentFont = () => {
    const family = String(opts()?.fontFamily ?? 'JetBrains Mono');
    return FONTS.find((f) => family.includes(f)) ?? FONTS[0];
  };
  const [fontIdx, setFontIdx] = createSignal(Math.max(0, FONTS.indexOf(currentFont() as any)));
  const [fontSize, setFontSize] = createSignal(opts()?.fontSize ?? DEFAULTS.fontSize);
  const [fontWeight, setFontWeight] = createSignal(Number(opts()?.fontWeight ?? DEFAULTS.fontWeight));
  const [fontWeightBold, setFontWeightBold] = createSignal(Number(opts()?.fontWeightBold ?? DEFAULTS.fontWeightBold));
  const [lineHeight, setLineHeight] = createSignal(opts()?.lineHeight ?? DEFAULTS.lineHeight);
  const [letterSpacing, setLetterSpacing] = createSignal(opts()?.letterSpacing ?? DEFAULTS.letterSpacing);
  const [brightness, setBrightness] = createSignal(getTerminalUserPrefs().brightness ?? DEFAULTS.brightness);

  const cycleFont = (dir: number) => {
    const next = (fontIdx() + dir + FONTS.length) % FONTS.length;
    setFontIdx(next);
    const family = `"${FONTS[next]}", monospace`;
    for (const s of getAllSessions()) {
      s.terminal.options.fontFamily = family;
      try { s.fitAddon.fit(); } catch {}
    }
    void setPref('terminal_fontFamily', FONTS[next]);
  };

  const apply = (key: string, value: number) => {
    const resolved = key === 'fontWeight' || key === 'fontWeightBold' ? String(value) : value;
    for (const s of getAllSessions()) {
      (s.terminal.options as any)[key] = resolved;
      try { s.fitAddon.fit(); } catch {}
    }
    void setPref(`terminal_${key}`, String(value));
  };

  const set = (setter: (v: number) => void, key: string) => (v: number) => { setter(v); apply(key, v); };

  const applyBrightness = (pct: number) => {
    setBrightness(pct);
    for (const s of getAllSessions()) {
      s.wrapper.style.filter = pct === 100 ? '' : `brightness(${pct}%)`;
    }
    void setPref('terminal_brightness', String(pct));
  };

  const reset = () => {
    const fontTarget = Math.max(0, FONTS.indexOf(DEFAULT_FONT as (typeof FONTS)[number]));
    if (fontIdx() !== fontTarget) cycleFont(fontTarget - fontIdx());
    if (themeIdx() !== 0) {
      setThemeIdx(0);
      applyTerminalTheme(APP_THEME_DEFAULT_ID);
    }
    set(setFontSize, 'fontSize')(DEFAULTS.fontSize);
    set(setFontWeight, 'fontWeight')(DEFAULTS.fontWeight);
    set(setFontWeightBold, 'fontWeightBold')(DEFAULTS.fontWeightBold);
    set(setLineHeight, 'lineHeight')(DEFAULTS.lineHeight);
    set(setLetterSpacing, 'letterSpacing')(DEFAULTS.letterSpacing);
    applyBrightness(DEFAULTS.brightness);
  };

  type Row = { label: string; value: () => number; fmt: (v: number) => string; dec: () => void; inc: () => void };

  const rows: Row[] = [
    {
      label: 'Size', value: fontSize,
      fmt: (v) => `${v}px`,
      dec: () => set(setFontSize, 'fontSize')(Math.max(8, fontSize() - 1)),
      inc: () => set(setFontSize, 'fontSize')(Math.min(24, fontSize() + 1)),
    },
    {
      label: 'Weight', value: fontWeight,
      fmt: (v) => String(v),
      dec: () => set(setFontWeight, 'fontWeight')(Math.max(100, fontWeight() - 100)),
      inc: () => set(setFontWeight, 'fontWeight')(Math.min(700, fontWeight() + 100)),
    },
    {
      label: 'Bold', value: fontWeightBold,
      fmt: (v) => String(v),
      dec: () => set(setFontWeightBold, 'fontWeightBold')(Math.max(100, fontWeightBold() - 100)),
      inc: () => set(setFontWeightBold, 'fontWeightBold')(Math.min(900, fontWeightBold() + 100)),
    },
    {
      label: 'Line Height', value: lineHeight,
      fmt: (v) => v.toFixed(2),
      dec: () => set(setLineHeight, 'lineHeight')(Math.max(0.8, +(lineHeight() - 0.05).toFixed(2))),
      inc: () => set(setLineHeight, 'lineHeight')(Math.min(2.0, +(lineHeight() + 0.05).toFixed(2))),
    },
    {
      label: 'Spacing', value: letterSpacing,
      fmt: (v) => v.toFixed(1),
      dec: () => set(setLetterSpacing, 'letterSpacing')(Math.max(-1, +(letterSpacing() - 0.1).toFixed(1))),
      inc: () => set(setLetterSpacing, 'letterSpacing')(Math.min(3, +(letterSpacing() + 0.1).toFixed(1))),
    },
    {
      label: 'Brightness', value: brightness,
      fmt: (v) => `${v}%`,
      dec: () => applyBrightness(Math.max(40, brightness() - 5)),
      inc: () => applyBrightness(Math.min(100, brightness() + 5)),
    },
  ];

  return (
    <div class={styles.panel} onClick={(e) => e.stopPropagation()}>
      <div class={styles.header}>
        <span>Terminal Display</span>
        <button class={styles.reset} onClick={reset} type="button">Reset</button>
      </div>
      <div class={styles.row}>
        <span>Theme</span>
        <div class={styles.control}>
          <button class={styles.btn} onClick={() => cycleTheme(-1)} type="button">&#x2039;</button>
          <span class={styles.valWide}>{themeList[themeIdx()].name}</span>
          <button class={styles.btn} onClick={() => cycleTheme(1)} type="button">&#x203A;</button>
        </div>
      </div>
      <div class={styles.row}>
        <span>Font</span>
        <div class={styles.control}>
          <button class={styles.btn} onClick={() => cycleFont(-1)} type="button">‹</button>
          <span class={styles.valMedium}>{FONTS[fontIdx()]}</span>
          <button class={styles.btn} onClick={() => cycleFont(1)} type="button">›</button>
        </div>
      </div>
      {rows.map((r) => (
        <div class={styles.row}>
          <span>{r.label}</span>
          <div class={styles.control}>
            <button class={styles.btn} onClick={r.dec} type="button">−</button>
            <span class={styles.val}>{r.fmt(r.value())}</span>
            <button class={styles.btn} onClick={r.inc} type="button">+</button>
          </div>
        </div>
      ))}
    </div>
  );
}
