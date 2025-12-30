import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, UserRole } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Shield, User as UserIcon, Eye, Loader2 } from "lucide-react";
import { useEffect } from "react";

const roleIcons: Record<UserRole, typeof Shield> = {
  admin: Shield,
  operator: UserIcon,
  viewer: Eye,
};

const roleColors: Record<UserRole, string> = {
  admin: "bg-destructive text-destructive-foreground",
  operator: "bg-primary text-primary-foreground",
  viewer: "bg-secondary text-secondary-foreground",
};

export default function UserManagement() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!currentUser,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Role Updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && currentUser && (currentUser as any).role !== 'admin') {
      toast({
        title: "Access Denied",
        description: "Only administrators can manage users.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [currentUser, authLoading, setLocation, toast]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">User Management</h1>
            <p className="text-sm text-muted-foreground">Manage user roles and permissions</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>
              Users are automatically created when they sign in. Assign roles to control their access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users?.map((user) => {
                const RoleIcon = roleIcons[(user.role as UserRole) || 'viewer'];
                const isCurrentUser = user.id === currentUser?.id;

                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card"
                    data-testid={`user-row-${user.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user.profileImageUrl || undefined} />
                        <AvatarFallback>{getInitials(user)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {user.firstName} {user.lastName}
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className={roleColors[(user.role as UserRole) || 'viewer']}>
                        <RoleIcon className="w-3 h-3 mr-1" />
                        {user.role || 'viewer'}
                      </Badge>

                      <Select
                        value={user.role || 'viewer'}
                        onValueChange={(value) => updateRoleMutation.mutate({ userId: user.id, role: value })}
                        disabled={isCurrentUser || updateRoleMutation.isPending}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-role-${user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}

              {!users?.length && (
                <p className="text-center text-muted-foreground py-8">
                  No users found. Users will appear here when they sign in.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Role Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-destructive" />
                  <span className="font-medium">Admin</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Manage users and roles</li>
                  <li>Add, edit, delete devices</li>
                  <li>Change polling settings</li>
                  <li>View all logs and history</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <UserIcon className="w-5 h-5 text-primary" />
                  <span className="font-medium">Operator</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Add, edit, delete devices</li>
                  <li>Change polling settings</li>
                  <li>View all logs and history</li>
                  <li>Cannot manage users</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Viewer</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>View dashboards</li>
                  <li>View logs and history</li>
                  <li>Read-only access</li>
                  <li>Cannot modify anything</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
