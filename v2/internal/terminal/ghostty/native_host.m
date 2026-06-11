// Author: Subash Karki
//
// Native host helpers — find the Wails NSWindow (the one that owns the
// WKWebView) and attach/detach PhantomTerminalView instances as siblings
// of the web content view. Wails v2 does not expose its NSWindow from Go,
// so we walk NSApp's window list and pick the window whose view hierarchy
// contains a WKWebView. Strict match only — no fallback. A transient boot
// window grabbed by a fallback gets cached by the Go side and its views
// die when boot settles, leaving dangling pointers (the 0.1.65 native
// terminal crash class).
//
// This file is compiled WITHOUT ARC. Every ObjC pointer captured into a
// dispatch block is CFRetain'd at capture (before dispatch) and CFRelease'd
// exactly once at the end of the block, on every exit path. Pointers are
// captured as raw void* so MRC block-copy never implicitly retains them at
// an unpredictable time — lifetime is owned explicitly here.

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static BOOL phantom_view_contains_webview(NSView *view) {
    if (view == nil) return NO;
    if ([view isKindOfClass:[WKWebView class]]) return YES;
    for (NSView *child in view.subviews) {
        if (phantom_view_contains_webview(child)) return YES;
    }
    return NO;
}

// Returns the NSWindow whose contentView hierarchy hosts the WKWebView, or
// NULL if none exists yet (e.g. before DomReady). Callers must treat NULL
// as a transient "window not ready" condition and retry — never substitute
// another window.
void *phantom_find_main_window(void) {
    __block void *result = NULL;
    void (^find)(void) = ^{
        for (NSWindow *win in [NSApp windows]) {
            if (!win.isVisible) continue;
            if (phantom_view_contains_webview(win.contentView)) {
                result = (__bridge void *)win;
                return;
            }
        }
    };
    if ([NSThread isMainThread]) {
        find();
    } else {
        dispatch_sync(dispatch_get_main_queue(), find);
    }
    return result;
}

void *phantom_window_content_view(void *window) {
    if (window == NULL) return NULL;
    CFRetain(window);
    __block void *result = NULL;
    void (^get)(void) = ^{
        NSWindow *win = (__bridge NSWindow *)window;
        result = (__bridge void *)win.contentView;
        CFRelease(window);
    };
    if ([NSThread isMainThread]) get(); else dispatch_sync(dispatch_get_main_queue(), get);
    return result;
}

double phantom_window_content_height(void *window) {
    if (window == NULL) return 0;
    CFRetain(window);
    __block double h = 0;
    void (^get)(void) = ^{
        NSWindow *win = (__bridge NSWindow *)window;
        h = (double)win.contentView.bounds.size.height;
        CFRelease(window);
    };
    if ([NSThread isMainThread]) get(); else dispatch_sync(dispatch_get_main_queue(), get);
    return h;
}

// Attaches child under window's contentView. Takes the WINDOW, not a
// contentView pointer — the contentView is re-resolved on the main queue
// inside the block, because a contentView captured at call time can be
// freed before the async block runs.
void phantom_add_native_subview(void *window, void *child) {
    if (window == NULL || child == NULL) return;
    CFRetain(window);
    CFRetain(child);
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *win = (__bridge NSWindow *)window;
        NSView *content = win.contentView;
        if (content != nil) {
            [content addSubview:(__bridge NSView *)child];
        }
        CFRelease(window);
        CFRelease(child);
    });
}

void phantom_remove_native_subview(void *child) {
    if (child == NULL) return;
    CFRetain(child);
    dispatch_async(dispatch_get_main_queue(), ^{
        [(__bridge NSView *)child removeFromSuperview];
        CFRelease(child);
    });
}

// Forces the surface view to become first responder so keystrokes reach
// libghostty instead of the WKWebView. Call after the view is parented
// and visible. WKWebView aggressively claims focus on click, so we also
// re-acquire focus when the user interacts with the surface region.
void phantom_make_first_responder(void *window, void *view) {
    if (window == NULL || view == NULL) return;
    CFRetain(window);
    CFRetain(view);
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *win = (__bridge NSWindow *)window;
        NSView *v = (__bridge NSView *)view;
        // Only focus a view that is actually parented in this window — the
        // attach block may have bailed (contentView gone) or the view may
        // have been detached by a racing destroy.
        if (v.window == win) {
            [win makeFirstResponder:v];
        }
        CFRelease(window);
        CFRelease(view);
    });
}
