import { type UserId } from "../../../lib/users";

export type ViewScope = UserId | "all";

export interface ThoughtRow {
  id: string;
  raw_text: string;
  title: string;
  format: string;
  visibility: string;
  created_at: string;
  updated_at: string | null;
  due_at: string | null;
  snoozed_until: string | null;
  user: string;
  has_image: number;
  char_count: number;
  slimthought: string | null;
  topics: string[];
}

export interface UserTopic {
  id: string;
  name: string;
}
