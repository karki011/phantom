/**
 * useProjectProfile — fetches project profile with detected recipes
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';
import { type ProjectProfile, getProjectProfile } from '../lib/api';

export const useProjectProfile = (
  projectId: string | null,
): {
  profile: ProjectProfile | null;
  loading: boolean;
} => {
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    getProjectProfile(projectId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  return { profile, loading };
};
