// Package provider — Embedded builtin provider configs.
//
// Uses //go:embed to bundle the YAML configs into the binary so they are
// always available even without the filesystem configs/ directory.
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import "embed"

// EmbeddedConfigs contains the builtin provider YAML configs.
// These are copies of the canonical configs/providers/*.yaml files,
// stored in internal/provider/configs/ for embed accessibility.
//
//go:embed configs/*.yaml
var EmbeddedConfigs embed.FS
