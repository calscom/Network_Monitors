import type { Express, Request, Response } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../../db";
import { users, passwordResetTokens } from "@shared/models/auth";
import { eq, and, gt, isNull } from "drizzle-orm";
import { sendWelcomeEmail, sendPasswordResetEmail } from "../../email";

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
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      }).from(users).where(eq(users.id, req.session.userId));
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }
      return res.json(user);
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

    app.post("/api/auth/signup", async (req: any, res) => {
      try {
        const { email, password, firstName, lastName } = req.body;
        
        if (!email || !password) {
          return res.status(400).json({ message: "Email and password required" });
        }
        
        if (password.length < 6) {
          return res.status(400).json({ message: "Password must be at least 6 characters" });
        }
        
        const [existingUser] = await db.select().from(users).where(eq(users.email, email));
        if (existingUser) {
          return res.status(400).json({ message: "Email already in use" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = crypto.randomUUID();
        
        const [newUser] = await db.insert(users).values({
          id: userId,
          email,
          password: hashedPassword,
          firstName: firstName || "",
          lastName: lastName || "",
          role: "viewer"
        }).returning();
        
        req.session.userId = newUser.id;
        
        sendWelcomeEmail(email, firstName || "").catch(err => {
          console.error("[email] Background welcome email failed:", err);
        });
        
        res.json({
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role
        });
      } catch (error: any) {
        console.error("Signup error:", error);
        res.status(500).json({ message: error?.message || "Signup failed" });
      }
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
        const userId = crypto.randomUUID();
        
        const [newUser] = await db.insert(users).values({
          id: userId,
          email,
          password: hashedPassword,
          firstName: firstName || "Admin",
          lastName: lastName || "User",
          role: "admin"
        }).returning();
        
        req.session.userId = newUser.id;
        
        sendWelcomeEmail(email, firstName || "Admin").catch(err => {
          console.error("[email] Background welcome email failed:", err);
        });
        
        res.json({
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role
        });
      } catch (error: any) {
        console.error("Setup error:", error);
        res.status(500).json({ message: error?.message || "Setup failed" });
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

    app.post("/api/auth/forgot-password", async (req, res) => {
      try {
        const { email } = req.body;
        
        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }
        
        const [user] = await db.select().from(users).where(eq(users.email, email));
        
        res.json({ message: "If an account exists with this email, a password reset link has been sent." });
        
        if (!user) {
          return;
        }
        
        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        
        await db.insert(passwordResetTokens).values({
          id: crypto.randomUUID(),
          userId: user.id,
          token: resetToken,
          expiresAt,
        });
        
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const host = req.headers.host || "localhost:5000";
        const baseUrl = `${protocol}://${host}`;
        
        sendPasswordResetEmail(email, resetToken, baseUrl).catch(err => {
          console.error("[email] Background password reset email failed:", err);
        });
        
      } catch (error: any) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Failed to process request" });
      }
    });

    app.post("/api/auth/reset-password", async (req, res) => {
      try {
        const { token, password } = req.body;
        
        if (!token || !password) {
          return res.status(400).json({ message: "Token and new password are required" });
        }
        
        if (password.length < 6) {
          return res.status(400).json({ message: "Password must be at least 6 characters" });
        }
        
        const [resetRecord] = await db.select()
          .from(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.token, token),
              gt(passwordResetTokens.expiresAt, new Date()),
              isNull(passwordResetTokens.usedAt)
            )
          );
        
        if (!resetRecord) {
          return res.status(400).json({ message: "Invalid or expired reset token" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await db.update(users)
          .set({ password: hashedPassword, updatedAt: new Date() })
          .where(eq(users.id, resetRecord.userId));
        
        await db.update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(passwordResetTokens.id, resetRecord.id));
        
        res.json({ message: "Password has been reset successfully" });
      } catch (error: any) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Failed to reset password" });
      }
    });

    app.get("/api/auth/verify-reset-token", async (req, res) => {
      try {
        const { token } = req.query;
        
        if (!token || typeof token !== "string") {
          return res.status(400).json({ valid: false, message: "Token is required" });
        }
        
        const [resetRecord] = await db.select()
          .from(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.token, token),
              gt(passwordResetTokens.expiresAt, new Date()),
              isNull(passwordResetTokens.usedAt)
            )
          );
        
        if (!resetRecord) {
          return res.json({ valid: false, message: "Invalid or expired reset token" });
        }
        
        res.json({ valid: true });
      } catch (error: any) {
        console.error("Verify token error:", error);
        res.status(500).json({ valid: false, message: "Failed to verify token" });
      }
    });
  }
}
