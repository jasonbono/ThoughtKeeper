"use client";

import { type UserTopic } from "./types";

interface Props {
  userTopics: UserTopic[];
  activeTopics: Set<string> | null;
  topicCounts: Map<string, number>;
  onToggleTopic: (topicName: string) => void;
  onResetTopics: () => void;
}

export function TopicFilterBar({ userTopics, activeTopics, topicCounts, onToggleTopic, onResetTopics }: Props) {
  return (
    <div className="flex gap-2 flex-wrap items-center select-none">
      {userTopics.map((topic) => {
        const active = activeTopics === null || activeTopics.has(topic.name);
        const count = topicCounts.get(topic.name) ?? 0;
        return (
          <button
            key={topic.id}
            onClick={() => onToggleTopic(topic.name)}
            className="cursor-pointer"
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all"
              style={active
                ? {
                    borderColor: "var(--accent-dim)",
                    background: "var(--pill-bg)",
                    color: "var(--accent)",
                  }
                : {
                    borderColor: "var(--border)",
                    background: "var(--pill-bg-muted)",
                    color: "var(--text-muted)",
                  }
              }
            >
              #{topic.name}
              <span className="opacity-50 tabular-nums">{count}</span>
            </span>
          </button>
        );
      })}
      <span className="text-[10px] ml-1">
        <button
          onClick={onResetTopics}
          className="cursor-pointer hover:underline"
          style={{ color: activeTopics === null ? "var(--accent)" : "var(--text-muted)" }}
        >
          All
        </button>
      </span>
    </div>
  );
}
