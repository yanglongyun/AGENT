const normalizeLlmPayload = (payload, normalizer) => ({
  ...payload,
  messages: normalizer?.normalizeMessages(payload?.messages) || [],
});

export { normalizeLlmPayload };
