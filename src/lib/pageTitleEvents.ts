export const CHAT_SESSION_TITLE_EVENT = "aads:chat-session-title-change";

export type ChatSessionTitleEventDetail = {
  sessionId: string;
  title?: string | null;
  deleted?: boolean;
};

export function emitChatSessionTitleChange(detail: ChatSessionTitleEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ChatSessionTitleEventDetail>(CHAT_SESSION_TITLE_EVENT, {
      detail,
    }),
  );
}
