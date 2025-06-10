import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";

interface TopBarProps {
  onLogout?: () => void;
}

export function TopBar({ onLogout }: TopBarProps) {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location] = useLocation();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const navigationItems = [
    { path: '/', label: 'Dashboard', icon: 'fas fa-chart-line' },
    { path: '/portfolio', label: 'Portfolio', icon: 'fas fa-wallet' },
    { path: '/my-exchanges', label: 'My Exchanges', icon: 'fas fa-exchange-alt' },
    { path: '/settings', label: 'Settings', icon: 'fas fa-cog' },
  ];

  const tradingSubItems = [
    { path: '/trading', label: 'Trading', icon: 'fas fa-chart-bar' },
    { path: '/bots', label: 'Bots', icon: 'fas fa-robot' },
    { path: '/my-bots', label: 'My Bots', icon: 'fas fa-cogs' },
    { path: '/bot-logs', label: 'Bot Logs', icon: 'fas fa-file-alt' },
  ];

  return (
    <header className="bg-crypto-dark border-b border-gray-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-8">
          {/* Logo/Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-crypto-accent to-crypto-success rounded-lg flex items-center justify-center">
              <i className="fas fa-robot text-white text-sm"></i>
            </div>
            <span className="text-xl font-bold text-white">CryptoBot</span>
          </div>

          {/* Navigation Menu */}
          <nav className="hidden md:flex items-center space-x-6">
            {/* Dashboard - First */}
            <Link href="/">
              <Button 
                variant="ghost" 
                className={`flex items-center space-x-2 text-sm ${
                  location === '/' 
                    ? 'text-crypto-accent bg-crypto-accent/10' 
                    : 'text-crypto-light hover:text-white hover:bg-gray-800'
                }`}
              >
                <i className="fas fa-chart-line"></i>
                <span>Dashboard</span>
              </Button>
            </Link>

            {/* Trading Dropdown - Second */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className={`flex items-center space-x-2 text-sm ${
                    location.startsWith('/trading') || location === '/bots' || location === '/my-bots' || location === '/bot-logs'
                      ? 'text-crypto-accent bg-crypto-accent/10' 
                      : 'text-crypto-light hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <i className="fas fa-chart-bar"></i>
                  <span>Trading</span>
                  <i className="fas fa-chevron-down text-xs ml-1"></i>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-crypto-dark border-gray-700" align="start">
                {tradingSubItems.map((subItem) => (
                  <Link key={subItem.path} href={subItem.path}>
                    <DropdownMenuItem className={`flex items-center space-x-2 cursor-pointer ${
                      location === subItem.path 
                        ? 'text-crypto-accent bg-crypto-accent/10' 
                        : 'text-crypto-light hover:text-white hover:bg-gray-800'
                    }`}>
                      <i className={subItem.icon}></i>
                      <span>{subItem.label}</span>
                    </DropdownMenuItem>
                  </Link>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Other Navigation Items */}
            {navigationItems.slice(1).map((item) => (
              <Link key={item.path} href={item.path}>
                <Button 
                  variant="ghost" 
                  className={`flex items-center space-x-2 text-sm ${
                    location === item.path 
                      ? 'text-crypto-accent bg-crypto-accent/10' 
                      : 'text-crypto-light hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <i className={item.icon}></i>
                  <span>{item.label}</span>
                </Button>
              </Link>
            ))}
          </nav>
        </div>
        
        <div className="flex items-center space-x-6">
          {/* UTC Time */}
          <div className="hidden md:flex items-center space-x-2 text-crypto-light text-sm">
            <i className="fas fa-clock text-xs"></i>
            <span>{currentTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false })} UTC</span>
          </div>
          
          {/* Notifications */}
          <Button variant="ghost" size="sm" className="p-2 text-crypto-light hover:bg-gray-800 relative">
            <i className="fas fa-bell"></i>
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-crypto-danger rounded-full"></span>
          </Button>
          
          {/* User Menu Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-2 text-crypto-light hover:bg-gray-800 pl-2 border-l border-gray-700">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-white">{user?.username}</div>
                  <div className="text-xs text-crypto-light">Trading Account</div>
                </div>
                <div className="w-8 h-8 bg-gradient-to-br from-crypto-accent to-crypto-success rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <i className="fas fa-chevron-down text-xs"></i>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-crypto-dark border-gray-800">
              <div className="px-3 py-2 border-b border-gray-800">
                <div className="text-sm font-medium text-white">{user?.username}</div>
                <div className="text-xs text-crypto-light">{user?.email}</div>
              </div>
              
              <DropdownMenuItem className="text-crypto-light hover:bg-gray-800 hover:text-white cursor-pointer">
                <i className="fas fa-user mr-2"></i>
                Profile Settings
              </DropdownMenuItem>
              
              <DropdownMenuItem className="text-crypto-light hover:bg-gray-800 hover:text-white cursor-pointer">
                <i className="fas fa-cog mr-2"></i>
                Account Settings
              </DropdownMenuItem>
              
              <DropdownMenuItem className="text-crypto-light hover:bg-gray-800 hover:text-white cursor-pointer">
                <i className="fas fa-shield-alt mr-2"></i>
                Security
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="bg-gray-800" />
              
              <DropdownMenuItem 
                className="text-crypto-danger hover:bg-crypto-danger/10 hover:text-crypto-danger cursor-pointer"
                onClick={onLogout}
              >
                <i className="fas fa-sign-out-alt mr-2"></i>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
