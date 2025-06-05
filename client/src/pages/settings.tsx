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
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState('general');
  const [listenKey, setListenKey] = useState<string>('');
  const [selectedExchangeId, setSelectedExchangeId] = useState<string>('');
  
  const { toast } = useToast();

  // Fetch exchanges for selection
  const { data: exchanges = [], isLoading: exchangesLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

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

  // Enhanced WebSocket testing functions using selected exchange API keys
  const generateListenKey = async () => {
    if (!selectedExchangeId) {
      toast({
        title: "Exchange Required",
        description: "Please select an exchange account first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest('POST', '/api/websocket/listen-key', {
        exchangeId: parseInt(selectedExchangeId)
      });
      const data = await response.json();
      
      if (response.ok) {
        setListenKey(data.listenKey);
        (document.getElementById('listen-key') as HTMLInputElement).value = data.listenKey;
        toast({
          title: "Listen Key Generated",
          description: "Use this key to connect to authenticated streams",
        });
      } else {
        throw new Error(data.error || 'Failed to generate listen key');
      }
    } catch (error: any) {
      toast({
        title: "Listen Key Error",
        description: error.message || "Please ensure your API keys are configured in My Exchanges",
        variant: "destructive",
      });
    }
  };

  const testUserWebSocket = () => {
    const listenKey = (document.getElementById('listen-key') as HTMLInputElement)?.value;
    
    if (!listenKey) {
      toast({
        title: "Listen Key Required",
        description: "Generate a listen key first to test user data stream",
        variant: "destructive",
      });
      return;
    }
    
    userWs.connect(listenKey);
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
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Public Stream Testing */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-3">Public Data Stream</h4>
            <p className="text-sm text-crypto-light mb-4">
              Test public market data streams for charts and price feeds
            </p>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="public-ws-url" className="text-crypto-light text-sm">Public Stream URL</Label>
                <Input
                  id="public-ws-url"
                  defaultValue="wss://stream.binance.com:9443/ws/btcusdt@ticker"
                  className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
                />
              </div>
              
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  className="bg-crypto-success hover:bg-crypto-success/80 text-white"
                  onClick={() => publicWs.connect()}
                  disabled={publicWs.status === 'connecting'}
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
                  {publicWs.lastMessage ? JSON.stringify(publicWs.lastMessage, null, 2) : 'Click "Test Connection" to start receiving live market data...'}
                </div>
              </div>
            </div>
          </div>

          {/* User Data Stream Testing */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-3">User Data Stream</h4>
            <p className="text-sm text-crypto-light mb-4">
              Test authenticated user data streams using the modern WebSocket API or legacy listen key method. Select an exchange account to use its API credentials for testing.
            </p>
            
            <div className="space-y-3">
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

              <div>
                <Label htmlFor="user-ws-url" className="text-crypto-light text-sm">User Stream URL</Label>
                <Input
                  id="user-ws-url"
                  defaultValue="wss://stream.binance.com:9443/ws/"
                  className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
                />
              </div>
              
              <div>
                <Label htmlFor="listen-key" className="text-crypto-light text-sm">Listen Key</Label>
                <Input
                  id="listen-key"
                  placeholder="API key required for listen key generation"
                  className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
                />
              </div>
              
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
                  onClick={generateListenKey}
                  disabled={!selectedExchangeId || exchangesLoading}
                >
                  <i className="fas fa-key mr-2"></i>
                  Generate Listen Key
                </Button>
                <Button 
                  size="sm" 
                  className="bg-crypto-success hover:bg-crypto-success/80 text-white"
                  onClick={testUserWebSocket}
                  disabled={userWs.status === 'connecting'}
                >
                  <i className={`${userWs.status === 'connecting' ? 'fas fa-spinner fa-spin' : 'fas fa-play'} mr-2`}></i>
                  {userWs.status === 'connecting' ? 'Connecting...' : 'Test Connection'}
                </Button>
              </div>
              
              <div className="bg-crypto-dark p-3 rounded border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-crypto-light">Authentication Status</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${
                      userWs.status === 'connected' ? 'bg-crypto-success animate-pulse' :
                      userWs.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      userWs.status === 'error' ? 'bg-crypto-danger' :
                      listenKey ? 'bg-yellow-500' : 'bg-gray-500'
                    }`}></div>
                    <span className={`text-xs ${
                      userWs.status === 'connected' ? 'text-crypto-success' :
                      userWs.status === 'connecting' ? 'text-yellow-500' :
                      userWs.status === 'error' ? 'text-crypto-danger' :
                      listenKey ? 'text-yellow-500' : 'text-gray-500'
                    }`}>
                      {userWs.status === 'connected' ? 'Connected' :
                       userWs.status === 'connecting' ? 'Connecting' :
                       userWs.status === 'error' ? 'Auth Error' :
                       listenKey ? 'Ready to Connect' : 'API Key Required'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto">
                  {userWs.lastMessage ? JSON.stringify(userWs.lastMessage, null, 2) : 'Generate a listen key and test connection to receive authenticated data...'}
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