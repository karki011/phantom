// PhantomOS v2 — Terminal display settings floating popover
// Author: Subash Karki
import { createSignal } from 'solid-js';
import { getSession } from '@/core/terminal/registry';
import { setPref } from '@/core/signals/preferences';
import { TERMINAL_THEMES, APP_THEME_DEFAULT_ID } from '@/core/terminal/themes';
import { activeTerminalThemeId, applyTerminalTheme } from '@/core/terminal/theme-manager';

interface TerminalSettingsProps {
  paneId: string;
  onClose: () => void;
}

const DEFAULTS = { fontSize: 12, fontWeight: 300, fontWeightBold: 400, lineHeight: 1.18, letterSpacing: 0.2 };

const panel: Record<string, string> = {
  position: 'absolute', top: '32px', right: '8px', 'z-index': '50',
  background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
  'border-radius': '8px', 'box-shadow': '0 8px 32px rgba(0,0,0,0.6)',
  padding: '12px', 'min-width': '220px',
  'font-family': '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  'font-size': '11px', color: '#ccc',
};

const headerStyle: Record<string, string> = {
  display: 'flex', 'justify-content': 'space-between', 'align-items': 'center',
  'font-weight': '600', color: '#eee', 'padding-bottom': '8px',
  'border-bottom': '1px solid rgba(255,255,255,0.1)', 'margin-bottom': '8px',
};

const rowStyle: Record<string, string> = {
  display: 'flex', 'justify-content': 'space-between', 'align-items': 'center',
  padding: '3px 0',
};

const controlStyle: Record<string, string> = {
  display: 'flex', 'align-items': 'center', gap: '6px',
};

const btnStyle: Record<string, string> = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  'border-radius': '4px', color: '#aaa', width: '22px', height: '22px',
  cursor: 'pointer', display: 'flex', 'align-items': 'center',
  'justify-content': 'center', 'font-size': '13px', padding: '0',
  'font-family': 'system-ui',
};

const valStyle: Record<string, string> = {
  'min-width': '42px', 'text-align': 'center', 'font-variant-numeric': 'tabular-nums',
  'font-family': '"JetBrains Mono", monospace', 'font-size': '10px', color: '#eee',
};

const resetStyle: Record<string, string> = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  'border-radius': '4px', color: '#888', 'font-size': '10px', padding: '2px 8px',
  cursor: 'pointer', 'font-family': 'system-ui',
};

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
  const [brightness, setBrightness] = createSignal(90);

  const cycleFont = (dir: number) => {
    const next = (fontIdx() + dir + FONTS.length) % FONTS.length;
    setFontIdx(next);
    const s = session();
    if (!s) return;
    const family = `"${FONTS[next]}", monospace`;
    s.terminal.options.fontFamily = family;
    try { s.fitAddon.fit(); } catch {}
    void setPref('terminal_fontFamily', FONTS[next]);
  };

  const apply = (key: string, value: number) => {
    const s = session();
    if (!s) return;
    (s.terminal.options as any)[key] = key === 'fontWeight' || key === 'fontWeightBold' ? String(value) : value;
    try { s.fitAddon.fit(); } catch {}
    void setPref(`terminal_${key}`, String(value));
  };

  const set = (setter: (v: number) => void, key: string) => (v: number) => { setter(v); apply(key, v); };

  const applyBrightness = (pct: number) => {
    setBrightness(pct);
    const s = session();
    if (!s) return;
    const ratio = pct / 100;
    const fg = `rgb(${Math.round(255 * ratio)}, ${Math.round(255 * ratio)}, ${Math.round(255 * ratio)})`;
    s.terminal.options.theme = { ...s.terminal.options.theme, foreground: fg };
    void setPref('terminal_brightness', String(pct));
  };

  const reset = () => {
    set(setFontSize, 'fontSize')(DEFAULTS.fontSize);
    set(setFontWeight, 'fontWeight')(DEFAULTS.fontWeight);
    set(setFontWeightBold, 'fontWeightBold')(DEFAULTS.fontWeightBold);
    set(setLineHeight, 'lineHeight')(DEFAULTS.lineHeight);
    set(setLetterSpacing, 'letterSpacing')(DEFAULTS.letterSpacing);
    applyBrightness(90);
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
    <div style={panel} onClick={(e) => e.stopPropagation()}>
      <div style={headerStyle}>
        <span>Terminal Display</span>
        <button style={resetStyle} onClick={reset} type="button">Reset</button>
      </div>
      <div style={rowStyle}>
        <span>Theme</span>
        <div style={controlStyle}>
          <button style={btnStyle} onClick={() => cycleTheme(-1)} type="button">&#x2039;</button>
          <span style={{ ...valStyle, 'min-width': '120px', 'font-size': '10px' }}>{themeList[themeIdx()].name}</span>
          <button style={btnStyle} onClick={() => cycleTheme(1)} type="button">&#x203A;</button>
        </div>
      </div>
      <div style={rowStyle}>
        <span>Font</span>
        <div style={controlStyle}>
          <button style={btnStyle} onClick={() => cycleFont(-1)} type="button">‹</button>
          <span style={{ ...valStyle, 'min-width': '110px', 'font-size': '10px' }}>{FONTS[fontIdx()]}</span>
          <button style={btnStyle} onClick={() => cycleFont(1)} type="button">›</button>
        </div>
      </div>
      {rows.map((r) => (
        <div style={rowStyle}>
          <span>{r.label}</span>
          <div style={controlStyle}>
            <button style={btnStyle} onClick={r.dec} type="button">−</button>
            <span style={valStyle}>{r.fmt(r.value())}</span>
            <button style={btnStyle} onClick={r.inc} type="button">+</button>
          </div>
        </div>
      ))}
    </div>
  );
}
