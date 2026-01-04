import { storage } from "./storage";
import type { Device, NotificationSettings } from "@shared/schema";

interface NotificationPayload {
  type: 'offline' | 'recovery' | 'high_utilization';
  device: Device;
  message: string;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[notifications] Telegram send failed:', error);
      return false;
    }
    
    console.log('[notifications] Telegram message sent successfully');
    return true;
  } catch (error) {
    console.error('[notifications] Telegram error:', error);
    return false;
  }
}

async function sendEmailNotification(
  recipients: string[],
  subject: string,
  body: string
): Promise<boolean> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@networkmonitor.local';
  
  if (!sendgridApiKey) {
    console.log('[notifications] SendGrid API key not configured, skipping email');
    return false;
  }
  
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: recipients.map(email => ({ email })),
        }],
        from: { email: fromEmail },
        subject,
        content: [{
          type: 'text/html',
          value: body,
        }],
      }),
    });
    
    if (!response.ok && response.status !== 202) {
      const error = await response.text();
      console.error('[notifications] SendGrid error:', error);
      return false;
    }
    
    console.log('[notifications] Email sent successfully to', recipients.join(', '));
    return true;
  } catch (error) {
    console.error('[notifications] Email error:', error);
    return false;
  }
}

function formatNotificationMessage(payload: NotificationPayload): { text: string; html: string; subject: string } {
  const { type, device, message } = payload;
  const timestamp = new Date().toLocaleString();
  
  let emoji = '';
  let status = '';
  
  switch (type) {
    case 'offline':
      emoji = '🔴';
      status = 'OFFLINE';
      break;
    case 'recovery':
      emoji = '🟢';
      status = 'RECOVERED';
      break;
    case 'high_utilization':
      emoji = '⚠️';
      status = 'HIGH UTILIZATION';
      break;
  }
  
  const text = `${emoji} ${status}: ${device.name}

Site: ${device.site}
IP: ${device.ip}
Type: ${device.type}
Message: ${message}
Time: ${timestamp}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${type === 'offline' ? '#dc2626' : type === 'recovery' ? '#16a34a' : '#f59e0b'};">
        ${emoji} ${status}: ${device.name}
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Site:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${device.site}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>IP:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${device.ip}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Type:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${device.type}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Message:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${message}</td></tr>
        <tr><td style="padding: 8px;"><strong>Time:</strong></td><td style="padding: 8px;">${timestamp}</td></tr>
      </table>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        Network Monitor Dashboard
      </p>
    </div>
  `;
  
  const subject = `[Network Monitor] ${status}: ${device.name} (${device.site})`;
  
  return { text, html, subject };
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const settings = await storage.getNotificationSettings();
  
  if (!settings) {
    console.log('[notifications] No notification settings configured');
    return;
  }
  
  if (settings.cooldownMinutes > 0 && settings.lastNotificationAt) {
    const cooldownMs = settings.cooldownMinutes * 60 * 1000;
    const timeSinceLastNotification = Date.now() - new Date(settings.lastNotificationAt).getTime();
    if (timeSinceLastNotification < cooldownMs) {
      console.log('[notifications] Skipping notification due to cooldown');
      return;
    }
  }
  
  const { text, html, subject } = formatNotificationMessage(payload);
  const promises: Promise<boolean>[] = [];
  
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
    promises.push(sendTelegramMessage(settings.telegramBotToken, settings.telegramChatId, text));
  }
  
  if (settings.emailEnabled && settings.emailRecipients) {
    const recipients = settings.emailRecipients.split(',').map(e => e.trim()).filter(Boolean);
    if (recipients.length > 0) {
      promises.push(sendEmailNotification(recipients, subject, html));
    }
  }
  
  if (promises.length > 0) {
    await Promise.all(promises);
    await storage.updateLastNotificationTime();
  }
}

export async function notifyDeviceOffline(device: Device): Promise<void> {
  const settings = await storage.getNotificationSettings();
  if (!settings?.notifyOnOffline) return;
  
  await sendNotification({
    type: 'offline',
    device,
    message: `Device went offline and is not responding to SNMP polls`,
  });
}

export async function notifyDeviceRecovery(device: Device): Promise<void> {
  const settings = await storage.getNotificationSettings();
  if (!settings?.notifyOnRecovery) return;
  
  await sendNotification({
    type: 'recovery',
    device,
    message: `Device is back online and responding to SNMP polls`,
  });
}

export async function notifyHighUtilization(device: Device, utilization: number): Promise<void> {
  const settings = await storage.getNotificationSettings();
  if (!settings?.notifyOnHighUtilization) return;
  if (utilization < (settings.utilizationThreshold || 90)) return;
  
  await sendNotification({
    type: 'high_utilization',
    device,
    message: `Bandwidth utilization at ${utilization}% exceeds threshold of ${settings.utilizationThreshold}%`,
  });
}

export async function testTelegramConnection(botToken: string, chatId: string): Promise<{ success: boolean; message: string }> {
  try {
    const success = await sendTelegramMessage(
      botToken,
      chatId,
      '✅ <b>Network Monitor</b>\n\nTelegram notifications configured successfully!'
    );
    
    if (success) {
      return { success: true, message: 'Test message sent successfully' };
    } else {
      return { success: false, message: 'Failed to send test message. Check bot token and chat ID.' };
    }
  } catch (error: any) {
    return { success: false, message: error.message || 'Connection failed' };
  }
}
