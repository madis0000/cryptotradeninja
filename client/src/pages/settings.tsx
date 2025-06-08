import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePublicWebSocket, useUserWebSocket } from "@/hooks/useWebSocketService";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Exchange {
  id: number;
  name: string;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
  wsApiEndpoint?: string;
  wsStreamEndpoint?: string;
  restApiEndpoint?: string;
  exchangeType?: string;
  isTestnet?: boolean;
}

interface StreamConfig {
  dataType: string;
  symbol: string; // Changed to single symbol for proper subscription control
  interval?: string;
  depth?: string;
}

// Predefined trading symbols for dropdown selection
const TRADING_SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'ADAUSDT', label: 'ADA/USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT' },
  { value: 'DOGEUSDT', label: 'DOGE/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'AVAXUSDT', label: 'AVAX/USDT' },
  { value: 'DOTUSDT', label: 'DOT/USDT' },
  { value: 'MATICUSDT', label: 'MATIC/USDT' }
];

export default function Settings() {
  const [activeSection, setActiveSection] = useState('general');
  const [selectedExchangeId, setSelectedExchangeId] = useState<string>('');
  const [streamConfig, setStreamConfig] = useState<StreamConfig>({
    dataType: 'kline',
    symbol: 'BTCUSDT', // Single symbol for clean subscription
    interval: '1m',
    depth: '5'
  });
  
  const { toast } = useToast();

  // Fetch exchanges for selection
  const { data: exchanges = [], isLoading: exchangesLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  // Get selected exchange data
  const selectedExchange = exchanges.find(ex => ex.id.toString() === selectedExchangeId);

  // Use the dedicated WebSocket service hooks
  const publicWs = usePublicWebSocket({
    onMessage: (data) => {
      console.log('Public WebSocket data:', data);
    },
    onConnect: () => {
      toast({
        title: "Public WebSocket Connected",
        description: "Successfully connected to market data stream",
      });
    },
    onDisconnect: () => {
      toast({
        title: "Public WebSocket Disconnected",
        description: "Market data stream connection closed",
      });
    },
    onError: (error) => {
      toast({
        title: "Public WebSocket Error",
        description: "Failed to connect to market data stream",
        variant: "destructive",
      });
    }
  });

  const userWs = useUserWebSocket({
    onMessage: (data) => {
      console.log('User WebSocket data:', data);
    },
    onConnect: () => {
      toast({
        title: "User WebSocket Connected",
        description: "Successfully connected to authenticated data stream",
      });
    },
    onDisconnect: () => {
      toast({
        title: "User WebSocket Disconnected",
        description: "Authenticated data stream connection closed",
      });
    },
    onError: (error) => {
      toast({
        title: "User WebSocket Error",
        description: "Failed to connect to authenticated stream",
        variant: "destructive",
      });
    }
  });

  // WebSocket testing functions using WebSocket API approach
  const testUserWebSocket = () => {
    if (!selectedExchangeId || !selectedExchange) {
      toast({
        title: "Exchange Required",
        description: "Please select an exchange account first",
        variant: "destructive",
      });
      return;
    }

    if (!selectedExchange.wsApiEndpoint) {
      toast({
        title: "Endpoint Missing",
        description: "WebSocket API endpoint not configured for this exchange",
        variant: "destructive",
      });
      return;
    }
    
    // Connect using WebSocket API (no listen key required)
    // API key will be retrieved from stored exchange credentials
    userWs.connect(selectedExchange.apiKey);
  };

  const sidebarItems = [
    { id: 'general', label: 'General Settings', icon: 'fas fa-cog' },
    { id: 'websocket', label: 'WebSocket Configuration', icon: 'fas fa-wifi' },
    { id: 'notifications', label: 'Notifications', icon: 'fas fa-bell' },
    { id: 'security', label: 'Security', icon: 'fas fa-shield-alt' },
  ];

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">General Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Dark Mode</Label>
              <p className="text-sm text-crypto-light/70">Toggle between light and dark themes</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <Separator className="bg-gray-800" />
          
          <div>
            <Label htmlFor="currency" className="text-crypto-light">Default Currency</Label>
            <Input
              id="currency"
              defaultValue="USD"
              className="mt-1 bg-crypto-darker border-gray-800 text-white"
            />
          </div>
          
          <div>
            <Label htmlFor="timezone" className="text-crypto-light">Timezone</Label>
            <Input
              id="timezone"
              defaultValue="UTC"
              className="mt-1 bg-crypto-darker border-gray-800 text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderWebSocketSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">WebSocket Configuration</h3>
        <p className="text-sm text-crypto-light mb-6">
          Configure and test WebSocket connections for real-time trading data and order monitoring.
          Proper WebSocket configuration is crucial for strategy execution.
        </p>

        {/* Exchange Account Selector */}
        <div className="mb-6 bg-crypto-darker p-4 rounded-lg border border-gray-800">
          <h4 className="text-md font-medium text-white mb-3">Exchange Account Selection</h4>
          <p className="text-sm text-crypto-light mb-4">
            Select an exchange account to use its configured endpoints for both public and user data streams.
          </p>
          
          <div>
            <Label htmlFor="exchange-selector" className="text-crypto-light text-sm">Exchange Account</Label>
            <Select value={selectedExchangeId} onValueChange={setSelectedExchangeId}>
              <SelectTrigger className="mt-1 bg-crypto-dark border-gray-700 text-white">
                <SelectValue placeholder={exchangesLoading ? "Loading exchanges..." : "Select an exchange account"} />
              </SelectTrigger>
              <SelectContent className="bg-crypto-dark border-gray-700">
                {exchanges.map((exchange) => (
                  <SelectItem key={exchange.id} value={exchange.id.toString()}>
                    <div className="flex items-center space-x-2">
                      <span className="text-white">{exchange.name}</span>
                      <div className={`w-2 h-2 rounded-full ${exchange.isActive ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {exchanges.length === 0 && !exchangesLoading && (
              <p className="text-xs text-crypto-light/70 mt-1">
                No exchange accounts found. Please add API keys in My Exchanges section.
              </p>
            )}
          </div>

          {selectedExchange && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-crypto-light text-xs">WebSocket API Endpoint</Label>
                <div className="mt-1 p-2 bg-crypto-dark border border-gray-700 rounded text-xs text-white">
                  {selectedExchange.wsApiEndpoint || 'Not configured'}
                </div>
              </div>
              <div>
                <Label className="text-crypto-light text-xs">WebSocket Stream Endpoint</Label>
                <div className="mt-1 p-2 bg-crypto-dark border border-gray-700 rounded text-xs text-white">
                  {selectedExchange.wsStreamEndpoint || 'Not configured'}
                </div>
              </div>
              <div>
                <Label className="text-crypto-light text-xs">REST API Endpoint</Label>
                <div className="mt-1 p-2 bg-crypto-dark border border-gray-700 rounded text-xs text-white">
                  {selectedExchange.restApiEndpoint || 'Not configured'}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Stream Configuration */}
        <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800 mb-6">
          <h4 className="text-md font-medium text-white mb-3">Stream Configuration</h4>
          <p className="text-sm text-crypto-light mb-4">
            Configure the type of market data and symbols to receive from the stream.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="stream-type">Data Type</Label>
              <Select value={streamConfig.dataType} onValueChange={(value) => setStreamConfig({...streamConfig, dataType: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select data type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ticker">24hr Ticker Statistics</SelectItem>
                  <SelectItem value="kline">Kline/Candlestick Data</SelectItem>
                  <SelectItem value="depth">Partial Book Depth</SelectItem>
                  <SelectItem value="trade">Trade Streams</SelectItem>
                  <SelectItem value="aggTrade">Aggregate Trade Streams</SelectItem>
                  <SelectItem value="miniTicker">Mini Ticker</SelectItem>
                  <SelectItem value="bookTicker">Book Ticker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {streamConfig.dataType === 'kline' && (
              <div>
                <Label htmlFor="interval">Kline Interval</Label>
                <Select value={streamConfig.interval} onValueChange={(value) => setStreamConfig({...streamConfig, interval: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1 minute</SelectItem>
                    <SelectItem value="3m">3 minutes</SelectItem>
                    <SelectItem value="5m">5 minutes</SelectItem>
                    <SelectItem value="15m">15 minutes</SelectItem>
                    <SelectItem value="30m">30 minutes</SelectItem>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="2h">2 hours</SelectItem>
                    <SelectItem value="4h">4 hours</SelectItem>
                    <SelectItem value="6h">6 hours</SelectItem>
                    <SelectItem value="8h">8 hours</SelectItem>
                    <SelectItem value="12h">12 hours</SelectItem>
                    <SelectItem value="1d">1 day</SelectItem>
                    <SelectItem value="3d">3 days</SelectItem>
                    <SelectItem value="1w">1 week</SelectItem>
                    <SelectItem value="1M">1 month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {streamConfig.dataType === 'depth' && (
              <div>
                <Label htmlFor="depth-level">Depth Level</Label>
                <Select value={streamConfig.depth} onValueChange={(value) => setStreamConfig({...streamConfig, depth: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select depth" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 levels</SelectItem>
                    <SelectItem value="10">10 levels</SelectItem>
                    <SelectItem value="20">20 levels</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="md:col-span-2 lg:col-span-1">
              <Label htmlFor="symbol">Trading Symbol</Label>
              <Select value={streamConfig.symbol} onValueChange={(value) => setStreamConfig({...streamConfig, symbol: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trading pair" />
                </SelectTrigger>
                <SelectContent>
                  {TRADING_SYMBOLS.map((symbol) => (
                    <SelectItem key={symbol.value} value={symbol.value}>
                      {symbol.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-3 p-3 bg-crypto-dark rounded border border-gray-700">
            <div className="text-xs text-crypto-light">
              <strong>Generated Stream URL:</strong>
              <div className="mt-1 text-white font-mono break-all">
                {selectedExchange?.wsStreamEndpoint 
                  ? `${selectedExchange.wsStreamEndpoint}/stream?streams=${
                      streamConfig.dataType === 'kline' ? `${streamConfig.symbol.toLowerCase()}@kline_${streamConfig.interval}` :
                      streamConfig.dataType === 'depth' ? `${streamConfig.symbol.toLowerCase()}@depth${streamConfig.depth}` :
                      `${streamConfig.symbol.toLowerCase()}@${streamConfig.dataType}`
                    }`
                  : 'No exchange selected'
                }
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Public Stream Testing */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-3">Public Data Stream</h4>
            <p className="text-sm text-crypto-light mb-4">
              Test public market data streams using the configured stream parameters above.
            </p>
            
            <div className="space-y-3">
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={async () => {
                    if (streamConfig.symbol) {
                      try {
                        // Configure stream via backend API endpoint
                        const response = await fetch('/api/websocket/configure-stream', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            dataType: streamConfig.dataType,
                            symbol: streamConfig.symbol,
                            interval: streamConfig.interval,
                            depth: streamConfig.depth
                          })
                        });
                        
                        if (!response.ok) {
                          throw new Error('Configuration failed');
                        }

                        toast({
                          title: "Stream Configured",
                          description: `Successfully configured ${streamConfig.dataType} stream for ${streamConfig.symbol}`,
                        });
                      } catch (error) {
                        toast({
                          title: "Configuration Failed",
                          description: "Failed to configure stream",
                          variant: "destructive",
                        });
                      }
                    } else {
                      toast({
                        title: "No Symbol",
                        description: "Please select a trading symbol first",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={!streamConfig.symbol}
                >
                  <i className="fas fa-cog mr-2"></i>
                  Configure Stream
                </Button>
                <Button 
                  size="sm" 
                  className="bg-crypto-success hover:bg-crypto-success/80 text-white"
                  onClick={async () => {
                    if (streamConfig.symbol) {
                      try {
                        // Connect directly to backend with configured symbol
                        publicWs.connect([streamConfig.symbol]);

                        toast({
                          title: "Stream Connected",
                          description: `Connected to ${streamConfig.dataType} stream for ${streamConfig.symbol}`,
                        });
                      } catch (error) {
                        toast({
                          title: "Connection Failed",
                          description: "Failed to connect to stream",
                          variant: "destructive",
                        });
                      }
                    } else {
                      toast({
                        title: "No Symbol",
                        description: "Please select a trading symbol first",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={publicWs.status === 'connecting' || !streamConfig.symbol}
                >
                  <i className={`${publicWs.status === 'connecting' ? 'fas fa-spinner fa-spin' : 'fas fa-play'} mr-2`}></i>
                  {publicWs.status === 'connecting' ? 'Connecting...' : 'Test Connection'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-gray-700 text-crypto-light hover:bg-gray-800"
                  onClick={() => publicWs.disconnect()}
                  disabled={publicWs.status === 'disconnected'}
                >
                  <i className="fas fa-stop mr-2"></i>
                  Disconnect
                </Button>
              </div>
              
              <div className="bg-crypto-dark p-3 rounded border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-crypto-light">Connection Status</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${
                      publicWs.status === 'connected' ? 'bg-crypto-success animate-pulse' :
                      publicWs.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      publicWs.status === 'error' ? 'bg-crypto-danger' :
                      'bg-gray-500'
                    }`}></div>
                    <span className={`text-xs ${
                      publicWs.status === 'connected' ? 'text-crypto-success' :
                      publicWs.status === 'connecting' ? 'text-yellow-500' :
                      publicWs.status === 'error' ? 'text-crypto-danger' :
                      'text-gray-500'
                    }`}>
                      {publicWs.status === 'connected' ? 'Connected' :
                       publicWs.status === 'connecting' ? 'Connecting' :
                       publicWs.status === 'error' ? 'Error' :
                       'Disconnected'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto">
                  {publicWs.lastMessage ? JSON.stringify(publicWs.lastMessage, null, 2) : 'Select an exchange account and test connection to receive live market data...'}
                </div>
              </div>
            </div>
          </div>

          {/* User Data Stream Testing */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-3">User Data Stream</h4>
            <p className="text-sm text-crypto-light mb-4">
              Test authenticated user data streams using the selected exchange's WebSocket API endpoint and stored API credentials.
            </p>
            
            <div className="space-y-3">
              
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  className="bg-crypto-success hover:bg-crypto-success/80 text-white"
                  onClick={testUserWebSocket}
                  disabled={userWs.status === 'connecting' || !selectedExchangeId}
                >
                  <i className={`${userWs.status === 'connecting' ? 'fas fa-spinner fa-spin' : 'fas fa-play'} mr-2`}></i>
                  {userWs.status === 'connecting' ? 'Connecting...' : 'Test Connection'}
                </Button>
              </div>
              
              <div className="bg-crypto-dark p-3 rounded border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-crypto-light">Connection Status</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${
                      userWs.status === 'connected' ? 'bg-crypto-success animate-pulse' :
                      userWs.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      userWs.status === 'error' ? 'bg-crypto-danger' :
                      selectedExchangeId ? 'bg-yellow-500' : 'bg-gray-500'
                    }`}></div>
                    <span className={`text-xs ${
                      userWs.status === 'connected' ? 'text-crypto-success' :
                      userWs.status === 'connecting' ? 'text-yellow-500' :
                      userWs.status === 'error' ? 'text-crypto-danger' :
                      selectedExchangeId ? 'text-yellow-500' : 'text-gray-500'
                    }`}>
                      {userWs.status === 'connected' ? 'Connected' :
                       userWs.status === 'connecting' ? 'Connecting' :
                       userWs.status === 'error' ? 'Connection Error' :
                       selectedExchangeId ? 'Ready to Connect' : 'Select Exchange Account'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto">
                  {userWs.lastMessage ? JSON.stringify(userWs.lastMessage, null, 2) : 'Select an exchange account and test connection to receive authenticated data...'}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <Separator className="bg-gray-800" />
        
        {/* WebSocket Settings */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-white">Connection Settings</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ws-reconnect" className="text-crypto-light">Reconnection Interval (ms)</Label>
              <Input
                id="ws-reconnect"
                type="number"
                defaultValue="5000"
                className="mt-1 bg-crypto-darker border-gray-800 text-white"
              />
            </div>
            
            <div>
              <Label htmlFor="ws-timeout" className="text-crypto-light">Connection Timeout (ms)</Label>
              <Input
                id="ws-timeout"
                type="number"
                defaultValue="10000"
                className="mt-1 bg-crypto-darker border-gray-800 text-white"
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Auto-Reconnect</Label>
              <p className="text-sm text-crypto-light/70">Automatically reconnect on connection loss</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Heartbeat/Ping</Label>
              <p className="text-sm text-crypto-light/70">Send periodic ping to keep connection alive</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
        
        <Separator className="bg-gray-800" />
        
        {/* Stream Subscriptions */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-white">Stream Subscriptions</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-crypto-light">Order Book Updates</Label>
                <p className="text-sm text-crypto-light/70">Real-time order book depth</p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-crypto-light">Trade Execution</Label>
                <p className="text-sm text-crypto-light/70">Account trade executions</p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-crypto-light">Account Updates</Label>
                <p className="text-sm text-crypto-light/70">Balance and position changes</p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-crypto-light">Order Updates</Label>
                <p className="text-sm text-crypto-light/70">Order status changes</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Notification Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Email Notifications</Label>
              <p className="text-sm text-crypto-light/70">Receive notifications via email</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Trade Alerts</Label>
              <p className="text-sm text-crypto-light/70">Get notified when trades are executed</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Bot Status Changes</Label>
              <p className="text-sm text-crypto-light/70">Notifications for bot start/stop events</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Security Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Two-Factor Authentication</Label>
              <p className="text-sm text-crypto-light/70">Add an extra layer of security</p>
            </div>
            <Switch />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-crypto-light">Session Timeout</Label>
              <p className="text-sm text-crypto-light/70">Auto-logout after inactivity</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div>
            <Label htmlFor="session-duration" className="text-crypto-light">Session Duration (hours)</Label>
            <Input
              id="session-duration"
              type="number"
              defaultValue="24"
              className="mt-1 bg-crypto-darker border-gray-800 text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings();
      case 'websocket':
        return renderWebSocketSettings();
      case 'notifications':
        return renderNotificationSettings();
      case 'security':
        return renderSecuritySettings();
      default:
        return renderGeneralSettings();
    }
  };

  return (
    <div className="flex h-screen bg-crypto-darker">
      {/* Settings Sidebar */}
      <div className="w-64 bg-crypto-dark border-r border-gray-800 p-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <p className="text-sm text-crypto-light">Configure your trading platform</p>
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
      
      {/* Settings Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Card className="bg-crypto-dark border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              {sidebarItems.find(item => item.id === activeSection)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderContent()}
            
            <div className="mt-8 pt-6 border-t border-gray-800">
              <div className="flex space-x-4">
                <Button className="bg-crypto-accent hover:bg-crypto-accent/80 text-white">
                  Save Changes
                </Button>
                <Button variant="outline" className="border-gray-800 text-crypto-light hover:bg-gray-800 hover:text-white">
                  Reset to Defaults
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}