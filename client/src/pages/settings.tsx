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

export default function Settings() {
  const [activeSection, setActiveSection] = useState('general');
  const [publicWsStatus, setPublicWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [userWsStatus, setUserWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [publicWsData, setPublicWsData] = useState<string>('');
  const [userWsData, setUserWsData] = useState<string>('');
  const [listenKey, setListenKey] = useState<string>('');
  
  const publicWsRef = useRef<WebSocket | null>(null);
  const userWsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  // WebSocket testing functions
  const testPublicWebSocket = () => {
    const url = (document.getElementById('public-ws-url') as HTMLInputElement)?.value || 'wss://stream.binance.com:9443/ws/btcusdt@ticker';
    
    if (publicWsRef.current) {
      publicWsRef.current.close();
    }
    
    setPublicWsStatus('connecting');
    setPublicWsData('Connecting to public stream...');
    
    try {
      publicWsRef.current = new WebSocket(url);
      
      publicWsRef.current.onopen = () => {
        setPublicWsStatus('connected');
        setPublicWsData('Connected! Waiting for market data...');
        toast({
          title: "Public WebSocket Connected",
          description: "Successfully connected to public market data stream",
        });
      };
      
      publicWsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setPublicWsData(JSON.stringify(data, null, 2));
        } catch (e) {
          setPublicWsData(event.data);
        }
      };
      
      publicWsRef.current.onerror = (error) => {
        setPublicWsStatus('error');
        setPublicWsData('Connection error occurred');
        toast({
          title: "WebSocket Error",
          description: "Failed to connect to public stream",
          variant: "destructive",
        });
      };
      
      publicWsRef.current.onclose = () => {
        setPublicWsStatus('disconnected');
        setPublicWsData('Connection closed');
      };
    } catch (error) {
      setPublicWsStatus('error');
      setPublicWsData('Failed to establish connection');
    }
  };

  const disconnectPublicWebSocket = () => {
    if (publicWsRef.current) {
      publicWsRef.current.close();
      publicWsRef.current = null;
    }
    setPublicWsStatus('disconnected');
    setPublicWsData('Disconnected from public stream');
  };

  const generateListenKey = async () => {
    try {
      const response = await apiRequest('POST', '/api/websocket/listen-key', {});
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
        description: error.message || "Please ensure your API keys are configured",
        variant: "destructive",
      });
    }
  };

  const testUserWebSocket = () => {
    const baseUrl = (document.getElementById('user-ws-url') as HTMLInputElement)?.value || 'wss://stream.binance.com:9443/ws/';
    const listenKey = (document.getElementById('listen-key') as HTMLInputElement)?.value;
    
    if (!listenKey) {
      toast({
        title: "Listen Key Required",
        description: "Generate a listen key first to test user data stream",
        variant: "destructive",
      });
      return;
    }
    
    const url = `${baseUrl}${listenKey}`;
    
    if (userWsRef.current) {
      userWsRef.current.close();
    }
    
    setUserWsStatus('connecting');
    setUserWsData('Connecting to user data stream...');
    
    try {
      userWsRef.current = new WebSocket(url);
      
      userWsRef.current.onopen = () => {
        setUserWsStatus('connected');
        setUserWsData('Connected! Listening for account updates...');
        toast({
          title: "User WebSocket Connected",
          description: "Successfully connected to authenticated user data stream",
        });
      };
      
      userWsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setUserWsData(JSON.stringify(data, null, 2));
        } catch (e) {
          setUserWsData(event.data);
        }
      };
      
      userWsRef.current.onerror = (error) => {
        setUserWsStatus('error');
        setUserWsData('Authentication or connection error');
        toast({
          title: "User WebSocket Error",
          description: "Failed to connect to authenticated stream",
          variant: "destructive",
        });
      };
      
      userWsRef.current.onclose = () => {
        setUserWsStatus('disconnected');
        setUserWsData('Connection closed');
      };
    } catch (error) {
      setUserWsStatus('error');
      setUserWsData('Failed to establish connection');
    }
  };

  const disconnectUserWebSocket = () => {
    if (userWsRef.current) {
      userWsRef.current.close();
      userWsRef.current = null;
    }
    setUserWsStatus('disconnected');
    setUserWsData('Disconnected from user stream');
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
                  onClick={testPublicWebSocket}
                  disabled={publicWsStatus === 'connecting'}
                >
                  <i className={`${publicWsStatus === 'connecting' ? 'fas fa-spinner fa-spin' : 'fas fa-play'} mr-2`}></i>
                  {publicWsStatus === 'connecting' ? 'Connecting...' : 'Test Connection'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-gray-700 text-crypto-light hover:bg-gray-800"
                  onClick={disconnectPublicWebSocket}
                  disabled={publicWsStatus === 'disconnected'}
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
                      publicWsStatus === 'connected' ? 'bg-crypto-success animate-pulse' :
                      publicWsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      publicWsStatus === 'error' ? 'bg-crypto-danger' :
                      'bg-gray-500'
                    }`}></div>
                    <span className={`text-xs ${
                      publicWsStatus === 'connected' ? 'text-crypto-success' :
                      publicWsStatus === 'connecting' ? 'text-yellow-500' :
                      publicWsStatus === 'error' ? 'text-crypto-danger' :
                      'text-gray-500'
                    }`}>
                      {publicWsStatus === 'connected' ? 'Connected' :
                       publicWsStatus === 'connecting' ? 'Connecting' :
                       publicWsStatus === 'error' ? 'Error' :
                       'Disconnected'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto">
                  {publicWsData || 'Click "Test Connection" to start receiving live market data...'}
                </div>
              </div>
            </div>
          </div>

          {/* User Data Stream Testing */}
          <div className="bg-crypto-darker p-4 rounded-lg border border-gray-800">
            <h4 className="text-md font-medium text-white mb-3">User Data Stream</h4>
            <p className="text-sm text-crypto-light mb-4">
              Test authenticated user data streams for account updates and order execution
            </p>
            
            <div className="space-y-3">
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
                >
                  <i className="fas fa-key mr-2"></i>
                  Generate Listen Key
                </Button>
                <Button 
                  size="sm" 
                  className="bg-crypto-success hover:bg-crypto-success/80 text-white"
                  onClick={testUserWebSocket}
                  disabled={userWsStatus === 'connecting'}
                >
                  <i className={`${userWsStatus === 'connecting' ? 'fas fa-spinner fa-spin' : 'fas fa-play'} mr-2`}></i>
                  {userWsStatus === 'connecting' ? 'Connecting...' : 'Test Connection'}
                </Button>
              </div>
              
              <div className="bg-crypto-dark p-3 rounded border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-crypto-light">Authentication Status</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${
                      userWsStatus === 'connected' ? 'bg-crypto-success animate-pulse' :
                      userWsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      userWsStatus === 'error' ? 'bg-crypto-danger' :
                      listenKey ? 'bg-yellow-500' : 'bg-gray-500'
                    }`}></div>
                    <span className={`text-xs ${
                      userWsStatus === 'connected' ? 'text-crypto-success' :
                      userWsStatus === 'connecting' ? 'text-yellow-500' :
                      userWsStatus === 'error' ? 'text-crypto-danger' :
                      listenKey ? 'text-yellow-500' : 'text-gray-500'
                    }`}>
                      {userWsStatus === 'connected' ? 'Connected' :
                       userWsStatus === 'connecting' ? 'Connecting' :
                       userWsStatus === 'error' ? 'Auth Error' :
                       listenKey ? 'Ready to Connect' : 'API Key Required'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-crypto-light/70 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto">
                  {userWsData || 'Generate a listen key and test connection to receive authenticated data...'}
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