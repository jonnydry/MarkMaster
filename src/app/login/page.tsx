"use client";

import { signIn } from "next-auth/react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Bookmark className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to MarkMaster</h1>
          <p className="text-muted-foreground">
            Sign in with your X account to get started
          </p>
        </div>
        <Button
          className="w-full h-12 text-base gap-3"
          onClick={() => signIn("twitter", { callbackUrl: "/dashboard" })}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Sign in with X
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-6">
          We request read access to your bookmarks and profile.
          <br />
          We never post on your behalf without permission.
        </p>
      </div>
    </div>
  );
}
