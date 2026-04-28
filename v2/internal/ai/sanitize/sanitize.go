// Package sanitize escapes adversarial content in source files before
// they are wrapped in XML blocks for AI context injection. This prevents
// prompt injection via crafted file contents.
//
// Author: Subash Karki
package sanitize

import "strings"

// xmlReplacer escapes XML-like tags that could break our context framing.
var xmlReplacer = strings.NewReplacer(
	"</codebase-context>", "&lt;/codebase-context&gt;",
	"</strategy-guidance>", "&lt;/strategy-guidance&gt;",
	"</phantom-context>", "&lt;/phantom-context&gt;",
	"</phantom-analysis>", "&lt;/phantom-analysis&gt;",
	"<system>", "&lt;system&gt;",
	"</system>", "&lt;/system&gt;",
	"<system-reminder>", "&lt;system-reminder&gt;",
	"</system-reminder>", "&lt;/system-reminder&gt;",
)

// XMLTags escapes XML-like tags in content that will be wrapped in XML blocks.
// This prevents prompt injection via source file contents that contain
// adversarial closing tags or system-level directives.
func XMLTags(content string) string {
	return xmlReplacer.Replace(content)
}
