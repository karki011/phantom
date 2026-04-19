package app

import (
	"context"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	EventAppReady    = "app:ready"
	EventHealthPulse = "health:pulse"
	EventWSStatus    = "ws:status"
)

func EmitEvent(ctx context.Context, name string, data interface{}) {
	wailsRuntime.EventsEmit(ctx, name, data)
}
