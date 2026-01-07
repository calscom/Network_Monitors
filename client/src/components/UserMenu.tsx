import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogOut, Shield, User, Eye, Users, Bell, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isReplitEnvironment = !!import.meta.env.VITE_REPLIT_ENV || window.location.hostname.includes('replit');

  if (!user) return null;

  const userRole = (user.role as UserRole) || 'viewer';
  const RoleIcon = roleIcons[userRole];
  
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast({
        title: "Password required",
        description: "Please enter your password to confirm deletion.",
        variant: "destructive",
      });
      return;
    }
    
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", "/api/auth/account", { password: deletePassword });
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted.",
      });
      setShowDeleteDialog(false);
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Deletion failed",
        description: error.message || "Failed to delete account. Check your password.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

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
            <DropdownMenuItem onClick={() => setLocation("/notifications")} data-testid="menu-item-notifications">
              <Bell className="w-4 h-4 mr-2" />
              Notification Settings
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
        
        {!isReplitEnvironment && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive"
              data-testid="menu-item-delete-account"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
      
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Account</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Your account and all associated data will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">Enter your password to confirm</Label>
              <Input
                id="delete-password"
                type="password"
                placeholder="Your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                data-testid="input-delete-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeletePassword("");
              }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || !deletePassword}
              data-testid="button-confirm-delete"
            >
              {isDeleting ? "Deleting..." : "Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
