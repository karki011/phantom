// Central app branding constants. Change the name here and it propagates everywhere.
// Author: Subash Karki

import pkg from '../../package.json';

export const APP_NAME = 'PhantomOS';
export const APP_NAME_SPACED = 'P H A N T O M   O S';
// Single source of truth: package.json version. Rendered with letter-spacing
// to match the SYSTEM banner (e.g. "0.1.1" -> "v 0 . 1 . 1").
export const APP_VERSION_RAW = pkg.version;
export const APP_VERSION = `v ${APP_VERSION_RAW.split('').join(' ')}`;
export const APP_AUTHOR = 'Subash Karki';
export const APP_CONFIG_DIR = '.phantom-os';
