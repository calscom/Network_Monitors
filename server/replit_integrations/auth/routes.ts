import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

// Check if running on Replit (has REPL_ID env var)
const isReplitEnvironment = !!process.env.REPL_ID;

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", async (req: any, res, next) => {
    // Self-hosted mode: return admin user without authentication
    if (!isReplitEnvironment) {
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
