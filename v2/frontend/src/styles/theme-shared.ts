// Author: Subash Karki
// Shared Phantom UI chrome (typography, rhythm, motion) and elevation presets
// for vanilla-extract themes. Per-theme entries only supply `color` + composed `shadow`.

const PHANTOM_FONT = {
	body: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
	mono: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
	display: '"Orbitron", "SF Pro Display", system-ui, sans-serif',
} as const;

const PHANTOM_FONT_SIZES = {
	xs: "0.6875rem",
	sm: "0.75rem",
	md: "0.875rem",
	lg: "1rem",
	xl: "1.25rem",
	xxl: "1.75rem",
} as const;

const PHANTOM_SPACE = {
	xs: "4px",
	sm: "8px",
	md: "12px",
	lg: "16px",
	xl: "24px",
	xxl: "32px",
} as const;

const PHANTOM_RADIUS = {
	sm: "4px",
	md: "8px",
	lg: "12px",
	full: "9999px",
} as const;

const PHANTOM_ANIMATION = {
	fast: "150ms",
	normal: "300ms",
	slow: "500ms",
} as const;

/** Standard dark UI depth (black scrim). */
export const elevationDark = {
	sm: "0 1px 2px rgba(0,0,0,0.4)",
	md: "0 4px 12px rgba(0,0,0,0.5)",
	lg: "0 8px 24px rgba(0,0,0,0.6)",
} as const;

/** Light theme depth (soft neutral scrim). */
export const elevationLight = {
	sm: "0 1px 2px rgba(0,0,0,0.05)",
	md: "0 4px 12px rgba(0,0,0,0.08)",
	lg: "0 8px 24px rgba(0,0,0,0.12)",
} as const;

/** Nord polar stack. */
export const elevationNord = {
	sm: "0 1px 2px #2e344026",
	md: "0 4px 8px #2e344033",
	lg: "0 8px 16px #2e344040",
} as const;

/** Teal dark — layered zinc scrim. */
export const elevationTealDark = {
	sm: "0px 2px 4px 0px #18181b1a, 0px 0px 1px 0px #18181b4d",
	md: "0px 4px 8px 0px #18181b1a, 0px 0px 1px 0px #18181b4d",
	lg: "0px 8px 16px 0px #18181b1a, 0px 0px 1px 0px #18181b4d",
} as const;

/** Teal light — softer layered scrim. */
export const elevationTealLight = {
	sm: "0px 1px 2px 0px #18181b0f, 0px 1px 3px 0px #18181b1a",
	md: "0px 4px 8px 0px #18181b0f, 0px 0px 1px 0px #18181b26",
	lg: "0px 8px 16px 0px #18181b0f, 0px 0px 1px 0px #18181b26",
} as const;

/** Dracula — tinted depth + purple lift. */
export const elevationDracula = {
	sm: "0 1px 3px #191a2133",
	md: "0 4px 12px #191a2155, 0 0 4px #bd93f922",
	lg: "0 8px 24px #191a2166, 0 0 8px #bd93f933",
} as const;

/** Cyberpunk — neon edge bloom on panels. */
export const elevationCyberpunk = {
	sm: "0 1px 3px #ec489933",
	md: "0 4px 12px #ec489944, 0 0 4px #06b6d433",
	lg: "0 8px 24px #ec489955, 0 0 8px #06b6d444",
} as const;

export type PhantomShadowBlock = {
	sm: string;
	md: string;
	lg: string;
	glow: string;
	dangerGlow: string;
	successGlow: string;
};

/**
 * Accent / danger / success glow rings. Pass RGB triplets as `"r, g, b"` strings.
 * Use `alphas` when glow strength differs (e.g. cyberpunk accent 0.5).
 */
export function semanticGlows(
	accentRgb: string,
	dangerRgb: string,
	successRgb: string,
	alphas: number | { accent?: number; danger?: number; success?: number } = 0.4,
): Pick<PhantomShadowBlock, "glow" | "dangerGlow" | "successGlow"> {
	const a =
		typeof alphas === "number"
			? { accent: alphas, danger: alphas, success: alphas }
			: {
					accent: alphas.accent ?? 0.4,
					danger: alphas.danger ?? 0.4,
					success: alphas.success ?? 0.4,
				};
	return {
		glow: `0 0 20px rgba(${accentRgb}, ${a.accent})`,
		dangerGlow: `0 0 20px rgba(${dangerRgb}, ${a.danger})`,
		successGlow: `0 0 20px rgba(${successRgb}, ${a.success})`,
	};
}

export function withPhantomChrome(shadow: PhantomShadowBlock) {
	return {
		font: { ...PHANTOM_FONT },
		fontSize: { ...PHANTOM_FONT_SIZES },
		space: { ...PHANTOM_SPACE },
		radius: { ...PHANTOM_RADIUS },
		animation: { ...PHANTOM_ANIMATION },
		shadow,
	};
}
