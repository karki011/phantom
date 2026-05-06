// Author: Subash Karki
// Composer V2 preferences — persisted to Go preferences DB (not localStorage)

import { createSignal } from 'solid-js'
import { getPreference, setPreference } from '../bindings'
import type { PaneType } from '../panes/types'

// ---------------------------------------------------------------------------
// Helpers — thin wrappers around the Go binding
// ---------------------------------------------------------------------------

const getPref = async (key: string): Promise<string | null> => {
  try {
    const v = await getPreference(key)
    return v || null
  } catch {
    return null
  }
}

const setPref = async (key: string, value: string): Promise<void> => {
  try {
    await setPreference(key, value)
  } catch {}
}

// ---------------------------------------------------------------------------
// V2 opt-in toggle (pre-existing)
// ---------------------------------------------------------------------------

const V2_ENABLED_KEY = 'composer.useV2'
const [composerV2Enabled, setComposerV2Signal] = createSignal(true)

export async function loadComposerV2Pref(): Promise<void> {
  const saved = await getPref(V2_ENABLED_KEY)
  if (saved === 'false') setComposerV2Signal(false)
}

export async function setComposerV2Enabled(enabled: boolean): Promise<void> {
  setComposerV2Signal(enabled)
  await setPref(V2_ENABLED_KEY, String(enabled))
}

export function composerPaneKind(): PaneType {
  return composerV2Enabled() ? 'composer-v2' : 'composer'
}

export { composerV2Enabled }

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const [composerModel, setComposerModelSignal] = createSignal('claude-opus-4-6[1m]')
export { composerModel }

export const setComposerModel = async (model: string): Promise<void> => {
  setComposerModelSignal(model)
  await setPref('composer_v2_model', model)
}

// ---------------------------------------------------------------------------
// Permission mode
// ---------------------------------------------------------------------------

export type PermissionModeValue =
  | 'default'
  | 'acceptEdits'
  | 'auto'
  | 'plan'
  | 'bypassPermissions'
  | 'dontAsk'

const VALID_PERMISSION_MODES: ReadonlySet<string> = new Set([
  'default',
  'acceptEdits',
  'auto',
  'plan',
  'bypassPermissions',
  'dontAsk',
])

const [composerPermissionMode, setComposerPermissionModeSignal] =
  createSignal<PermissionModeValue>('default')
export { composerPermissionMode }

export const setComposerPermissionMode = async (
  mode: PermissionModeValue
): Promise<void> => {
  setComposerPermissionModeSignal(mode)
  await setPref('composer_v2_permission_mode', mode)
}

// ---------------------------------------------------------------------------
// Effort level
// ---------------------------------------------------------------------------

const [composerEffortLevel, setComposerEffortLevelSignal] =
  createSignal('high')
export { composerEffortLevel }

export const setComposerEffortLevel = async (
  level: string
): Promise<void> => {
  setComposerEffortLevelSignal(level)
  await setPref('composer_v2_effort_level', level)
}

// ---------------------------------------------------------------------------
// Font size
// ---------------------------------------------------------------------------

const [composerFontSize, setComposerFontSizeSignal] = createSignal(13)
export { composerFontSize }

export const setComposerFontSize = async (size: number): Promise<void> => {
  setComposerFontSizeSignal(size)
  await setPref('composer_v2_font_size', String(size))
}

// ---------------------------------------------------------------------------
// No-context default
// ---------------------------------------------------------------------------

const [composerNoContext, setComposerNoContextSignal] = createSignal(false)
export { composerNoContext }

export const setComposerNoContext = async (
  value: boolean
): Promise<void> => {
  setComposerNoContextSignal(value)
  await setPref('composer_v2_no_context', value ? 'true' : 'false')
}

// ---------------------------------------------------------------------------
// Load all V2 composer preferences from the Go DB.
// Called once during app bootstrap (after loadComposerV2Pref).
// ---------------------------------------------------------------------------

export const loadComposerPrefs = async (): Promise<void> => {
  const [model, permMode, effortLevel, fontSize, noCtx] = await Promise.all([
    getPref('composer_v2_model'),
    getPref('composer_v2_permission_mode'),
    getPref('composer_v2_effort_level'),
    getPref('composer_v2_font_size'),
    getPref('composer_v2_no_context'),
  ])

  if (model) setComposerModelSignal(model)

  if (permMode && VALID_PERMISSION_MODES.has(permMode)) {
    setComposerPermissionModeSignal(permMode as PermissionModeValue)
  }

  const VALID_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
  if (effortLevel && VALID_EFFORT_LEVELS.has(effortLevel)) {
    setComposerEffortLevelSignal(effortLevel)
  }

  const parsedSize = Number(fontSize)
  if (fontSize && !Number.isNaN(parsedSize) && parsedSize > 0) {
    setComposerFontSizeSignal(parsedSize)
  }

  if (noCtx === 'true') setComposerNoContextSignal(true)
}
