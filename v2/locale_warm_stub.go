//go:build !ghostty

// Author: Subash Karki
package main

// warmLocale is a no-op when libghostty is not linked. The fork()/setlocale()
// startup deadlock it guards against only occurs in the cgo (ghostty) build;
// see locale_warm.go for the full explanation.
func warmLocale() {}
