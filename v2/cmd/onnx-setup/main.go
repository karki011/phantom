// Author: Subash Karki
// cmd/onnx-setup downloads ONNX runtime + embedding model to ~/.phantom-os/.
// Developer convenience tool — `make onnx-setup` or `go run ./cmd/onnx-setup`.
package main

import (
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/lmittmann/tint"
	"github.com/subashkarki/phantom-os-v2/internal/ai/embedding"
)

func main() {
	slog.SetDefault(slog.New(tint.NewHandler(os.Stderr, &tint.Options{
		Level:      slog.LevelInfo,
		TimeFormat: time.TimeOnly,
	})))

	fmt.Println("Phantom ONNX Setup")
	fmt.Println("==================")

	status := embedding.CheckSetup()
	fmt.Printf("Runtime available: %v\n", status.RuntimeAvailable)
	fmt.Printf("Model available:   %v\n", status.ModelAvailable)

	if !status.NeedsDownload {
		fmt.Println("\nAll files present — nothing to download.")
		return
	}

	fmt.Printf("\nDownloading ~%d MB...\n\n", status.DownloadSizeMB)

	if err := embedding.EnsureAll(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\nSetup complete. You can now build with: go build -tags onnx ./...")
}
