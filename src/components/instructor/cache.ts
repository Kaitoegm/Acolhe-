export type Cached = {
  items: unknown[];
  nextCursor: string | null;
  hasMore: boolean;
};
export const instructorCache = new Map<string, Cached>();
export const invalidateInstructorCache = () => instructorCache.clear();
