import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { webSocketSingleton } from "@/services/WebSocketSingleton";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { audioService } from "@/services/audioService";
import { Volume2, VolumeX, Bell, Settings2 } from "lucide-react";

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

  // Audio notification settings
  const [soundNotificationsEnabled, setSoundNotificationsEnabled] = useState(
    localStorage.getItem('soundNotificationsEnabled') !== 'false'
  );
  const [takeProfitSoundEnabled, setTakeProfitSoundEnabled] = useState(
    localStorage.getItem('takeProfitSoundEnabled') !== 'false'
  );
  const [safetyOrderSoundEnabled, setSafetyOrderSoundEnabled] = useState(
    localStorage.getItem('safetyOrderSoundEnabled') !== 'false'
  );
  const [baseOrderSoundEnabled, setBaseOrderSoundEnabled] = useState(
    localStorage.getItem('baseOrderSoundEnabled') !== 'false'
  );
  const [takeProfitSound, setTakeProfitSound] = useState(
    localStorage.getItem('takeProfitSound') || 'chin-chin'
  );
  const [safetyOrderSound, setSafetyOrderSound] = useState(
    localStorage.getItem('safetyOrderSound') || 'beep'
  );
  const [baseOrderSound, setBaseOrderSound] = useState(
    localStorage.getItem('baseOrderSound') || 'notification'
  );
  const [notificationVolume, setNotificationVolume] = useState(
    parseFloat(localStorage.getItem('notificationVolume') || '0.5')
  );
  
  const { toast } = useToast();

  // Save notification setting to localStorage
  const saveNotificationSetting = (key: string, value: any) => {
    localStorage.setItem(key, value.toString());
    toast({
      title: "Settings Saved",
      description: "Notification preference updated successfully",
    });
  };

  // Test audio notification
  const testAudioNotification = async (orderType: 'take_profit' | 'safety_order' | 'base_order') => {
    const settings = {
      soundNotificationsEnabled,
      takeProfitSoundEnabled,
      safetyOrderSoundEnabled,
      baseOrderSoundEnabled,
      takeProfitSound,
      safetyOrderSound,
      baseOrderSound,
      notificationVolume
    };

    await audioService.playOrderFillNotification(orderType, settings);
    
    toast({
      title: "Test Sound",
      description: `Playing ${orderType.replace('_', ' ')} notification sound`,
    });
  };

  // Fetch exchanges for selection
  const { data: exchanges = [], isLoading: exchangesLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  // Get selected exchange data
  const selectedExchange = exchanges.find(ex => ex.id.toString() === selectedExchangeId);

  // Use the unified WebSocket singleton to prevent multiple connections
  const [wsConnected, setWsConnected] = useState(webSocketSingleton.isConnected());
  const [wsConnecting, setWsConnecting] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<StreamConfig | null>(null);
  const [receivedMessages, setReceivedMessages] = useState<any[]>([]);
  const [userMessages, setUserMessages] = useState<any[]>([]);

  useEffect(() => {
    // Set initial connection status
    setWsConnected(webSocketSingleton.isConnected());
    
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
      console.log('[SETTINGS WS] Received data:', data);
      
      // Add message to the appropriate list based on type
      const timestamp = new Date().toLocaleTimeString();
      const messageWithTimestamp = { ...data, timestamp };
      
      if (data.type === 'authenticated' || data.type === 'user_stream_connected' || 
          data.type === 'user_stream_error' || data.type === 'account_balance') {
        // User/authenticated messages
        setUserMessages(prev => [messageWithTimestamp, ...prev].slice(0, 20)); // Keep last 20 messages
      } else {
        // Public stream messages (ticker, kline, etc.)
        setReceivedMessages(prev => [messageWithTimestamp, ...prev].slice(0, 20)); // Keep last 20 messages
      }
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      console.log('[SETTINGS WS] WebSocket connected');
      setWsConnected(true);
      setWsConnecting(false);
      toast({
        title: "WebSocket Connected",
        description: "Successfully connected to unified trading stream",
      });
    });

    const unsubscribeDisconnect = webSocketSingleton.onDisconnect(() => {
      console.log('[SETTINGS WS] WebSocket disconnected');
      setWsConnected(false);
      setWsConnecting(false);
      setCurrentSubscription(null);
      setReceivedMessages([]);
      setUserMessages([]);
      toast({
        title: "WebSocket Disconnected",
        description: "Trading stream connection closed",
      });
    });

    const unsubscribeError = webSocketSingleton.onError((error) => {
      console.error('[SETTINGS WS] WebSocket error:', error);
      setWsConnected(false);
      setWsConnecting(false);
      toast({
        title: "WebSocket Error",
        description: "Connection failed or encountered an error",
        variant: "destructive",
      });
    });

    return () => {
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, []);

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
    
    // Test connection using unified WebSocket singleton
    webSocketSingleton.connect(['BTCUSDT']);
  };

  // Handle stream configuration changes
  const handleStreamConfigChange = async (newConfig: Partial<StreamConfig>) => {
    const updatedConfig = { ...streamConfig, ...newConfig };
    setStreamConfig(updatedConfig);

    // If we have an active subscription and connection, update it
    if (wsConnected && currentSubscription) {
      console.log('[SETTINGS WS] Stream config changed, updating subscription...');
      
      try {
        // Configure the stream via backend API endpoint
        const response = await fetch('/api/websocket/configure-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataType: updatedConfig.dataType,
            symbol: updatedConfig.symbol,
            interval: updatedConfig.interval,
            depth: updatedConfig.depth
          })
        });
        
        if (!response.ok) {
          throw new Error('Configuration failed');
        }

        // Update subscription with new symbol
        webSocketSingleton.sendMessage({
          type: 'subscribe',
          symbols: [updatedConfig.symbol]
        });

        setCurrentSubscription(updatedConfig);
        
        toast({
          title: "Stream Updated",
          description: `Updated to ${updatedConfig.dataType} stream for ${updatedConfig.symbol}`,
        });
      } catch (error) {
        console.error('[SETTINGS WS] Failed to update stream config:', error);
        toast({
          title: "Update Failed",
          description: "Failed to update stream configuration",
          variant: "destructive",
        });
      }
    }
  };

  // Connect to public stream
  const connectPublicStream = async () => {
    if (!streamConfig.symbol) {
      toast({
        title: "No Symbol",
        description: "Please select a trading symbol first",
        variant: "destructive",
      });
      return;
    }

    setWsConnecting(true);
    
    try {
      // First configure the stream via backend API endpoint
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

      // Then connect using unified WebSocket singleton
      await webSocketSingleton.connect([streamConfig.symbol]);
      setCurrentSubscription({ ...streamConfig });

    } catch (error) {
      console.error('[SETTINGS WS] Connection failed:', error);
      setWsConnecting(false);
      toast({
        title: "Connection Failed",
        description: "Failed to configure and connect to stream",
        variant: "destructive",
      });
    }
  };

  // Disconnect from stream
  const disconnectStream = () => {
    webSocketSingleton.disconnect();
    setCurrentSubscription(null);
    setWsConnecting(false);
  };

  // Clear message logs
  const clearPublicMessages = () => {
    setReceivedMessages([]);
    toast({
      title: "Messages Cleared",
      description: "Public stream message log cleared",
    });
  };

  const clearUserMessages = () => {
    setUserMessages([]);
    toast({
      title: "Messages Cleared", 
      description: "User stream message log cleared",
    });
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
              <Select 
                value={streamConfig.dataType} 
                onValueChange={(value) => handleStreamConfigChange({ dataType: value })}
              >
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
                <Select 
                  value={streamConfig.interval} 
                  onValueChange={(value) => handleStreamConfigChange({ interval: value })}
                >
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
                <Select 
                  value={streamConfig.depth} 
                  onValueChange={(value) => handleStreamConfigChange({ depth: value })}
                >
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
              <Select 
                value={streamConfig.symbol} 
                onValueChange={(value) => handleStreamConfigChange({ symbol: value })}
              >
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
              Test public market data streams. This will automatically configure and connect to the stream using the parameters above.
              <span className="block mt-2 text-xs text-yellow-400">
                ⚠️ Requires an exchange account to be selected and a trading symbol to be chosen.
              </span>
            </p>
            
            <div className="space-y-3">
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  className="bg-crypto-success hover:bg-crypto-success/80 text-white"
                  onClick={connectPublicStream}
                  disabled={wsConnecting || wsConnected || !streamConfig.symbol || !selectedExchangeId}
                >
                  <i className={`${wsConnecting ? 'fas fa-spinner fa-spin' : 'fas fa-play'} mr-2`}></i>
                  {wsConnecting ? 'Connecting...' : 'Test Connection'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-gray-700 text-crypto-light hover:bg-gray-800"
                  onClick={disconnectStream}
                  disabled={!wsConnected && !wsConnecting}
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
                      wsConnected ? 'bg-crypto-success animate-pulse' : 
                      wsConnecting ? 'bg-yellow-500 animate-pulse' : 
                      'bg-gray-500'
                    }`}></div>
                    <span className={`text-xs ${
                      wsConnected ? 'text-crypto-success' : 
                      wsConnecting ? 'text-yellow-500' : 
                      'text-gray-500'
                    }`}>
                      {wsConnected ? 'Connected' : wsConnecting ? 'Connecting...' : 'Disconnected'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto">
                  {wsConnected ? `Connected to ${currentSubscription?.dataType || 'ticker'} stream for ${currentSubscription?.symbol || 'N/A'}` :
                   wsConnecting ? 'Connecting to unified trading stream...' :
                   !selectedExchangeId ? 'Please select an exchange account first' :
                   !streamConfig.symbol ? 'Please select a trading symbol first' :
                   'Ready to connect - click Test Connection'}
                </div>
              </div>

              {/* Message Log for Public Stream */}
              <div className="bg-crypto-dark p-3 rounded border border-gray-700 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-chart-line text-crypto-success text-xs"></i>
                    <span className="text-xs font-medium text-crypto-light">Live Market Data ({receivedMessages.length})</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearPublicMessages}
                    className="h-6 px-2 text-xs text-crypto-light hover:bg-gray-800"
                    disabled={receivedMessages.length === 0}
                  >
                    <i className="fas fa-trash mr-1"></i>
                    Clear
                  </Button>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-32 overflow-y-auto">
                  {receivedMessages.length === 0 ? (
                    <div className="text-gray-500 italic text-center py-2">
                      📊 No market data received yet<br />
                      <span className="text-xs">Connect to see live ticker updates, kline data, and more...</span>
                    </div>
                  ) : (
                    receivedMessages.map((msg, index) => (
                      <div key={index} className="mb-1 pb-1 border-b border-gray-800 last:border-b-0">
                        <div className="flex justify-between items-center">
                          <span className="text-yellow-400 text-xs">[{msg.timestamp}]</span>
                          <span className="text-xs text-gray-400">{msg.type}</span>
                        </div>
                        <div className="text-green-400 text-xs mt-1 break-all">
                          {JSON.stringify(msg, null, 1).slice(0, 200)}
                          {JSON.stringify(msg).length > 200 && '...'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* User Data Stream Testing */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-3">User Data Stream</h4>
            <p className="text-sm text-crypto-light mb-4">
              Test authenticated user data streams using the selected exchange's WebSocket API endpoint and stored API credentials.
              <span className="block mt-2 text-xs text-yellow-400">
                ⚠️ Requires an exchange account to be selected with properly configured API credentials.
              </span>
            </p>
            
            <div className="space-y-3">
              
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  className="bg-crypto-success hover:bg-crypto-success/80 text-white"
                  onClick={testUserWebSocket}
                  disabled={wsConnecting || wsConnected || !selectedExchangeId}
                >
                  <i className={`${wsConnecting ? 'fas fa-spinner fa-spin' : 'fas fa-play'} mr-2`}></i>
                  {wsConnecting ? 'Connecting...' : 'Test Connection'}
                </Button>
              </div>
              
              <div className="bg-crypto-dark p-3 rounded border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-crypto-light">Connection Status</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${
                      wsConnected ? 'bg-crypto-success animate-pulse' :
                      wsConnecting ? 'bg-yellow-500 animate-pulse' :
                      selectedExchangeId ? 'bg-yellow-500' : 'bg-gray-500'
                    }`}></div>
                    <span className={`text-xs ${
                      wsConnected ? 'text-crypto-success' :
                      wsConnecting ? 'text-yellow-500' :
                      selectedExchangeId ? 'text-yellow-500' : 'text-gray-500'
                    }`}>
                      {wsConnected ? 'Connected' :
                       wsConnecting ? 'Connecting...' :
                       selectedExchangeId ? 'Ready to Connect' : 'Select Exchange Account'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto">
                  {wsConnected ? 'Connected to unified trading stream with user authentication' : 
                   wsConnecting ? 'Connecting to authenticated stream...' :
                   !selectedExchangeId ? 'Please select an exchange account first' :
                   'Ready to connect - click Test Connection for authenticated data...'}
                </div>
              </div>

              {/* Message Log for User Stream */}
              <div className="bg-crypto-dark p-3 rounded border border-gray-700 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-user-shield text-crypto-accent text-xs"></i>
                    <span className="text-xs font-medium text-crypto-light">Authenticated Data ({userMessages.length})</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearUserMessages}
                    className="h-6 px-2 text-xs text-crypto-light hover:bg-gray-800"
                    disabled={userMessages.length === 0}
                  >
                    <i className="fas fa-trash mr-1"></i>
                    Clear
                  </Button>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-32 overflow-y-auto">
                  {userMessages.length === 0 ? (
                    <div className="text-gray-500 italic text-center py-2">
                      🔐 No authenticated data received yet<br />
                      <span className="text-xs">Connect with exchange account to see balances, orders, and account updates...</span>
                    </div>
                  ) : (
                    userMessages.map((msg, index) => (
                      <div key={index} className="mb-1 pb-1 border-b border-gray-800 last:border-b-0">
                        <div className="flex justify-between items-center">
                          <span className="text-yellow-400 text-xs">[{msg.timestamp}]</span>
                          <span className="text-xs text-gray-400">{msg.type}</span>
                        </div>
                        <div className="text-blue-400 text-xs mt-1 break-all">
                          {JSON.stringify(msg, null, 1).slice(0, 200)}
                          {JSON.stringify(msg).length > 200 && '...'}
                        </div>
                      </div>
                    ))
                  )}
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
        <p className="text-sm text-crypto-light mb-6">
          Configure audio and visual notifications for trading events and order fills.
        </p>
        
        <div className="space-y-6">
          {/* Master Audio Control */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Bell className="h-5 w-5 text-crypto-primary" />
                <h4 className="text-md font-medium text-white">Sound Notifications</h4>
              </div>
              <Switch 
                checked={soundNotificationsEnabled}
                onCheckedChange={(checked) => {
                  setSoundNotificationsEnabled(checked);
                  saveNotificationSetting('soundNotificationsEnabled', checked);
                }}
              />
            </div>
            <p className="text-sm text-crypto-light mb-4">
              Enable or disable all audio notifications for bot trading events.
            </p>
          </div>

          {/* Volume Control */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <div className="flex items-center space-x-2 mb-4">
              <Volume2 className="h-5 w-5 text-crypto-primary" />
              <h4 className="text-md font-medium text-white">Volume Control</h4>
            </div>
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <VolumeX className="h-4 w-4 text-crypto-light" />
                <Slider
                  value={[notificationVolume]}
                  onValueChange={(value) => {
                    setNotificationVolume(value[0]);
                    saveNotificationSetting('notificationVolume', value[0]);
                    audioService.setVolume(value[0]);
                  }}
                  max={1}
                  min={0}
                  step={0.1}
                  className="flex-1"
                />
                <Volume2 className="h-4 w-4 text-crypto-light" />
                <span className="text-sm text-crypto-light w-12 text-right">
                  {Math.round(notificationVolume * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Individual Order Type Settings */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-4">Order Type Notifications</h4>
            <div className="space-y-4">
              
              {/* Take Profit Orders */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <Label className="text-crypto-light">Take Profit Orders</Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Select 
                      value={takeProfitSound} 
                      onValueChange={(value) => {
                        setTakeProfitSound(value);
                        saveNotificationSetting('takeProfitSound', value);
                      }}
                    >
                      <SelectTrigger className="w-32 bg-crypto-dark border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-crypto-dark border-gray-700">
                        <SelectItem value="chin-chin">Chin-Chin</SelectItem>
                        <SelectItem value="beep">Beep</SelectItem>
                        <SelectItem value="notification">Notification</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => testAudioNotification('take_profit')}
                      className="border-gray-700 text-crypto-light hover:bg-gray-800"
                    >
                      Test
                    </Button>
                  </div>
                </div>
                <Switch 
                  checked={takeProfitSoundEnabled}
                  onCheckedChange={(checked) => {
                    setTakeProfitSoundEnabled(checked);
                    saveNotificationSetting('takeProfitSoundEnabled', checked);
                  }}
                />
              </div>

              {/* Safety Orders */}
              <Separator className="bg-gray-800" />
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <Label className="text-crypto-light">Safety Orders</Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Select 
                      value={safetyOrderSound} 
                      onValueChange={(value) => {
                        setSafetyOrderSound(value);
                        saveNotificationSetting('safetyOrderSound', value);
                      }}
                    >
                      <SelectTrigger className="w-32 bg-crypto-dark border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-crypto-dark border-gray-700">
                        <SelectItem value="beep">Beep</SelectItem>
                        <SelectItem value="chin-chin">Chin-Chin</SelectItem>
                        <SelectItem value="notification">Notification</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => testAudioNotification('safety_order')}
                      className="border-gray-700 text-crypto-light hover:bg-gray-800"
                    >
                      Test
                    </Button>
                  </div>
                </div>
                <Switch 
                  checked={safetyOrderSoundEnabled}
                  onCheckedChange={(checked) => {
                    setSafetyOrderSoundEnabled(checked);
                    saveNotificationSetting('safetyOrderSoundEnabled', checked);
                  }}
                />
              </div>

              {/* Base Orders */}
              <Separator className="bg-gray-800" />
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <Label className="text-crypto-light">Base Orders</Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Select 
                      value={baseOrderSound} 
                      onValueChange={(value) => {
                        setBaseOrderSound(value);
                        saveNotificationSetting('baseOrderSound', value);
                      }}
                    >
                      <SelectTrigger className="w-32 bg-crypto-dark border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-crypto-dark border-gray-700">
                        <SelectItem value="notification">Notification</SelectItem>
                        <SelectItem value="beep">Beep</SelectItem>
                        <SelectItem value="chin-chin">Chin-Chin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => testAudioNotification('base_order')}
                      className="border-gray-700 text-crypto-light hover:bg-gray-800"
                    >
                      Test
                    </Button>
                  </div>
                </div>
                <Switch 
                  checked={baseOrderSoundEnabled}
                  onCheckedChange={(checked) => {
                    setBaseOrderSoundEnabled(checked);
                    saveNotificationSetting('baseOrderSoundEnabled', checked);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Notification Status */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-3">System Status</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-crypto-light">Audio Service</p>
                <p className="text-xs text-green-400">Ready</p>
              </div>
              <div className="text-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-crypto-light">WebSocket</p>
                <p className="text-xs text-green-400">Connected</p>
              </div>
              <div className="text-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-crypto-light">Bot Integration</p>
                <p className="text-xs text-green-400">Active</p>
              </div>
            </div>
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