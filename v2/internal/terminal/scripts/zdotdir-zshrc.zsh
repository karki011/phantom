# Author: Subash Karki
# PhantomOS zsh ZDOTDIR shim. Restores the user's ZDOTDIR, sources their
# real .zshrc, then loads our shell integration script.

if [[ -n "$USER_ZDOTDIR" ]]; then
	ZDOTDIR="$USER_ZDOTDIR"
else
	# Recover original ZDOTDIR from $HOME if USER_ZDOTDIR wasn't set.
	ZDOTDIR="$HOME"
fi

if [[ -f "$ZDOTDIR/.zshrc" ]]; then
	. "$ZDOTDIR/.zshrc"
fi

if [[ -n "${PHANTOM_SHELL_INTEGRATION_SCRIPT:-}" && -r "${PHANTOM_SHELL_INTEGRATION_SCRIPT}" ]]; then
	. "${PHANTOM_SHELL_INTEGRATION_SCRIPT}"
fi
