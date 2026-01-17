import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  TableOfContents,
  PageBreak,
} from "docx";
import * as fs from "fs";

const createBulletPoint = (text: string, level: number = 0) => {
  return new Paragraph({
    text: text,
    bullet: { level },
    spacing: { after: 100 },
  });
};

const createNumberedItem = (text: string, level: number = 0) => {
  return new Paragraph({
    text: text,
    numbering: { reference: "numbered-list", level },
    spacing: { after: 100 },
  });
};

const createParagraph = (text: string, bold: boolean = false) => {
  return new Paragraph({
    children: [new TextRun({ text, bold })],
    spacing: { after: 200 },
  });
};

const createNote = (text: string) => {
  return new Paragraph({
    children: [
      new TextRun({ text: "Note: ", bold: true, italics: true }),
      new TextRun({ text, italics: true }),
    ],
    spacing: { after: 200, before: 100 },
    indent: { left: 360 },
  });
};

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "numbered-list",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.START,
          },
          {
            level: 1,
            format: "lowerLetter",
            text: "%2)",
            alignment: AlignmentType.START,
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {},
      children: [
        // Title Page
        new Paragraph({
          children: [
            new TextRun({
              text: "SceptView Network Monitor",
              bold: true,
              size: 56,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 3000, after: 400 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Operational Manual",
              size: 40,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Version 1.0",
              size: 28,
              italics: true,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
              size: 24,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 3000 },
        }),

        // Page break for Table of Contents
        new Paragraph({
          children: [new PageBreak()],
        }),

        // Table of Contents
        new Paragraph({
          text: "Table of Contents",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 },
        }),
        new TableOfContents("Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 1: Introduction
        new Paragraph({
          text: "1. Introduction",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),
        new Paragraph({
          text: "1.1 Overview",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph(
          "SceptView Network Monitor is a real-time SNMP network monitoring solution designed to track device status and bandwidth utilization across multiple sites. It provides comprehensive visibility into network health through live status indicators, bandwidth gauges, and historical performance data."
        ),
        createParagraph("Key capabilities include:"),
        createBulletPoint("Real-time device status monitoring (Online/Offline/Recovering)"),
        createBulletPoint("Separate download and upload bandwidth measurements in Mbps"),
        createBulletPoint("Multi-site organization with tabbed navigation"),
        createBulletPoint("Network topology visualization"),
        createBulletPoint("Historical performance graphs and availability tracking"),
        createBulletPoint("Email and Telegram notifications for alerts"),
        createBulletPoint("Role-based access control (Admin, Operator, Viewer)"),
        createBulletPoint("CSV/Excel import and export functionality"),

        new Paragraph({
          text: "1.2 System Requirements",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("For Replit Deployment:"),
        createBulletPoint("Active Replit account"),
        createBulletPoint("PostgreSQL database (provided by Replit)"),
        createBulletPoint("SMTP credentials for email notifications (optional)"),

        createParagraph("For Self-Hosted Deployment (AWS EC2, Vultr VPS):"),
        createBulletPoint("Node.js 18 or higher"),
        createBulletPoint("PostgreSQL 14 or higher"),
        createBulletPoint("Linux-based operating system"),
        createBulletPoint("Network access to monitored devices (SNMP/ICMP)"),

        new Paragraph({
          text: "1.3 Poll Types",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "The system supports four polling modes that determine how device connectivity is verified:"
        ),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [createParagraph("Poll Type", true)],
                  width: { size: 25, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [createParagraph("Description", true)],
                  width: { size: 75, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Ping Only")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Uses ICMP ping to verify device reachability. No bandwidth metrics collected."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("SNMP Only")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Uses SNMP polling for full metrics including bandwidth utilization. Default mode."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Ping AND SNMP")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Both ping and SNMP must succeed for device to be considered online. Most strict."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Ping OR SNMP")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Either ping or SNMP success marks device as online. Most lenient for unreliable connections."
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 2: Getting Started
        new Paragraph({
          text: "2. Getting Started",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "2.1 First-Time Setup (Self-Hosted)",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph(
          "When deploying on a self-hosted server, the first user to access the application will be prompted to create an administrator account:"
        ),
        createNumberedItem("Navigate to the application URL in your web browser"),
        createNumberedItem("You will be redirected to the Initial Setup page"),
        createNumberedItem("Enter a username (minimum 3 characters)"),
        createNumberedItem("Enter an email address"),
        createNumberedItem("Create a strong password (minimum 6 characters)"),
        createNumberedItem("Click 'Create Admin Account'"),
        createNote(
          "This initial admin account has full system access. Store credentials securely."
        ),

        new Paragraph({
          text: "2.2 Logging In",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("Replit Environment:"),
        createBulletPoint("Click the 'Sign in with Replit' button"),
        createBulletPoint("Authenticate using your Replit account (Google, GitHub, X, Apple, or email)"),
        createBulletPoint("New users are automatically assigned the 'Viewer' role"),

        createParagraph("Self-Hosted Environment:"),
        createBulletPoint("Enter your username and password"),
        createBulletPoint("Click 'Sign In'"),
        createBulletPoint("Use 'Forgot Password?' if you need to reset your password"),

        new Paragraph({
          text: "2.3 Understanding the Dashboard",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "The main dashboard displays all monitored devices organized by site. Key elements include:"
        ),
        createBulletPoint("Site Tabs - Switch between different locations"),
        createBulletPoint("Device Cards - Show individual device status, bandwidth, and utilization"),
        createBulletPoint("Status Indicators - Green (Online), Red (Offline), Blue (Recovering)"),
        createBulletPoint("Bandwidth Gauges - Visual representation of current utilization"),
        createBulletPoint("Availability Percentage - Uptime tracking for each device"),
        createBulletPoint("Theme Toggle - Switch between light and dark modes using the sun/moon icon"),
        createBulletPoint("Copy IP Address - Click any device IP to copy it to your clipboard"),

        new Paragraph({
          text: "2.4 New User Onboarding",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "First-time users are presented with an interactive onboarding tour that introduces key features:"
        ),
        createBulletPoint("Progress bar shows your journey through the tour steps"),
        createBulletPoint("Navigate using Next/Back buttons or click the step dots"),
        createBulletPoint("Skip the tour at any time using the X button"),
        createBulletPoint("Restart the tour from the main menu under 'Restart Tour'"),
        createNote(
          "The onboarding tour covers device management, notifications, Network Map, and user roles."
        ),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 3: Managing Sites
        new Paragraph({
          text: "3. Managing Sites",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "3.1 Adding a New Site",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph(
          "Sites are created automatically when you add a device with a new site name. Alternatively:"
        ),
        createNumberedItem("Click the 'Add Site' button (if available) or navigate to Settings > Sites"),
        createNumberedItem("Enter the site name (e.g., 'Lagos', 'Abuja', 'Cloud')"),
        createNumberedItem("Click 'Create Site'"),
        createNote(
          "Site names should be descriptive and consistent across your organization."
        ),

        new Paragraph({
          text: "3.2 Viewing Site Health",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "The Site Health page provides a visual overview of all sites with aggregate statistics:"
        ),
        createBulletPoint("Total devices per site"),
        createBulletPoint("Online/Offline device counts"),
        createBulletPoint("Average availability percentage"),
        createBulletPoint("Peak bandwidth utilization"),
        createParagraph(
          "Access Site Health from the sidebar navigation menu."
        ),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 4: Managing Devices
        new Paragraph({
          text: "4. Managing Devices",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "4.1 Adding a Device",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph("To add a new device to monitoring:"),
        createNumberedItem("Click the 'Add Device' button in the header or device list"),
        createNumberedItem("Fill in the required fields:"),
        createBulletPoint("Device Name - A descriptive identifier", 1),
        createBulletPoint("IP Address - The device's IP address", 1),
        createBulletPoint("Site - Select an existing site or enter a new one", 1),
        createBulletPoint("Device Type - Router, Switch, Mikrotik, Access Point, etc.", 1),
        createBulletPoint("Poll Type - Select the monitoring method", 1),
        createNumberedItem("For SNMP-enabled devices, configure:"),
        createBulletPoint("SNMP Community String (default: 'public')", 1),
        createBulletPoint("Interface Index for bandwidth monitoring", 1),
        createBulletPoint("Maximum Bandwidth (Mbps) for utilization calculation", 1),
        createNumberedItem("Click 'Add Device' to save"),

        new Paragraph({
          text: "4.2 Editing a Device",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createNumberedItem("Locate the device card on the dashboard"),
        createNumberedItem("Click the three-dot menu (kebab menu) on the device card"),
        createNumberedItem("Select 'Edit Device'"),
        createNumberedItem("Modify the desired settings"),
        createNumberedItem("Click 'Save Changes'"),

        new Paragraph({
          text: "4.3 Deleting a Device",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createNumberedItem("Click the three-dot menu on the device card"),
        createNumberedItem("Select 'Delete Device'"),
        createNumberedItem("Confirm the deletion in the dialog"),
        createNote(
          "Deleting a device removes all associated historical data. This action cannot be undone."
        ),

        new Paragraph({
          text: "4.4 Interface Discovery",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "For devices with multiple network interfaces, use the Interface Discovery feature:"
        ),
        createNumberedItem("Edit the device"),
        createNumberedItem("Click 'Discover Interfaces'"),
        createNumberedItem("Wait for the SNMP scan to complete"),
        createNumberedItem("Select the primary interface for monitoring"),
        createNumberedItem("Optionally enable monitoring for additional interfaces"),

        new Paragraph({
          text: "4.5 Bulk Import (CSV/Excel)",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("To import multiple devices at once:"),
        createNumberedItem("Navigate to Settings > Import/Export"),
        createNumberedItem("Download the template file to see the required format"),
        createNumberedItem("Prepare your CSV or Excel file with device data"),
        createNumberedItem("Click 'Import Devices' and select your file"),
        createNumberedItem("Review the import preview"),
        createNumberedItem("Confirm the import"),

        createParagraph("Required columns:"),
        createBulletPoint("name - Device name"),
        createBulletPoint("ip - IP address"),
        createBulletPoint("site - Site name"),
        createBulletPoint("type - Device type (mikrotik, unifi, radio, generic, etc.)"),
        createBulletPoint("community - SNMP community string (default: public)"),
        createBulletPoint("poll_type - Polling method (ping_only, snmp_only, ping_and_snmp, ping_or_snmp)"),
        createBulletPoint("max_bandwidth - Maximum bandwidth in Mbps for utilization calculation"),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 5: User Management
        new Paragraph({
          text: "5. User Management",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "5.1 User Roles",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph("The system supports three permission levels:"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [createParagraph("Role", true)],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [createParagraph("Permissions", true)],
                  width: { size: 80, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Viewer")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Read-only access. Can view dashboards, device status, and reports."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Operator")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Can add, edit, and delete devices and sites. Can manage notification settings."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Admin")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Full access including user management, system settings, and all operator permissions."
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({
          text: "5.2 Managing Users (Admin Only)",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createNumberedItem("Navigate to Settings > User Management"),
        createNumberedItem("View all registered users"),
        createNumberedItem("Click on a user to modify their role"),
        createNumberedItem("Select the new role from the dropdown"),
        createNumberedItem("Click 'Save'"),

        new Paragraph({
          text: "5.3 Password Reset",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("For self-hosted deployments with SMTP configured:"),
        createNumberedItem("Click 'Forgot Password?' on the login page"),
        createNumberedItem("Enter your registered email address"),
        createNumberedItem("Check your email for the reset link"),
        createNumberedItem("Click the link and enter a new password"),
        createNote(
          "Password reset links expire after 1 hour for security."
        ),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 6: Notifications
        new Paragraph({
          text: "6. Notifications",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "6.1 Email Notifications",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph("Configure email alerts for device events:"),
        createNumberedItem("Navigate to Settings > Notifications"),
        createNumberedItem("Enable 'Email Notifications'"),
        createNumberedItem("Enter recipient email addresses (comma-separated for multiple)"),
        createNumberedItem("Select notification triggers:"),
        createBulletPoint("Device Offline - When a device becomes unreachable", 1),
        createBulletPoint("Device Recovery - When an offline device comes back online", 1),
        createBulletPoint("High Utilization - When bandwidth exceeds threshold", 1),
        createNumberedItem("Set the utilization threshold percentage (default: 90%)"),
        createNumberedItem("To test email configuration:"),
        createBulletPoint("Enter a test email address in the 'Test Email Configuration' field", 1),
        createBulletPoint("Click 'Send Test' to verify SMTP is working correctly", 1),
        createNumberedItem("Click 'Save Settings'"),
        createNote(
          "SMTP must be configured with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL environment variables."
        ),

        new Paragraph({
          text: "6.2 Telegram Notifications",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("To receive notifications via Telegram:"),
        createNumberedItem("Create a Telegram bot via @BotFather"),
        createNumberedItem("Copy the bot token"),
        createNumberedItem("Get your chat ID (use @userinfobot)"),
        createNumberedItem("In Settings > Notifications, enable Telegram"),
        createNumberedItem("Paste the bot token and chat ID"),
        createNumberedItem("Click 'Test' to verify the connection"),
        createNumberedItem("Save your settings"),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 7: Reports and Analytics
        new Paragraph({
          text: "7. Reports and Analytics",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "7.1 Performance History",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph(
          "View historical bandwidth and utilization data for any device:"
        ),
        createNumberedItem("Click on a device card to open the detail view"),
        createNumberedItem("Select the 'History' tab"),
        createNumberedItem("Choose the time range (1 hour, 24 hours, 7 days, 30 days)"),
        createNumberedItem("View download/upload graphs and utilization trends"),

        new Paragraph({
          text: "7.2 Availability Reports",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "The system tracks device availability and generates monthly reports:"
        ),
        createBulletPoint("Current Month - Shows real-time availability percentage"),
        createBulletPoint("Monthly History - View past months' availability"),
        createBulletPoint("Annual Summary - Aggregated yearly availability data"),
        createParagraph(
          "Availability resets at 11:59 PM on the last day of each month, with data archived for historical reference."
        ),

        new Paragraph({
          text: "7.3 Activity Log",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "The Activity Log records all system events:"
        ),
        createBulletPoint("Device status changes"),
        createBulletPoint("Configuration modifications"),
        createBulletPoint("User login/logout events"),
        createBulletPoint("System alerts and notifications"),
        createParagraph(
          "Access the Activity Log from the sidebar. Use filters to search by site, device, or date range."
        ),

        new Paragraph({
          text: "7.4 Exporting Data",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("Export device and performance data:"),
        createNumberedItem("Navigate to Settings > Import/Export"),
        createNumberedItem("Select the data type to export:"),
        createBulletPoint("Device List - All devices with current configuration", 1),
        createBulletPoint("Performance Data - Historical metrics", 1),
        createBulletPoint("Activity Logs - Event history", 1),
        createNumberedItem("Choose format (CSV or Excel)"),
        createNumberedItem("Click 'Export' to download"),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 8: Network Topology
        new Paragraph({
          text: "8. Network Topology",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),
        
        new Paragraph({
          text: "8.1 Network Map View",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph(
          "The Network Map provides a visual overview of all sites and devices:"
        ),
        createBulletPoint("Sites displayed as columns with device status counts"),
        createBulletPoint("Color-coded status indicators (green=online, red=offline, blue=recovering)"),
        createBulletPoint("Real-time bandwidth utilization bars on each device"),
        createBulletPoint("Click a site column to navigate to that site's device list"),
        createBulletPoint("Toggle between Grid and Horizontal layout modes"),
        createBulletPoint("Bottom status bar shows total Online/Offline/Recovering/Hotspot Users counts"),
        createBulletPoint("Live clock displays current date and time"),

        new Paragraph({
          text: "8.2 Kiosk Mode",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "Kiosk mode provides a full-screen Network Map display ideal for wall-mounted monitors and NOC displays:"
        ),
        createNumberedItem("Access kiosk mode by navigating to /kiosk in your browser"),
        createNumberedItem("The view fills the entire screen without sidebar or header"),
        createNumberedItem("No authentication required for kiosk access"),
        createNumberedItem("Automatically refreshes device data every 2 seconds"),
        createParagraph("Summary Cards at the top display:"),
        createBulletPoint("Total Devices - Count of all monitored devices with activity icon"),
        createBulletPoint("Online & Stable - Count of devices currently online (green indicator)"),
        createBulletPoint("Critical / Recovering - Count of offline or recovering devices (red indicator)"),
        createParagraph("Browser Kiosk Mode Setup:"),
        createBulletPoint("Chrome: Press F11 for full-screen, or launch with --kiosk flag"),
        createBulletPoint("Firefox: Press F11 for full-screen mode"),
        createBulletPoint("Edge: Press F11 or use Settings > Full Screen"),
        createNote(
          "For dedicated kiosk displays, configure your browser to auto-start in kiosk mode pointing to /kiosk URL."
        ),

        new Paragraph({
          text: "8.3 Device Links and Connections",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "Device Links allow you to visualize network connections between devices:"
        ),
        createBulletPoint("Links show real-time traffic flow between connected devices"),
        createBulletPoint("Color-coded status: green (online), red (offline), blue (recovering), orange (degraded)"),
        createBulletPoint("Animated indicators show current traffic utilization"),
        createBulletPoint("Traffic displayed in Mbps with utilization percentage"),
        
        createParagraph("Managing Device Links:"),
        createNumberedItem("Navigate to Network Map from the sidebar"),
        createNumberedItem("Click 'Manage Links' button (top right of Network Map header) to open link management dialog"),
        createNumberedItem("To create a link:"),
        createBulletPoint("Select the source device from the dropdown", 1),
        createBulletPoint("Select the target device from the dropdown", 1),
        createBulletPoint("Optionally enter a label (e.g., 'Fiber Uplink')", 1),
        createBulletPoint("Set the bandwidth capacity in Mbps", 1),
        createBulletPoint("Click 'Create Link'", 1),
        createNumberedItem("To edit an existing link:"),
        createBulletPoint("In the link list, click the Edit (pencil) icon next to the link", 1),
        createBulletPoint("Modify the label, bandwidth, or connected devices", 1),
        createBulletPoint("Click 'Update Link' to save changes", 1),
        createNumberedItem("To delete a link:"),
        createBulletPoint("Click the Delete (trash) icon next to the link", 1),
        createBulletPoint("The link will be removed immediately", 1),
        
        createParagraph("Auto-Discovery Feature:"),
        createBulletPoint("Click 'Auto-Discover' to automatically detect device connections"),
        createBulletPoint("Uses network topology heuristics (routers, switches, APs hierarchy)"),
        createBulletPoint("Supports LLDP/CDP discovery when available on devices"),
        createNote(
          "Auto-discovery creates links based on device types and network topology. Review and adjust the discovered links as needed."
        ),

        new Paragraph({
          text: "8.4 Manual Device Arrangement",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "You can manually rearrange devices on the Network Map using drag-and-drop:"
        ),
        createNumberedItem("Navigate to the Network Map from the sidebar"),
        createNumberedItem("Click the 'Edit' button in the header to enable edit mode"),
        createNumberedItem("A blue indicator banner appears confirming edit mode is active"),
        createNumberedItem("Devices show a blue ring and move icon when hovering"),
        createNumberedItem("Click and drag any device to reposition it within the site column"),
        createNumberedItem("Release the mouse button to drop the device in its new position"),
        createNumberedItem("Click 'Done' to exit edit mode when finished"),
        createParagraph("Position Persistence:"),
        createBulletPoint("Custom positions are saved automatically to your browser's local storage"),
        createBulletPoint("Positions persist across page refreshes and browser sessions"),
        createBulletPoint("Each browser/device maintains its own layout preferences"),
        createParagraph("Resetting Layout:"),
        createBulletPoint("Click the 'Reset' button (appears when custom positions exist)"),
        createBulletPoint("All devices return to their default automatic positions"),
        createBulletPoint("Reset affects only your browser's saved layout"),
        createNote(
          "Manual positioning works for both regular device boxes and compact access point/switch tiles. Access Points and Access Switches can be dragged independently within their grid areas."
        ),

        new Paragraph({
          text: "8.5 Interface Availability Tracking",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "Interface-level availability tracking provides detailed uptime metrics for individual device interfaces:"
        ),
        createBulletPoint("Each monitored interface tracks its own availability separately"),
        createBulletPoint("Availability calculated as (successful checks / total checks) * 100"),
        createBulletPoint("Monthly and annual availability snapshots stored for historical analysis"),
        createBulletPoint("Interface availability independent of device-level availability"),
        
        createParagraph("Viewing Interface Availability:"),
        createNumberedItem("Click on a device to view its details"),
        createNumberedItem("Navigate to the 'Interfaces' section"),
        createNumberedItem("Each interface displays its current availability percentage"),
        createNumberedItem("Historical data available in Performance History"),
        createNote(
          "Interface availability resets at month-end along with device availability. Monthly snapshots preserve historical data."
        ),

        new Paragraph({
          text: "8.6 Responsive Grid Layout",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "The Network Map uses a responsive auto-fill grid that adapts to your browser window:"
        ),
        createBulletPoint("Sites automatically fill available space based on browser width"),
        createBulletPoint("Grid uses CSS Grid auto-fit with minimum 180px column width"),
        createBulletPoint("Columns automatically adjust when resizing the browser window"),
        createBulletPoint("Optimal viewing on screens from mobile devices to large NOC displays"),
        createBulletPoint("Site cards maintain consistent spacing and alignment"),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 9: Settings
        new Paragraph({
          text: "9. System Settings",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "9.1 Polling Interval",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph(
          "Configure how frequently devices are polled for status updates:"
        ),
        createNumberedItem("Navigate to Settings > Polling"),
        createNumberedItem("Adjust the global polling interval (default: 30 seconds)"),
        createNumberedItem("Click 'Save'"),
        createNote(
          "Lower intervals provide more real-time data but increase network traffic and system load."
        ),

        new Paragraph({
          text: "9.2 SMTP Configuration",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("Configure email sending for notifications and password resets:"),
        createBulletPoint("SMTP Host - Your email server address"),
        createBulletPoint("SMTP Port - Usually 587 (TLS) or 465 (SSL)"),
        createBulletPoint("SMTP User - Email account username"),
        createBulletPoint("SMTP Password - Email account password"),
        createBulletPoint("From Email - Sender address for outgoing emails"),
        createNote(
          "SMTP credentials are stored as secrets and never displayed in the interface."
        ),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 10: Troubleshooting
        new Paragraph({
          text: "10. Troubleshooting",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),

        new Paragraph({
          text: "10.1 Device Shows as Offline",
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        createParagraph("If a device appears offline when it should be reachable:"),
        createNumberedItem("Verify the IP address is correct"),
        createNumberedItem("Check that SNMP is enabled on the device"),
        createNumberedItem("Confirm the SNMP community string matches"),
        createNumberedItem("Verify firewall rules allow SNMP (UDP 161) and ICMP"),
        createNumberedItem("Try changing the poll type to 'Ping Only' to isolate the issue"),
        createNumberedItem("Check the Activity Log for error messages"),

        new Paragraph({
          text: "10.2 No Bandwidth Data",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("If bandwidth metrics are not showing:"),
        createNumberedItem("Ensure the correct interface index is configured"),
        createNumberedItem("Use 'Discover Interfaces' to find active interfaces"),
        createNumberedItem("Verify the device supports SNMP IF-MIB (ifInOctets/ifOutOctets)"),
        createNumberedItem("Check that max bandwidth is set to a realistic value"),
        createNumberedItem("Wait for at least two polling cycles to establish baseline"),

        new Paragraph({
          text: "10.3 Notifications Not Received",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("For email notifications:"),
        createBulletPoint("Verify SMTP settings are correct"),
        createBulletPoint("Check spam/junk folders"),
        createBulletPoint("Ensure the 'From' address is authorized by your email provider"),
        createBulletPoint("Test the connection using the 'Send Test Email' button"),

        createParagraph("For Telegram notifications:"),
        createBulletPoint("Confirm the bot token is valid"),
        createBulletPoint("Verify the chat ID is correct"),
        createBulletPoint("Ensure you've started a conversation with the bot"),

        new Paragraph({
          text: "10.4 Login Issues",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("Cannot log in:"),
        createBulletPoint("Verify username/password are correct"),
        createBulletPoint("Check if your account has been disabled"),
        createBulletPoint("Use 'Forgot Password' to reset credentials"),
        createBulletPoint("Contact an administrator if problems persist"),

        createParagraph("Session expired:"),
        createBulletPoint("Sessions timeout after 24 hours of inactivity"),
        createBulletPoint("Simply log in again to continue"),

        new Paragraph({
          text: "10.5 Performance Issues",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph("If the dashboard is slow:"),
        createBulletPoint("Increase the polling interval to reduce load"),
        createBulletPoint("Limit the number of devices displayed per page"),
        createBulletPoint("Check database performance and connection limits"),
        createBulletPoint("Verify adequate server resources (CPU, memory)"),

        new Paragraph({
          text: "10.6 Common Error Messages",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [createParagraph("Error", true)],
                  width: { size: 35, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [createParagraph("Solution", true)],
                  width: { size: 65, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("SNMP Timeout")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Device not responding to SNMP. Check connectivity and community string."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Database Connection Error")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Check DATABASE_URL environment variable and PostgreSQL service status."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Unauthorized")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Session expired or insufficient permissions. Log in again."
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Interface Not Found")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "The configured interface index doesn't exist. Run interface discovery."
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Chapter 10: Database Migrations (Self-Hosted)
        new Paragraph({
          text: "10. Database Migrations (Self-Hosted)",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),
        createParagraph(
          "Self-hosted deployments (AWS EC2, Vultr VPS) require manual database migrations when upgrading to new versions. This section covers the required steps."
        ),

        new Paragraph({
          text: "10.1 Device Links Table Migration",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "The Device Links feature (Network Map connections) requires the device_links table. Run this migration if you see the error 'relation device_links does not exist':"
        ),
        createNumberedItem("SSH into your server"),
        createNumberedItem("Navigate to the application directory"),
        createNumberedItem("Run the migration script:"),
        createParagraph("    psql $DATABASE_URL -f scripts/create-device-links.sql"),
        createNumberedItem("Restart the application:"),
        createParagraph("    pm2 restart all  (or your process manager command)"),
        createNote(
          "Always backup your database before running migrations. The script uses CREATE TABLE IF NOT EXISTS, so it's safe to run multiple times."
        ),

        new Paragraph({
          text: "10.2 Verifying Migrations",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        createParagraph(
          "After running a migration, verify the table was created:"
        ),
        createParagraph("    psql $DATABASE_URL -c \"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';\""),
        createParagraph(
          "You should see device_links in the list of tables."
        ),

        new Paragraph({
          text: "10.3 Migration Scripts Reference",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [createParagraph("Script", true)],
                  width: { size: 40, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [createParagraph("Purpose", true)],
                  width: { size: 60, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("scripts/create-device-links.sql")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Creates the device_links table for Network Map connections"
                    ),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("scripts/migrate-sites.sql")] }),
                new TableCell({
                  children: [
                    createParagraph(
                      "Migrates sites data if upgrading from older versions"
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Appendix
        new Paragraph({
          text: "Appendix A: Keyboard Shortcuts",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [createParagraph("Shortcut", true)],
                  width: { size: 30, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [createParagraph("Action", true)],
                  width: { size: 70, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("Ctrl/Cmd + K")] }),
                new TableCell({ children: [createParagraph("Open command palette")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("R")] }),
                new TableCell({ children: [createParagraph("Refresh dashboard data")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("N")] }),
                new TableCell({ children: [createParagraph("Add new device")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("/")] }),
                new TableCell({ children: [createParagraph("Focus search")] }),
              ],
            }),
          ],
        }),

        new Paragraph({
          text: "Appendix B: SNMP OIDs",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 300 },
        }),
        createParagraph("The system uses the following SNMP OIDs for monitoring:"),
        createBulletPoint("1.3.6.1.2.1.2.2.1.10 - ifInOctets (download bytes)"),
        createBulletPoint("1.3.6.1.2.1.2.2.1.16 - ifOutOctets (upload bytes)"),
        createBulletPoint("1.3.6.1.2.1.2.2.1.1 - ifIndex (interface index)"),
        createBulletPoint("1.3.6.1.2.1.2.2.1.2 - ifDescr (interface description)"),
        createBulletPoint("1.3.6.1.4.1.14988.1.1.5.3 - Mikrotik hotspot users"),

        new Paragraph({
          text: "Appendix C: Support",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 300 },
        }),
        createParagraph("For additional support:"),
        createBulletPoint("Review the Activity Log for detailed error messages"),
        createBulletPoint("Check server logs for backend issues"),
        createBulletPoint("Consult the project documentation"),
        createBulletPoint("Contact your system administrator"),
      ],
    },
  ],
});

// Generate the document
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("Network_Monitor_Operational_Manual.docx", buffer);
  console.log("Operational manual generated successfully: Network_Monitor_Operational_Manual.docx");
});
