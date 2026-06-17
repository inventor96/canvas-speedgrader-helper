import { logger } from '@/shared/logger.js';
import { LOCAL_SETTINGS } from '@/shared/settings.js';

const API_PATH = '/api/chat';

export function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(LOCAL_SETTINGS, (data) => {
      resolve({
        aiEnabled: !!data.aiEnabled,
        aiEndpointUrl: data.aiEndpointUrl || LOCAL_SETTINGS.aiEndpointUrl,
        aiModel: data.aiModel || LOCAL_SETTINGS.aiModel,
        aiKeepAlive: data.aiKeepAlive ?? LOCAL_SETTINGS.aiKeepAlive,
      });
    });
  });
}

export async function sendChatRequest(messages, options = {}) {
  const settings = await getSettings();

  if (!settings.aiEnabled) {
    return null;
  }

  const baseUrl = settings.aiEndpointUrl.replace(/\/+$/, '');
  const url = baseUrl + API_PATH;

  const payload = {
    model: settings.aiModel,
    messages,
    stream: false,
  };

  if (settings.aiKeepAlive != null) {
    payload.keep_alive = settings.aiKeepAlive * 60;
  }

  if (options.useJsonFormat) {
    payload.format = 'json';
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`LLM request failed: ${err.message}`);
  }

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {}
    throw new Error(
      `LLM request failed: ${response.status} ${response.statusText}${errorBody ? ' — ' + errorBody.slice(0, 200) : ''}`
    );
  }

  return response.json();
}
