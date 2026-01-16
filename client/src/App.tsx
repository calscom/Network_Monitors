import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Toaster } from "./components/ui/toaster";
import { MainMenu } from "./components/MainMenu";
import { ThemeProvider } from "./components/ThemeProvider";
import { UserMenu } from "./components/UserMenu";
import { useAuth } from "./hooks/use-auth";
import { Onboarding } from "./components/Onboarding";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const KioskMap = lazy(() => import("./pages/KioskMap"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const NotFound = lazy(() => import("./pages/not-found"));

function App() {
  const { user } = useAuth();

  if (!user) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="h-screen">
          <Suspense fallback={<>...</>}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<Login />} />
            </Routes>
          </Suspense>
        </div>
      </ThemeProvider>
    );
  }

  if (user && !user.onboarded) {
    return <Onboarding />;
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="h-screen">
        <header className="flex items-center justify-between p-4">
          <MainMenu />
          <UserMenu />
        </header>
        <main className="p-4">
          <Suspense fallback={<>...</>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/kiosk" element={<KioskMap />} />
              <Route path="/activity" element={<ActivityLog />} />
              <Route path="/notifications" element={<NotificationSettings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;