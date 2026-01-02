import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Terminal, Network, Play } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

interface UtilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UtilityResult {
  success: boolean;
  output: string;
  error: string | null;
}

export function UtilityDialog({ open, onOpenChange }: UtilityDialogProps) {
  const [pingTarget, setPingTarget] = useState("");
  const [pingCount, setPingCount] = useState("4");
  const [tracerouteTarget, setTracerouteTarget] = useState("");
  const [pingResult, setPingResult] = useState<UtilityResult | null>(null);
  const [tracerouteResult, setTracerouteResult] = useState<UtilityResult | null>(null);

  const pingMutation = useMutation({
    mutationFn: async ({ target, count }: { target: string; count: number }) => {
      const res = await fetch("/api/utility/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, count }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to execute ping");
      }
      return res.json() as Promise<UtilityResult>;
    },
    onSuccess: (data) => {
      setPingResult(data);
    },
    onError: (error: Error) => {
      setPingResult({ success: false, output: "", error: error.message });
    },
  });

  const tracerouteMutation = useMutation({
    mutationFn: async (target: string) => {
      const res = await fetch("/api/utility/traceroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to execute traceroute");
      }
      return res.json() as Promise<UtilityResult>;
    },
    onSuccess: (data) => {
      setTracerouteResult(data);
    },
    onError: (error: Error) => {
      setTracerouteResult({ success: false, output: "", error: error.message });
    },
  });

  const handlePing = () => {
    if (!pingTarget.trim()) return;
    setPingResult(null);
    pingMutation.mutate({ target: pingTarget.trim(), count: parseInt(pingCount) || 4 });
  };

  const handleTraceroute = () => {
    if (!tracerouteTarget.trim()) return;
    setTracerouteResult(null);
    tracerouteMutation.mutate(tracerouteTarget.trim());
  };

  const renderOutput = (result: UtilityResult | null, isLoading: boolean) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Running...</span>
        </div>
      );
    }

    if (!result) {
      return (
        <div className="text-muted-foreground text-sm italic py-8 text-center">
          Enter a target and click Run to execute
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {result.error && (
          <div className="text-destructive text-sm bg-destructive/10 p-2 rounded">
            {result.error}
          </div>
        )}
        <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md overflow-x-auto">
          {result.output || "No output"}
        </pre>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Network Utilities
          </DialogTitle>
          <DialogDescription>
            Ping and traceroute tools for network troubleshooting
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="ping" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ping" className="flex items-center gap-2" data-testid="tab-ping">
              <Network className="w-4 h-4" />
              Ping
            </TabsTrigger>
            <TabsTrigger value="traceroute" className="flex items-center gap-2" data-testid="tab-traceroute">
              <Terminal className="w-4 h-4" />
              Traceroute
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ping" className="space-y-4 mt-4">
            <div className="text-xs text-muted-foreground mb-2">
              Uses TCP connectivity check (tests ports 80, 443, 22, 161)
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="ping-target">Target (IP or hostname)</Label>
                <Input
                  id="ping-target"
                  placeholder="e.g., 8.8.8.8 or google.com"
                  value={pingTarget}
                  onChange={(e) => setPingTarget(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePing()}
                  data-testid="input-ping-target"
                />
              </div>
              <div className="w-20 space-y-2">
                <Label htmlFor="ping-count">Count</Label>
                <Input
                  id="ping-count"
                  type="number"
                  min="1"
                  max="10"
                  value={pingCount}
                  onChange={(e) => setPingCount(e.target.value)}
                  data-testid="input-ping-count"
                />
              </div>
              <Button 
                onClick={handlePing} 
                disabled={pingMutation.isPending || !pingTarget.trim()}
                data-testid="button-run-ping"
              >
                {pingMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span className="ml-2">Run</span>
              </Button>
            </div>
            <ScrollArea className="h-[300px] rounded-md border p-2">
              {renderOutput(pingResult, pingMutation.isPending)}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="traceroute" className="space-y-4 mt-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="traceroute-target">Target (IP or hostname)</Label>
                <Input
                  id="traceroute-target"
                  placeholder="e.g., 8.8.8.8 or google.com"
                  value={tracerouteTarget}
                  onChange={(e) => setTracerouteTarget(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTraceroute()}
                  data-testid="input-traceroute-target"
                />
              </div>
              <Button 
                onClick={handleTraceroute} 
                disabled={tracerouteMutation.isPending || !tracerouteTarget.trim()}
                data-testid="button-run-traceroute"
              >
                {tracerouteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span className="ml-2">Run</span>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Note: Traceroute may take up to 60 seconds to complete
            </div>
            <ScrollArea className="h-[300px] rounded-md border p-2">
              {renderOutput(tracerouteResult, tracerouteMutation.isPending)}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
