/**
 * Path utilities — shared path formatting helpers.
 * @author Subash Karki
 */

export const shortenPath = (fullPath: string): string => {
  const home = '/Users/';
  const idx = fullPath.indexOf(home);
  if (idx >= 0) {
    const rest = fullPath.slice(idx + home.length);
    const parts = rest.split('/');
    return parts.length > 1 ? `~/${parts.slice(1).join('/')}` : `~/${rest}`;
  }
  return fullPath;
};
