import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ChevronUp, ChevronDown, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuth } from "@/hooks/useAuth";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";

interface MartingaleStrategyProps {
  className?: string;
  selectedSymbol: string;
  selectedExchangeId?: number;
  exchanges?: any[];
  onExchangeChange?: (exchangeId: number) => void;
  onBotCreated?: () => void;
  onConfigChange?: (config: any) => void;
}

export function MartingaleStrategy({ className, selectedSymbol, selectedExchangeId, exchanges, onExchangeChange, onBotCreated, onConfigChange }: MartingaleStrategyProps) {
  const { user } = useAuth();
  const [localDirection, setLocalDirection] = useState<"long" | "short">("long");
  const [realtimeBalance, setRealtimeBalance] = useState<string | null>(null);
  
  // Initialize order notifications
  useOrderNotifications();
  
  // Exchange-specific minimum order amounts (in USDT)
  const getMinimumOrderAmount = (exchangeId?: number) => {
    // Binance minimum order amount is typically $5-10 USDT
    // Setting to $5 to ensure orders pass exchange validation
    return "5.0";
  };

  const [config, setConfig] = useState({
    // Price Settings
    priceDeviation: "1",
    takeProfit: "1.5",
    takeProfitType: "fix",
    trailingProfit: "0.5",
    
    // Investment (set to exchange minimum)
    baseOrderSize: getMinimumOrderAmount(selectedExchangeId),
    safetyOrderSize: getMinimumOrderAmount(selectedExchangeId),
    maxSafetyOrders: "8",
    activeSafetyOrdersEnabled: false,
    activeSafetyOrders: "1",
    
    // Advanced Settings
    advancedEnabled: false,
    triggerType: "market",
    triggerPrice: "",
    priceDeviationMultiplier: [1.5],
    safetyOrderSizeMultiplier: [2.0],
    cooldownBetweenRounds: "60",
    
    // Price Range
    lowerPrice: "",
    upperPrice: ""
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Bot creation state
  const [isCreatingBot, setIsCreatingBot] = useState(false);

  // WebSocket for real-time balance updates
  const { connect, subscribeToBalance, unsubscribeFromBalance } = useWebSocket({
    onBalanceUpdate: (data) => {
      // Balance update processed silently
      if (data.userId === user?.id && data.exchangeId === selectedExchangeId && data.symbol === selectedSymbol) {
        setRealtimeBalance(data.balance);
      }
    }
  });

  // Initialize WebSocket connection
  useEffect(() => {
    connect();
  }, [connect]);

  // Subscribe to balance updates when exchange or symbol changes
  useEffect(() => {
    if (user?.id && selectedExchangeId && selectedSymbol) {
      subscribeToBalance(user.id, selectedExchangeId, selectedSymbol);
      
      return () => {
        unsubscribeFromBalance(user.id, selectedExchangeId, selectedSymbol);
      };
    }
  }, [user?.id, selectedExchangeId, selectedSymbol, subscribeToBalance, unsubscribeFromBalance]);

  // Notify parent component when configuration changes for real-time chart updates
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange(config);
    }
  }, [config, onConfigChange]);

  // Fetch available balance from exchange
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance', selectedExchangeId, selectedSymbol],
    queryFn: async () => {
      if (!selectedExchangeId || !selectedSymbol) return null;
      const response = await apiRequest(`/api/exchanges/${selectedExchangeId}/balance/${selectedSymbol}`);
      return response.json();
    },
    enabled: !!(selectedExchangeId && selectedSymbol),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Handle progress dialog completion
  const handleProgressComplete = (botId: string) => {
    setProgressDialogOpen(false);
    setIsCreatingBot(false);
    
    toast({
      title: "Bot Created Successfully",
      description: `Martingale bot ${botId} is now running with all orders placed`
    });
    
    // Invalidate queries to refresh bot list
    queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
    onBotCreated?.();
  };

  // Handle progress dialog error
  const handleProgressError = (error: string) => {
    setProgressDialogOpen(false);
    setIsCreatingBot(false);
    
    toast({
      title: "Bot Creation Failed",
      description: error,
      variant: "destructive"
    });
  };

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  // Helper functions for arrow controls
  const adjustPercentageValue = (field: string, increment: number) => {
    const currentValue = parseFloat(config[field as keyof typeof config] as string) || 0;
    const newValue = Math.max(0, currentValue + increment);
    setConfig(prev => ({ ...prev, [field]: newValue.toFixed(1) }));
  };

  const adjustAmountValue = (field: string, increment: number) => {
    const currentValue = parseFloat(config[field as keyof typeof config] as string) || 0;
    const minAmount = parseFloat(getMinimumOrderAmount(selectedExchangeId));
    const newValue = Math.max(minAmount, currentValue + increment);
    setConfig(prev => ({ ...prev, [field]: newValue.toFixed(2) }));
  };

  const adjustIntegerValue = (field: string, increment: number, min: number = 1, max?: number) => {
    const currentValue = parseInt(config[field as keyof typeof config] as string) || min;
    let newValue = currentValue + increment;
    newValue = Math.max(min, newValue);
    if (max !== undefined) {
      newValue = Math.min(max, newValue);
    }
    setConfig(prev => ({ ...prev, [field]: newValue.toString() }));
  };

  // Store created bot ID for progress dialog
  const [createdBotId, setCreatedBotId] = useState<string | null>(null);

  // Create bot mutation
  const createBotMutation = useMutation({
    mutationFn: async (botData: any) => {
      const response = await fetch('/api/bots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(botData),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create bot');
      }
      
      return response.json();
    },
    onSuccess: (botData) => {
      console.log('Bot created successfully:', botData);
      // Bot created - real-time notifications will handle order updates
      setCreatedBotId(botData.id.toString());
      toast({
        title: "Bot Created Successfully",
        description: `Martingale bot for ${selectedSymbol} has been created and is starting trades`,
        variant: "default"
      });
    },
    onError: (error: any) => {
      setIsCreatingBot(false);
      
      // Check if error response contains bot ID (bot was created but order placement failed)
      const errorData = error.response?.data;
      if (errorData?.botId) {
        setCreatedBotId(errorData.botId.toString());
        setProgressDialogOpen(true); // Still show progress dialog to track the failed bot
        toast({
          title: "Bot Created with Errors",
          description: `Bot was saved but order placement failed: ${error.message}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Bot Creation Failed",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  });

  const handleCreateBot = async () => {
    if (!selectedExchangeId) {
      toast({
        title: "Exchange Required",
        description: "Please select an exchange to create the bot",
        variant: "destructive"
      });
      return;
    }

    setIsCreatingBot(true);

    // Prepare bot data to match backend schema
    const botData = {
      name: `Martingale Bot - ${selectedSymbol}`,
      strategy: 'martingale',
      tradingPair: selectedSymbol,
      direction: localDirection,
      exchangeId: selectedExchangeId,
      isActive: true,
      
      // Investment Settings
      baseOrderAmount: config.baseOrderSize,
      safetyOrderAmount: config.safetyOrderSize,
      maxSafetyOrders: parseInt(config.maxSafetyOrders),
      activeSafetyOrdersEnabled: config.activeSafetyOrdersEnabled,
      activeSafetyOrders: config.activeSafetyOrdersEnabled ? parseInt(config.activeSafetyOrders) : 1,
      
      // Price Settings
      priceDeviation: config.priceDeviation,
      takeProfitPercentage: config.takeProfit,
      takeProfitType: config.takeProfitType,
      trailingProfitPercentage: config.trailingProfit,
      
      // Advanced Settings
      triggerType: config.triggerType,
      triggerPrice: config.triggerPrice || null,
      priceDeviationMultiplier: config.priceDeviationMultiplier[0].toString(),
      safetyOrderSizeMultiplier: config.safetyOrderSizeMultiplier[0].toString(),
      cooldownBetweenRounds: parseInt(config.cooldownBetweenRounds),
      
      // Risk Management
      lowerPriceLimit: config.lowerPrice || null,
      upperPriceLimit: config.upperPrice || null
    };

    createBotMutation.mutate(botData);
  };

  const baseCurrency = selectedSymbol.replace('USDT', '');

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Exchange Selector */}
      <div className="space-y-2">
        <Label className="text-sm text-gray-400">Exchange Account</Label>
        <Select 
          value={selectedExchangeId?.toString()} 
          onValueChange={(value) => onExchangeChange?.(parseInt(value))}
        >
          <SelectTrigger className="w-full bg-crypto-darker border-gray-600 text-white">
            <SelectValue placeholder="Select exchange account" />
          </SelectTrigger>
          <SelectContent className="bg-crypto-darker border-gray-600">
            {exchanges?.map((exchange: any) => (
              <SelectItem 
                key={exchange.id} 
                value={exchange.id.toString()}
                className="text-white hover:bg-gray-700"
              >
                {exchange.name} {exchange.isTestnet ? "(Testnet)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Direction Selector */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocalDirection("long")}
          className={`w-full text-xs px-3 py-1.5 ${
            localDirection === "long"
              ? 'text-green-400 bg-green-400/10 border border-green-400/20' 
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Long
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocalDirection("short")}
          className={`w-full text-xs px-3 py-1.5 ${
            localDirection === "short"
              ? 'text-red-400 bg-red-400/10 border border-red-400/20' 
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Short
        </Button>
      </div>

      {/* Price Settings */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">1. Price Settings</h4>
        
        <div className="space-y-3">
          <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-400">Price Deviation</Label>
            <div className="flex items-center space-x-2">
              <div className="flex flex-col">
                <button
                  onClick={() => adjustPercentageValue('priceDeviation', 0.1)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronUp className="h-2 w-2 text-gray-400" />
                </button>
                <button
                  onClick={() => adjustPercentageValue('priceDeviation', -0.1)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronDown className="h-2 w-2 text-gray-400" />
                </button>
              </div>
              <Input
                value={config.priceDeviation}
                onChange={(e) => handleInputChange('priceDeviation', e.target.value)}
                className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </div>

          <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-400">Take Profit</Label>
            <div className="flex items-center space-x-2">
              <div className="flex flex-col">
                <button
                  onClick={() => adjustPercentageValue('takeProfit', 0.1)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronUp className="h-2 w-2 text-gray-400" />
                </button>
                <button
                  onClick={() => adjustPercentageValue('takeProfit', -0.1)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronDown className="h-2 w-2 text-gray-400" />
                </button>
              </div>
              <Input
                value={config.takeProfit}
                onChange={(e) => handleInputChange('takeProfit', e.target.value)}
                className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
              />
              <span className="text-sm text-gray-400">%</span>
              <Select 
                value={config.takeProfitType}
                onValueChange={(value) => handleInputChange('takeProfitType', value)}
              >
                <SelectTrigger className="w-20 h-7 bg-crypto-darker border-gray-600 text-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-crypto-darker border-gray-600">
                  <SelectItem value="fix" className="text-white hover:bg-gray-700">Fix</SelectItem>
                  <SelectItem value="trailing" className="text-white hover:bg-gray-700">Trailing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {config.takeProfitType === "trailing" && (
            <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-400">Trailing Profit</Label>
              <div className="flex items-center space-x-2">
                <div className="flex flex-col">
                  <button
                    onClick={() => adjustPercentageValue('trailingProfit', 0.1)}
                    className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                  >
                    <ChevronUp className="h-2 w-2 text-gray-400" />
                  </button>
                  <button
                    onClick={() => adjustPercentageValue('trailingProfit', -0.1)}
                    className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                  >
                    <ChevronDown className="h-2 w-2 text-gray-400" />
                  </button>
                </div>
                <Input
                  value={config.trailingProfit}
                  onChange={(e) => handleInputChange('trailingProfit', e.target.value)}
                  className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
                />
                <span className="text-sm text-gray-400">%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Investment */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">2. Investment</h4>
        
        <div className="space-y-3">
          <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-400">Base Order</Label>
            <div className="flex items-center space-x-2">
              <div className="flex flex-col">
                <button
                  onClick={() => adjustAmountValue('baseOrderSize', 0.01)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronUp className="h-2 w-2 text-gray-400" />
                </button>
                <button
                  onClick={() => adjustAmountValue('baseOrderSize', -0.01)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronDown className="h-2 w-2 text-gray-400" />
                </button>
              </div>
              <Input
                value={config.baseOrderSize}
                onChange={(e) => handleInputChange('baseOrderSize', e.target.value)}
                className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
              />
              <span className="text-sm text-gray-400">USDT</span>
            </div>
          </div>

          <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-400">Safety Orders</Label>
            <div className="flex items-center space-x-2">
              <div className="flex flex-col">
                <button
                  onClick={() => adjustAmountValue('safetyOrderSize', 0.01)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronUp className="h-2 w-2 text-gray-400" />
                </button>
                <button
                  onClick={() => adjustAmountValue('safetyOrderSize', -0.01)}
                  className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                >
                  <ChevronDown className="h-2 w-2 text-gray-400" />
                </button>
              </div>
              <Input
                value={config.safetyOrderSize}
                onChange={(e) => handleInputChange('safetyOrderSize', e.target.value)}
                className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
              />
              <span className="text-sm text-gray-400">USDT</span>
            </div>
          </div>

          <div className="bg-crypto-dark rounded border border-gray-700 p-3">
            <div className="flex justify-between items-center mb-3">
              <Label className="text-sm text-gray-400">Max Safety Orders</Label>
              <Input
                value={config.maxSafetyOrders}
                onChange={(e) => handleInputChange('maxSafetyOrders', e.target.value)}
                className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={config.activeSafetyOrdersEnabled}
                  onCheckedChange={(checked) => setConfig(prev => ({...prev, activeSafetyOrdersEnabled: checked}))}
                />
                <Label className="text-sm text-gray-500">Active Safety Orders</Label>
              </div>
              
              {config.activeSafetyOrdersEnabled && (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <div className="flex flex-col">
                      <button
                        onClick={() => adjustIntegerValue('activeSafetyOrders', 1, 1, Math.max(1, parseInt(config.maxSafetyOrders) - 1))}
                        className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                      >
                        <ChevronUp className="h-2 w-2 text-gray-400" />
                      </button>
                      <button
                        onClick={() => adjustIntegerValue('activeSafetyOrders', -1, 1, Math.max(1, parseInt(config.maxSafetyOrders) - 1))}
                        className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                      >
                        <ChevronDown className="h-2 w-2 text-gray-400" />
                      </button>
                    </div>
                    <Input
                      value={config.activeSafetyOrders}
                      onChange={(e) => {
                        const value = e.target.value;
                        const maxValue = Math.max(1, parseInt(config.maxSafetyOrders) - 1) || 1;
                        const numValue = parseInt(value) || 1;
                        if (numValue >= 1 && numValue <= maxValue) {
                          handleInputChange('activeSafetyOrders', value);
                        }
                      }}
                      className="w-12 h-6 bg-crypto-darker border-gray-600 text-white text-xs text-center"
                      min="1"
                      max={Math.max(1, parseInt(config.maxSafetyOrders) - 1)}
                      type="number"
                    />
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-gray-500">/ {Math.max(1, parseInt(config.maxSafetyOrders) - 1)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <div className="flex items-center space-x-1">
            <span className="text-gray-400">Available</span>
            <span className="text-orange-500 font-medium">
              {(() => {
                // Use real-time balance if available, otherwise fall back to API data
                const displayBalance = realtimeBalance || (balanceData ? balanceData.free : '0.000000');
                const balanceValue = parseFloat(displayBalance);
                return `${balanceValue.toFixed(3)} USDT`;
              })()}
            </span>
            {realtimeBalance && (
              <span className="text-green-400 text-xs animate-pulse">●</span>
            )}
            <Info className="w-3 h-3 text-gray-400" />
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Total Investment</span>
          <span className="text-gray-400">
            {(() => {
              const baseOrder = parseFloat(config.baseOrderSize) || 0;
              const safetyOrderBase = parseFloat(config.safetyOrderSize) || 0;
              const maxSafetyOrders = parseInt(config.maxSafetyOrders) || 0;
              const activeSafetyOrders = parseInt(config.activeSafetyOrders) || 0;
              const multiplier = config.safetyOrderSizeMultiplier[0] || 1;
              
              // Use active safety orders if enabled, otherwise use max safety orders
              const safetyOrdersToCalculate = config.activeSafetyOrdersEnabled 
                ? Math.min(activeSafetyOrders, maxSafetyOrders)
                : maxSafetyOrders;
              
              // Calculate total safety orders with multiplier
              let totalSafetyOrderAmount = 0;
              for (let i = 0; i < safetyOrdersToCalculate; i++) {
                totalSafetyOrderAmount += safetyOrderBase * Math.pow(multiplier, i);
              }
              
              const total = baseOrder + totalSafetyOrderAmount;
              return total.toFixed(2);
            })()} USDT
          </span>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="space-y-3">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center justify-between w-full text-sm text-gray-400 hover:text-white"
        >
          <div className="flex items-center space-x-1">
            <span>3. Advanced settings</span>
            <Info className="w-3 h-3 text-gray-400" />
          </div>
          {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {advancedOpen && (
          <div className="space-y-3 pl-4 border-l-2 border-gray-700">
            <div className="bg-crypto-dark rounded border border-gray-700 p-3">
              <div className="flex justify-between items-center mb-2">
                <Label className="text-sm text-gray-400">Trigger Price</Label>
                <Select 
                  value={config.triggerType}
                  onValueChange={(value) => handleInputChange('triggerType', value)}
                >
                  <SelectTrigger className="w-20 h-7 bg-crypto-darker border-gray-600 text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-crypto-darker border-gray-600">
                    <SelectItem value="market" className="text-white hover:bg-gray-700">Market</SelectItem>
                    <SelectItem value="limit" className="text-white hover:bg-gray-700">Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.triggerType === "limit" && (
                <div className="flex justify-between items-center">
                  <Label className="text-sm text-gray-500">Price</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={config.triggerPrice}
                      onChange={(e) => handleInputChange('triggerPrice', e.target.value)}
                      className="w-20 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
                      placeholder="0.00"
                    />
                    <span className="text-sm text-gray-400">USDT</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-crypto-dark rounded border border-gray-700 p-3">
              <div className="flex justify-between items-center mb-3">
                <Label className="text-sm text-gray-400">Price deviation multiplier</Label>
                <span className="text-sm text-white">{config.priceDeviationMultiplier[0]}</span>
              </div>
              <Slider
                value={config.priceDeviationMultiplier}
                onValueChange={(value) => setConfig(prev => ({...prev, priceDeviationMultiplier: value}))}
                max={10}
                min={1}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="bg-crypto-dark rounded border border-gray-700 p-3">
              <div className="flex justify-between items-center mb-3">
                <Label className="text-sm text-gray-400">Safety Order Size multiplier</Label>
                <span className="text-sm text-white">{config.safetyOrderSizeMultiplier[0]}</span>
              </div>
              <Slider
                value={config.safetyOrderSizeMultiplier}
                onValueChange={(value) => setConfig(prev => ({...prev, safetyOrderSizeMultiplier: value}))}
                max={10}
                min={1}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-400">Cooldown between rounds</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={config.cooldownBetweenRounds}
                  onChange={(e) => handleInputChange('cooldownBetweenRounds', e.target.value)}
                  className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
                />
                <span className="text-sm text-gray-400">Sec</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Risk Management */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">4. Risk Management</h4>
        
        <div className="space-y-3">
          <div className="bg-crypto-dark rounded border border-gray-700 p-3">
            <Label className="text-sm text-gray-400 mb-3 block">Price Range</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={config.lowerPrice}
                onChange={(e) => handleInputChange('lowerPrice', e.target.value)}
                placeholder="Lower"
                className="h-8 text-sm bg-crypto-darker border-gray-600 text-white"
              />
              <Input
                value={config.upperPrice}
                onChange={(e) => handleInputChange('upperPrice', e.target.value)}
                placeholder="Upper"
                className="h-8 text-sm bg-crypto-darker border-gray-600 text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Create Bot Button */}
      <div className="mt-6 pt-4 border-t border-gray-700">
        <Button 
          onClick={handleCreateBot}
          disabled={isCreatingBot || !selectedExchangeId}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white"
        >
          {isCreatingBot ? "Creating..." : "Create Martingale Bot"}
        </Button>
      </div>

      {/* Real-time order notifications are now handled by useOrderNotifications hook */}
    </div>
  );
}