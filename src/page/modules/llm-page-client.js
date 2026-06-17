import { logger } from '@/shared/logger';
import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';

const REQUEST_TIMEOUT_MS = 1200000;

export function sendLlmChat(messages, options = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `llm_req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', handler);
      reject(new Error('LLM request timed out'));
    }, REQUEST_TIMEOUT_MS);

    const handler = (event) => {
      if (event.source !== window) return;
      const msg = event.data;
      if (!msg || msg.type !== CSH_MESSAGE_TYPES.LLM_CHAT_RESULT) return;
      if (msg.requestId !== requestId) return;

      clearTimeout(timeoutId);
      window.removeEventListener('message', handler);

      if (settled) return;
      settled = true;

      if (msg.error) {
        reject(new Error(msg.error));
        return;
      }

      if (msg.disabled) {
        reject(new Error('AI features are disabled'));
        return;
      }

      try {
        const response = msg.response;
        const content = response?.message?.content;
        if (!content) {
          reject(new Error('Empty LLM response'));
          return;
        }
        const parsed = JSON.parse(content);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse LLM response: ${e.message}`));
      }
    };

    window.addEventListener('message', handler);

    window.postMessage({
      type: CSH_MESSAGE_TYPES.LLM_CHAT_REQUEST,
      requestId,
      messages,
      options: {
        ...options,
        useJsonFormat: true,
      },
    }, '*');
  });
}
