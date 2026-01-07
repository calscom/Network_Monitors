import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Activity, Lock, CheckCircle, XCircle } from "lucide-react";

export default function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token") || "";

  const { data: tokenStatus, isLoading: verifyingToken } = useQuery<{ valid: boolean; message?: string }>({
    queryKey: ["/api/auth/verify-reset-token", token],
    queryFn: async () => {
      const res = await fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
      return res.json();
    },
    enabled: !!token,
  });

  const resetMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Reset Successful",
        description: "You can now sign in with your new password.",
      });
      setTimeout(() => setLocation("/"), 2000);
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }
    
    if (password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    
    resetMutation.mutate({ token, password });
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card/50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-bold">Network Monitor</h1>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 container mx-auto px-4 py-12 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <CardTitle>Invalid Reset Link</CardTitle>
              <CardDescription>
                No reset token was provided. Please request a new password reset.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={() => setLocation("/")}
                data-testid="button-back-to-login"
              >
                Back to Sign In
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (verifyingToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tokenStatus?.valid) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card/50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-bold">Network Monitor</h1>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 container mx-auto px-4 py-12 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <CardTitle>Expired or Invalid Link</CardTitle>
              <CardDescription>
                {tokenStatus?.message || "This password reset link has expired or has already been used."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={() => setLocation("/")}
                data-testid="button-back-to-login"
              >
                Back to Sign In
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (resetMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card/50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-bold">Network Monitor</h1>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 container mx-auto px-4 py-12 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
              <CardTitle>Password Reset Complete</CardTitle>
              <CardDescription>
                Your password has been reset successfully. Redirecting to sign in...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={() => setLocation("/")}
                data-testid="button-sign-in"
              >
                Sign In Now
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Network Monitor</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password (min 6 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    required
                    minLength={6}
                    data-testid="input-new-password"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9"
                    required
                    minLength={6}
                    data-testid="input-confirm-password"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={resetMutation.isPending}
                data-testid="button-reset-password"
              >
                {resetMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
