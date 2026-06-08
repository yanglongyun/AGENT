// @ts-nocheck
const DATA_URL_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

const stripImageData = (value) => {
  if (typeof value !== "string") return value;
  return value.replace(DATA_URL_RE, "[image data omitted]");
};

const extractImageUrls = (value) => {
  if (typeof value !== "string") return [];
  const matches = value.match(DATA_URL_RE) || [];
  return [...new Set(matches)];
};

const stripImages = (message) => {
  if (!message || typeof message !== "object") return message;
  if (typeof message.content === "string") {
    return { ...message, content: stripImageData(message.content) };
  }
  return message;
};

const expandImages = (message) => {
  if (!message || typeof message !== "object" || typeof message.content !== "string") return message;
  const urls = extractImageUrls(message.content);
  if (!urls.length) return stripImages(message);
  const text = stripImageData(message.content);
  return {
    ...message,
    content: [
      { type: "text", text },
      ...urls.slice(0, 4).map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  };
};

const prepareVisionMessages = (messages = [], enabled = false) =>
  messages.map((message) => (enabled ? expandImages(message) : stripImages(message)));

export { expandImages, prepareVisionMessages, stripImages };
