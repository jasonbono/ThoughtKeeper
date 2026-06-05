export { getDb, withWriteLock } from "./connection";

export type { PaginatedResult } from "./captures";
export {
  insertThought,
  archiveThought,
  unarchiveThought,
  trashThought,
  restoreFromTrash,
  getTrashedThoughts,
  getAllThoughts,
  getAllThoughtsPaginated,
  countThoughts,
  getThoughtById,
  getThoughtImage,
  updateThought,
  getThoughtsForDate,
  getOverdueTodos,
  getStaleCaptures,
  getUnscheduledTodos,
  snoozeThought,
} from "./captures";

export {
  countTextMatches,
  searchTrashedThoughts,
  hybridSearchThoughts,
  enrichWithTopics,
} from "./search";

export type { UserTopic } from "./topics";
export {
  getUserTopics,
  getUserTopicsWithCounts,
  createUserTopic,
  deleteUserTopic,
  getTopicsForThought,
  getTopicsForThoughts,
  setTopicsForThought,
} from "./topics";

export type { Template } from "./templates";
export {
  insertTemplate,
  getAllVisibleTemplates,
  getTemplateById,
  updateTemplate,
  archiveTemplate,
} from "./templates";

export type { FeatureRequest } from "./feature-requests";
export {
  insertFeatureRequest,
  getFeatureRequestById,
  getFeatureRequests,
  archiveFeatureRequest,
  trashFeatureRequest,
} from "./feature-requests";

export { insertChatUsage } from "./usage";
