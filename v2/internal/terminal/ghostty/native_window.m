// Author: Subash Karki
//
// Minimal NSApplication + NSWindow helpers used by the standalone
// phantom-libghostty-demo binary. Kept in the ghostty package so it
// links into the same cgo unit as the rest of the bridge (single
// translation unit per cgo file group; no cross-package Objective-C).
//
// Production Phantom path doesn't use these — Wails owns the NSWindow.
// This is strictly for headless perf verification of libghostty.

#import <Cocoa/Cocoa.h>
#import <AppKit/AppKit.h>

// Forward declaration for handoff to PhantomTerminalView in native_macos.m.
// We don't need a real header — symbol resolved at link time inside the same
// cgo translation unit group.

@interface PhantomDemoAppDelegate : NSObject <NSApplicationDelegate>
@end

@implementation PhantomDemoAppDelegate
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    return NSTerminateNow;
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}
@end

static PhantomDemoAppDelegate *gAppDelegate = nil;

void phantom_app_init(void) {
    @autoreleasepool {
        // NSApp must be created on main thread. Caller (Go side) ensures
        // runtime.LockOSThread() on the goroutine that runs main().
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

        if (gAppDelegate == nil) {
            gAppDelegate = [[PhantomDemoAppDelegate alloc] init];
            [NSApp setDelegate:gAppDelegate];
        }
    }
}

void *phantom_window_new(double width, double height, const char *title) {
    @autoreleasepool {
        NSRect frame = NSMakeRect(0, 0, width, height);
        NSWindowStyleMask style = NSWindowStyleMaskTitled |
                                  NSWindowStyleMaskClosable |
                                  NSWindowStyleMaskResizable |
                                  NSWindowStyleMaskMiniaturizable;
        NSWindow *window = [[NSWindow alloc] initWithContentRect:frame
                                                       styleMask:style
                                                         backing:NSBackingStoreBuffered
                                                           defer:NO];
        NSString *t = [NSString stringWithUTF8String:(title ? title : "Phantom")];
        [window setTitle:t];
        [window center];
        [window setReleasedWhenClosed:NO];
        return (void *)window;
    }
}

void phantom_window_set_content_view(void *windowHandle, void *viewHandle) {
    if (!windowHandle || !viewHandle) return;
    NSWindow *window = (NSWindow *)windowHandle;
    NSView *view = (NSView *)viewHandle;

    dispatch_block_t block = ^{
        // Size the view to fill the window's content rect.
        NSRect contentBounds = [[window contentView] bounds];
        [view setFrame:contentBounds];
        [view setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
        [window setContentView:view];
        [window makeFirstResponder:view];
    };
    if ([NSThread isMainThread]) {
        block();
    } else {
        dispatch_sync(dispatch_get_main_queue(), block);
    }
}

void phantom_window_show(void *windowHandle) {
    if (!windowHandle) return;
    NSWindow *window = (NSWindow *)windowHandle;
    dispatch_block_t block = ^{
        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
    };
    if ([NSThread isMainThread]) {
        block();
    } else {
        dispatch_sync(dispatch_get_main_queue(), block);
    }
}

void phantom_run_event_loop(void) {
    [NSApp run];
}

void phantom_stop_event_loop(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSApp stop:nil];
        // Post a no-op event so [NSApp run] actually returns.
        NSEvent *event = [NSEvent otherEventWithType:NSEventTypeApplicationDefined
                                            location:NSZeroPoint
                                       modifierFlags:0
                                           timestamp:0
                                        windowNumber:0
                                             context:nil
                                             subtype:0
                                               data1:0
                                               data2:0];
        [NSApp postEvent:event atStart:YES];
    });
}
