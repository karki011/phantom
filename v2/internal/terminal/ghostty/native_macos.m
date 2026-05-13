// Author: Subash Karki
//
// PhantomTerminalView — Objective-C NSView subclass that hosts the
// CAMetalLayer libghostty draws into. Exposed back to Go via
// phantom_terminal_view_new() which returns the bare void* (NSView *).
//
// Input bridge: keyDown:/flagsChanged:/insertText: convert NSEvent →
// ghostty_input_key_s and feed ghostty_surface_key / ghostty_surface_text.

#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <Metal/Metal.h>
#import <Carbon/Carbon.h>

#include "ghostty.h"

@interface PhantomTerminalView : NSView <NSTextInputClient>
@property (assign, nonatomic) ghostty_surface_t surface;
@property (assign, nonatomic) ghostty_input_mods_e currentMods;
@property (retain, nonatomic) NSMutableString *pendingMarked;
- (void)pushSizeToSurface;
- (void)pushDisplayIDToSurface;
@end

// ---- key map -----------------------------------------------------------
// Subset of AppKit/HID virtual keycodes → ghostty_input_key_e.
// Anything not listed gets GHOSTTY_KEY_UNIDENTIFIED — text input still
// works through insertText:.
static ghostty_input_key_e phantom_keycode_to_ghostty(unsigned short kc) {
    switch (kc) {
        // Letters
        case kVK_ANSI_A: return GHOSTTY_KEY_A;
        case kVK_ANSI_B: return GHOSTTY_KEY_B;
        case kVK_ANSI_C: return GHOSTTY_KEY_C;
        case kVK_ANSI_D: return GHOSTTY_KEY_D;
        case kVK_ANSI_E: return GHOSTTY_KEY_E;
        case kVK_ANSI_F: return GHOSTTY_KEY_F;
        case kVK_ANSI_G: return GHOSTTY_KEY_G;
        case kVK_ANSI_H: return GHOSTTY_KEY_H;
        case kVK_ANSI_I: return GHOSTTY_KEY_I;
        case kVK_ANSI_J: return GHOSTTY_KEY_J;
        case kVK_ANSI_K: return GHOSTTY_KEY_K;
        case kVK_ANSI_L: return GHOSTTY_KEY_L;
        case kVK_ANSI_M: return GHOSTTY_KEY_M;
        case kVK_ANSI_N: return GHOSTTY_KEY_N;
        case kVK_ANSI_O: return GHOSTTY_KEY_O;
        case kVK_ANSI_P: return GHOSTTY_KEY_P;
        case kVK_ANSI_Q: return GHOSTTY_KEY_Q;
        case kVK_ANSI_R: return GHOSTTY_KEY_R;
        case kVK_ANSI_S: return GHOSTTY_KEY_S;
        case kVK_ANSI_T: return GHOSTTY_KEY_T;
        case kVK_ANSI_U: return GHOSTTY_KEY_U;
        case kVK_ANSI_V: return GHOSTTY_KEY_V;
        case kVK_ANSI_W: return GHOSTTY_KEY_W;
        case kVK_ANSI_X: return GHOSTTY_KEY_X;
        case kVK_ANSI_Y: return GHOSTTY_KEY_Y;
        case kVK_ANSI_Z: return GHOSTTY_KEY_Z;
        // Digits
        case kVK_ANSI_0: return GHOSTTY_KEY_DIGIT_0;
        case kVK_ANSI_1: return GHOSTTY_KEY_DIGIT_1;
        case kVK_ANSI_2: return GHOSTTY_KEY_DIGIT_2;
        case kVK_ANSI_3: return GHOSTTY_KEY_DIGIT_3;
        case kVK_ANSI_4: return GHOSTTY_KEY_DIGIT_4;
        case kVK_ANSI_5: return GHOSTTY_KEY_DIGIT_5;
        case kVK_ANSI_6: return GHOSTTY_KEY_DIGIT_6;
        case kVK_ANSI_7: return GHOSTTY_KEY_DIGIT_7;
        case kVK_ANSI_8: return GHOSTTY_KEY_DIGIT_8;
        case kVK_ANSI_9: return GHOSTTY_KEY_DIGIT_9;
        // Punctuation
        case kVK_ANSI_Minus:        return GHOSTTY_KEY_MINUS;
        case kVK_ANSI_Equal:        return GHOSTTY_KEY_EQUAL;
        case kVK_ANSI_LeftBracket:  return GHOSTTY_KEY_BRACKET_LEFT;
        case kVK_ANSI_RightBracket: return GHOSTTY_KEY_BRACKET_RIGHT;
        case kVK_ANSI_Backslash:    return GHOSTTY_KEY_BACKSLASH;
        case kVK_ANSI_Semicolon:    return GHOSTTY_KEY_SEMICOLON;
        case kVK_ANSI_Quote:        return GHOSTTY_KEY_QUOTE;
        case kVK_ANSI_Comma:        return GHOSTTY_KEY_COMMA;
        case kVK_ANSI_Period:       return GHOSTTY_KEY_PERIOD;
        case kVK_ANSI_Slash:        return GHOSTTY_KEY_SLASH;
        case kVK_ANSI_Grave:        return GHOSTTY_KEY_BACKQUOTE;
        // Whitespace / navigation
        case kVK_Return:        return GHOSTTY_KEY_ENTER;
        case kVK_Tab:           return GHOSTTY_KEY_TAB;
        case kVK_Space:         return GHOSTTY_KEY_SPACE;
        case kVK_Delete:        return GHOSTTY_KEY_BACKSPACE;
        case kVK_ForwardDelete: return GHOSTTY_KEY_DELETE;
        case kVK_Escape:        return GHOSTTY_KEY_ESCAPE;
        case kVK_LeftArrow:     return GHOSTTY_KEY_ARROW_LEFT;
        case kVK_RightArrow:    return GHOSTTY_KEY_ARROW_RIGHT;
        case kVK_DownArrow:     return GHOSTTY_KEY_ARROW_DOWN;
        case kVK_UpArrow:       return GHOSTTY_KEY_ARROW_UP;
        case kVK_Home:          return GHOSTTY_KEY_HOME;
        case kVK_End:           return GHOSTTY_KEY_END;
        case kVK_PageUp:        return GHOSTTY_KEY_PAGE_UP;
        case kVK_PageDown:      return GHOSTTY_KEY_PAGE_DOWN;
        // Modifiers (also sent via flagsChanged)
        case kVK_Shift:        return GHOSTTY_KEY_SHIFT_LEFT;
        case kVK_RightShift:   return GHOSTTY_KEY_SHIFT_RIGHT;
        case kVK_Control:      return GHOSTTY_KEY_CONTROL_LEFT;
        case kVK_RightControl: return GHOSTTY_KEY_CONTROL_RIGHT;
        case kVK_Option:       return GHOSTTY_KEY_ALT_LEFT;
        case kVK_RightOption:  return GHOSTTY_KEY_ALT_RIGHT;
        case kVK_Command:      return GHOSTTY_KEY_META_LEFT;
        case kVK_RightCommand: return GHOSTTY_KEY_META_RIGHT;
        case kVK_CapsLock:     return GHOSTTY_KEY_CAPS_LOCK;
        // Function row
        case kVK_F1:  return GHOSTTY_KEY_F1;
        case kVK_F2:  return GHOSTTY_KEY_F2;
        case kVK_F3:  return GHOSTTY_KEY_F3;
        case kVK_F4:  return GHOSTTY_KEY_F4;
        case kVK_F5:  return GHOSTTY_KEY_F5;
        case kVK_F6:  return GHOSTTY_KEY_F6;
        case kVK_F7:  return GHOSTTY_KEY_F7;
        case kVK_F8:  return GHOSTTY_KEY_F8;
        case kVK_F9:  return GHOSTTY_KEY_F9;
        case kVK_F10: return GHOSTTY_KEY_F10;
        case kVK_F11: return GHOSTTY_KEY_F11;
        case kVK_F12: return GHOSTTY_KEY_F12;
        default:     return GHOSTTY_KEY_UNIDENTIFIED;
    }
}

static ghostty_input_mods_e phantom_mods_from_event(NSEvent *evt) {
    NSEventModifierFlags f = evt.modifierFlags;
    ghostty_input_mods_e m = GHOSTTY_MODS_NONE;
    if (f & NSEventModifierFlagShift)     m |= GHOSTTY_MODS_SHIFT;
    if (f & NSEventModifierFlagControl)   m |= GHOSTTY_MODS_CTRL;
    if (f & NSEventModifierFlagOption)    m |= GHOSTTY_MODS_ALT;
    if (f & NSEventModifierFlagCommand)   m |= GHOSTTY_MODS_SUPER;
    if (f & NSEventModifierFlagCapsLock)  m |= GHOSTTY_MODS_CAPS;
    if (f & NSEventModifierFlagNumericPad) m |= GHOSTTY_MODS_NUM;
    return m;
}

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
        self.surface = NULL;
        self.currentMods = GHOSTTY_MODS_NONE;
        self.pendingMarked = [[NSMutableString alloc] init];
    }
    return self;
}

- (void)dealloc {
    [NSNotificationCenter.defaultCenter removeObserver:self];
    [_pendingMarked release];
    [super dealloc];
}

// ---- resize / scale ------------------------------------------------
- (void)pushSizeToSurface {
    if (self.surface == NULL) return;
    CGFloat scale = self.window.screen.backingScaleFactor;
    if (scale <= 0) scale = NSScreen.mainScreen.backingScaleFactor;
    if (scale <= 0) scale = 2.0;
    uint32_t w = (uint32_t)(self.bounds.size.width  * scale);
    uint32_t h = (uint32_t)(self.bounds.size.height * scale);
    if (w == 0 || h == 0) return;
    ghostty_surface_set_content_scale(self.surface, scale, scale);
    ghostty_surface_set_size(self.surface, w, h);
    // Keep the CAMetalLayer drawableSize in lockstep so Metal doesn't stretch.
    CAMetalLayer *layer = (CAMetalLayer *)self.layer;
    if ([layer isKindOfClass:[CAMetalLayer class]]) {
        layer.contentsScale = scale;
        layer.drawableSize = CGSizeMake(w, h);
    }
}

- (void)pushDisplayIDToSurface {
    if (self.surface == NULL) return;
    NSScreen *screen = self.window.screen ?: NSScreen.mainScreen;
    NSNumber *num = screen.deviceDescription[@"NSScreenNumber"];
    if (num == nil) return;
    uint32_t displayID = (uint32_t)num.unsignedIntValue;
    if (displayID == 0) return;
    ghostty_surface_set_display_id(self.surface, displayID);
}

- (void)setFrameSize:(NSSize)newSize {
    [super setFrameSize:newSize];
    [self pushSizeToSurface];
}

- (void)viewDidChangeBackingProperties {
    [super viewDidChangeBackingProperties];
    [self pushSizeToSurface];
    [self pushDisplayIDToSurface];
}

- (void)viewDidMoveToWindow {
    [super viewDidMoveToWindow];
    [self updateTrackingAreas];
    [self pushSizeToSurface];
    [self pushDisplayIDToSurface];
    // Listen for window→screen moves so ProMotion + display refresh follow.
    NSNotificationCenter *nc = NSNotificationCenter.defaultCenter;
    [nc removeObserver:self name:NSWindowDidChangeScreenNotification object:nil];
    if (self.window) {
        [nc addObserver:self
               selector:@selector(phantomWindowDidChangeScreen:)
                   name:NSWindowDidChangeScreenNotification
                 object:self.window];
    }
}

- (void)phantomWindowDidChangeScreen:(NSNotification *)note {
    [self pushSizeToSurface];
    [self pushDisplayIDToSurface];
}

- (BOOL)acceptsFirstResponder { return YES; }
- (BOOL)becomeFirstResponder {
    BOOL ok = [super becomeFirstResponder];
    if (ok && self.surface != NULL) {
        ghostty_surface_set_focus(self.surface, true);
    }
    return ok;
}
- (BOOL)resignFirstResponder {
    if (self.surface != NULL) {
        ghostty_surface_set_focus(self.surface, false);
    }
    return [super resignFirstResponder];
}
- (BOOL)isFlipped { return NO; }

// ---- key events ----------------------------------------------------
- (void)keyDown:(NSEvent *)event {
    if (self.surface == NULL) {
        [super keyDown:event];
        return;
    }
    self.currentMods = phantom_mods_from_event(event);

    NSString *chars = event.characters ?: @"";
    NSString *unshifted = event.charactersIgnoringModifiers ?: @"";
    const char *utf8 = [chars UTF8String];

    ghostty_input_key_s key = (ghostty_input_key_s){0};
    key.action = event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
    key.mods = self.currentMods;
    key.consumed_mods = GHOSTTY_MODS_NONE;
    key.keycode = phantom_keycode_to_ghostty(event.keyCode);
    key.text = utf8;
    key.unshifted_codepoint = unshifted.length > 0 ? [unshifted characterAtIndex:0] : 0;
    key.composing = false;

    bool consumed = ghostty_surface_key(self.surface, key);

    // For plain printable text (no Cmd/Ctrl), also feed text path so IME
    // and dead keys work via the NSTextInputClient route.
    if (!consumed && chars.length > 0 &&
        !(event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl))) {
        [self interpretKeyEvents:@[event]];
    }
}

- (void)keyUp:(NSEvent *)event {
    if (self.surface == NULL) return;
    self.currentMods = phantom_mods_from_event(event);
    ghostty_input_key_s key = (ghostty_input_key_s){0};
    key.action = GHOSTTY_ACTION_RELEASE;
    key.mods = self.currentMods;
    key.keycode = phantom_keycode_to_ghostty(event.keyCode);
    key.text = "";
    key.unshifted_codepoint = 0;
    ghostty_surface_key(self.surface, key);
}

- (void)flagsChanged:(NSEvent *)event {
    if (self.surface == NULL) return;
    self.currentMods = phantom_mods_from_event(event);
    ghostty_input_key_s key = (ghostty_input_key_s){0};
    // We can't easily tell press vs release for modifiers from flagsChanged
    // alone; libghostty internally tracks via mods so treat as press.
    key.action = GHOSTTY_ACTION_PRESS;
    key.mods = self.currentMods;
    key.keycode = phantom_keycode_to_ghostty(event.keyCode);
    key.text = "";
    key.unshifted_codepoint = 0;
    ghostty_surface_key(self.surface, key);
}

// ---- NSTextInputClient ---------------------------------------------
- (void)insertText:(id)str replacementRange:(NSRange)replacementRange {
    if (self.surface == NULL) return;
    NSString *s = [str isKindOfClass:[NSAttributedString class]] ? [(NSAttributedString*)str string] : (NSString*)str;
    if (s.length == 0) return;
    const char *utf8 = [s UTF8String];
    ghostty_surface_text(self.surface, utf8, strlen(utf8));
}

- (void)setMarkedText:(id)string selectedRange:(NSRange)sel replacementRange:(NSRange)rep {
    if (self.surface == NULL) return;
    NSString *s = [string isKindOfClass:[NSAttributedString class]] ? [(NSAttributedString*)string string] : (NSString*)string;
    [self.pendingMarked setString:s ?: @""];
    const char *utf8 = [self.pendingMarked UTF8String];
    ghostty_surface_preedit(self.surface, utf8, strlen(utf8));
}

- (void)unmarkText {
    if (self.surface == NULL) return;
    [self.pendingMarked setString:@""];
    ghostty_surface_preedit(self.surface, "", 0);
}

- (NSRange)selectedRange  { return NSMakeRange(NSNotFound, 0); }
- (NSRange)markedRange    { return self.pendingMarked.length > 0 ? NSMakeRange(0, self.pendingMarked.length) : NSMakeRange(NSNotFound, 0); }
- (BOOL)hasMarkedText     { return self.pendingMarked.length > 0; }
- (NSAttributedString *)attributedSubstringForProposedRange:(NSRange)r actualRange:(NSRangePointer)a { return nil; }
- (NSArray<NSAttributedStringKey> *)validAttributesForMarkedText { return @[]; }
- (NSRect)firstRectForCharacterRange:(NSRange)r actualRange:(NSRangePointer)a { return NSZeroRect; }
- (NSUInteger)characterIndexForPoint:(NSPoint)p { return 0; }
- (void)doCommandBySelector:(SEL)selector { /* Already handled in keyDown via ghostty_surface_key */ }

// ---- mouse events --------------------------------------------------
- (void)updateTrackingAreas {
    for (NSTrackingArea *a in [self.trackingAreas copy]) {
        [self removeTrackingArea:a];
    }
    NSTrackingAreaOptions opts = NSTrackingMouseMoved | NSTrackingMouseEnteredAndExited |
                                 NSTrackingActiveInKeyWindow | NSTrackingInVisibleRect;
    NSTrackingArea *area = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                       options:opts
                                                         owner:self
                                                      userInfo:nil];
    [self addTrackingArea:area];
    [area release];
}

- (NSPoint)mouseLocalPoint:(NSEvent *)event {
    NSPoint p = [self convertPoint:event.locationInWindow fromView:nil];
    // ghostty expects top-left origin; AppKit is bottom-left. Flip Y.
    return NSMakePoint(p.x, self.bounds.size.height - p.y);
}

- (void)forwardMouseButton:(NSEvent *)event button:(ghostty_input_mouse_button_e)btn state:(ghostty_input_mouse_state_e)st {
    if (self.surface == NULL) return;
    self.currentMods = phantom_mods_from_event(event);
    ghostty_surface_mouse_button(self.surface, st, btn, self.currentMods);
    NSPoint p = [self mouseLocalPoint:event];
    ghostty_surface_mouse_pos(self.surface, p.x, p.y, self.currentMods);
}

- (void)mouseDown:(NSEvent *)e   { [self forwardMouseButton:e button:GHOSTTY_MOUSE_LEFT   state:GHOSTTY_MOUSE_PRESS]; }
- (void)mouseUp:(NSEvent *)e     { [self forwardMouseButton:e button:GHOSTTY_MOUSE_LEFT   state:GHOSTTY_MOUSE_RELEASE]; }
- (void)rightMouseDown:(NSEvent *)e { [self forwardMouseButton:e button:GHOSTTY_MOUSE_RIGHT  state:GHOSTTY_MOUSE_PRESS]; }
- (void)rightMouseUp:(NSEvent *)e   { [self forwardMouseButton:e button:GHOSTTY_MOUSE_RIGHT  state:GHOSTTY_MOUSE_RELEASE]; }
- (void)otherMouseDown:(NSEvent *)e { [self forwardMouseButton:e button:GHOSTTY_MOUSE_MIDDLE state:GHOSTTY_MOUSE_PRESS]; }
- (void)otherMouseUp:(NSEvent *)e   { [self forwardMouseButton:e button:GHOSTTY_MOUSE_MIDDLE state:GHOSTTY_MOUSE_RELEASE]; }

- (void)mouseMoved:(NSEvent *)event {
    if (self.surface == NULL) return;
    NSPoint p = [self mouseLocalPoint:event];
    ghostty_surface_mouse_pos(self.surface, p.x, p.y, phantom_mods_from_event(event));
}
- (void)mouseDragged:(NSEvent *)event   { [self mouseMoved:event]; }
- (void)rightMouseDragged:(NSEvent *)e  { [self mouseMoved:e]; }
- (void)otherMouseDragged:(NSEvent *)e  { [self mouseMoved:e]; }

- (void)scrollWheel:(NSEvent *)event {
    if (self.surface == NULL) return;
    double dx = event.scrollingDeltaX;
    double dy = event.scrollingDeltaY;
    int mods = (int)phantom_mods_from_event(event);
    ghostty_surface_mouse_scroll(self.surface, dx, dy, mods);
}

@end

// ---- C entry points -----------------------------------------------------
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

void phantom_terminal_view_attach_surface(void *handle, void *surface) {
    if (!handle) return;
    PhantomTerminalView *view = (PhantomTerminalView *)handle;
    view.surface = (ghostty_surface_t)surface;
    // Push the initial size now so libghostty's renderer + PTY start
    // at the correct rows/cols rather than the placeholder.
    dispatch_async(dispatch_get_main_queue(), ^{
        [view pushSizeToSurface];
    });
}
