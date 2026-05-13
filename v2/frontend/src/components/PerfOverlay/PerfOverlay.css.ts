// Author: Subash Karki

import { style } from "@vanilla-extract/css";
import { vars } from "../../styles/theme.css";

export const overlay = style({
	position: "fixed",
	bottom: vars.space.sm,
	right: vars.space.sm,
	zIndex: 9999,
	background: vars.color.bgOverlay,
	color: vars.color.textPrimary,
	border: `1px solid ${vars.color.accent}`,
	borderRadius: vars.radius.md,
	fontFamily: vars.font.mono,
	fontSize: vars.fontSize.xs,
	padding: vars.space.sm,
	minWidth: "240px",
	boxShadow: vars.shadow.lg,
	selectors: {
		'&[data-collapsed="true"]': {
			padding: vars.space.xs,
			minWidth: "auto",
		},
	},
});

export const header = style({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	gap: vars.space.sm,
	width: "100%",
	background: "transparent",
	border: "none",
	color: vars.color.accent,
	fontFamily: "inherit",
	fontSize: "inherit",
	cursor: "pointer",
	padding: 0,
	textTransform: "uppercase",
	letterSpacing: "0.05em",
});

export const headerSummary = style({
	color: vars.color.textSecondary,
	textTransform: "none",
	letterSpacing: "normal",
});

export const loading = style({
	color: vars.color.textSecondary,
	padding: vars.space.xs,
});

export const body = style({
	display: "flex",
	flexDirection: "column",
	gap: vars.space.xs,
	marginTop: vars.space.xs,
});

export const section = style({
	display: "flex",
	flexDirection: "column",
	borderTop: `1px solid ${vars.color.bgTertiary}`,
	paddingTop: vars.space.xs,
	marginTop: vars.space.xs,
});

export const sectionLabel = style({
	color: vars.color.textSecondary,
	fontSize: vars.fontSize.xs,
	textTransform: "uppercase",
	letterSpacing: "0.05em",
	marginBottom: "2px",
});

export const row = style({
	display: "grid",
	gridTemplateColumns: "1fr auto auto",
	gap: vars.space.xs,
	alignItems: "baseline",
});

export const label = style({
	color: vars.color.textSecondary,
});

export const value = style({
	color: vars.color.textPrimary,
	fontVariantNumeric: "tabular-nums",
});

export const sub = style({
	color: vars.color.textDisabled,
	fontSize: vars.fontSize.xs,
});

export const targets = style({
	marginTop: vars.space.sm,
	paddingTop: vars.space.xs,
	borderTop: `1px solid ${vars.color.bgTertiary}`,
	display: "flex",
	flexDirection: "column",
	gap: "2px",
});

export const targetRow = style({
	display: "flex",
	justifyContent: "space-between",
	gap: vars.space.xs,
	fontSize: vars.fontSize.xs,
	selectors: {
		'&[data-met="true"]': {
			color: vars.color.success,
		},
		'&[data-met="false"]': {
			color: vars.color.textSecondary,
		},
	},
});

export const targetKey = style({});

export const targetValue = style({
	fontVariantNumeric: "tabular-nums",
});
