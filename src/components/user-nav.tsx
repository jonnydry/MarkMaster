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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";

interface UserNavProps {
  user: DbUser;
}

export function UserNav({ user }: UserNavProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "outline-none inline-flex h-8 max-w-[11rem] items-center gap-2 rounded-lg bg-secondary pl-2 pr-1",
          "text-left text-xs font-medium text-foreground transition-colors",
          "hover:bg-secondary/80 dark:hover:bg-secondary/60",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
        <Avatar className="size-6 shrink-0">
          {user.profileImageUrl ? (
            <AvatarImage
              src={user.profileImageUrl}
              alt={`${user.displayName} profile picture`}
            />
          ) : null}
          <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
            {user.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
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