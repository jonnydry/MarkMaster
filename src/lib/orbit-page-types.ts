import type { BookmarkWithRelations, OrbitScanBatchMetadata } from "@/types";

export type BookmarkResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
  nextCursor?: string;
  page?: number;
  personalBoostAuthors?: string[];
  personalBoostTags?: string[];
};

export type OrbitScanCandidatesResponse = {
  bookmarks: BookmarkWithRelations[];
};

export type OrbitScanRequest = {
  targetIds: string[];
  scanningSelection: boolean;
  contextKey: string;
  batch: OrbitScanBatchMetadata;
};
