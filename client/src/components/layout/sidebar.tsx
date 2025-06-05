import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navigation = [
  { name: 'Dashboard', href: '/', icon: 'fas fa-chart-line' },
  { name: 'Trading Bots', href: '/bots', icon: 'fas fa-robot' },
  { name: 'API Keys', href: '/api-keys', icon: 'fas fa-key' },
  { name: 'Portfolio', href: '/portfolio', icon: 'fas fa-wallet' },
  { name: 'Trade History', href: '/trades', icon: 'fas fa-history' },
  { name: 'Settings', href: '/settings', icon: 'fas fa-cog' },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-crypto-dark border-r border-gray-800">
      <div className="flex items-center h-16 px-6 border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-crypto-accent to-crypto-success rounded-lg flex items-center justify-center">
            <i className="fas fa-robot text-white text-sm"></i>
          </div>
          <span className="text-xl font-bold text-white">CryptoBot Pro</span>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href} className={cn(
              "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
              isActive
                ? "bg-crypto-accent/10 text-crypto-accent border border-crypto-accent/20"
                : "text-crypto-light hover:bg-gray-800 hover:text-white"
            )}>
              <i className={cn(item.icon, "mr-3")}></i>
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="px-4 py-6 border-t border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-crypto-success to-crypto-accent rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-white">JD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">John Doe</p>
            <p className="text-xs text-crypto-light truncate">Pro Trader</p>
          </div>
        </div>
      </div>
    </div>
  );
}
