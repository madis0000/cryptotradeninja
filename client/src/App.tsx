import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/layout/top-bar";
import { AuthProvider } from "@/components/auth/auth-provider";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Trading from "@/pages/trading";
import TradingBots from "@/pages/trading-bots";
import { MyBotsPage } from "@/pages/my-bots";
import ApiKeys from "@/pages/api-keys";
import Portfolio from "@/pages/portfolio";
import MyExchanges from "@/pages/my-exchanges";
import Settings from "@/pages/settings";
import NotificationSettings from "@/pages/notification-settings";
import WebSocketTest from "@/pages/websocket-test";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import BotLogsPage from "@/pages/bot-logs";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-crypto-darker">
      <TopBar onLogout={logout} />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-crypto-darker flex items-center justify-center">
        <div className="text-crypto-light">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={() => <AuthPage onAuthSuccess={login} />} />
        <Route path="/register" component={() => <AuthPage onAuthSuccess={login} />} />
        <Route component={() => <AuthPage onAuthSuccess={login} />} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/home" component={Landing} />
      <Route path="*">
        <AuthenticatedLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/trading" component={Trading} />
            {/* Trading Bots - Main route */}
            <Route path="/bots" component={TradingBots} />
            {/* Redirect /trading-bots to /bots to avoid duplicate routes and WebSocket connections */}
            <Route path="/trading-bots">
              <Redirect to="/bots" />
            </Route>
            <Route path="/my-bots" component={MyBotsPage} />
            <Route path="/bot-logs" component={BotLogsPage} />
            <Route path="/api-keys" component={ApiKeys} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/my-exchanges" component={MyExchanges} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/notifications" component={NotificationSettings} />
            <Route path="/websocket-test" component={WebSocketTest} />
            <Route component={NotFound} />
          </Switch>
        </AuthenticatedLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
