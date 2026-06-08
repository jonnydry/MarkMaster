"use client";

import { signOut } from "next-auth/react";
import { Moon, Sun, LogOut, Download, User, Type, Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme, useColorTheme, useFontMode } from "@/components/providers";
import { COLOR_THEMES } from "@/lib/color-themes";
import { TYPOGRAPHY_PRESETS } from "@/lib/typography-presets";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/auth";

interface UserNavProps {
  user: DbUser;
}

export function UserNav({ user }: UserNavProps) {
  const { theme, toggleTheme } = useTheme();
  const { typographyPreset, setTypographyPreset } = useFontMode();
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "outline-none inline-flex items-center gap-1.5 rounded-full p-0.5 transition-colors",
          "hover:bg-secondary/80 dark:hover:bg-secondary/60",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <Avatar size="xl" className="shrink-0">
          {user.profileImageUrl ? (
            <AvatarImage
              src={user.profileImageUrl}
              alt={`${user.displayName} profile picture`}
            />
          ) : null}
          <AvatarFallback className="bg-primary text-sm font-bold text-primary-foreground">
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Type className="w-4 h-4 mr-2" />
            Typography
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TYPOGRAPHY_PRESETS.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onClick={() => setTypographyPreset(option.id)}
              >
                {option.name}
                {typographyPreset === option.id && (
                  <span className="ml-auto text-[9px] font-medium uppercase tracking-wider text-primary">
                    ON
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="w-4 h-4 mr-2" />
            Accent Color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {COLOR_THEMES.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onClick={() => setColorTheme(option.id)}
              >
                <span
                  className="mr-2 h-3 w-3 rounded-full border border-hairline-soft"
                  style={{ backgroundColor: option.swatch }}
                />
                {option.name}
                {colorTheme === option.id && (
                  <span className="ml-auto text-[9px] font-medium uppercase tracking-wider text-primary">
                    ON
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
