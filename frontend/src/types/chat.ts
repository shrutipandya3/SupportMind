export interface Chat {
  id: string;
  title: string;
  /** ISO-8601 timestamp of the last message / update */
  updatedAt: string;
  createdAt: string;
}

export interface ChatsResponse {
  chats: Chat[];
}
