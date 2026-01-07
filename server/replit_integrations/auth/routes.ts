import type { Express, Request, Response } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const isReplitEnvironment = !!process.env.REPL_ID;

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", async (req: any, res, next) => {
    if (!isReplitEnvironment) {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await authStorage.getUser(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });
    }
    
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

  if (!isReplitEnvironment) {
    app.post("/api/auth/login", async (req: any, res) => {
      try {
        const { email, password } = req.body;
        
        if (!email || !password) {
          return res.status(400).json({ message: "Email and password required" });
        }
        
        const [user] = await db.select().from(users).where(eq(users.email, email));
        
        if (!user || !user.password) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        
        req.session.userId = user.id;
        
        res.json({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        });
      } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Login failed" });
      }
    });

    app.post("/api/auth/logout", (req: any, res) => {
      req.session.destroy((err: any) => {
        if (err) {
          return res.status(500).json({ message: "Logout failed" });
        }
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out" });
      });
    });

    app.get("/api/login", (req, res) => {
      res.redirect("/");
    });
    
    app.get("/api/logout", (req: any, res) => {
      req.session.destroy(() => {
        res.redirect("/");
      });
    });

    app.post("/api/auth/setup", async (req: any, res) => {
      try {
        const existingUsers = await db.select().from(users);
        if (existingUsers.length > 0) {
          return res.status(400).json({ message: "Setup already completed" });
        }
        
        const { email, password, firstName, lastName } = req.body;
        
        if (!email || !password) {
          return res.status(400).json({ message: "Email and password required" });
        }
        
        if (password.length < 6) {
          return res.status(400).json({ message: "Password must be at least 6 characters" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [newUser] = await db.insert(users).values({
          email,
          password: hashedPassword,
          firstName: firstName || "Admin",
          lastName: lastName || "User",
          role: "admin"
        }).returning();
        
        req.session.userId = newUser.id;
        
        res.json({
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role
        });
      } catch (error) {
        console.error("Setup error:", error);
        res.status(500).json({ message: "Setup failed" });
      }
    });

    app.get("/api/auth/needs-setup", async (req, res) => {
      try {
        const existingUsers = await db.select().from(users);
        res.json({ needsSetup: existingUsers.length === 0 });
      } catch (error) {
        res.json({ needsSetup: true });
      }
    });
  }
}
