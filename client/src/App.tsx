import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { AuthProvider } from "@/components/auth/auth-provider";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/dashboard";
import TradingBots from "@/pages/trading-bots";
import ApiKeys from "@/pages/api-keys";
import Portfolio from "@/pages/portfolio";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";

function AuthenticatedApp() {
  const { logout } = useAuth();

  const handleAuthSuccess = (token: string, user: any) => {
    // The AuthProvider will handle this automatically
    window.location.reload();
  };

  return (
    <div className="flex h-screen bg-crypto-darker">
      <Sidebar />
      <div className="flex-1 lg:pl-64">
        <TopBar onLogout={logout} />
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/bots" component={TradingBots} />
          <Route path="/api-keys" component={ApiKeys} />
          <Route path="/portfolio" component={Portfolio} />
          <Route component={NotFound} />
        </Switch>
      </div>
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
    return <AuthPage onAuthSuccess={login} />;
  }

  return <AuthenticatedApp />;
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
