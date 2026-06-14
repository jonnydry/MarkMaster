"use client";

import { useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { sendJson } from "@/lib/fetch-json";

type SyncSettingsResponse = {
  syncXFolders: boolean;
};

export function useSyncSettings() {
  const { data: session, update: updateSession } = useSession();
  const syncXFolders = session?.dbUser?.syncXFolders ?? false;

  const mutation = useMutation({
    mutationFn: (nextValue: boolean) =>
      sendJson<SyncSettingsResponse>("/api/user/sync-settings", {
        method: "PATCH",
        body: { syncXFolders: nextValue },
      }),
    onSuccess: async () => {
      await updateSession();
    },
  });

  return {
    syncXFolders,
    setSyncXFolders: mutation.mutate,
    isUpdating: mutation.isPending,
    updateError: mutation.error,
  };
}
