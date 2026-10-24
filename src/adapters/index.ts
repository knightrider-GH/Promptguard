/**
 * Adapter registry — returns the correct adapter for the current page.
 */

import type { AISiteAdapter } from './base';
import { ChatGPTAdapter } from './chatgpt';
import { ClaudeAdapter } from './claude';
import { GeminiAdapter } from './gemini';
import { CopilotAdapter } from './copilot';
import { GenericAdapter } from './generic';

const PRIMARY_ADAPTERS: AISiteAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new GeminiAdapter(),
  new CopilotAdapter(),
];

export function getAdapter(useGeneric = false): AISiteAdapter | null {
  for (const adapter of PRIMARY_ADAPTERS) {
    if (adapter.isSupported()) return adapter;
  }
  if (useGeneric) return new GenericAdapter();
  return null;
}

export { PRIMARY_ADAPTERS, GenericAdapter };
export type { AISiteAdapter };
