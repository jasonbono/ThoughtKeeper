"use client";

import { type UserId, USERS, getAllTeammateIds } from "../../../lib/users";
import { type ViewScope } from "./types";

interface Props {
  viewScope: ViewScope;
  onScopeChange: (scope: ViewScope) => void;
  currentUser: UserId;
}

export function ViewScopeToggle({ viewScope, onScopeChange, currentUser }: Props) {
  const teammates = getAllTeammateIds(currentUser);

  // Solo user — no one to toggle between
  if (teammates.length === 0) return null;

  const visibleUsers = [currentUser, ...teammates];

  return (
    <div className="flex items-center gap-3 animate-fade-up">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
        Viewing
      </span>
      <div
        className="flex items-center rounded-full p-0.5 text-[11px] font-semibold"
        style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
      >
        {visibleUsers.map((id: UserId) => (
          <button
            key={id}
            onClick={() => onScopeChange(id)}
            className="px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer"
            style={{
              background: viewScope === id ? "var(--surface-hover)" : "transparent",
              color: viewScope === id ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {USERS[id].displayName}
          </button>
        ))}
        {teammates.length > 0 && (
          <button
            onClick={() => onScopeChange("all")}
            className="px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer"
            style={{
              background: viewScope === "all" ? "var(--surface-hover)" : "transparent",
              color: viewScope === "all" ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            Both
          </button>
        )}
      </div>
    </div>
  );
}
