import { BotIcon, BriefcaseIcon, CodeXmlIcon, MessageCircleIcon } from "lucide-react";
import type { SessionType } from "../../lib/session-organization";

export function SessionGlyph({ type, className = "size-4" }: { type: SessionType; className?: string }) {
  if (type === "code") return <CodeXmlIcon className={className} />;
  if (type === "work") return <BriefcaseIcon className={className} />;
  if (type === "agent") return <BotIcon className={className} />;
  return <MessageCircleIcon className={className} />;
}
