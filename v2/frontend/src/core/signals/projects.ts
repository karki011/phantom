// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { Project } from '../types';
import { getProjects } from '../bindings';

const [projects, setProjects] = createSignal<Project[]>([]);

export function bootstrapProjects(): void {
  getProjects().then((data) => setProjects(data));
}

export { projects, setProjects };
