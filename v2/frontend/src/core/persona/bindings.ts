// Author: Subash Karki

import type { PersonaResponse, PersonaState, PersonaContext, Message } from './types';

const app = () => (window as any).go?.app?.App;

export async function personaAsk(input: string): Promise<PersonaResponse> {
  try {
    const result = await app()?.PersonaAsk(input);
    return result ?? { text: 'Persona unavailable.', speak: '' };
  } catch (err) {
    console.error('[persona] ask error:', err);
    return { text: 'Something went wrong.', speak: '' };
  }
}

export async function personaGetState(): Promise<PersonaState> {
  try {
    const result = await app()?.PersonaGetState();
    return result ?? { pillState: 'idle', statusText: 'Phantom', activeProject: '', expanded: false };
  } catch {
    return { pillState: 'idle', statusText: 'Phantom', activeProject: '', expanded: false };
  }
}

export async function personaGetHistory(): Promise<Message[]> {
  try {
    const result = await app()?.PersonaGetHistory();
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function personaGetContext(): Promise<PersonaContext | null> {
  try {
    return await app()?.PersonaGetContext() ?? null;
  } catch {
    return null;
  }
}

export async function personaSetTrust(projectId: string, tier: number): Promise<void> {
  try {
    await app()?.PersonaSetTrust(projectId, tier);
  } catch (err) {
    console.error('[persona] setTrust error:', err);
  }
}

export async function personaGetTrust(projectId: string): Promise<number> {
  try {
    return (await app()?.PersonaGetTrust(projectId)) ?? 0;
  } catch {
    return 0;
  }
}

export async function personaSpeak(text: string): Promise<void> {
  try {
    await app()?.PersonaSpeak(text);
  } catch (err) {
    console.error('[persona] speak error:', err);
  }
}

export async function personaSetPillState(state: string): Promise<void> {
  try {
    await app()?.PersonaSetPillState(state);
  } catch (err) {
    console.error('[persona] setPillState error:', err);
  }
}
