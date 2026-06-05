"use client";

import type { ReactNode } from "react";
import { Settings, Brain, Mic, Activity, BotMessageSquare, Form } from "lucide-react";

import type { Screen } from "../../lib/types";
import { useAppStore } from "../../lib/store";

export type { Screen };

// Single source of truth for navigation order
export const NAV_ORDER: Screen[] = ["settings", "voice", "pulse", "chat", "templates", "captures"];

interface NavItem {
  id: Screen;
  icon: ReactNode;
}

const ITEMS: NavItem[] = [
  { id: "settings", icon: <Settings size={14} /> },
  { id: "voice", icon: <Mic size={14} /> },
  { id: "pulse", icon: <Activity size={14} /> },
  { id: "chat", icon: <BotMessageSquare size={14} /> },
  { id: "templates", icon: <Form size={14} /> },
  { id: "captures", icon: <Brain size={14} /> },
];

export default function SpatialNav() {
  const current = useAppStore(s => s.screen);
  const navigateTo = useAppStore(s => s.navigateTo);
  const activeIndex = ITEMS.findIndex((item) => item.id === current);

  return (
    <div>
      <div
        className="relative flex"
        style={{
          borderRadius: "10px",
          border: "1px solid var(--border-bright)",
          background: "var(--surface)",
          overflow: "hidden",
        }}
      >
        {/* Sliding highlight */}
        <div
          className="absolute top-0 bottom-0 transition-transform duration-200 ease-in-out"
          style={{
            width: `calc(100% / ${ITEMS.length})`,
            background: "var(--accent-dim)",
            borderRadius: "8px",
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {ITEMS.map((item) => {
          const isActive = ITEMS.indexOf(item) === activeIndex;
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className="relative z-10 flex items-center justify-center cursor-pointer transition-opacity duration-200"
              style={{
                width: "36px",
                height: "32px",
                background: "transparent",
                border: "none",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                opacity: isActive ? 1 : 0.45,
              }}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
