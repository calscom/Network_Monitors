import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

// Check if running on Replit (has REPL_ID env var)
const isReplitEnvironment = !!process.env.REPL_ID;
console.log(`[auth] Environment check: REPL_ID=${process.env.REPL_ID ? 'present' : 'absent'}, isReplitEnvironment=${isReplitEnvironment}`);

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  console.log(`[auth] Registering auth routes, isReplitEnvironment=${isReplitEnvironment}`);
  
  // Get current authenticated user
  app.get("/api/auth/user", async (req: any, res, next) => {
    console.log(`[auth] /api/auth/user called, isReplitEnvironment=${isReplitEnvironment}`);
    
    // Self-hosted mode: return admin user without authentication
    if (!isReplitEnvironment) {
      console.log("[auth] Self-hosted mode: returning admin user");
      return res.json({
        id: "self-hosted-admin",
        email: "admin@localhost",
        firstName: "Admin",
        lastName: "User",
        profileImageUrl: null,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Replit mode: use normal authentication
    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const user = await authStorage.getUser(userId);
        res.json(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: "Failed to fetch user" });
      }
    });
  });

  // Self-hosted mode: /api/login just redirects to dashboard
  if (!isReplitEnvironment) {
    app.get("/api/login", (req, res) => {
      res.redirect("/");
    });
    
    app.get("/api/logout", (req, res) => {
      res.redirect("/");
    });
  }
}
