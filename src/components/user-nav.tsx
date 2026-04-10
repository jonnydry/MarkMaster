"use client";

import { signOut } from "next-auth/react";
import { Moon, Sun, LogOut, Download, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/providers";
import type { DbUser } from "@/lib/auth";

interface UserNavProps {
  user: DbUser;
}

export function UserNav({ user }: UserNavProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted transition-colors">
        <div className="flex flex-col items-end gap-px">
          <span className="text-[13px] text-foreground leading-tight">
            {user.displayName}
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            X connected
          </span>
        </div>
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary-foreground">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-foreground">{user.displayName}</p>
          <p className="text-xs text-muted-foreground">@{user.username}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => window.open(`https://x.com/${user.username}`, "_blank")}
        >
          <User className="w-4 h-4 mr-2" />
          View X Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleTheme}>
          {theme === "dark" ? (
            <Sun className="w-4 h-4 mr-2" />
          ) : (
            <Moon className="w-4 h-4 mr-2" />
          )}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open("/api/export?format=json")}
        >
          <Download className="w-4 h-4 mr-2" />
          Export Bookmarks
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-destructive"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}