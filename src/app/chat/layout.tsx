import type { Metadata } from "next";
import "@/styles/chat-theme.css";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "AADS AI Chat",
  description: "AADS Chat-First Interface — CEO Workspace",
};

export default function ChatSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
