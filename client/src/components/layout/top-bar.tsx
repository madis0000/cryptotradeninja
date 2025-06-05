import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { MarketData } from "@/types";
import { useAuth } from "@/hooks/useAuth";

interface TopBarProps {
  onLogout?: () => void;
}

export function TopBar({ onLogout }: TopBarProps) {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

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

  return (
    <header className="bg-crypto-dark border-b border-gray-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" className="lg:hidden p-2 text-crypto-light hover:bg-gray-800">
            <i className="fas fa-bars"></i>
          </Button>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-crypto-success rounded-full animate-pulse"></div>
            <span className="text-sm text-crypto-light">Live Market Data</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Market Status */}
          <div className="hidden md:flex items-center space-x-6 text-sm">
            {marketData && (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-crypto-light">BTC/USDT:</span>
                  <span className="font-mono font-semibold text-white">
                    {formatPrice(marketData['BTC/USDT']?.price || 0)}
                  </span>
                  <span className={`text-xs ${
                    marketData['BTC/USDT']?.change >= 0 ? 'text-crypto-success' : 'text-crypto-danger'
                  }`}>
                    {formatChange(marketData['BTC/USDT']?.change || 0)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-crypto-light">ETH/USDT:</span>
                  <span className="font-mono font-semibold text-white">
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
          
          <div className="flex items-center space-x-2 text-crypto-light text-sm">
            <i className="fas fa-clock"></i>
            <span>{currentTime.toLocaleTimeString('en-US', { timeZone: 'UTC' })} UTC</span>
          </div>
          
          <Button variant="ghost" size="sm" className="p-2 text-crypto-light hover:bg-gray-800 relative">
            <i className="fas fa-bell"></i>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-crypto-danger rounded-full text-xs flex items-center justify-center text-white">3</span>
          </Button>
          
          {/* User Menu */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-crypto-light">Welcome, {user?.username}</span>
            <Button 
              onClick={onLogout}
              variant="ghost" 
              size="sm" 
              className="p-2 text-crypto-light hover:bg-gray-800"
              title="Logout"
            >
              <i className="fas fa-sign-out-alt"></i>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
