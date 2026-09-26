// worker/src/ai/huggingface.js
//
// Provider adapter for Hugging Face Inference API.
// All HTTP details are isolated here — the rest of the application
// calls hfInference() and never touches HF endpoints directly.
//
// The HF_TOKEN is read from the Worker environment (env.HF_TOKEN).
// It is NEVER passed to the frontend or included in any API response.

const HF_INFERENCE_BASE = 'https://router.huggingface.co/hf-inference/models';

/**
 * Send a chat-completion request to a Hugging Face hosted model.
 *
 * @param {object} opts
 * @param {string}   opts.token     - HF_TOKEN from Worker env (never logged, never forwarded)
 * @param {string}   opts.model     - Model ID, e.g. "ibm-granite/granite-3.3-8b-instruct"
 * @param {Array}    opts.messages  - OpenAI-compatible message array
 * @param {number}   [opts.maxTokens=512]
 * @param {number}   [opts.timeoutMs=12000]
 *
 * @returns {Promise<{ text: string }>}
 * @throws  {HFError} on non-recoverable failure
 */
export async function hfInference({ token, model, messages, maxTokens = 512, timeoutMs = 12000 }) {
  const url = `${HF_INFERENCE_BASE}/${model}/v1/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // Token is injected here and never leaves this module
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new HFError('timeout', 'Request timed out');
    throw new HFError('network', err.message);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const reason = statusToReason(res.status);
    throw new HFError(reason, `HTTP ${res.status}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new HFError('malformed_response', 'Response was not valid JSON');
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new HFError('malformed_response', 'Unexpected response shape from HF');
  }

  return { text };
}

function statusToReason(status) {
  if (status === 503) return 'provider_busy';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 404) return 'model_not_found';
  return 'provider_error';
}

export class HFError extends Error {
  /** @param {'timeout'|'network'|'provider_busy'|'rate_limited'|'auth_error'|'model_not_found'|'provider_error'|'malformed_response'} reason */
  constructor(reason, detail) {
    super(detail || reason);
    this.reason = reason;
  }
}
