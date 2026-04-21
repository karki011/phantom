// Author: Subash Karki

import { createSignal } from 'solid-js';
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

export { projects, setProjects };
