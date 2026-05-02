// Author: Subash Karki
package app

import "github.com/subashkarki/phantom-os-v2/internal/ai/embedding"

// GetEmbeddingSetupStatus returns whether the ONNX runtime and model are
// available. The frontend can use this to show setup progress or a
// "semantic search unavailable" badge.
func (a *App) GetEmbeddingSetupStatus() map[string]interface{} {
	status := embedding.CheckSetup()
	return map[string]interface{}{
		"runtimeAvailable": status.RuntimeAvailable,
		"modelAvailable":   status.ModelAvailable,
		"runtimePath":      status.RuntimePath,
		"modelDir":         status.ModelDir,
		"needsDownload":    status.NeedsDownload,
		"downloadSizeMB":   status.DownloadSizeMB,
	}
}
