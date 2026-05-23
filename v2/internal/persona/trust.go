// Author: Subash Karki
package persona

import (
	"fmt"
	"sync"
)

type PrefGetter interface {
	GetPreference(key string) string
}

type PrefSetter interface {
	SetPreference(key, value string) error
}

type TrustManager struct {
	mu    sync.RWMutex
	tiers map[string]TrustTier
	prefs PrefGetter
	save  PrefSetter
}

func NewTrustManager(prefs PrefGetter, save PrefSetter) *TrustManager {
	return &TrustManager{
		tiers: make(map[string]TrustTier),
		prefs: prefs,
		save:  save,
	}
}

func (tm *TrustManager) GetTier(projectID string) TrustTier {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	if tier, ok := tm.tiers[projectID]; ok {
		return tier
	}
	if tm.prefs != nil {
		val := tm.prefs.GetPreference(fmt.Sprintf("persona_trust_%s", projectID))
		switch val {
		case "1":
			return TierTerminal
		case "2":
			return TierClaude
		case "3":
			return TierGit
		}
	}
	return TierObserve
}

func (tm *TrustManager) SetTier(projectID string, tier TrustTier) error {
	tm.mu.Lock()
	tm.tiers[projectID] = tier
	tm.mu.Unlock()
	if tm.save != nil {
		return tm.save.SetPreference(
			fmt.Sprintf("persona_trust_%s", projectID),
			fmt.Sprintf("%d", tier),
		)
	}
	return nil
}

func (tm *TrustManager) IsAllowed(projectID string, requiredTier TrustTier) bool {
	return tm.GetTier(projectID) >= requiredTier
}
