/**
 * EmployeeKindIcon.
 *
 * Small icon distinguishing person employees from agent employees in workforce UI.
 */

import { Bot, User } from "lucide-react";

/**
 * Person (user) vs agent (bot) indicator for workforce employee kind.
 *
 * @param kind - `"agent"` renders bot icon; otherwise user icon
 * @param className - Optional Tailwind classes for the icon
 */
export function EmployeeKindIcon({ kind, className }: { kind: string; className?: string }) {
  const isAgent = kind === "agent";
  const Icon = isAgent ? Bot : User;
  return (
    <Icon
      className={className ?? "h-4 w-4 text-stone-600"}
      strokeWidth={2.25}
      aria-hidden
    />
  );
}
