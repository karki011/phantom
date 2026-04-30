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

add-zsh-hook precmd __phantom_precmd
add-zsh-hook preexec __phantom_preexec
