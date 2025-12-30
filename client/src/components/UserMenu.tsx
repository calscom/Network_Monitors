import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import type { UserRole } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogOut, Shield, User, Eye, Users } from "lucide-react";

const roleLabels: Record<UserRole, string> = {
  admin: "Administrator",
  operator: "Operator",
  viewer: "Viewer",
};

const roleColors: Record<UserRole, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  operator: "bg-primary/10 text-primary border-primary/20",
  viewer: "bg-secondary text-secondary-foreground",
};

const roleIcons: Record<UserRole, typeof Shield> = {
  admin: Shield,
  operator: User,
  viewer: Eye,
};

export function UserMenu() {
  const { user, logout, isLoggingOut } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) return null;

  const userRole = (user.role as UserRole) || 'viewer';
  const RoleIcon = roleIcons[userRole];

  const getInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-user-menu">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <p className="text-sm font-medium leading-none">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            <Badge variant="outline" className={`w-fit ${roleColors[userRole]}`}>
              <RoleIcon className="w-3 h-3 mr-1" />
              {roleLabels[userRole]}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {userRole === 'admin' && (
          <>
            <DropdownMenuItem onClick={() => setLocation("/users")} data-testid="menu-item-users">
              <Users className="w-4 h-4 mr-2" />
              Manage Users
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem
          onClick={() => logout()}
          disabled={isLoggingOut}
          className="text-destructive focus:text-destructive"
          data-testid="menu-item-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {isLoggingOut ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
