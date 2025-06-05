import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { MarketData } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";

interface TopBarProps {
  onLogout?: () => void;
}

export function TopBar({ onLogout }: TopBarProps) {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location] = useLocation();

  const { data: marketData } = useQuery<MarketData>({
    queryKey: ['/api/market'],
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  const navigationItems = [
    { path: '/', label: 'Dashboard', icon: 'fas fa-chart-line' },
    { path: '/bots', label: 'Trading Bots', icon: 'fas fa-robot' },
    { path: '/portfolio', label: 'Portfolio', icon: 'fas fa-wallet' },
    { path: '/api-keys', label: 'API Keys', icon: 'fas fa-key' },
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
            {navigationItems.map((item) => (
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
          {/* Live Market Status */}
          <div className="hidden lg:flex items-center space-x-2">
            <div className="w-2 h-2 bg-crypto-success rounded-full animate-pulse"></div>
            <span className="text-xs text-crypto-light">Live</span>
          </div>

          {/* Market Data */}
          <div className="hidden lg:flex items-center space-x-4 text-sm">
            {marketData && (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-crypto-light">BTC:</span>
                  <span className="font-mono font-medium text-white">
                    {formatPrice(marketData['BTC/USDT']?.price || 0)}
                  </span>
                  <span className={`text-xs ${
                    marketData['BTC/USDT']?.change >= 0 ? 'text-crypto-success' : 'text-crypto-danger'
                  }`}>
                    {formatChange(marketData['BTC/USDT']?.change || 0)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-crypto-light">ETH:</span>
                  <span className="font-mono font-medium text-white">
                    {formatPrice(marketData['ETH/USDT']?.price || 0)}
                  </span>
                  <span className={`text-xs ${
                    marketData['ETH/USDT']?.change >= 0 ? 'text-crypto-success' : 'text-crypto-danger'
                  }`}>
                    {formatChange(marketData['ETH/USDT']?.change || 0)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* UTC Time */}
          <div className="hidden md:flex items-center space-x-2 text-crypto-light text-sm">
            <i className="fas fa-clock text-xs"></i>
            <span>{currentTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false })} UTC</span>
          </div>
          
          {/* User Menu */}
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" className="p-2 text-crypto-light hover:bg-gray-800 relative">
              <i className="fas fa-bell"></i>
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-crypto-danger rounded-full"></span>
            </Button>
            
            <div className="flex items-center space-x-2 pl-2 border-l border-gray-700">
              <div className="text-right">
                <div className="text-sm font-medium text-white">{user?.username}</div>
                <div className="text-xs text-crypto-light">Trading Account</div>
              </div>
              <Button 
                onClick={onLogout}
                variant="ghost" 
                size="sm" 
                className="p-2 text-crypto-light hover:bg-gray-800 hover:text-crypto-danger"
                title="Logout"
              >
                <i className="fas fa-sign-out-alt"></i>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
