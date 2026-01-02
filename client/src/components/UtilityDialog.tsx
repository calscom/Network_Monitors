import { useState, useRef, useEffect } from "react";
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
import { Loader2, Terminal, Network, Play, Square } from "lucide-react";

interface UtilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UtilityDialog({ open, onOpenChange }: UtilityDialogProps) {
  const [pingTarget, setPingTarget] = useState("");
  const [pingCount, setPingCount] = useState("4");
  const [tracerouteTarget, setTracerouteTarget] = useState("");
  const [pingOutput, setPingOutput] = useState<string[]>([]);
  const [tracerouteOutput, setTracerouteOutput] = useState<string[]>([]);
  const [pingRunning, setPingRunning] = useState(false);
  const [tracerouteRunning, setTracerouteRunning] = useState(false);
  const [pingSuccess, setPingSuccess] = useState<boolean | null>(null);
  const [tracerouteSuccess, setTracerouteSuccess] = useState<boolean | null>(null);
  
  const pingEventSourceRef = useRef<EventSource | null>(null);
  const tracerouteEventSourceRef = useRef<EventSource | null>(null);
  const pingScrollRef = useRef<HTMLDivElement>(null);
  const tracerouteScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pingScrollRef.current) {
      pingScrollRef.current.scrollTop = pingScrollRef.current.scrollHeight;
    }
  }, [pingOutput]);

  useEffect(() => {
    if (tracerouteScrollRef.current) {
      tracerouteScrollRef.current.scrollTop = tracerouteScrollRef.current.scrollHeight;
    }
  }, [tracerouteOutput]);

  useEffect(() => {
    return () => {
      pingEventSourceRef.current?.close();
      tracerouteEventSourceRef.current?.close();
    };
  }, []);

  const handlePing = () => {
    if (!pingTarget.trim() || pingRunning) return;
    
    setPingOutput([]);
    setPingRunning(true);
    setPingSuccess(null);
    
    pingEventSourceRef.current?.close();
    
    const url = `/api/utility/ping/stream?target=${encodeURIComponent(pingTarget.trim())}&count=${parseInt(pingCount) || 4}`;
    const eventSource = new EventSource(url);
    pingEventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          setPingOutput(prev => [...prev, data.line]);
        }
        if (data.done) {
          setPingRunning(false);
          setPingSuccess(data.success);
          eventSource.close();
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    };
    
    eventSource.onerror = () => {
      setPingRunning(false);
      setPingOutput(prev => [...prev, 'Connection error']);
      eventSource.close();
    };
  };

  const handleStopPing = () => {
    pingEventSourceRef.current?.close();
    setPingRunning(false);
    setPingOutput(prev => [...prev, '--- Stopped ---']);
  };

  const handleTraceroute = () => {
    if (!tracerouteTarget.trim() || tracerouteRunning) return;
    
    setTracerouteOutput([]);
    setTracerouteRunning(true);
    setTracerouteSuccess(null);
    
    tracerouteEventSourceRef.current?.close();
    
    const url = `/api/utility/traceroute/stream?target=${encodeURIComponent(tracerouteTarget.trim())}`;
    const eventSource = new EventSource(url);
    tracerouteEventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          setTracerouteOutput(prev => [...prev, data.line]);
        }
        if (data.done) {
          setTracerouteRunning(false);
          setTracerouteSuccess(data.success);
          eventSource.close();
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    };
    
    eventSource.onerror = () => {
      setTracerouteRunning(false);
      setTracerouteOutput(prev => [...prev, 'Connection error']);
      eventSource.close();
    };
  };

  const handleStopTraceroute = () => {
    tracerouteEventSourceRef.current?.close();
    setTracerouteRunning(false);
    setTracerouteOutput(prev => [...prev, '--- Stopped ---']);
  };

  const renderStreamingOutput = (
    output: string[], 
    isRunning: boolean, 
    success: boolean | null,
    scrollRef: React.RefObject<HTMLDivElement>
  ) => {
    if (output.length === 0 && !isRunning) {
      return (
        <div className="text-muted-foreground text-sm italic py-8 text-center">
          Enter a target and click Run to execute
        </div>
      );
    }

    return (
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md">
          {output.map((line, i) => (
            <div key={i} className={line.startsWith('Error:') ? 'text-destructive' : ''}>
              {line}
            </div>
          ))}
          {isRunning && (
            <span className="inline-block w-2 h-4 bg-foreground animate-pulse ml-1" />
          )}
        </pre>
        {!isRunning && success !== null && (
          <div className={`text-xs mt-2 ${success ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {success ? 'Completed successfully' : 'Completed with errors'}
          </div>
        )}
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
            Real-time ping and traceroute for network troubleshooting
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
              Uses ICMP ping on EC2/Vultr, TCP connectivity check on Replit
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="ping-target">Target (IP or hostname)</Label>
                <Input
                  id="ping-target"
                  placeholder="e.g., 8.8.8.8 or google.com"
                  value={pingTarget}
                  onChange={(e) => setPingTarget(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !pingRunning && handlePing()}
                  disabled={pingRunning}
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
                  disabled={pingRunning}
                  data-testid="input-ping-count"
                />
              </div>
              {pingRunning ? (
                <Button 
                  onClick={handleStopPing}
                  variant="destructive"
                  data-testid="button-stop-ping"
                >
                  <Square className="w-4 h-4" />
                  <span className="ml-2">Stop</span>
                </Button>
              ) : (
                <Button 
                  onClick={handlePing} 
                  disabled={!pingTarget.trim()}
                  data-testid="button-run-ping"
                >
                  <Play className="w-4 h-4" />
                  <span className="ml-2">Run</span>
                </Button>
              )}
            </div>
            <div className="h-[300px] rounded-md border p-2 overflow-hidden">
              {renderStreamingOutput(pingOutput, pingRunning, pingSuccess, pingScrollRef)}
            </div>
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
                  onKeyDown={(e) => e.key === "Enter" && !tracerouteRunning && handleTraceroute()}
                  disabled={tracerouteRunning}
                  data-testid="input-traceroute-target"
                />
              </div>
              {tracerouteRunning ? (
                <Button 
                  onClick={handleStopTraceroute}
                  variant="destructive"
                  data-testid="button-stop-traceroute"
                >
                  <Square className="w-4 h-4" />
                  <span className="ml-2">Stop</span>
                </Button>
              ) : (
                <Button 
                  onClick={handleTraceroute} 
                  disabled={!tracerouteTarget.trim()}
                  data-testid="button-run-traceroute"
                >
                  <Play className="w-4 h-4" />
                  <span className="ml-2">Run</span>
                </Button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Shows each hop as it's discovered (max 15 hops)
            </div>
            <div className="h-[300px] rounded-md border p-2 overflow-hidden">
              {renderStreamingOutput(tracerouteOutput, tracerouteRunning, tracerouteSuccess, tracerouteScrollRef)}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
