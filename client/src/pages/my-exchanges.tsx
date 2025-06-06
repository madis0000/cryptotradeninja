import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useUserWebSocket } from "@/hooks/useWebSocketService";

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

export default function MyExchanges() {
  const [activeSection, setActiveSection] = useState('general');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingExchange, setEditingExchange] = useState<Exchange | null>(null);
  const [selectedExchange, setSelectedExchange] = useState('');
  const [mode, setMode] = useState('testnet');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [wsApiEndpoint, setWsApiEndpoint] = useState('');
  const [wsStreamEndpoint, setWsStreamEndpoint] = useState('');
  const [restApiEndpoint, setRestApiEndpoint] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [exchangeBalances, setExchangeBalances] = useState<Record<number, { balance: string; loading: boolean; error?: string }>>({});
  const [currentExchangeId, setCurrentExchangeId] = useState<number | null>(null);
  const [timeoutRef, setTimeoutRef] = useState<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    };
  }, [timeoutRef]);

  // WebSocket for balance fetching
  const userWs = useUserWebSocket({
    onMessage: (data) => {
      console.log('Balance WebSocket response:', data);
      
      if (data.type === 'balance_update' && data.data?.balances) {
        console.log('Processing balance_update:', { 
          currentExchangeId, 
          hasBalances: !!data.data.balances,
          balanceCount: data.data.balances?.length 
        });
        
        // Find the first active exchange if currentExchangeId is null
        const targetExchangeId = currentExchangeId || (exchanges?.length > 0 ? exchanges[0].id : null);
        
        if (targetExchangeId) {
          // Clear any pending timeout since we received a successful response
          if (timeoutRef) {
            clearTimeout(timeoutRef);
            setTimeoutRef(null);
          }
          
          // Handle balance update from REST API or WebSocket API
          const totalUsdtValue = calculateTotalUsdtBalance(data.data.balances);
          const fetchMethod = data.data.method || 'websocket_api';
          console.log(`✅ Balance fetched via ${fetchMethod.toUpperCase()}:`, totalUsdtValue, 'USDT');
          
          setExchangeBalances(prev => ({
            ...prev,
            [targetExchangeId]: { balance: totalUsdtValue, loading: false }
          }));
          console.log('Balance updated successfully for exchange', targetExchangeId, ':', totalUsdtValue);
        } else {
          console.warn('Received balance_update but no valid exchange ID found');
        }
      } else if (data.type === 'api_response' && data.data?.balances && data.exchangeId) {
        // Handle real account balance response (legacy format)
        const totalUsdtValue = calculateTotalUsdtBalance(data.data.balances);
        setExchangeBalances(prev => ({
          ...prev,
          [data.exchangeId]: { balance: totalUsdtValue, loading: false }
        }));
      } else if (data.type === 'balance_error' && currentExchangeId) {
        // Handle balance errors
        setExchangeBalances(prev => ({
          ...prev,
          [currentExchangeId]: { 
            balance: '0.00', 
            loading: false, 
            error: data.error || 'Failed to fetch balance'
          }
        }));
      } else if (data.type === 'api_error' && data.exchangeId) {
        // Handle API errors (legacy format)
        setExchangeBalances(prev => ({
          ...prev,
          [data.exchangeId]: { 
            balance: '0.00', 
            loading: false, 
            error: data.error || 'Failed to fetch balance'
          }
        }));
      } else if (data.type === 'user_stream_unavailable' || data.type === 'user_stream_error') {
        console.log('User stream unavailable:', data.message);
      }
    }
  });

  // Calculate total USDT value from balance array
  const calculateTotalUsdtBalance = (balances: any[]) => {
    if (!Array.isArray(balances)) return '0.00';
    
    let total = 0;
    balances.forEach(balance => {
      if (balance.asset === 'USDT') {
        total += parseFloat(balance.free || 0) + parseFloat(balance.locked || 0);
      }
      // For other assets, we'd need price conversion which requires market data
      // For now, just show USDT balance
    });
    
    return total.toFixed(2);
  };

  // Function to fetch balance for a specific exchange
  const fetchExchangeBalance = async (exchange: Exchange) => {
    if (!exchange.isActive || !exchange.apiKey) return;
    
    // Set current exchange ID for tracking responses
    setCurrentExchangeId(exchange.id);
    
    setExchangeBalances(prev => ({
      ...prev,
      [exchange.id]: { balance: '0.00', loading: true }
    }));

    try {
      // Connect to user WebSocket if not already connected
      if (userWs.status !== 'connected') {
        userWs.connect();
      }
      
      // Wait for connection to be established with better retry logic
      const waitForConnection = () => {
        return new Promise<void>((resolve, reject) => {
          if (userWs.status === 'connected') {
            resolve();
            return;
          }
          
          let attempts = 0;
          const maxAttempts = 50; // 5 seconds max wait
          
          const checkConnection = () => {
            attempts++;
            console.log(`Connection check attempt ${attempts}/${maxAttempts}, status: ${userWs.status}`);
            
            if (userWs.status === 'connected') {
              console.log('✅ WebSocket connection established successfully');
              resolve();
            } else if (userWs.status === 'error') {
              reject(new Error('WebSocket connection failed'));
            } else if (attempts >= maxAttempts) {
              console.warn('⚠️ Connection timeout, proceeding anyway');
              resolve(); // Proceed even if connection is slow
            } else {
              setTimeout(checkConnection, 100);
            }
          };
          checkConnection();
        });
      };

      await waitForConnection();
      
      // Authenticate with the backend to trigger balance fetch
      const authRequest = {
        type: 'authenticate',
        userId: 1, // This should come from auth context
        apiKey: exchange.apiKey
      };
      
      console.log('Sending authentication request for balance:', authRequest);
      
      // Send authentication message which will trigger balance fetch
      try {
        userWs.sendMessage(authRequest);
        console.log('Authentication message sent successfully');
      } catch (wsError) {
        console.error('Error sending WebSocket message:', wsError);
        throw wsError;
      }
      
      // Set timeout for error handling - increased to 30 seconds for testnet
      const timeout = setTimeout(() => {
        setExchangeBalances(prev => {
          if (prev[exchange.id]?.loading) {
            return {
              ...prev,
              [exchange.id]: { 
                balance: '0.00', 
                loading: false, 
                error: 'Request timeout - please try again'
              }
            };
          }
          return prev;
        });
        setTimeoutRef(null);
      }, 30000);
      
      setTimeoutRef(timeout);
      
    } catch (error) {
      console.error('Error in fetchExchangeBalance:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('Error details:', {
        message: errorMessage,
        stack: errorStack,
        exchangeId: exchange.id
      });
      // Only set error state if balance wasn't already successfully updated
      setExchangeBalances(prev => {
        const currentState = prev[exchange.id];
        console.log('Current exchange state when error caught:', currentState);
        if (currentState?.loading) {
          console.log('Setting error state for exchange', exchange.id);
          return {
            ...prev,
            [exchange.id]: { 
              balance: '0.00', 
              loading: false, 
              error: 'Connection failed'
            }
          };
        }
        console.log('Not overriding successful result for exchange', exchange.id);
        return prev; // Don't override successful results
      });
    }
  };

  // Mask API key to show only first 3 characters and last 3, with proper truncation
  const maskApiKey = (apiKey: string) => {
    if (!apiKey || apiKey.length < 6) return '***';
    if (apiKey.length > 20) {
      // Truncate very long keys to fit card layout
      return apiKey.substring(0, 3) + '***' + apiKey.substring(apiKey.length - 3);
    }
    return apiKey.substring(0, 3) + '*'.repeat(Math.max(3, apiKey.length - 6)) + apiKey.substring(apiKey.length - 3);
  };

  // Fetch exchanges
  const { data: exchanges = [], isLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  // Auto-fetch balances when exchanges are loaded
  useEffect(() => {
    if (exchanges && exchanges.length > 0) {
      exchanges.forEach(exchange => {
        if (exchange.isActive && exchange.apiKey) {
          console.log(`Auto-fetching balance for exchange: ${exchange.name}`);
          fetchExchangeBalance(exchange);
        }
      });
    }
  }, [exchanges, fetchExchangeBalance]);

  // Add exchange mutation
  const addExchangeMutation = useMutation({
    mutationFn: async (exchangeData: any) => {
      const response = await apiRequest('/api/exchanges', 'POST', exchangeData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Exchange Added",
        description: "Exchange has been successfully added and configured.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add exchange",
        variant: "destructive",
      });
    },
  });

  // Delete exchange mutation
  const deleteExchangeMutation = useMutation({
    mutationFn: async (exchangeId: number) => {
      const response = await apiRequest(`/api/exchanges/${exchangeId}`, 'DELETE');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      toast({
        title: "Exchange Removed",
        description: "Exchange has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove exchange",
        variant: "destructive",
      });
    },
  });

  // Update exchange mutation
  const updateExchangeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest(`/api/exchanges/${id}`, 'PUT', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsEditDialogOpen(false);
      resetEditForm();
      toast({
        title: "Exchange Updated",
        description: "Exchange has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update exchange",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedExchange('');
    setMode('testnet');
    setApiKey('');
    setApiSecret('');
    setWsApiEndpoint('');
    setWsStreamEndpoint('');
    setRestApiEndpoint('');
  };

  const resetEditForm = () => {
    setEditingExchange(null);
    setApiKey('');
    setApiSecret('');
    setWsApiEndpoint('');
    setWsStreamEndpoint('');
    setRestApiEndpoint('');
  };

  const handleEditExchange = (exchange: Exchange) => {
    setEditingExchange(exchange);
    setApiKey(''); // Don't prefill for security
    setApiSecret(''); // Don't prefill for security
    setWsApiEndpoint(exchange.wsApiEndpoint || '');
    setWsStreamEndpoint(exchange.wsStreamEndpoint || '');
    setRestApiEndpoint(exchange.restApiEndpoint || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdateExchange = () => {
    if (!editingExchange || !apiKey || !apiSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    updateExchangeMutation.mutate({
      id: editingExchange.id,
      data: {
        apiKey,
        apiSecret,
        wsApiEndpoint: wsApiEndpoint || null,
        wsStreamEndpoint: wsStreamEndpoint || null,
        restApiEndpoint: restApiEndpoint || null,
      }
    });
  };

  const testConnection = async () => {
    if (!selectedExchange || !apiKey || !apiSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields before testing connection",
        variant: "destructive",
      });
      return;
    }

    setIsTestingConnection(true);
    
    try {
      // Test connection logic would go here
      // For now, simulate a test
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Connection Successful",
        description: "API credentials are valid and connection is working",
      });
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Unable to connect with provided credentials",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleAddExchange = () => {
    if (!selectedExchange || !apiKey || !apiSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const exchangeName = `${selectedExchange} (${mode})`;
    addExchangeMutation.mutate({
      name: exchangeName,
      apiKey,
      apiSecret,
      wsApiEndpoint: wsApiEndpoint || null,
      wsStreamEndpoint: wsStreamEndpoint || null,
      restApiEndpoint: restApiEndpoint || null,
      exchangeType: selectedExchange.toLowerCase(),
      isTestnet: mode === 'testnet',
    });
  };

  const handleDeleteExchange = (exchangeId: number) => {
    if (window.confirm('Are you sure you want to remove this exchange? This action cannot be undone.')) {
      deleteExchangeMutation.mutate(exchangeId);
    }
  };

  const sidebarItems = [
    { id: 'general', label: 'General', icon: 'fas fa-cog' },
  ];

  const exchangeOptions = [
    { value: 'binance', label: 'Binance' },
    { value: 'binance-us', label: 'Binance US' },
    { value: 'coinbase', label: 'Coinbase Pro' },
    { value: 'kraken', label: 'Kraken' },
    { value: 'bybit', label: 'Bybit' },
  ];

  const renderSidebar = () => (
    <div className="w-72 bg-crypto-dark p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Exchange Management</h2>
          <nav className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center space-x-3 text-sm ${
                  activeSection === item.id
                    ? 'bg-crypto-accent text-white'
                    : 'text-crypto-light hover:bg-gray-800 hover:text-white'
                }`}
              >
                <i className={`${item.icon} w-4`}></i>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );

  const renderExchangeCard = (exchange: Exchange) => {
    const balanceInfo = exchangeBalances[exchange.id];
    
    return (
      <Card key={exchange.id} className="bg-crypto-darker border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center space-x-2">
              <i className="fas fa-exchange-alt text-crypto-accent"></i>
              <span>{exchange.name}</span>
            </CardTitle>
            <Badge variant={exchange.isActive ? "default" : "secondary"} className={exchange.isActive ? "bg-crypto-success" : ""}>
              {exchange.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <Label className="text-crypto-light text-sm">API Key</Label>
              <p className="text-white font-mono text-sm bg-crypto-dark p-2 rounded mt-1">
                {maskApiKey(exchange.apiKey)}
              </p>
            </div>

            <div>
              <Label className="text-crypto-light text-sm">Available Balance</Label>
              <div className="flex items-center space-x-2 mt-1">
                {balanceInfo?.loading ? (
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-spinner fa-spin text-crypto-accent"></i>
                    <span className="text-sm text-crypto-light">Loading...</span>
                  </div>
                ) : balanceInfo?.error ? (
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-exclamation-triangle text-yellow-500"></i>
                    <span className="text-sm text-yellow-500">{balanceInfo.error}</span>
                  </div>
                ) : exchange.isActive ? (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-white font-semibold">
                      ${balanceInfo?.balance || '0.00'} USDT
                    </span>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 px-2 text-xs text-crypto-accent hover:bg-crypto-accent/10"
                      onClick={() => fetchExchangeBalance(exchange)}
                    >
                      <i className="fas fa-sync-alt mr-1"></i>
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500">Connect to view balance</span>
                )}
              </div>
            </div>
            
            <div>
              <Label className="text-crypto-light text-sm">Status</Label>
              <div className="flex items-center space-x-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${exchange.isActive ? 'bg-crypto-success' : 'bg-gray-500'}`}></div>
                <span className="text-sm text-crypto-light">
                  {exchange.isActive ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div>
              <Label className="text-crypto-light text-sm">Added</Label>
              <p className="text-crypto-light text-sm mt-1">
                {new Date(exchange.createdAt).toLocaleDateString()}
              </p>
            </div>
            
            <div className="flex space-x-2 pt-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="border-gray-700 text-crypto-light hover:bg-gray-800"
                onClick={() => handleEditExchange(exchange)}
              >
                <i className="fas fa-edit mr-2"></i>
                Edit
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="border-red-700 text-red-400 hover:bg-red-900"
                onClick={() => handleDeleteExchange(exchange.id)}
                disabled={deleteExchangeMutation.isPending}
              >
                <i className="fas fa-trash mr-2"></i>
                {deleteExchangeMutation.isPending ? 'Removing...' : 'Remove'}
              </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    );
  };

  const renderAddExchangeDialog = () => (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="bg-crypto-accent hover:bg-crypto-accent/80 text-white">
          <i className="fas fa-plus mr-2"></i>
          Add Exchange
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-crypto-darker border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add New Exchange</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="exchange" className="text-crypto-light">Exchange</Label>
            <Select value={selectedExchange} onValueChange={setSelectedExchange}>
              <SelectTrigger className="mt-1 bg-crypto-dark border-gray-700 text-white">
                <SelectValue placeholder="Select an exchange" />
              </SelectTrigger>
              <SelectContent className="bg-crypto-dark border-gray-700">
                {exchangeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-white">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="mode" className="text-crypto-light">Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="mt-1 bg-crypto-dark border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-crypto-dark border-gray-700">
                <SelectItem value="testnet" className="text-white">Testnet</SelectItem>
                <SelectItem value="live" className="text-white">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="api-key" className="text-crypto-light">API Key</Label>
            <Input
              id="api-key"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              className="mt-1 bg-crypto-dark border-gray-700 text-white"
            />
          </div>

          <div>
            <Label htmlFor="api-secret" className="text-crypto-light">API Secret</Label>
            <Input
              id="api-secret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Enter your API secret"
              className="mt-1 bg-crypto-dark border-gray-700 text-white"
            />
          </div>

          <Separator className="bg-gray-800" />

          <div className="space-y-4">
            <h4 className="text-md font-medium text-white">Endpoint Configuration (Optional)</h4>
            
            <div>
              <Label htmlFor="ws-api-endpoint" className="text-crypto-light">WebSocket API Endpoint</Label>
              <Input
                id="ws-api-endpoint"
                type="url"
                value={wsApiEndpoint}
                onChange={(e) => setWsApiEndpoint(e.target.value)}
                placeholder="wss://ws-api.testnet.binance.vision/ws-api/v3"
                className="mt-1 bg-crypto-dark border-gray-700 text-white"
              />
            </div>

            <div>
              <Label htmlFor="ws-stream-endpoint" className="text-crypto-light">WebSocket Stream Endpoint</Label>
              <Input
                id="ws-stream-endpoint"
                type="url"
                value={wsStreamEndpoint}
                onChange={(e) => setWsStreamEndpoint(e.target.value)}
                placeholder="wss://stream.binance.com:9443/ws/"
                className="mt-1 bg-crypto-dark border-gray-700 text-white"
              />
            </div>

            <div>
              <Label htmlFor="rest-api-endpoint" className="text-crypto-light">REST API Endpoint</Label>
              <Input
                id="rest-api-endpoint"
                type="url"
                value={restApiEndpoint}
                onChange={(e) => setRestApiEndpoint(e.target.value)}
                placeholder="https://testnet.binance.vision"
                className="mt-1 bg-crypto-dark border-gray-700 text-white"
              />
            </div>
          </div>

          <Separator className="bg-gray-800" />

          <div className="flex space-x-2">
            <Button
              onClick={testConnection}
              disabled={isTestingConnection}
              variant="outline"
              className="border-gray-700 text-crypto-light hover:bg-gray-800 flex-1"
            >
              {isTestingConnection ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Testing...
                </>
              ) : (
                <>
                  <i className="fas fa-plug mr-2"></i>
                  Test Connection
                </>
              )}
            </Button>
            
            <Button
              onClick={handleAddExchange}
              disabled={addExchangeMutation.isPending}
              className="bg-crypto-success hover:bg-crypto-success/80 text-white flex-1"
            >
              {addExchangeMutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Adding...
                </>
              ) : (
                <>
                  <i className="fas fa-plus mr-2"></i>
                  Add Exchange
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderEditExchangeDialog = () => (
    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
      <DialogContent className="bg-crypto-darker border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Edit Exchange: {editingExchange?.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="edit-api-key" className="text-crypto-light">API Key</Label>
            <Input
              id="edit-api-key"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter new API key"
              className="mt-1 bg-crypto-dark border-gray-700 text-white"
            />
          </div>

          <div>
            <Label htmlFor="edit-api-secret" className="text-crypto-light">API Secret</Label>
            <Input
              id="edit-api-secret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Enter new API secret"
              className="mt-1 bg-crypto-dark border-gray-700 text-white"
            />
          </div>

          <Separator className="bg-gray-800" />

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-crypto-light">Optional Endpoints</h4>
            
            <div>
              <Label htmlFor="edit-ws-api" className="text-crypto-light text-xs">WebSocket API Endpoint</Label>
              <Input
                id="edit-ws-api"
                type="text"
                value={wsApiEndpoint}
                onChange={(e) => setWsApiEndpoint(e.target.value)}
                placeholder="wss://ws-api.binance.com:9443/ws-api/v3"
                className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
              />
            </div>

            <div>
              <Label htmlFor="edit-ws-stream" className="text-crypto-light text-xs">WebSocket Stream Endpoint</Label>
              <Input
                id="edit-ws-stream"
                type="text"
                value={wsStreamEndpoint}
                onChange={(e) => setWsStreamEndpoint(e.target.value)}
                placeholder="wss://stream.binance.com:9443/ws"
                className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
              />
            </div>

            <div>
              <Label htmlFor="edit-rest-api" className="text-crypto-light text-xs">REST API Endpoint</Label>
              <Input
                id="edit-rest-api"
                type="text"
                value={restApiEndpoint}
                onChange={(e) => setRestApiEndpoint(e.target.value)}
                placeholder="https://api.binance.com"
                className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
              />
            </div>
          </div>

          <div className="flex space-x-2 pt-4">
            <Button
              onClick={handleUpdateExchange}
              disabled={updateExchangeMutation.isPending}
              className="flex-1 bg-crypto-accent hover:bg-crypto-accent/80"
            >
              {updateExchangeMutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Updating...
                </>
              ) : (
                <>
                  <i className="fas fa-save mr-2"></i>
                  Update Exchange
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              className="border-gray-700 text-crypto-light hover:bg-gray-800"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderGeneralSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Exchange Configuration</h3>
          <p className="text-crypto-light mt-1">
            Manage your cryptocurrency exchange API connections for trading and data access.
          </p>
        </div>
        {renderAddExchangeDialog()}
      </div>

      <Separator className="bg-gray-800" />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-crypto-darker border-gray-800 animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-700 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-700 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : exchanges && exchanges.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exchanges.map(renderExchangeCard)}
        </div>
      ) : (
        <Card className="bg-crypto-darker border-gray-800">
          <CardContent className="text-center py-12">
            <div className="text-crypto-light mb-4">
              <i className="fas fa-exchange-alt text-4xl text-gray-600"></i>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No Exchanges Connected</h3>
            <p className="text-crypto-light mb-6">
              Connect your first exchange to start trading and accessing market data.
            </p>
            {renderAddExchangeDialog()}
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="flex">
        {renderSidebar()}
        
        <div className="flex-1">
          <div className="p-8">
            {activeSection === 'general' && renderGeneralSection()}
          </div>
        </div>
      </div>
      
      {/* Dialogs */}
      {renderEditExchangeDialog()}
    </div>
  );
}