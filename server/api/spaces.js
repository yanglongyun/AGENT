// @ts-nocheck
import {
  createSpace,
  createSpaceChatWithChat,
  listSpaceChats,
  listSpaceChildren,
  listSpaces,
  removeSpace,
} from "../service/spaces/index.js";
import { readJsonBody } from "../utils/http.js";

const handleSpacesApi = async (req, res, { sendJson }, path, method, url) => {
  if (path === "/api/spaces" && method === "GET") {
    sendJson(res, 200, { ok: true, spaces: listSpaces() });
    return;
  }

  if (path === "/api/spaces" && method === "POST") {
    const body = await readJsonBody(req);
    sendJson(res, 200, { ok: true, space: createSpace(body) });
    return;
  }

  if (path === "/api/spaces" && method === "DELETE") {
    removeSpace(url.searchParams.get("id"));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (path === "/api/spaces/tree" && method === "GET") {
    sendJson(res, 200, {
      ok: true,
      items: listSpaceChildren({
        spaceId: url.searchParams.get("spaceId"),
        relativePath: url.searchParams.get("path") || ".",
      }),
    });
    return;
  }

  if (path === "/api/spaces/chats" && method === "GET") {
    sendJson(res, 200, {
      ok: true,
      chats: listSpaceChats({
        spaceId: url.searchParams.get("spaceId"),
        relativePath: url.searchParams.has("path") ? url.searchParams.get("path") : null,
      }),
    });
    return;
  }

  if (path === "/api/spaces/chats" && method === "POST") {
    const body = await readJsonBody(req);
    sendJson(res, 200, { ok: true, ...createSpaceChatWithChat(body) });
    return;
  }

  sendJson(res, 404, { error: "API endpoint not found" });
};

export { handleSpacesApi };
