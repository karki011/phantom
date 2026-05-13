// Author: Subash Karki
//
// PhantomTerminalView — Objective-C NSView subclass that hosts the
// CAMetalLayer libghostty draws into. Exposed back to Go via
// phantom_terminal_view_new() which returns the bare void* (NSView *).
//
// This file is compiled by CGo when GOOS=darwin. It implements the
// minimum needed for ghostty_surface_new to succeed: a layer-backed
// NSView with a CAMetalLayer suitable for Metal rendering.

#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <Metal/Metal.h>

@interface PhantomTerminalView : NSView
@end

@implementation PhantomTerminalView

+ (Class)layerClass {
    return [CAMetalLayer class];
}

- (instancetype)initWithFrame:(NSRect)frameRect {
    self = [super initWithFrame:frameRect];
    if (self) {
        // Order matters: set the layer before flipping wantsLayer.
        CAMetalLayer *layer = [CAMetalLayer layer];
        layer.device = MTLCreateSystemDefaultDevice();
        layer.pixelFormat = MTLPixelFormatBGRA8Unorm;
        layer.framebufferOnly = YES;
        layer.contentsScale = NSScreen.mainScreen.backingScaleFactor;
        self.layer = layer;
        self.wantsLayer = YES;
        self.layerContentsRedrawPolicy = NSViewLayerContentsRedrawDuringViewResize;
    }
    return self;
}

- (BOOL)acceptsFirstResponder { return YES; }
- (BOOL)isFlipped { return NO; }

@end

// C entry points called from Go.
// Using manual retain/release because CGo compiles without ARC by default.
void *phantom_terminal_view_new(double width, double height) {
    NSRect frame = NSMakeRect(0, 0, width, height);
    PhantomTerminalView *view = [[PhantomTerminalView alloc] initWithFrame:frame];
    return (void *)view; // caller holds the retain; release with phantom_terminal_view_release
}

void phantom_terminal_view_release(void *handle) {
    if (!handle) return;
    NSView *view = (NSView *)handle;
    [view release];
}

void phantom_terminal_view_set_frame(void *handle, double x, double y, double width, double height) {
    if (!handle) return;
    NSView *view = (NSView *)handle;
    NSRect rect = NSMakeRect(x, y, width, height);
    dispatch_async(dispatch_get_main_queue(), ^{
        view.frame = rect;
    });
}

double phantom_terminal_view_scale(void *handle) {
    if (!handle) return 2.0;
    NSView *view = (NSView *)handle;
    NSScreen *screen = view.window.screen ?: NSScreen.mainScreen;
    return screen.backingScaleFactor;
}
