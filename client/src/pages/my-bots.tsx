import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { TradingBot } from "@shared/schema";

export function MyBotsPage() {
  const [activeSection, setActiveSection] = useState('active-bots');

  // Fetch bots data
  const { data: bots = [], isLoading: botsLoading } = useQuery({
    queryKey: ['/api/bots']
  });

  const sidebarItems = [
    { id: 'active-bots', label: 'Active Bots', icon: 'fas fa-play-circle' },
    { id: 'bot-templates', label: 'Bot Templates', icon: 'fas fa-template' },
    { id: 'bot-history', label: 'Trading History', icon: 'fas fa-history' },
    { id: 'bot-performance', label: 'Performance', icon: 'fas fa-chart-line' },
    { id: 'bot-settings', label: 'Bot Settings', icon: 'fas fa-cog' },
  ];

  const tradingBots = Array.isArray(bots) ? (bots as TradingBot[]) : [];
  const activeBots = tradingBots.filter((bot: TradingBot) => bot.isActive);
  const inactiveBots = tradingBots.filter((bot: TradingBot) => !bot.isActive);

  const renderActiveBots = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Active Trading Bots ({activeBots.length})</h3>
        {botsLoading ? (
          <div className="text-center py-12">
            <div className="text-crypto-light">Loading bots...</div>
          </div>
        ) : activeBots.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-robot text-crypto-accent text-2xl"></i>
            </div>
            <h4 className="text-xl font-semibold text-white mb-2">No Active Bots</h4>
            <p className="text-crypto-light mb-6">You don't have any active trading bots running yet.</p>
            <Button className="bg-crypto-accent hover:bg-crypto-accent/80 text-white">
              <i className="fas fa-plus mr-2"></i>
              Create New Bot
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeBots.map((bot: any) => (
              <Card key={bot.id} className="bg-crypto-darker border-gray-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-sm font-medium">{bot.name}</CardTitle>
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                      Running
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-crypto-light">Pair:</span>
                      <div className="text-white font-medium">{bot.tradingPair}</div>
                    </div>
                    <div>
                      <span className="text-crypto-light">Strategy:</span>
                      <div className="text-white font-medium capitalize">{bot.strategy}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-crypto-light">Direction:</span>
                      <div className={`font-medium ${bot.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                        {bot.direction?.toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <span className="text-crypto-light">Base Amount:</span>
                      <div className="text-white font-medium">${bot.baseOrderAmount}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs border-gray-600 hover:border-crypto-accent text-white">
                      View Details
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs border-red-600 hover:border-red-500 text-red-400">
                      Stop Bot
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {inactiveBots.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-medium text-white mb-4">Inactive Bots ({inactiveBots.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactiveBots.map((bot: any) => (
                <Card key={bot.id} className="bg-crypto-darker border-gray-800 opacity-60">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-sm font-medium">{bot.name}</CardTitle>
                      <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                        Stopped
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-crypto-light">Pair:</span>
                        <div className="text-white font-medium">{bot.tradingPair}</div>
                      </div>
                      <div>
                        <span className="text-crypto-light">Strategy:</span>
                        <div className="text-white font-medium capitalize">{bot.strategy}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-green-600 hover:border-green-500 text-green-400">
                        Start Bot
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-xs border-gray-600 hover:border-crypto-accent text-white">
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderBotTemplates = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Bot Templates</h3>
        <p className="text-crypto-light mb-6">Choose from pre-configured trading strategies to get started quickly.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'Grid Trading', description: 'Buy low, sell high with automated grid orders', icon: 'fas fa-th' },
            { name: 'DCA Bot', description: 'Dollar cost averaging with regular purchases', icon: 'fas fa-calendar-alt' },
            { name: 'Martingale', description: 'Double down strategy for trend recovery', icon: 'fas fa-chart-line' },
          ].map((template, index) => (
            <div key={index} className="bg-crypto-darker p-4 rounded-lg border border-gray-800 hover:border-crypto-accent/30 transition-colors">
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-crypto-accent/10 rounded-lg flex items-center justify-center mr-3">
                  <i className={`${template.icon} text-crypto-accent`}></i>
                </div>
                <h4 className="text-white font-medium">{template.name}</h4>
              </div>
              <p className="text-crypto-light text-sm mb-4">{template.description}</p>
              <Button size="sm" variant="outline" className="border-gray-700 text-crypto-light hover:bg-gray-800 hover:text-white">
                Use Template
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBotHistory = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Trading History</h3>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-history text-gray-400 text-2xl"></i>
          </div>
          <h4 className="text-xl font-semibold text-white mb-2">No Trading History</h4>
          <p className="text-crypto-light">Your bot trading history will appear here once you start trading.</p>
        </div>
      </div>
    </div>
  );

  const renderBotPerformance = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Performance Analytics</h3>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-chart-line text-gray-400 text-2xl"></i>
          </div>
          <h4 className="text-xl font-semibold text-white mb-2">No Performance Data</h4>
          <p className="text-crypto-light">Performance metrics will be available once your bots start trading.</p>
        </div>
      </div>
    </div>
  );

  const renderBotSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Bot Settings</h3>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-cog text-gray-400 text-2xl"></i>
          </div>
          <h4 className="text-xl font-semibold text-white mb-2">No Bot Settings</h4>
          <p className="text-crypto-light">Bot configuration options will appear here when you create your first bot.</p>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'active-bots':
        return renderActiveBots();
      case 'bot-templates':
        return renderBotTemplates();
      case 'bot-history':
        return renderBotHistory();
      case 'bot-performance':
        return renderBotPerformance();
      case 'bot-settings':
        return renderBotSettings();
      default:
        return renderActiveBots();
    }
  };

  return (
    <div className="flex h-screen bg-crypto-darker">
      {/* My Bots Sidebar */}
      <div className="w-64 bg-crypto-dark border-r border-gray-800 p-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">My Bots</h2>
          <p className="text-sm text-crypto-light">Manage your trading automation</p>
        </div>
        
        <nav className="space-y-2">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                activeSection === item.id
                  ? 'bg-crypto-accent/10 text-crypto-accent border border-crypto-accent/20'
                  : 'text-crypto-light hover:bg-gray-800 hover:text-white'
              }`}
            >
              <i className={item.icon}></i>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      
      {/* My Bots Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Card className="bg-crypto-dark border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              {sidebarItems.find(item => item.id === activeSection)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderContent()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}