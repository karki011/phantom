// PhantomOS v2 — Chat bindings (Claude conversations)
// Author: Subash Karki

import type { Conversation, ChatMessage } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

// ── Conversations ──────────────────────────────────────────────────────────

export async function getConversations(workspaceId: string): Promise<Conversation[]> {
  try {
    const raw = (await App()?.GetConversations(workspaceId)) ?? [];
    return normalize<Conversation[]>(raw);
  } catch {
    return [];
  }
}

export async function createConversation(
  workspaceId: string,
  title: string,
  model: string,
): Promise<Conversation | null> {
  try {
    const raw = await App()?.CreateConversation(workspaceId, title, model);
    return raw ? normalize<Conversation>(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    await App()?.DeleteConversation(id);
    return true;
  } catch {
    return false;
  }
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function sendChatMessage(
  conversationId: string,
  content: string,
  model: string,
): Promise<boolean> {
  try {
    await App()?.SendChatMessage(conversationId, content, model);
    return true;
  } catch {
    return false;
  }
}

export async function getChatHistory(conversationId: string): Promise<ChatMessage[]> {
  try {
    const raw = (await App()?.GetChatHistory(conversationId)) ?? [];
    return normalize<ChatMessage[]>(raw);
  } catch {
    return [];
  }
}
