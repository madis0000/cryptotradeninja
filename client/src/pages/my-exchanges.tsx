import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Trash2, Settings, RefreshCw, AlertCircle } from "lucide-react";
import { useUserWebSocket } from "@/hooks/useWebSocketService";
import { EXCHANGE_OPTIONS } from "@/lib/mock-data";
import { calculateTotalUsdtValue, calculateUsdtBalance, formatBalance } from "@/utils/balance-utils";
import { tickerPriceService } from "@/services/TickerPriceService";

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

interface ExchangeBalance {
  balance: string;
  loading: boolean;
  error?: string;
  balances?: any[];
  usdtOnly?: string;
  totalFree?: string;
  totalLocked?: string;
}

export default function MyExchanges() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for exchange balances
  const [exchangeBalances, setExchangeBalances] = useState<Record<number, ExchangeBalance>>({});
  const [currentExchangeId, setCurrentExchangeId] = useState<number | null>(null);
  
  // State for add/edit exchange dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [exchangeToDelete, setExchangeToDelete] = useState<Exchange | null>(null);
  const [selectedExchange, setSelectedExchange] = useState("");
  const [mode, setMode] = useState<'testnet' | 'live'>('testnet');
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [editingExchange, setEditingExchange] = useState<Exchange | null>(null);
  const [wsApiEndpoint, setWsApiEndpoint] = useState("");
  const [wsStreamEndpoint, setWsStreamEndpoint] = useState("");
  const [restApiEndpoint, setRestApiEndpoint] = useState("");

  // Fetch exchanges
  const { data: exchanges, isLoading: exchangesLoading, error: exchangesError } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Debug logging for exchanges query
  useEffect(() => {
    console.log('[MY EXCHANGES] Query state:', {
      exchanges: exchanges?.length || 0,
      exchangesLoading,
      exchangesError: exchangesError?.message
    });
  }, [exchanges, exchangesLoading, exchangesError]);

  // Helper functions for balance calculations
  const calculateTotalBalanceForDisplay = (balances: any[]): string => {
    // This shows the count of assets with non-zero balances
    const totalAssets = balances.filter(balance => 
      (parseFloat(balance.free || 0) + parseFloat(balance.locked || 0)) > 0
    ).length;
    return `${totalAssets} assets`;
  };

  // WebSocket for balance fetching
  const userWs = useUserWebSocket({
    onMessage: (data) => {
      console.log('Balance WebSocket response:', data);
      
      if (data.type === 'balance_update' && data.data?.balances) {
        const targetExchangeId = currentExchangeId || data.exchangeId;
        
        console.log('Processing balance update:', {
          currentExchangeId,
          dataExchangeId: data.exchangeId,
          targetExchangeId,
          balancesLength: data.data.balances.length
        });
        
        if (targetExchangeId) {
          // Calculate USDT balance and other metrics
          const usdtOnly = calculateUsdtBalance(data.data.balances);
          const totalFree = calculateTotalBalanceForDisplay(data.data.balances.filter((b: any) => parseFloat(b.free || '0') > 0));
          const totalLocked = calculateTotalBalanceForDisplay(data.data.balances.filter((b: any) => parseFloat(b.locked || '0') > 0));
          
          // Calculate total USDT value with price conversion (async)
          calculateTotalUsdtValue(data.data.balances, targetExchangeId).then(totalUsdtValue => {
            console.log('✅ Balance fetched via WebSocket API:', totalUsdtValue, 'USDT');
            
            setExchangeBalances(prev => ({
              ...prev,
              [targetExchangeId]: { 
                balance: totalUsdtValue, 
                loading: false,
                balances: data.data.balances,
                usdtOnly,
                totalFree,
                totalLocked
              }
            }));
          }).catch(error => {
            console.error('Error calculating total USDT value:', error);
            // Fallback to USDT-only value if price conversion fails
            setExchangeBalances(prev => ({
              ...prev,
              [targetExchangeId]: { 
                balance: usdtOnly, 
                loading: false,
                balances: data.data.balances,
                usdtOnly,
                totalFree,
                totalLocked
              }
            }));
          });
        } else {
          console.log('❌ No target exchange ID found for balance update');
        }
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      if (currentExchangeId) {
        setExchangeBalances(prev => ({
          ...prev,
          [currentExchangeId]: { 
            balance: '0.00', 
            loading: false, 
            error: 'Connection failed'
          }
        }));
      }
    }
  });

  // Simple balance fetching function
  const fetchExchangeBalance = (exchange: Exchange) => {
    if (!exchange.isActive || !exchange.apiKey) return;
    
    console.log(`Fetching balance for exchange: ${exchange.name}`);
    
    // Disconnect any existing connection first
    userWs.disconnect();
    
    // Set loading state
    setExchangeBalances(prev => ({
      ...prev,
      [exchange.id]: { balance: '0.00', loading: true }
    }));
    
    // Set current exchange for message handling
    setCurrentExchangeId(exchange.id);
    
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log(`Timeout fetching balance for exchange ${exchange.name}`);
      setExchangeBalances(prev => ({
        ...prev,
        [exchange.id]: { 
          balance: '0.00', 
          loading: false, 
          error: 'Request timeout'
        }
      }));
    }, 10000); // 10 second timeout
    
    // Connect and authenticate using WebSocket API
    userWs.connect();
    
    // Send balance request after a brief delay to ensure connection is established
    setTimeout(() => {
      userWs.sendMessage({
        type: 'get_balance',
        exchangeId: exchange.id
        // No asset parameter - this will request ALL balances
      });
      
      // Clear timeout once request is sent
      clearTimeout(timeoutId);
    }, 500);
  };

  // Auto-fetch balances when page loads (once only)
  useEffect(() => {
    if (exchanges && exchanges.length > 0) {
      exchanges.forEach(exchange => {
        if (exchange.isActive && exchange.apiKey && exchange.wsApiEndpoint) {
          fetchExchangeBalance(exchange);
        }
      });
    }
  }, [exchanges?.length]); // Only depend on length to prevent loops

  // Cleanup WebSocket connections when component unmounts
  useEffect(() => {
    return () => {
      console.log('[MY EXCHANGES] Component unmounting - disconnecting WebSocket');
      userWs.disconnect();
    };
  }, []);
  // Conditional ticker price subscription - only when we have balances that need price conversion
  useEffect(() => {
    console.log('[MY EXCHANGES] Checking if ticker price subscription is needed...');
    
    // Get unique asset symbols from all current balances that need price conversion
    const uniqueAssets = new Set<string>();
    Object.values(exchangeBalances).forEach(balanceState => {
      if (balanceState.balances && !balanceState.loading && !balanceState.error) {
        balanceState.balances.forEach((balance: any) => {
          if (balance.asset && 
              balance.asset !== 'USDT' && 
              (parseFloat(balance.free || '0') > 0 || parseFloat(balance.locked || '0') > 0)) {
            uniqueAssets.add(balance.asset);
          }
        });
      }
    });
    
    const assetsArray = Array.from(uniqueAssets);
    
    if (assetsArray.length > 0) {
      console.log('[MY EXCHANGES] Non-USDT balances detected, subscribing to ticker prices for:', assetsArray);
      
      const unsubscribe = tickerPriceService.subscribeToSymbols(assetsArray, (prices) => {
        console.log('[MY EXCHANGES] Received ticker price updates for', Object.keys(prices).length, 'symbols');
        
        // Recalculate balances for all exchanges when prices update
        setExchangeBalances(prevBalances => {
          const updatedBalances = { ...prevBalances };
          
          Object.keys(updatedBalances).forEach(exchangeId => {
            const exchangeData = updatedBalances[Number(exchangeId)];
            if (exchangeData.balances && !exchangeData.loading) {
              // Recalculate total USDT value with new prices
              calculateTotalUsdtValue(exchangeData.balances, Number(exchangeId)).then(totalUsdtValue => {
                setExchangeBalances(prev => ({
                  ...prev,
                  [Number(exchangeId)]: {
                    ...prev[Number(exchangeId)],
                    balance: totalUsdtValue
                  }
                }));
              }).catch(error => {
                console.warn(`Failed to recalculate balance for exchange ${exchangeId}:`, error);
              });
            }
          });
          
          return updatedBalances;
        });
      });
      
      return unsubscribe;
    } else {
      console.log('[MY EXCHANGES] No non-USDT balances found, skipping ticker price subscription');
    }  }, [exchangeBalances]); // Re-run when exchangeBalances change

  // Mutations for CRUD operations
  const createExchangeMutation = useMutation({
    mutationFn: async (exchangeData: any) => {
      return apiRequest('/api/exchanges', 'POST', exchangeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Exchange Added",
        description: "Exchange configuration has been saved successfully.",
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

  const updateExchangeMutation = useMutation({
    mutationFn: async ({ id, ...exchangeData }: any) => {
      return apiRequest(`/api/exchanges/${id}`, 'PUT', exchangeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsEditDialogOpen(false);
      resetEditForm();
      toast({
        title: "Exchange Updated",
        description: "Exchange configuration has been updated successfully.",
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

  const deleteExchangeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/exchanges/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      toast({
        title: "Exchange Deleted",
        description: "Exchange configuration has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete exchange",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedExchange("");
    setApiKey("");
    setApiSecret("");
    setWsApiEndpoint("");
    setWsStreamEndpoint("");
    setRestApiEndpoint("");
    setEditingExchange(null);
  };

  const resetEditForm = () => {
    setEditingExchange(null);
    setApiKey("");
    setApiSecret("");
    setWsApiEndpoint("");
    setWsStreamEndpoint("");
    setRestApiEndpoint("");
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

    const exchangeConfig = EXCHANGE_OPTIONS.find(ex => ex.value === selectedExchange);
    if (!exchangeConfig) return;

    const exchangeData = {
      name: `${exchangeConfig.name} (${mode})`,
      exchangeType: exchangeConfig.value,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      isActive: true,
      isTestnet: mode === 'testnet',
      wsApiEndpoint: wsApiEndpoint || null,
      wsStreamEndpoint: wsStreamEndpoint || null,
      restApiEndpoint: restApiEndpoint || null,
    };

    if (editingExchange) {
      updateExchangeMutation.mutate({ id: editingExchange.id, ...exchangeData });
    } else {
      createExchangeMutation.mutate(exchangeData);
    }
  };

  const handleEditExchange = (exchange: Exchange) => {
    setEditingExchange(exchange);
    setApiKey(exchange.apiKey); // Pre-fill existing API key
    setApiSecret(""); // Keep secret empty for security, user must re-enter
    setWsApiEndpoint(exchange.wsApiEndpoint || "");
    setWsStreamEndpoint(exchange.wsStreamEndpoint || "");
    setRestApiEndpoint(exchange.restApiEndpoint || "");
    setIsEditDialogOpen(true);
  };

  const handleUpdateExchange = () => {
    if (!editingExchange || !apiKey) {
      toast({
        title: "Missing Information",
        description: "Please provide at least the API key",
        variant: "destructive",
      });
      return;
    }

    const updateData: any = {
      apiKey,
      wsApiEndpoint: wsApiEndpoint || null,
      wsStreamEndpoint: wsStreamEndpoint || null,
      restApiEndpoint: restApiEndpoint || null,
    };

    // Only include API secret if provided (to update it)
    if (apiSecret) {
      updateData.apiSecret = apiSecret;
    }

    updateExchangeMutation.mutate({
      id: editingExchange.id,
      data: updateData
    });
  };

  const handleDeleteExchange = (exchange: Exchange) => {
    setExchangeToDelete(exchange);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteExchange = () => {
    if (exchangeToDelete) {
      deleteExchangeMutation.mutate(exchangeToDelete.id);
      setIsDeleteDialogOpen(false);
      setExchangeToDelete(null);
    }
  };

  const renderExchangeCard = (exchange: Exchange) => {
    const balanceState = exchangeBalances[exchange.id];
    
    return (
      <Card key={exchange.id} className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">
                {exchange.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">
                {exchange.name}
                {exchange.isTestnet && (
                  <Badge variant="secondary" className="ml-2">Testnet</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Added {new Date(exchange.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={exchange.isActive ? "default" : "secondary"}>
              {exchange.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">API Key</p>
              <p className="text-sm font-mono bg-muted p-2 rounded mt-1">
                {exchange.apiKey.substring(0, 8)}...{exchange.apiKey.slice(-4)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Balance (USDT)</p>
              <div className="flex items-center mt-1">
                {balanceState?.loading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : balanceState?.error ? (
                  <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{balanceState.error}</span>
                  </div>
                ) : (
                  <span className="text-lg font-semibold">
                    ${formatBalance(balanceState?.balance || '0.00')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Enhanced Balance Details Section */}
          {balanceState && !balanceState.loading && !balanceState.error && balanceState.balances && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">USDT Balance</p>
                  <p className="text-base font-semibold mt-1">
                    ${formatBalance(balanceState.usdtOnly || '0.00')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assets with Free Balance</p>
                  <p className="text-base font-semibold mt-1">
                    {balanceState.totalFree || '0 assets'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assets with Locked Balance</p>
                  <p className="text-base font-semibold mt-1">
                    {balanceState.totalLocked || '0 assets'}
                  </p>
                </div>
              </div>
            </>
          )}
          
          <Separator className="my-4" />
          
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchExchangeBalance(exchange)}
              disabled={balanceState?.loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Balance
            </Button>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditExchange(exchange)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteExchange(exchange)}
                disabled={deleteExchangeMutation.isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (exchangesLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading exchanges...</p>
          </div>
        </div>
      </div>
    );
  }

  if (exchangesError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to load exchanges</h3>
            <p className="text-muted-foreground mb-4">{exchangesError.message}</p>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Exchanges</h1>
          <p className="text-muted-foreground mt-2">
            Manage your cryptocurrency exchange connections
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Exchange
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingExchange ? 'Edit Exchange' : 'Add New Exchange'}
              </DialogTitle>
              <DialogDescription>
                Configure your exchange API credentials to enable trading
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="exchange">Exchange</Label>
                <Select value={selectedExchange} onValueChange={setSelectedExchange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an exchange" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCHANGE_OPTIONS.map((exchange) => (
                      <SelectItem key={exchange.value} value={exchange.value}>
                        {exchange.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="mode">Environment</Label>
                <Select value={mode} onValueChange={(value: 'testnet' | 'live') => setMode(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="testnet">Testnet</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter your API secret"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddExchange}
                disabled={createExchangeMutation.isPending || updateExchangeMutation.isPending}
              >
                {createExchangeMutation.isPending || updateExchangeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {editingExchange ? 'Update' : 'Add'} Exchange
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Exchange Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Edit Exchange: {editingExchange?.name}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-api-key">API Key</Label>
                <Input
                  id="edit-api-key"
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter new API key"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="edit-api-secret">API Secret</Label>
                <Input
                  id="edit-api-secret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Leave empty to keep existing secret"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Only enter if you want to update the API secret
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Optional Endpoints</h4>
                
                <div>
                  <Label htmlFor="edit-ws-api" className="text-xs">WebSocket API Endpoint</Label>
                  <Input
                    id="edit-ws-api"
                    type="text"
                    value={wsApiEndpoint}
                    onChange={(e) => setWsApiEndpoint(e.target.value)}
                    placeholder="wss://ws-api.binance.com:9443/ws-api/v3"
                    className="mt-1 text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-ws-stream" className="text-xs">WebSocket Stream Endpoint</Label>
                  <Input
                    id="edit-ws-stream"
                    type="text"
                    value={wsStreamEndpoint}
                    onChange={(e) => setWsStreamEndpoint(e.target.value)}
                    placeholder="wss://stream.binance.com:9443/ws"
                    className="mt-1 text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-rest-api" className="text-xs">REST API Endpoint</Label>
                  <Input
                    id="edit-rest-api"
                    type="text"
                    value={restApiEndpoint}
                    onChange={(e) => setRestApiEndpoint(e.target.value)}
                    placeholder="https://api.binance.com"
                    className="mt-1 text-sm"
                  />
                </div>
              </div>

              <div className="flex space-x-2 pt-4">
                <Button
                  onClick={handleUpdateExchange}
                  disabled={updateExchangeMutation.isPending}
                  className="flex-1"
                >
                  {updateExchangeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Settings className="h-4 w-4 mr-2" />
                      Update Exchange
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Exchange</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove "{exchangeToDelete?.name}"? This action cannot be undone and will permanently delete all associated configuration and data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setIsDeleteDialogOpen(false);
                setExchangeToDelete(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteExchange}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {deleteExchangeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  'Delete Exchange'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {exchanges && exchanges.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {exchanges.map(renderExchangeCard)}
        </div>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <div className="mx-auto max-w-sm">
              <div className="mb-4">
                <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Exchanges Connected</h3>
              <p className="text-muted-foreground mb-4">
                Connect your first exchange to start trading
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Exchange
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}