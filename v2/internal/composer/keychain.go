// Author: Subash Karki
//
// Package composer — Keychain helpers for the user's Anthropic API key.
//
// Storage location: macOS Login Keychain
//   service:  PhantomOS
//   account:  anthropic-api-key
//
// The key is consumed at spawn time by both Composer and Chat services as
// the ANTHROPIC_API_KEY environment variable on the spawned `claude` CLI.
// When no key is present, callers fall through to the user's existing
// claude subscription (no env var injected — same code path as before).
package composer

import (
	"errors"
	"fmt"
	"strings"

	keychain "github.com/keybase/go-keychain"
)

const (
	keychainService = "PhantomOS"
	keychainAccount = "anthropic-api-key"
	keychainLabel   = "Phantom — Anthropic API Key"
)

// GetAnthropicAPIKey returns the user-provided Anthropic API key from the
// macOS login Keychain. The boolean is true only when a non-empty key is
// found. Errors (Keychain locked, missing) collapse to (false, nil) so
// callers can simply branch on the bool.
func GetAnthropicAPIKey() (string, bool) {
	q := keychain.NewItem()
	q.SetSecClass(keychain.SecClassGenericPassword)
	q.SetService(keychainService)
	q.SetAccount(keychainAccount)
	q.SetMatchLimit(keychain.MatchLimitOne)
	q.SetReturnData(true)

	results, err := keychain.QueryItem(q)
	if err != nil || len(results) == 0 {
		return "", false
	}
	key := strings.TrimSpace(string(results[0].Data))
	if key == "" {
		return "", false
	}
	return key, true
}

// HasAnthropicAPIKey reports whether a key is stored. Cheaper than
// GetAnthropicAPIKey because it does not return secret data.
func HasAnthropicAPIKey() bool {
	q := keychain.NewItem()
	q.SetSecClass(keychain.SecClassGenericPassword)
	q.SetService(keychainService)
	q.SetAccount(keychainAccount)
	q.SetMatchLimit(keychain.MatchLimitOne)

	results, err := keychain.QueryItem(q)
	if err != nil {
		return false
	}
	return len(results) > 0
}

// SetAnthropicAPIKey writes the key to the Keychain, replacing any
// existing value. Empty input returns an error — call ClearAnthropicAPIKey
// instead to remove the entry.
func SetAnthropicAPIKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return errors.New("composer/keychain: refusing to store empty key")
	}

	item := keychain.NewItem()
	item.SetSecClass(keychain.SecClassGenericPassword)
	item.SetService(keychainService)
	item.SetAccount(keychainAccount)
	item.SetLabel(keychainLabel)
	item.SetData([]byte(key))
	item.SetSynchronizable(keychain.SynchronizableNo)
	item.SetAccessible(keychain.AccessibleWhenUnlocked)

	if err := keychain.AddItem(item); err == nil {
		return nil
	} else if !errors.Is(err, keychain.ErrorDuplicateItem) {
		return fmt.Errorf("composer/keychain: add item: %w", err)
	}

	// Update existing entry.
	q := keychain.NewItem()
	q.SetSecClass(keychain.SecClassGenericPassword)
	q.SetService(keychainService)
	q.SetAccount(keychainAccount)

	upd := keychain.NewItem()
	upd.SetData([]byte(key))
	upd.SetLabel(keychainLabel)

	if err := keychain.UpdateItem(q, upd); err != nil {
		return fmt.Errorf("composer/keychain: update item: %w", err)
	}
	return nil
}

// ClearAnthropicAPIKey removes the stored key. It is a no-op when no key
// is present, so callers can use this idempotently to "switch back to
// subscription mode".
func ClearAnthropicAPIKey() error {
	q := keychain.NewItem()
	q.SetSecClass(keychain.SecClassGenericPassword)
	q.SetService(keychainService)
	q.SetAccount(keychainAccount)

	if err := keychain.DeleteItem(q); err != nil {
		if errors.Is(err, keychain.ErrorItemNotFound) {
			return nil
		}
		return fmt.Errorf("composer/keychain: delete item: %w", err)
	}
	return nil
}
