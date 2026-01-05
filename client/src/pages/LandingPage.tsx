import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Activity, Shield, Wifi, Users } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Network Monitor</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild data-testid="button-login">
              <a href="/api/login">Sign In</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Real-Time Network Monitoring</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Monitor your network devices across multiple sites with live SNMP polling,
            bandwidth tracking, and comprehensive activity logs.
          </p>
          <Button size="lg" asChild data-testid="button-get-started">
            <a href="/api/login">Get Started</a>
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
          <Card>
            <CardHeader>
              <Wifi className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Live Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Real-time SNMP polling to track device status and bandwidth utilization.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Activity className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Bandwidth Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Monitor download and upload speeds with configurable polling intervals.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Role-Based Access</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Admin, operator, and viewer roles with granular permissions.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Multi-Site Support</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Manage devices across 12 different sites with organized dashboards.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Network Monitor Dashboard - Secure SNMP Monitoring
      </footer>
    </div>
  );
}
