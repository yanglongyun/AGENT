// @ts-nocheck
import { createChat } from "../chat/chats.js";
import {
  createSpace,
  createSpaceChat,
  getSpaceChatContext,
  listSpaceChats,
  listSpaceChildren,
  listSpaces,
  removeSpace,
} from "../../repository/spaces/index.js";

const createSpaceChatWithChat = ({ spaceId, relativePath = ".", title = "New chat" } = {}) => {
  const chat = createChat({ title, app: "chat" });
  const spaceChat = createSpaceChat({ spaceId, relativePath, chatId: chat.id });
  return { chat, spaceChat };
};

export {
  createSpace,
  createSpaceChatWithChat,
  getSpaceChatContext,
  listSpaceChats,
  listSpaceChildren,
  listSpaces,
  removeSpace,
};
