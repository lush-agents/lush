export type Appearance = "dark" | "light" | "system";

export type Route = {
  href: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  sessionAgentId?: string;
};

export type Concept = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "error";
};

export type SessionStatus = "signed-out" | "loading" | "ready" | "error";
