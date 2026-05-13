// Author: Subash Karki
//
// phantom-libghostty-demo — a minimal standalone binary that opens a native
// macOS NSWindow, attaches a libghostty terminal surface, and runs the user's
// login shell (/bin/zsh) interactively.
//
// Purpose: measure libghostty's rendering perf (latency, idle CPU) without the
// overhead of a full Wails integration. If this binary feels fast and pegs
// near-zero CPU at idle, we know the perf budget is upstream of Wails.
//
// Run:
//     cd /Users/subash.karki/phantom-os/v2
//     go build -o phantom-libghostty-demo ./cmd/phantom-libghostty-demo/
//     ./phantom-libghostty-demo
//
// Quit: Cmd-Q, close the window, or Ctrl-C in the launching shell.
package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/terminal/ghostty"
)

func init() {
	// NSApp + Metal init MUST run on the OS main thread. Lock here so the
	// goroutine that ran init() (which is the same that calls main()) stays
	// pinned to that thread for the lifetime of the process.
	runtime.LockOSThread()
}

func main() {
	occludeAfter := flag.Duration("occlude-after", 0,
		"if >0, call ghostty_surface_set_occlusion(true) after this duration — for measuring backgrounded-pane idle CPU")
	flag.Parse()

	if !ghostty.Available() {
		fmt.Fprintln(os.Stderr, "libghostty not available on this platform")
		os.Exit(2)
	}

	if err := ghostty.Init(); err != nil {
		fmt.Fprintln(os.Stderr, "ghostty.Init:", err)
		os.Exit(1)
	}

	info, err := ghostty.GetInfo()
	if err != nil {
		fmt.Fprintln(os.Stderr, "ghostty.GetInfo:", err)
		os.Exit(1)
	}
	fmt.Printf("libghostty %s (%s)\n", info.Version, info.BuildMode)

	// 1. Initialize NSApp on main thread.
	ghostty.InitNSApp()

	// 2. Create the NSWindow up front so the Metal layer has a real
	//    NSScreen / backingScaleFactor by the time the surface is created.
	const (
		winW = 1024.0
		winH = 768.0
	)
	win := ghostty.NewWindow(winW, winH, "Phantom Libghostty Demo")
	if win == nil {
		fmt.Fprintln(os.Stderr, "phantom_window_new returned nil")
		os.Exit(1)
	}

	// 3. Spin up a ghostty App.
	app, err := ghostty.NewApp()
	if err != nil {
		fmt.Fprintln(os.Stderr, "ghostty.NewApp:", err)
		os.Exit(1)
	}
	defer app.Free()
	fmt.Println("ghostty_app_new ok")

	// 4. Create a Surface. This allocates a PhantomTerminalView (CAMetalLayer
	//    backed NSView) and calls ghostty_surface_new on it.
	surface, err := app.NewSurface(ghostty.SurfaceOptions{
		Width:   winW,
		Height:  winH,
		Command: "/bin/zsh",
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "app.NewSurface:", err)
		os.Exit(1)
	}
	defer surface.Free()
	fmt.Println("ghostty_surface_new ok")

	// 5. Attach the surface's NSView as the window's content view, then show.
	win.SetContentView(surface.NSView())
	win.Show()
	fmt.Println("window shown — type into the terminal; Cmd-Q to quit")

	// 5a. Optional: flip the surface into the occluded (backgrounded) state
	//     after a delay so an external sampler can measure low-power CPU.
	if *occludeAfter > 0 {
		go func() {
			time.Sleep(*occludeAfter)
			fmt.Printf("occluding surface after %s — set_occlusion(true)\n", *occludeAfter)
			surface.SetOcclusion(true)
		}()
	}

	// 6. SIGINT handler so Ctrl-C in the launching shell cleanly stops NSApp.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\ninterrupt — stopping event loop")
		ghostty.StopEventLoop()
	}()

	// 7. Block on NSApp run loop. Returns when window closes or stopped.
	ghostty.RunEventLoop()
	fmt.Println("event loop returned, exiting")
}
