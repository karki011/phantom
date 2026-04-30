# Author: Subash Karki
# ---------------------------------------------------------------------------------------------
# PhantomOS shell integration for bash. Emits OSC 633 sequences so the
# terminal frontend can detect prompt/command/exit boundaries.
#
# Adapted from VS Code (MIT License, (c) Microsoft Corporation).
# Original: src/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh
# ---------------------------------------------------------------------------------------------

# Prevent the script recursing when setting up
if [[ -n "${PHANTOM_SHELL_INTEGRATION:-}" ]]; then
	builtin return
fi

PHANTOM_SHELL_INTEGRATION=1

# Source the user's bashrc (skipped here — we wrap via --rcfile from the host).

__phantom_escape_value_fast() {
	builtin local LC_ALL=C out
	out=${1//\\/\\\\}
	out=${out//;/\\x3b}
	builtin printf '%s\n' "${out}"
}

# Backslashes doubled, semicolons and control chars hex-encoded.
__phantom_escape_value() {
	if [ "${#1}" -ge 2000 ]; then
		__phantom_escape_value_fast "$1"
		builtin return
	fi

	builtin local -r LC_ALL=C
	builtin local -r str="${1}"
	builtin local -i i val
	builtin local byte token out=''

	for (( i=0; i < ${#str}; ++i )); do
		byte="${str:$i:1}"
		builtin printf -v val '%d' "'$byte"
		if  (( val < 31 )); then
			builtin printf -v token '\\x%02x' "'$byte"
		elif (( val == 92 )); then
			token="\\\\"
		elif (( val == 59 )); then
			token="\\x3b"
		else
			token="$byte"
		fi
		out+="$token"
	done

	builtin printf '%s\n' "$out"
}

__phantom_initialized=0
__phantom_original_PS1="$PS1"
__phantom_original_PS2="$PS2"
__phantom_custom_PS1=""
__phantom_custom_PS2=""
__phantom_in_command_execution="1"
__phantom_current_command=""

# Use bash history to recover the actual command line if HISTCONTROL allows.
__phantom_regex_histcontrol=".*(erasedups|ignoreboth|ignoredups|ignorespace).*"
if [[ "${HISTCONTROL:-}" =~ $__phantom_regex_histcontrol ]]; then
	__phantom_history_verify=0
else
	__phantom_history_verify=1
fi
builtin unset __phantom_regex_histcontrol

__phantom_prompt_start()      { builtin printf '\e]633;A\a'; }
__phantom_prompt_end()        { builtin printf '\e]633;B\a'; }
__phantom_continuation_start(){ builtin printf '\e]633;F\a'; }
__phantom_continuation_end()  { builtin printf '\e]633;G\a'; }

__phantom_update_cwd() {
	builtin printf '\e]633;P;Cwd=%s\a' "$(__phantom_escape_value "$PWD")"
}

__phantom_command_output_start() {
	if [[ -z "${__phantom_first_prompt-}" ]]; then
		builtin return
	fi
	builtin printf '\e]633;E;%s\a' "$(__phantom_escape_value "${__phantom_current_command}")"
	builtin printf '\e]633;C\a'
}

__phantom_command_complete() {
	if [[ -z "${__phantom_first_prompt-}" ]]; then
		__phantom_update_cwd
		builtin return
	fi
	if [ "$__phantom_current_command" = "" ]; then
		builtin printf '\e]633;D\a'
	else
		builtin printf '\e]633;D;%s\a' "$__phantom_status"
	fi
	__phantom_update_cwd
}

__phantom_update_prompt() {
	if [ "$__phantom_in_command_execution" = "1" ]; then
		if [[ "$__phantom_custom_PS1" == "" || "$__phantom_custom_PS1" != "$PS1" ]]; then
			__phantom_original_PS1=$PS1
			__phantom_custom_PS1="\[$(__phantom_prompt_start)\]$__phantom_original_PS1\[$(__phantom_prompt_end)\]"
			PS1="$__phantom_custom_PS1"
		fi
		if [[ "$__phantom_custom_PS2" == "" || "$__phantom_custom_PS2" != "$PS2" ]]; then
			__phantom_original_PS2=$PS2
			__phantom_custom_PS2="\[$(__phantom_continuation_start)\]$__phantom_original_PS2\[$(__phantom_continuation_end)\]"
			PS2="$__phantom_custom_PS2"
		fi
		__phantom_in_command_execution="0"
	fi
}

__phantom_precmd() {
	__phantom_command_complete "$__phantom_status"
	__phantom_current_command=""
	__phantom_first_prompt=1
	__phantom_update_prompt
}

__phantom_preexec() {
	__phantom_initialized=1
	if [[ ! $BASH_COMMAND == __phantom_prompt* ]]; then
		if [ "$__phantom_history_verify" = "1" ]; then
			__phantom_current_command="$(builtin history 1 | sed 's/ *[0-9]* *//')"
		else
			__phantom_current_command=$BASH_COMMAND
		fi
	else
		__phantom_current_command=""
	fi
	__phantom_command_output_start
}

__phantom_get_trap() {
	builtin local -a terms
	builtin eval "terms=( $(trap -p "${1:-DEBUG}") )"
	builtin printf '%s' "${terms[2]:-}"
}

__phantom_dbg_trap="$(__phantom_get_trap DEBUG)"

if [[ -z "$__phantom_dbg_trap" ]]; then
	__phantom_preexec_only() {
		if [ "$__phantom_in_command_execution" = "0" ]; then
			__phantom_in_command_execution="1"
			__phantom_preexec
		fi
	}
	trap '__phantom_preexec_only "$_"' DEBUG
elif [[ "$__phantom_dbg_trap" != '__phantom_preexec "$_"' && "$__phantom_dbg_trap" != '__phantom_preexec_all "$_"' ]]; then
	__phantom_preexec_all() {
		if [ "$__phantom_in_command_execution" = "0" ]; then
			__phantom_in_command_execution="1"
			__phantom_preexec
			builtin eval "${__phantom_dbg_trap}"
		fi
	}
	trap '__phantom_preexec_all "$_"' DEBUG
fi

__phantom_update_prompt

__phantom_restore_exit_code() { return "$1"; }

__phantom_prompt_cmd_original() {
	__phantom_status="$?"
	builtin local cmd
	__phantom_restore_exit_code "${__phantom_status}"
	for cmd in "${__phantom_original_prompt_command[@]}"; do
		eval "${cmd:-}"
	done
	__phantom_precmd
}

__phantom_prompt_cmd() {
	__phantom_status="$?"
	__phantom_precmd
}

__phantom_original_prompt_command=${PROMPT_COMMAND:-}

if [[ -n "${__phantom_original_prompt_command:-}" && "${__phantom_original_prompt_command:-}" != "__phantom_prompt_cmd" ]]; then
	PROMPT_COMMAND=__phantom_prompt_cmd_original
else
	PROMPT_COMMAND=__phantom_prompt_cmd
fi
