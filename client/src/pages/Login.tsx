import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Activity, Lock, Mail, User, Wifi, Shield, Users, LogIn } from "lucide-react";

const isReplitEnvironment = typeof window !== "undefined" && 
  (window.location.hostname.includes("replit") || 
   window.location.hostname.includes("repl.co") ||
   window.location.hostname.endsWith(".replit.dev") ||
   window.location.hostname.endsWith(".replit.app") ||
   !!import.meta.env.VITE_REPLIT_ENV);

export default function Login() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  
  const { data: setupStatus, isLoading: checkingSetup } = useQuery<{ needsSetup: boolean }>({
    queryKey: ["/api/auth/needs-setup"],
  });
  
  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Signup failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Account Created",
        description: "Welcome! Your account has been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Signup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const setupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Setup failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/needs-setup"] });
      toast({
        title: "Setup Complete",
        description: "Admin account created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Check Your Email",
        description: "If an account exists with this email, you'll receive a password reset link.",
      });
      setShowForgotPassword(false);
      setForgotEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Request Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };
  
  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    signupMutation.mutate({ email, password, firstName, lastName });
  };
  
  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    setupMutation.mutate({ email, password, firstName, lastName });
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    forgotPasswordMutation.mutate(forgotEmail);
  };
  
  const clearForm = () => {
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
  };
  
  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  const isSetup = setupStatus?.needsSetup;
  const isPending = loginMutation.isPending || signupMutation.isPending || setupMutation.isPending;

  const features = [
    {
      icon: Wifi,
      title: "Live Monitoring",
      description: "Real-time SNMP polling to track device status and bandwidth utilization."
    },
    {
      icon: Activity,
      title: "Bandwidth Tracking",
      description: "Monitor download and upload speeds with configurable polling intervals."
    },
    {
      icon: Shield,
      title: "Role-Based Access",
      description: "Admin, operator, and viewer roles with granular permissions."
    },
    {
      icon: Users,
      title: "Multi-Site Support",
      description: "Manage devices across 12 different sites with organized dashboards."
    }
  ];
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">SceptView Network Monitor</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!showAuthForm && !isSetup && (
              isReplitEnvironment ? (
                <Button onClick={() => window.location.href = "/api/login"} data-testid="button-login">
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In with Replit
                </Button>
              ) : (
                <Button onClick={() => setShowAuthForm(true)} data-testid="button-login">
                  Sign In
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        {showAuthForm || isSetup ? (
          <div className="max-w-md mx-auto">
            {isSetup ? (
              <Card>
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl">Create Admin Account</CardTitle>
                  <CardDescription>
                    Set up your first admin account to get started
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSetup} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="firstName"
                            type="text"
                            placeholder="Admin"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="pl-9"
                            data-testid="input-first-name"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          type="text"
                          placeholder="User"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="admin@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-9"
                          required
                          data-testid="input-email"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="Create a password (min 6 chars)"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-9"
                          required
                          minLength={6}
                          data-testid="input-password"
                        />
                      </div>
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isPending}
                      data-testid="button-submit"
                    >
                      {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Account
                    </Button>
                  </form>
                  
                  <p className="mt-4 text-xs text-center text-muted-foreground">
                    This account will have full admin access to manage devices, users, and settings.
                  </p>
                </CardContent>
              </Card>
            ) : showForgotPassword ? (
              <Card>
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl">Reset Password</CardTitle>
                  <CardDescription>
                    Enter your email and we'll send you a reset link
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="forgot-email"
                          type="email"
                          placeholder="you@example.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="pl-9"
                          required
                          data-testid="input-forgot-email"
                        />
                      </div>
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={forgotPasswordMutation.isPending}
                      data-testid="button-send-reset"
                    >
                      {forgotPasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Send Reset Link
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => { setShowForgotPassword(false); setForgotEmail(""); }}
                        className="text-sm text-muted-foreground hover:text-foreground"
                        data-testid="button-back-to-login"
                      >
                        Back to Sign In
                      </button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl">Welcome Back</CardTitle>
                  <CardDescription>
                    Sign in or create an account to access the dashboard
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "login" | "signup"); clearForm(); }}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                      <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="login">
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="login-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="login-email"
                              type="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-9"
                              required
                              data-testid="input-login-email"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="login-password">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="login-password"
                              type="password"
                              placeholder="Enter your password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pl-9"
                              required
                              data-testid="input-login-password"
                            />
                          </div>
                        </div>
                        
                        <Button 
                          type="submit" 
                          className="w-full" 
                          disabled={isPending}
                          data-testid="button-login-submit"
                        >
                          {loginMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Sign In
                        </Button>

                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setShowForgotPassword(true)}
                            className="text-sm text-primary hover:underline"
                            data-testid="button-forgot-password"
                          >
                            Forgot your password?
                          </button>
                        </div>
                      </form>
                    </TabsContent>
                    
                    <TabsContent value="signup">
                      <form onSubmit={handleSignup} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="signup-firstName">First Name</Label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                id="signup-firstName"
                                type="text"
                                placeholder="John"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className="pl-9"
                                data-testid="input-signup-first-name"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="signup-lastName">Last Name</Label>
                            <Input
                              id="signup-lastName"
                              type="text"
                              placeholder="Doe"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              data-testid="input-signup-last-name"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="signup-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="signup-email"
                              type="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-9"
                              required
                              data-testid="input-signup-email"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="signup-password">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="signup-password"
                              type="password"
                              placeholder="Create a password (min 6 chars)"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pl-9"
                              required
                              minLength={6}
                              data-testid="input-signup-password"
                            />
                          </div>
                        </div>
                        
                        <Button 
                          type="submit" 
                          className="w-full" 
                          disabled={isPending}
                          data-testid="button-signup-submit"
                        >
                          {signupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Create Account
                        </Button>
                      </form>
                      
                      <p className="mt-4 text-xs text-center text-muted-foreground">
                        New accounts are created with viewer access. Contact an admin for elevated permissions.
                      </p>
                    </TabsContent>
                  </Tabs>
                  
                  <Button 
                    variant="ghost" 
                    className="w-full mt-4" 
                    onClick={() => { setShowAuthForm(false); clearForm(); }}
                    data-testid="button-back"
                  >
                    Back to Home
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <>
            <div className="max-w-4xl mx-auto text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">SceptView Real-Time Network Monitoring</h2>
              <p className="text-xl text-muted-foreground mb-8">
                Monitor your network devices across multiple sites with live SNMP polling,
                bandwidth tracking, and comprehensive activity logs.
              </p>
              <Button size="lg" onClick={() => setShowAuthForm(true)} data-testid="button-get-started">
                Get Started
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
              {features.map((feature, index) => (
                <Card key={index}>
                  <CardHeader>
                    <feature.icon className="w-10 h-10 text-primary mb-2" />
                    <CardTitle>{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        SceptView Network Monitor - Secure SNMP Monitoring
      </footer>
    </div>
  );
}
