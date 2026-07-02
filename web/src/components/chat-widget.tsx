// Thin re-export shim: the Team Chat widget was decomposed into ./chat/*.
// Kept so existing importers (dashboard-shell.tsx) don't need to change.
export { ChatWidget } from "./chat/chat-widget";
