// Author: Subash Karki

import { normalize } from './_normalize';
import { App } from './_app';

export interface TaskItem {
  id: string;
  session_id: string | null;
  task_num: number | null;
  subject: string | null;
  description: string | null;
  crew: string | null;
  status: string | null;
  active_form: string | null;
  duration_ms: number | null;
  created_at: number | null;
  updated_at: number | null;
}

export async function getSessionTasks(sessionId: string): Promise<TaskItem[]> {
  try {
    const raw = (await App()?.GetSessionTasks(sessionId)) ?? [];
    return normalize<TaskItem[]>(raw);
  } catch {
    return [];
  }
}
