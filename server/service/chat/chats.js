// @ts-nocheck
import {
  createChat as repoCreateChat,
  deleteChat as repoDeleteChat,
  getChat,
  listChats,
  updateChatState,
} from "../../repository/chat/chats/index.js";

const createChat = ({ title = "New chat", app = "chat", meta = null } = {}) =>
  repoCreateChat(title, app, meta);

const deleteChat = ({ chatId }) => repoDeleteChat(chatId);

const setChatState = ({ chatId, state }) => updateChatState(chatId, state);

export { createChat, deleteChat, getChat, listChats, setChatState };
