export type ChatRole = "user" | "assistant";

export type ChatStatus = "idle" | "pending" | "error";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export type ChatGroup = "Today" | "Yesterday" | "Previous 7 Days";

export interface Conversation {
  id: string;
  title: string;
  group: ChatGroup;
  messages: ChatMessage[];
}

export type AssistantMode = "closed" | "compact" | "fullscreen";
