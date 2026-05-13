// Author: Subash Karki
//
// Native host helpers — find the Wails NSWindow (the one that owns the
// WKWebView) and attach/detach PhantomTerminalView instances as siblings
// of the web content view. Wails v2 does not expose its NSWindow from Go,
// so we walk NSApp's window list and pick the first window whose view
// hierarchy contains a WKWebView.

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
        // Fallback — first visible window.
        for (NSWindow *win in [NSApp windows]) {
            if (win.isVisible) { result = (__bridge void *)win; return; }
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
    NSWindow *win = (__bridge NSWindow *)window;
    __block void *result = NULL;
    void (^get)(void) = ^{ result = (__bridge void *)win.contentView; };
    if ([NSThread isMainThread]) get(); else dispatch_sync(dispatch_get_main_queue(), get);
    return result;
}

double phantom_window_content_height(void *window) {
    if (window == NULL) return 0;
    NSWindow *win = (__bridge NSWindow *)window;
    __block double h = 0;
    void (^get)(void) = ^{ h = (double)win.contentView.bounds.size.height; };
    if ([NSThread isMainThread]) get(); else dispatch_sync(dispatch_get_main_queue(), get);
    return h;
}

void phantom_add_native_subview(void *parent, void *child) {
    if (parent == NULL || child == NULL) return;
    NSView *p = (__bridge NSView *)parent;
    NSView *c = (__bridge NSView *)child;
    dispatch_async(dispatch_get_main_queue(), ^{
        [p addSubview:c];
    });
}

void phantom_remove_native_subview(void *child) {
    if (child == NULL) return;
    NSView *c = (__bridge NSView *)child;
    dispatch_async(dispatch_get_main_queue(), ^{
        [c removeFromSuperview];
    });
}

// Forces the surface view to become first responder so keystrokes reach
// libghostty instead of the WKWebView. Call after the view is parented
// and visible. WKWebView aggressively claims focus on click, so we also
// re-acquire focus when the user interacts with the surface region.
void phantom_make_first_responder(void *window, void *view) {
    if (window == NULL || view == NULL) return;
    NSWindow *win = (__bridge NSWindow *)window;
    NSView *v = (__bridge NSView *)view;
    dispatch_async(dispatch_get_main_queue(), ^{
        [win makeFirstResponder:v];
    });
}
