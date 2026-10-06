---
name: EC2 runtime selection
description: Runtime selection on the user's existing self-hosted EC2 service.
---

The existing EC2 installation runs the application service as root with an explicit Node binary from root's NVM installation. Do not assume it uses the system Node binary described by the installer.

**Why:** The user supplied the actual systemd service configuration, which differs from the repository's installer defaults. Changing the shell's NVM version alone does not change the service runtime.

**How to apply:** Inspect the current service configuration before changing its runtime. Preserve existing service settings, update the explicit Node executable, reload systemd, and verify the effective start command before restarting. Treat running as root as an existing constraint, not a recommendation for new installations.
