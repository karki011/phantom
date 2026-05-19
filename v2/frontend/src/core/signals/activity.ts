// Phantom — Activity panel signals (PR, CI, creating state, workflows)
// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { PrStatus, CiRun, Workflow, WorkflowRun } from '../types';

const [prStatus, setPrStatus] = createSignal<PrStatus | null>(null);
const [ciRuns, setCiRuns] = createSignal<CiRun[] | null>(null);
const [isCreatingPr, setIsCreatingPr] = createSignal(false);
const [ghAvailable, setGhAvailable] = createSignal(false);
const [workflows, setWorkflows] = createSignal<Workflow[] | null>(null);
const [workflowRuns, setWorkflowRuns] = createSignal<WorkflowRun[] | null>(null);

export {
  prStatus, setPrStatus,
  ciRuns, setCiRuns,
  isCreatingPr, setIsCreatingPr,
  ghAvailable, setGhAvailable,
  workflows, setWorkflows,
  workflowRuns, setWorkflowRuns,
};
