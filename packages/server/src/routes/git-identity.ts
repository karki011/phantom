/**
 * PhantomOS — Git Identity Route
 * Returns the user's git name and email for onboarding pre-fill.
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { execSync } from 'node:child_process';

export const gitIdentityRoutes = new Hono();

gitIdentityRoutes.get('/git-identity', (c) => {
  let name = '';
  let email = '';
  try {
    name = execSync('git config user.name', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim();
  } catch { /* not configured */ }
  try {
    email = execSync('git config user.email', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim();
  } catch { /* not configured */ }
  return c.json({ name, email });
});
