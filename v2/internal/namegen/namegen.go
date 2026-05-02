// Author: Subash Karki
//
// Package namegen generates memorable session names using Pokémon names.
// Names are stored lowercase in the pool and returned in Title case.
package namegen

import (
	"fmt"
	"math/rand/v2"
	"strings"
)

// names is a curated list of ~151 popular Pokémon (Gen 1-3 favorites).
// Stored lowercase; Generate returns Title case.
var names = []string{
	// Gen 1
	"bulbasaur", "ivysaur", "venusaur", "charmander", "charmeleon", "charizard",
	"squirtle", "wartortle", "blastoise", "caterpie", "butterfree", "pikachu",
	"raichu", "sandshrew", "nidoqueen", "nidoking", "clefairy", "clefable",
	"vulpix", "ninetales", "jigglypuff", "wigglytuff", "zubat", "golbat",
	"oddish", "vileplume", "paras", "parasect", "diglett", "dugtrio",
	"meowth", "persian", "psyduck", "golduck", "mankey", "primeape",
	"growlithe", "arcanine", "poliwag", "poliwrath", "abra", "kadabra",
	"alakazam", "machop", "machamp", "bellsprout", "tentacool", "geodude",
	"golem", "ponyta", "rapidash", "slowpoke", "slowbro", "magnemite",
	"magneton", "farfetchd", "dodrio", "seel", "dewgong", "grimer",
	"muk", "shellder", "cloyster", "gastly", "haunter", "gengar",
	"onix", "drowzee", "hypno", "krabby", "kingler", "voltorb",
	"electrode", "exeggcute", "exeggutor", "cubone", "marowak", "hitmonlee",
	"hitmonchan", "lickitung", "koffing", "weezing", "rhyhorn", "rhydon",
	"chansey", "tangela", "kangaskhan", "horsea", "seadra", "goldeen",
	"seaking", "staryu", "starmie", "scyther", "jynx", "electabuzz",
	"magmar", "pinsir", "tauros", "magikarp", "gyarados", "lapras",
	"ditto", "eevee", "vaporeon", "jolteon", "flareon", "porygon",
	"omanyte", "omastar", "kabuto", "kabutops", "aerodactyl", "snorlax",
	"articuno", "zapdos", "moltres", "dratini", "dragonair", "dragonite",
	"mewtwo", "mew",
	// Gen 2
	"chikorita", "cyndaquil", "totodile", "furret", "hoothoot", "noctowl",
	"togetic", "mareep", "ampharos", "bellossom", "marill", "sudowoodo",
	"espeon", "umbreon", "murkrow", "slowking", "misdreavus", "unown",
	"wobbuffet", "girafarig", "pineco", "dunsparce", "gligar", "steelix",
	"snubbull", "scizor", "shuckle", "heracross", "sneasel", "teddiursa",
	"slugma", "swinub", "corsola", "remoraid", "delibird", "skarmory",
	"houndoom", "kingdra", "donphan", "porygon2", "stantler", "smeargle",
	"tyrogue", "hitmontop", "elekid", "magby", "miltank", "blissey",
	"raikou", "entei", "suicune", "larvitar", "tyranitar", "lugia", "celebi",
	// Gen 3
	"treecko", "torchic", "mudkip", "mightyena", "zigzagoon", "beautifly",
	"lotad", "gardevoir", "ralts", "sableye", "mawile", "aggron",
	"meditite", "electrike", "manectric", "roselia", "carvanha", "sharpedo",
	"wailord", "numel", "camerupt", "torkoal", "spinda", "trapinch",
	"flygon", "cacturne", "altaria", "zangoose", "seviper", "lunatone",
	"solrock", "whiscash", "crawdaunt", "baltoy", "feebas", "milotic",
	"absol", "snorunt", "glalie", "spheal", "walrein", "clamperl",
	"bagon", "shelgon", "salamence", "beldum", "metang", "metagross",
	"regirock", "registeel", "latias", "latios", "kyogre", "groudon",
	"rayquaza", "jirachi",
}

// maxRetries is the cap on collision retries before appending a number.
const maxRetries = 50

// Generate returns a random Pokémon name in Title case (e.g. "Pikachu").
func Generate() string {
	idx := rand.IntN(len(names))
	return titleCase(names[idx])
}

// GenerateUnique picks a name not present in existing. If all names collide
// after maxRetries attempts, appends a numeric suffix (e.g. "Pikachu-7").
func GenerateUnique(existing map[string]bool) string {
	for i := 0; i < maxRetries; i++ {
		name := Generate()
		if !existing[name] {
			return name
		}
	}
	// All retries collided — append a random suffix.
	base := Generate()
	for suffix := 2; suffix < 10000; suffix++ {
		candidate := fmt.Sprintf("%s-%d", base, suffix)
		if !existing[candidate] {
			return candidate
		}
	}
	// Extremely unlikely fallback.
	return fmt.Sprintf("%s-%d", base, rand.IntN(99999))
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
