import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "./lib/api";
import { canAccess, firstAllowedPath } from "./lib/nav";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import { LoadingPanel } from "./components/QueryState";
import Shell from "./components/Shell";
import Login from "./pages/Login";

// Each screen is a separate chunk so opening the CRM on mobile data downloads the shell
// and one page, not the charting library and every other section as well.
const Today = lazy(() => import("./pages/Today"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadDetail = lazy(() => import("./pages/LeadDetail"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Services = lazy(() => import("./pages/Services"));
const Schedule = lazy(() => import("./pages/Schedule"));
const ContentCalendar = lazy(() => import("./pages/ContentCalendar"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Reports = lazy(() => import("./pages/Reports"));
const Team = lazy(() => import("./pages/Team"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const AIAgent = lazy(() => import("./pages/AIAgent"));
const Portal = lazy(() => import("./pages/Portal"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A phone drops in and out of signal constantly, so one retry smooths over a
      // flaky request, but an auth failure must not be retried.
      retry: (failureCount, error) => failureCount < 1 && ![401, 403, 404].includes(error?.status),
      staleTime: 30_000,
      refetchOnWindowFocus: true
    }
  }
});

function RequireAuth({ children, roles, permission }) {
  const { token, user } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={firstAllowedPath(user)} replace />;
  if (permission && !canAccess(user, permission)) return <Navigate to={firstAllowedPath(user)} replace />;
  return <Shell><Suspense fallback={<LoadingPanel label="page" />}>{children}</Suspense></Shell>;
}

function Root() {
  const { token, user } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  return <Navigate to={firstAllowedPath(user)} replace />;
}

export default function App() {
  return <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/login" element={<Login />} />
            <Route path="/portal/login" element={<Login portal />} />

            <Route path="/today" element={<RequireAuth permission="dashboard"><Today /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth permission="dashboard"><Dashboard /></RequireAuth>} />
            <Route path="/ai" element={<RequireAuth permission="ai"><AIAgent /></RequireAuth>} />
            <Route path="/leads" element={<RequireAuth permission="leads"><Leads /></RequireAuth>} />
            <Route path="/leads/:id" element={<RequireAuth permission="leads"><LeadDetail /></RequireAuth>} />
            <Route path="/clients" element={<RequireAuth permission="clients"><Clients /></RequireAuth>} />
            <Route path="/clients/:id" element={<RequireAuth permission="clients"><ClientDetail /></RequireAuth>} />
            <Route path="/services" element={<RequireAuth permission="services"><Services /></RequireAuth>} />
            <Route path="/tasks" element={<Navigate to="/services" replace />} />
            <Route path="/schedule" element={<RequireAuth permission="content"><Schedule /></RequireAuth>} />
            <Route path="/content" element={<RequireAuth permission="content"><ContentCalendar /></RequireAuth>} />
            <Route path="/invoices" element={<RequireAuth permission="invoices"><Invoices /></RequireAuth>} />
            <Route path="/campaigns" element={<RequireAuth permission="campaigns"><Campaigns /></RequireAuth>} />
            <Route path="/reports" element={<RequireAuth permission="reports"><Reports /></RequireAuth>} />
            <Route path="/team/workload" element={<RequireAuth roles={["OWNER"]}><Team /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth permission="settings"><SettingsPage /></RequireAuth>} />
            <Route path="/portal/dashboard" element={<RequireAuth roles={["CLIENT"]}><Portal /></RequireAuth>} />

            <Route path="*" element={<RequireAuth><NotFound /></RequireAuth>} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </ErrorBoundary>;
}
