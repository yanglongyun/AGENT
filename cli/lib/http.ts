// @ts-nocheck
import { SERVER_URL } from "../runtime.js";

const request = async (pathname, options = {}) => {
  const res = await fetch(`${SERVER_URL}${pathname}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }
  return data;
};

export { request };
