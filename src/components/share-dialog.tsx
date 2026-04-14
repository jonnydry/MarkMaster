"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Check } from "lucide-react";
import { generateClipboardThread } from "@/lib/share-content";
import type { ShareContent } from "@/lib/share-content";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareContent: ShareContent | null;
}

export function ShareDialog({
  open,
  onOpenChange,
  shareContent,
}: ShareDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!shareContent) return null;

  const isSmallCollection = shareContent.itemCount <= 10;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share &quot;{shareContent.collectionName}&quot;</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Share link */}
          <div>
            <h3 className="text-sm font-medium mb-2">Public Link</h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
                {shareContent.shareUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() =>
                  copyToClipboard(shareContent.shareUrl, "link")
                }
              >
                {copiedField === "link" ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Summary tweet */}
          <div>
            <h3 className="text-sm font-medium mb-2">
              {isSmallCollection
                ? "Post to X (Single Tweet)"
                : "Post to X (Summary + Link)"}
            </h3>
            <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap mb-2">
              {shareContent.summaryTweet}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={shareContent.xIntentUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="default" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open X Compose
                </Button>
              </a>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  copyToClipboard(shareContent.summaryTweet, "summary")
                }
              >
                {copiedField === "summary" ? (
                  <Check className="w-3.5 h-3.5 text-success" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Copy Tweet
              </Button>
            </div>
          </div>

          {/* Thread for small collections */}
          {isSmallCollection && shareContent.thread.length > 1 && (
            <div>
              <h3 className="text-sm font-medium mb-2">
                Full Thread ({shareContent.thread.length} tweets)
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                Copy the thread content below, then post each tweet manually on X.
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {shareContent.thread.map((tweet, i) => (
                  <div
                    key={i}
                    className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap"
                  >
                    <span className="text-xs text-muted-foreground block mb-1">
                      Tweet {i + 1}
                    </span>
                    {tweet.text}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 mt-2"
                onClick={() =>
                  copyToClipboard(
                    generateClipboardThread(shareContent.thread),
                    "thread"
                  )
                }
              >
                {copiedField === "thread" ? (
                  <Check className="w-3.5 h-3.5 text-success" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Copy Full Thread
              </Button>
            </div>
          )}

          {/* Info for large collections */}
          {!isSmallCollection && (
            <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground">
              This collection has {shareContent.itemCount} bookmarks. For better
              readability on X, we recommend sharing the public link with a summary
              tweet. The full collection is always viewable at the link above.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}