export type Screen = "settings" | "voice" | "pulse" | "chat" | "templates" | "captures";
export type CaptureMode = "private" | "shared";

export interface ThoughtResult {
  id: string;
  data: Record<string, unknown>;
  isUpdate: boolean;
}

export interface ToolEvent {
  type: "tool_call" | "tool_result";
  name: string;
  data: Record<string, unknown>;
  /** Tool input params — present on tool_result events for UI (e.g. RecallStats). */
  input?: Record<string, unknown>;
}

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolEvents: ToolEvent[];
  imageDataUrl?: string;
}

export type ApiMessageContent = string | Array<{ type: string; [key: string]: unknown }>;

export interface ApiMessage {
  role: "user" | "assistant";
  content: ApiMessageContent;
}

export type Visibility = "private" | "team";

export interface Thought {
  id: string;
  raw_text: string;
  title: string;
  format: string;
  created_at: string;
  updated_at: string | null;
  due_at: string | null;
  snoozed_until: string | null;
  archived: number;
  archived_at: string | null;
  trashed: number;
  trashed_at: string | null;
  user: string;
  visibility: Visibility;
  image_data: string | null;
  /** Present on list queries instead of image_data (0 or 1). */
  has_image?: number;
  char_count: number;
  slimthought: string | null;
}
