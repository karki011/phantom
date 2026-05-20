// Author: Subash Karki
//
// Main-thread dispatch wrappers for libghostty and NSView operations.
// Wails bindings run on arbitrary goroutines, but Metal/AppKit/ghostty
// surface lifecycle must happen on the macOS main thread. Every Go→C
// call that touches ghostty_app, ghostty_surface, or NSView goes through
// one of these wrappers which dispatch_sync to the main queue.

#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>
#include "ghostty.h"

// Forward-declare the C helpers defined in runtime.go's cgo block and
// native_macos.m so we can wrap them.
extern void *phantom_terminal_view_new(double width, double height);
extern void phantom_terminal_view_release(void *handle);
extern void phantom_terminal_view_attach_surface(void *handle, void *surface);
extern double phantom_terminal_view_scale(void *handle);
extern void phantom_terminal_view_set_frame(void *handle, double x, double y, double w, double h);

// ---------------------------------------------------------------------------
// Helpers — run block on main, sync or async
// ---------------------------------------------------------------------------

static inline void on_main_sync(void (^block)(void)) {
    if ([NSThread isMainThread]) { block(); } else { dispatch_sync(dispatch_get_main_queue(), block); }
}

// ---------------------------------------------------------------------------
// ghostty_config wrappers
// ---------------------------------------------------------------------------

ghostty_config_t phantom_config_new_main(void) {
    __block ghostty_config_t r = NULL;
    on_main_sync(^{ r = ghostty_config_new(); });
    return r;
}

void phantom_config_load_default_files_main(ghostty_config_t cfg) {
    on_main_sync(^{ ghostty_config_load_default_files(cfg); });
}

void phantom_config_load_file_main(ghostty_config_t cfg, const char *path) {
    on_main_sync(^{ ghostty_config_load_file(cfg, path); });
}

void phantom_config_finalize_main(ghostty_config_t cfg) {
    on_main_sync(^{ ghostty_config_finalize(cfg); });
}

void phantom_config_free_main(ghostty_config_t cfg) {
    on_main_sync(^{ ghostty_config_free(cfg); });
}

// ---------------------------------------------------------------------------
// ghostty_app wrappers
// ---------------------------------------------------------------------------

ghostty_app_t phantom_app_new_main(const ghostty_runtime_config_s *rt, ghostty_config_t config) {
    __block ghostty_app_t r = NULL;
    on_main_sync(^{ r = ghostty_app_new(rt, config); });
    return r;
}

void phantom_app_free_main(ghostty_app_t app) {
    on_main_sync(^{ ghostty_app_free(app); });
}

void phantom_app_tick_main(ghostty_app_t app) {
    on_main_sync(^{ ghostty_app_tick(app); });
}

void phantom_app_set_focus_main(ghostty_app_t app, bool focused) {
    on_main_sync(^{ ghostty_app_set_focus(app, focused); });
}

void phantom_app_set_color_scheme_main(ghostty_app_t app, ghostty_color_scheme_e scheme) {
    on_main_sync(^{ ghostty_app_set_color_scheme(app, scheme); });
}

// ---------------------------------------------------------------------------
// ghostty_surface wrappers
// ---------------------------------------------------------------------------

ghostty_surface_t phantom_surface_new_main(ghostty_app_t app, ghostty_surface_config_s *cfg) {
    __block ghostty_surface_t r = NULL;
    on_main_sync(^{ r = ghostty_surface_new(app, cfg); });
    return r;
}

void phantom_surface_free_main(ghostty_surface_t s) {
    on_main_sync(^{ ghostty_surface_free(s); });
}

void phantom_surface_request_close_main(ghostty_surface_t s) {
    on_main_sync(^{ ghostty_surface_request_close(s); });
}

void phantom_surface_set_occlusion_main(ghostty_surface_t s, bool hidden) {
    on_main_sync(^{ ghostty_surface_set_occlusion(s, hidden); });
}

void phantom_surface_complete_clipboard_main(ghostty_surface_t s, const char *data, void *state, bool confirmed) {
    on_main_sync(^{ ghostty_surface_complete_clipboard_request(s, data, state, confirmed); });
}

// ---------------------------------------------------------------------------
// NSView (PhantomTerminalView) wrappers
// ---------------------------------------------------------------------------

void *phantom_view_new_main(double w, double h) {
    __block void *r = NULL;
    on_main_sync(^{ r = phantom_terminal_view_new(w, h); });
    return r;
}

void phantom_view_release_main(void *handle) {
    on_main_sync(^{ phantom_terminal_view_release(handle); });
}

void phantom_view_attach_surface_main(void *handle, void *surface) {
    on_main_sync(^{ phantom_terminal_view_attach_surface(handle, surface); });
}

double phantom_view_scale_main(void *handle) {
    __block double r = 2.0;
    on_main_sync(^{ r = phantom_terminal_view_scale(handle); });
    return r;
}

void phantom_view_set_frame_main(void *handle, double x, double y, double w, double h) {
    on_main_sync(^{ phantom_terminal_view_set_frame(handle, x, y, w, h); });
}
