# Author: Subash Karki
# ---------------------------------------------------------------------------------------------
# Phantom shell integration for zsh. Emits OSC 633 sequences so the
# terminal frontend can detect prompt/command/exit boundaries.
#
# Adapted from VS Code (MIT License, (c) Microsoft Corporation).
# Original: src/vs/workbench/contrib/terminal/common/scripts/shellIntegration-rc.zsh
# ---------------------------------------------------------------------------------------------
builtin autoload -Uz add-zsh-hook is-at-least

if [ -n "$PHANTOM_SHELL_INTEGRATION" ]; then
	ZDOTDIR=$USER_ZDOTDIR
	builtin return
fi

PHANTOM_SHELL_INTEGRATION=1

# Backslashes doubled, semicolons and control chars hex-encoded.
__phantom_escape_value() {
	builtin emulate -L zsh

	builtin local LC_ALL=C str="$1" i byte token out='' val

	for (( i = 0; i < ${#str}; ++i )); do
		byte="${str:$i:1}"
		val=$(printf "%d" "'$byte")
		if (( val < 31 )); then
			token=$(printf "\\\\x%02x" "'$byte")
		elif [ "$byte" = "\\" ]; then
			token="\\\\"
		elif [ "$byte" = ";" ]; then
			token="\\x3b"
		else
			token="$byte"
		fi
		out+="$token"
	done

	builtin print -r -- "$out"
}

__phantom_in_command_execution="1"
__phantom_current_command=""

__phantom_prompt_start()       { builtin printf '\e]633;A\a'; }
__phantom_prompt_end()         { builtin printf '\e]633;B\a'; }
__phantom_continuation_start() { builtin printf '\e]633;F\a'; }
__phantom_continuation_end()   { builtin printf '\e]633;G\a'; }
__phantom_right_prompt_start() { builtin printf '\e]633;H\a'; }
__phantom_right_prompt_end()   { builtin printf '\e]633;I\a'; }

__phantom_update_cwd() {
	builtin printf '\e]633;P;Cwd=%s\a' "$(__phantom_escape_value "${PWD}")"
}

__phantom_command_output_start() {
	builtin printf '\e]633;E;%s\a' "$(__phantom_escape_value "${__phantom_current_command}")"
	builtin printf '\e]633;C\a'
}

__phantom_command_complete() {
	if [[ "$__phantom_current_command" == "" ]]; then
		builtin printf '\e]633;D\a'
	else
		builtin printf '\e]633;D;%s\a' "$__phantom_status"
	fi
	__phantom_update_cwd
}

if [[ -o NOUNSET ]]; then
	if [ -z "${RPROMPT-}" ]; then RPROMPT=""; fi
fi

__phantom_update_prompt() {
	__phantom_prior_prompt="$PS1"
	__phantom_prior_prompt2="$PS2"
	__phantom_in_command_execution=""
	PS1="%{$(__phantom_prompt_start)%}$PS1%{$(__phantom_prompt_end)%}"
	PS2="%{$(__phantom_continuation_start)%}$PS2%{$(__phantom_continuation_end)%}"
	if [ -n "$RPROMPT" ]; then
		__phantom_prior_rprompt="$RPROMPT"
		RPROMPT="%{$(__phantom_right_prompt_start)%}$RPROMPT%{$(__phantom_right_prompt_end)%}"
	fi
}

__phantom_precmd() {
	builtin local __phantom_status="$?"
	if [ -z "${__phantom_in_command_execution-}" ]; then
		__phantom_command_output_start
	fi

	__phantom_command_complete "$__phantom_status"
	__phantom_current_command=""

	if [ -n "$__phantom_in_command_execution" ]; then
		__phantom_update_prompt
	fi
}

__phantom_preexec() {
	PS1="$__phantom_prior_prompt"
	PS2="$__phantom_prior_prompt2"
	if [ -n "$RPROMPT" ]; then
		RPROMPT="$__phantom_prior_rprompt"
	fi
	__phantom_in_command_execution="1"
	__phantom_current_command=$1
	__phantom_command_output_start
}

# ─── Claude command intercept ────────────────────────────────────────────────
# When the user types `claude ...` in a Phantom terminal, this function spawns
# a MANAGED Claude session through Phantom's API. Phantom owns the process
# lifecycle, tracks tool calls in real-time for the pill, and allows
# Persona to pause/stop/redirect the session.
#
# If the API is unreachable, falls back to running the real claude binary.
claude() {
	builtin emulate -L zsh

	local __phantom_port="${PHANTOM_API_PORT:-3849}"
	local __phantom_tid="${PHANTOM_TERMINAL_ID:-}"
	local __phantom_args="$*"
	local __phantom_cwd="${PWD}"

	# Emit OSC notification (for pill update even if API fails).
	builtin printf '\e]633;Claude;%s\a' "$__phantom_args"

	# Try spawning a managed session via Phantom API.
	if (( $+commands[curl] )); then
		local __phantom_json
		__phantom_json=$(builtin printf '{"args":"%s","cwd":"%s","terminalId":"%s"}' \
			"${__phantom_args//\"/\\\"}" \
			"${__phantom_cwd//\"/\\\"}" \
			"$__phantom_tid")

		local __phantom_resp
		__phantom_resp=$(command curl -s --max-time 3 \
			-X POST "http://localhost:${__phantom_port}/api/persona/claude" \
			-H 'Content-Type: application/json' \
			-d "$__phantom_json" 2>/dev/null)

		if [[ $? -eq 0 ]] && builtin print -r -- "$__phantom_resp" | command grep -q '"text"'; then
			# Phantom accepted the session.
			builtin printf '\n\033[1;36mPhantom\033[0m is managing this Claude session.\n'
			builtin printf '  %s\n' "$(builtin print -r -- "$__phantom_resp" | command grep -o '"text":"[^"]*"' | head -1 | cut -d'"' -f4)"
			builtin printf '  Use the Persona pill to monitor, pause, or stop.\n\n'
			return 0
		fi
	fi

	# Fallback: API unreachable — run claude directly.
	command claude "$@"
}

add-zsh-hook precmd __phantom_precmd
add-zsh-hook preexec __phantom_preexec
