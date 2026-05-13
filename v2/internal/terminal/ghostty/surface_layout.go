// Author: Subash Karki
//
// SetPlacement — translates web-coordinate bounds (top-down Y, origin
// top-left) reported by the frontend ResizeObserver into AppKit-frame
// coordinates (bottom-up Y, origin bottom-left) and pushes the new frame
// to the underlying PhantomTerminalView.
package ghostty

// SetPlacement positions this surface using web-coordinate bounds.
// x/y/width/height are exactly what getBoundingClientRect() returns.
// host provides the NSWindow content height for Y flipping.
func (s *Surface) SetPlacement(host *HostWindow, x, y, width, height float64) {
	if s == nil || host == nil {
		return
	}
	contentH := host.ContentHeight()
	if contentH <= 0 {
		// Window not ready yet; skip — frontend will retry on next layout.
		return
	}
	// Web Y (top) → AppKit Y (bottom). AppKit Y origin is the bottom of
	// the contentView, so the bottom edge of our subview lives at
	//   contentH - (webY + webHeight).
	appkitY := contentH - (y + height)
	s.SetFrame(x, appkitY, width, height)
}
