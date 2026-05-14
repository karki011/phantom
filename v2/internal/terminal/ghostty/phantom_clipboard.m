// Author: Subash Karki
//
// NSPasteboard helpers for the libghostty clipboard callbacks.
// Called from Go via CGo — must dispatch to main thread for AppKit safety.

#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>

static inline void on_main_sync(void (^block)(void)) {
    if ([NSThread isMainThread]) { block(); } else { dispatch_sync(dispatch_get_main_queue(), block); }
}

// Returns a malloc'd C string with the pasteboard contents (caller must free),
// or NULL if the pasteboard is empty or doesn't contain text.
char *phantom_pasteboard_read(void) {
    __block char *result = NULL;
    on_main_sync(^{
        NSString *text = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
        if (text.length > 0) {
            const char *utf8 = text.UTF8String;
            size_t len = strlen(utf8);
            result = (char *)malloc(len + 1);
            memcpy(result, utf8, len + 1);
        }
    });
    return result;
}

// Writes a UTF-8 C string to the general pasteboard.
void phantom_pasteboard_write(const char *text) {
    if (text == NULL) return;
    NSString *str = [NSString stringWithUTF8String:text];
    on_main_sync(^{
        NSPasteboard *pb = NSPasteboard.generalPasteboard;
        [pb clearContents];
        [pb setString:str forType:NSPasteboardTypeString];
    });
}
