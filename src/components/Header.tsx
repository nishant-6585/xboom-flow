import { LogOut, Shield, ClipboardList, Zap, Activity, User, KeyRound, ShieldCheck, Settings, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { NotificationPanel } from "@/components/NotificationPanel";
import { AttendanceWidget } from "@/components/attendance/AttendanceWidget";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PomodoroTimer } from "@/components/header/PomodoroTimer";
import { MessagesNavButton } from "@/components/messages/MessagesNavButton";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getRoleLabel } from "@/lib/nav";

export function Header() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const AvatarBubble = ({
    size = "w-9 h-9",
    textSize = "text-xs",
  }: { size?: string; textSize?: string }) => {
    const hasPhoto = !!profile?.avatar_url;
    return (
      <div
        className={
          size +
          " rounded-full overflow-hidden shadow-sm flex items-center justify-center " +
          (hasPhoto
            ? "bg-muted"
            : "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-semibold " +
              textSize)
        }
      >
        {hasPhoto ? (
          <img
            src={profile!.avatar_url as string}
            alt={profile?.name || "Profile"}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={textSize}>{profile?.name ? getInitials(profile.name) : "U"}</span>
        )}
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-50 glass-strong border-b border-border/60">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="h-9 w-9" />
        </div>

        {/* Center - Pomodoro Timer */}
        <div className="hidden sm:flex flex-1 justify-center">
          <ErrorBoundary fallback={null}><PomodoroTimer /></ErrorBoundary>
        </div>

        {/* Right side */}
        <div className="hidden sm:flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          >
            <Search className="h-4 w-4" />
            <span className="text-xs hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
          <ErrorBoundary fallback={null}><AttendanceWidget /></ErrorBoundary>
          <ErrorBoundary fallback={null}><MessagesNavButton /></ErrorBoundary>
          <ErrorBoundary fallback={null}><NotificationPanel /></ErrorBoundary>

          <div className="w-px h-6 bg-border/60 mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 hover:opacity-90 transition-opacity rounded-lg px-2 py-1.5 hover:bg-muted/50">
                <div className="text-right hidden lg:block">
                  <p className="text-sm font-medium leading-tight">{profile?.name || "User"}</p>
                  <p className="text-[11px] text-muted-foreground">{getRoleLabel(role)}</p>
                </div>
                <AvatarBubble size="w-9 h-9" textSize="text-xs" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 bg-popover">
              <DropdownMenuLabel>
                <div className="flex items-center gap-3">
                  <AvatarBubble size="w-10 h-10" textSize="text-sm" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{profile?.name}</p>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">{getRoleLabel(role)}</Badge>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal py-1">Personal</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <User className="w-4 h-4 mr-2" /> My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/profile/security")}>
                <ShieldCheck className="w-4 h-4 mr-2" /> Security Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/profile/change-password")}>
                <KeyRound className="w-4 h-4 mr-2" /> Change Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/profile/preferences")}>
                <Settings className="w-4 h-4 mr-2" /> Preferences
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/profile/activity")}>
                <Activity className="w-4 h-4 mr-2" /> My Activity
              </DropdownMenuItem>
              {role === "admin" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal py-1">Admin</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Shield className="w-4 h-4 mr-2" /> User Management
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/audit-logs")}>
                    <ClipboardList className="w-4 h-4 mr-2" /> Audit Logs
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/ai-automation")}>
                    <Zap className="w-4 h-4 mr-2" /> AI Automation
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile right */}
        <div className="flex sm:hidden items-center gap-2">
          <ErrorBoundary fallback={null}><MessagesNavButton /></ErrorBoundary>
          <ErrorBoundary fallback={null}><NotificationPanel /></ErrorBoundary>
          <AvatarBubble size="w-8 h-8" textSize="text-xs" />
        </div>
      </div>
    </header>
  );
}
