const normalizeMessages = (messages = []) => (Array.isArray(messages) ? messages : []);

const openaiNormalizer = { normalizeMessages };

export { openaiNormalizer };
