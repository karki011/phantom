// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import type { Project } from '../types';
import { getProjects } from '../bindings';

const [projects, setProjects] = createSignal<Project[]>([]);
let loaded = false;

export async function bootstrapProjects(): Promise<void> {
  if (loaded) return;
  await refreshProjects();
  loaded = true;
}

export async function refreshProjects(): Promise<void> {
  const data = await getProjects();
  setProjects(data);
}

// Derived: starred projects in DB order. Server enforces max 10.
export const starredProjects = createMemo<Project[]>(() =>
  projects().filter((p) => p.starred === 1),
);

export { projects, setProjects };
