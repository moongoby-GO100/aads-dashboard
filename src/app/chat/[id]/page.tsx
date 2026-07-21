// Render the chat client directly for durable /chat/{sessionId} URLs.
// ChatPage reads the session id from the pathname, so refresh no longer incurs
// a second full-page navigation that can race workspace/session initialization.
export { default } from "../page";
