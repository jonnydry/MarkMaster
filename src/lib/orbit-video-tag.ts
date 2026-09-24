import { hasVideoLikeMedia, type BookmarkMediaJson } from "@/lib/bookmark-media";

export const VIDEO_TAG_NAME = "Video";
export const VIDEO_TAG_REASON = "This post includes a video.";

export function mediaIncludesVideo(media: unknown): boolean {
  if (!Array.isArray(media)) return false;
  return hasVideoLikeMedia(media as BookmarkMediaJson[]);
}

/** Format tag added because the post has video or GIF media, not a topic guess. */
export function isVideoFormatTag(tag: { name: string; reason?: string }): boolean {
  return (
    tag.name.trim().toLowerCase() === VIDEO_TAG_NAME.toLowerCase() &&
    tag.reason === VIDEO_TAG_REASON
  );
}
