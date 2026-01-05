import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Bell, Mail, Send, Save, AlertTriangle, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { SiTelegram } from "react-icons/si";
import { Link } from "wouter";

interface NotificationSettings {
  id?: number;
  emailEnabled: number;
  emailRecipients: string;
  telegramEnabled: number;
  telegramBotToken: string;
  telegramChatId: string;
  notifyOnOffline: number;
  notifyOnRecovery: number;
  notifyOnHighUtilization: number;
  utilizationThreshold: number;
  cooldownMinutes: number;
}

export default function NotificationSettings() {
  const { toast } = useToast();
  const [testingTelegram, setTestingTelegram] = useState(false);
  
  const { data: settings, isLoading } = useQuery<NotificationSettings>({
    queryKey: ["/api/settings/notifications"],
  });

  const [formData, setFormData] = useState<Partial<NotificationSettings>>({});
  
  const getFieldValue = <K extends keyof NotificationSettings>(key: K): NotificationSettings[K] => {
    if (key in formData) {
      return formData[key] as NotificationSettings[K];
    }
    return settings?.[key] ?? (key.includes('Enabled') || key.includes('notify') ? 0 : '') as NotificationSettings[K];
  };

  const updateField = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<NotificationSettings>) => {
      const res = await apiRequest("POST", "/api/settings/notifications", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/notifications"] });
      toast({
        title: "Settings saved",
        description: "Notification settings have been updated.",
      });
      setFormData({});
    },
    onError: (err: any) => {
      toast({
        title: "Error saving settings",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const testTelegramMutation = useMutation({
    mutationFn: async ({ botToken, chatId }: { botToken: string; chatId: string }) => {
      const res = await apiRequest("POST", "/api/settings/notifications/test-telegram", { botToken, chatId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Test successful",
          description: "Telegram test message sent successfully!",
        });
      } else {
        toast({
          title: "Test failed",
          description: data.message || "Failed to send test message",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Connection failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const dataToSave = { ...settings, ...formData };
    
    // Normalize all boolean-like values to integers 0/1
    const normalizedData = {
      ...dataToSave,
      emailEnabled: dataToSave.emailEnabled ? 1 : 0,
      telegramEnabled: dataToSave.telegramEnabled ? 1 : 0,
      notifyOnOffline: dataToSave.notifyOnOffline ? 1 : 0,
      notifyOnRecovery: dataToSave.notifyOnRecovery ? 1 : 0,
      notifyOnHighUtilization: dataToSave.notifyOnHighUtilization ? 1 : 0,
      utilizationThreshold: Number(dataToSave.utilizationThreshold) || 90,
      cooldownMinutes: Number(dataToSave.cooldownMinutes) || 5,
    };
    
    saveMutation.mutate(normalizedData);
  };

  const handleTestTelegram = () => {
    const botToken = getFieldValue('telegramBotToken');
    const chatId = getFieldValue('telegramChatId');
    
    if (!botToken || !chatId) {
      toast({
        title: "Missing credentials",
        description: "Please enter both Bot Token and Chat ID",
        variant: "destructive",
      });
      return;
    }
    
    setTestingTelegram(true);
    testTelegramMutation.mutate({ botToken, chatId }, {
      onSettled: () => setTestingTelegram(false)
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bell className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Notification Settings</h1>
            <p className="text-muted-foreground">Configure alerts for device status changes</p>
          </div>
        </div>
        <Link href="/">
          <Button variant="outline" data-testid="button-back-dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alert Preferences
          </CardTitle>
          <CardDescription>Choose which events trigger notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Device goes offline</Label>
              <p className="text-sm text-muted-foreground">Notify when a device stops responding</p>
            </div>
            <Switch
              data-testid="switch-notify-offline"
              checked={getFieldValue('notifyOnOffline') === 1}
              onCheckedChange={(checked) => updateField('notifyOnOffline', checked ? 1 : 0)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label>Device recovers</Label>
              <p className="text-sm text-muted-foreground">Notify when an offline device comes back online</p>
            </div>
            <Switch
              data-testid="switch-notify-recovery"
              checked={getFieldValue('notifyOnRecovery') === 1}
              onCheckedChange={(checked) => updateField('notifyOnRecovery', checked ? 1 : 0)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label>High bandwidth utilization</Label>
              <p className="text-sm text-muted-foreground">Notify when utilization exceeds threshold</p>
            </div>
            <Switch
              data-testid="switch-notify-utilization"
              checked={getFieldValue('notifyOnHighUtilization') === 1}
              onCheckedChange={(checked) => updateField('notifyOnHighUtilization', checked ? 1 : 0)}
            />
          </div>
          
          {getFieldValue('notifyOnHighUtilization') === 1 && (
            <div className="pl-4 border-l-2 border-muted space-y-2">
              <Label>Utilization threshold: {getFieldValue('utilizationThreshold')}%</Label>
              <Slider
                data-testid="slider-utilization-threshold"
                value={[getFieldValue('utilizationThreshold') || 90]}
                onValueChange={([value]) => updateField('utilizationThreshold', value)}
                min={50}
                max={100}
                step={5}
              />
            </div>
          )}
          
          <div className="pt-4 border-t">
            <Label>Cooldown period (minutes)</Label>
            <p className="text-sm text-muted-foreground mb-2">Minimum time between notifications to prevent spam</p>
            <Input
              data-testid="input-cooldown"
              type="number"
              min={0}
              max={60}
              value={getFieldValue('cooldownMinutes') || 5}
              onChange={(e) => updateField('cooldownMinutes', parseInt(e.target.value) || 5)}
              className="w-24"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SiTelegram className="h-5 w-5 text-[#0088cc]" />
            Telegram Notifications
          </CardTitle>
          <CardDescription>Send alerts to a Telegram chat or group</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable Telegram notifications</Label>
            <Switch
              data-testid="switch-telegram-enabled"
              checked={getFieldValue('telegramEnabled') === 1}
              onCheckedChange={(checked) => updateField('telegramEnabled', checked ? 1 : 0)}
            />
          </div>
          
          {getFieldValue('telegramEnabled') === 1 && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Bot Token</Label>
                <Input
                  data-testid="input-telegram-token"
                  type="password"
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={getFieldValue('telegramBotToken') || ''}
                  onChange={(e) => updateField('telegramBotToken', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Get this from @BotFather on Telegram
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Chat ID</Label>
                <Input
                  data-testid="input-telegram-chat-id"
                  placeholder="-100123456789 or 123456789"
                  value={getFieldValue('telegramChatId') || ''}
                  onChange={(e) => updateField('telegramChatId', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use @userinfobot or @RawDataBot to get your chat ID
                </p>
              </div>
              
              <Button
                data-testid="button-test-telegram"
                variant="outline"
                onClick={handleTestTelegram}
                disabled={testingTelegram}
              >
                {testingTelegram ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Test Message
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>Send alerts via email (requires SendGrid)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable email notifications</Label>
            <Switch
              data-testid="switch-email-enabled"
              checked={getFieldValue('emailEnabled') === 1}
              onCheckedChange={(checked) => updateField('emailEnabled', checked ? 1 : 0)}
            />
          </div>
          
          {getFieldValue('emailEnabled') === 1 && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Recipient Email Addresses</Label>
                <Input
                  data-testid="input-email-recipients"
                  placeholder="admin@example.com, ops@example.com"
                  value={getFieldValue('emailRecipients') || ''}
                  onChange={(e) => updateField('emailRecipients', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of email addresses
                </p>
              </div>
              
              <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                <p className="font-medium mb-1">Email Configuration Required</p>
                <p>Set the following environment variables:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>SENDGRID_API_KEY - Your SendGrid API key</li>
                  <li>SENDGRID_FROM_EMAIL - Verified sender email</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          data-testid="button-save-settings"
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
