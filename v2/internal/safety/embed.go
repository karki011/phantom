// embed.go — default ward installation (no-op).
// The app ships with no pre-defined wards. Users define their own.
// Author: Subash Karki
package safety

// InstallDefaults is a no-op retained for backward compatibility.
// Phantom OS no longer ships default ward rules — users create their own
// via the UI or by placing YAML files in ~/.phantom-os/wards/.
func InstallDefaults(_ string) {}
