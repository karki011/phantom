# Author: Subash Karki
# PhantomOS bash rcfile wrapper. Sources the user's normal startup files,
# then our shell integration script. Invoked via `bash --rcfile <thispath>`.

if [ -r /etc/profile ]; then . /etc/profile; fi

if [ -r ~/.bash_profile ]; then
	. ~/.bash_profile
elif [ -r ~/.bash_login ]; then
	. ~/.bash_login
elif [ -r ~/.profile ]; then
	. ~/.profile
fi

if [ -r ~/.bashrc ]; then
	. ~/.bashrc
fi

if [ -n "${PHANTOM_SHELL_INTEGRATION_SCRIPT:-}" ] && [ -r "${PHANTOM_SHELL_INTEGRATION_SCRIPT}" ]; then
	. "${PHANTOM_SHELL_INTEGRATION_SCRIPT}"
fi
