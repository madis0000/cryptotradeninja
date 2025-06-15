import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ChevronUp, ChevronDown, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { webSocketSingleton } from "@/services/WebSocketSingleton";

interface MartingaleStrategyProps {
  className?: string;
  selectedSymbol: string;
  selectedExchangeId?: number;
  exchanges?: any[];
  onExchangeChange?: (exchangeId: number) => void;
  onBotCreated?: () => void;
  onConfigChange?: (config: any) => void;
}

export function MartingaleStrategy({ 
  className, 
  selectedSymbol, 
  selectedExchangeId, 
  exchanges, 
  onExchangeChange, 
  onBotCreated, 
  onConfigChange 
}: MartingaleStrategyProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [localDirection, setLocalDirection] = useState<"long" | "short">("long");
  const [priceSettingsOpen, setPriceSettingsOpen] = useState(true);
  const [orderSettingsOpen, setOrderSettingsOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [riskManagementOpen, setRiskManagementOpen] = useState(false);
  const [createdBotId, setCreatedBotId] = useState<string | null>(null);

  const [config, setConfig] = useState({
    // Order Settings
    baseOrderSize: "100",
    safetyOrderSize: "100",
    maxSafetyOrders: "5",
    activeSafetyOrdersEnabled: false,
    activeSafetyOrders: "3",
    
    // Price Settings
    priceDeviation: "1.0",
    takeProfit: "1.0",
    takeProfitType: "fix",
    trailingProfit: "0.5",
    
    // Advanced Settings
    triggerType: "market",
    triggerPrice: "",
    priceDeviationMultiplier: [2.0],
    safetyOrderSizeMultiplier: [2.0],
    cooldownBetweenRounds: "60",
    
    // Risk Management
    lowerPrice: "",
    upperPrice: ""
  });

  // Notify parent component when configuration changes for real-time chart updates
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange(config);
    }
  }, [config, onConfigChange]);

  const [balanceData, setBalanceData] = useState<any>(null);

  // Ensure WebSocket connection is established
  useEffect(() => {
    console.log(`[UNIFIED WS BALANCE FETCHING] Ensuring WebSocket connection is established`);
    if (webSocketSingleton.getStatus() !== 'connected') {
      webSocketSingleton.connect();
    }
  }, []);

  // Fetch balance via WebSocket
  useEffect(() => {
    if (!selectedExchangeId) return;

    console.log(`[UNIFIED WS BALANCE FETCHING] Subscribing to balance for exchange ${selectedExchangeId}`);

    const handleBalanceUpdate = (data: any) => {
      console.log(`[UNIFIED WS BALANCE FETCHING] Received WebSocket message:`, data);
      
      if (data.type === 'balance_update' && data.exchangeId === selectedExchangeId && data.asset === 'USDT') {
        console.log(`[UNIFIED WS BALANCE FETCHING] Balance update received for exchange ${selectedExchangeId}:`, data.balance);
        setBalanceData(data.balance);
      }
    };

    // Subscribe to WebSocket messages
    const unsubscribe = webSocketSingleton.subscribe(handleBalanceUpdate);

    // Request initial balance
    webSocketSingleton.sendMessage({
      type: 'get_balance',
      exchangeId: selectedExchangeId,
      asset: 'USDT'
    });

    return () => {
      console.log(`[UNIFIED WS BALANCE FETCHING] Unsubscribing from balance updates`);
      unsubscribe();
    };
  }, [selectedExchangeId]);

  const handleInputChange = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  // Validation function to check if increasing a value would exceed 99.99% deviation
  const canIncrease = (field: string, currentValue: number, increment: number) => {
    let testConfig = { ...config };
    
    if (field === 'maxSafetyOrders') {
      testConfig.maxSafetyOrders = (currentValue + increment).toString();
    } else if (field === 'priceDeviation') {
      testConfig.priceDeviation = (parseFloat(config.priceDeviation) + increment).toString();
    }
    
    // Calculate the maximum deviation with test config
    const maxSafetyOrders = parseInt(testConfig.maxSafetyOrders) || 5;
    const priceDeviation = parseFloat(testConfig.priceDeviation) || 1.0;
    const multiplier = testConfig.priceDeviationMultiplier[0] || 1.5;
    
    const lastDeviation = priceDeviation * Math.pow(multiplier, maxSafetyOrders - 1);
    
    return lastDeviation <= 99.99;
  };

  const adjustPercentageValue = (field: string, increment: number) => {
    const currentValue = parseFloat(config[field as keyof typeof config] as string) || 0;
    let newValue = currentValue + increment;
    newValue = Math.max(0.1, newValue);
    
    // Check if increasing priceDeviation would exceed 99.99%
    if (field === 'priceDeviation' && increment > 0) {
      if (!canIncrease('priceDeviation', currentValue, increment)) {
        toast({
          title: "Maximum Price Deviation Reached",
          description: "Increasing price deviation would exceed 99.99% limit for the last safety order.",
          variant: "destructive"
        });
        return;
      }
    }
    
    setConfig(prev => ({ ...prev, [field]: newValue.toFixed(1) }));
  };

  const adjustIntegerValue = (field: string, increment: number, min: number = 1, max?: number) => {
    const currentValue = parseInt(config[field as keyof typeof config] as string) || min;
    let newValue = currentValue + increment;
    newValue = Math.max(min, newValue);
    if (max !== undefined) {
      newValue = Math.min(max, newValue);
    }
    
    // Check if increasing maxSafetyOrders would exceed 99.99%
    if (field === 'maxSafetyOrders' && increment > 0) {
      if (!canIncrease('maxSafetyOrders', currentValue, increment)) {
        toast({
          title: "Maximum Safety Orders Reached",
          description: "Adding more safety orders would exceed 99.99% deviation limit.",
          variant: "destructive"
        });
        return;
      }
    }
    
    setConfig(prev => ({ ...prev, [field]: newValue.toString() }));
  };

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
      setCreatedBotId(botData.id.toString());
      toast({
        title: "Bot Created Successfully",
        description: `Martingale bot for ${selectedSymbol} has been created and is starting trades`,
        variant: "default"
      });
      onBotCreated?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Bot",
        description: error.message || "Failed to create bot. Please try again.",
        variant: "destructive"
      });
    }
  });

  const isCreatingBot = createBotMutation.isPending;

  const handleCreateBot = () => {
    if (!selectedExchangeId) {
      toast({
        title: "No Exchange Selected",
        description: "Please select an exchange account before creating the bot.",
        variant: "destructive"
      });
      return;
    }

    const botData = {
      name: `Martingale ${selectedSymbol} ${localDirection.toUpperCase()}`,
      strategy: "martingale",
      exchangeId: selectedExchangeId,
      tradingPair: selectedSymbol,
      direction: localDirection,
      status: "active",
      
      // Order Settings
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

  return (
    <div className={`${className}`}>
      <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
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
          <button
            onClick={() => setPriceSettingsOpen(!priceSettingsOpen)}
            className="flex items-center justify-between w-full text-sm text-gray-400 hover:text-white"
          >
            <div className="flex items-center space-x-1">
              <span>1. Price Settings</span>
            </div>
            {priceSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {priceSettingsOpen && (
            <div className="space-y-3 pl-4 border-l-2 border-gray-700">
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
            </div>
          )}
        </div>

        {/* Order Settings */}
        <div className="space-y-3">
          <button
            onClick={() => setOrderSettingsOpen(!orderSettingsOpen)}
            className="flex items-center justify-between w-full text-sm text-gray-400 hover:text-white"
          >
            <div className="flex items-center space-x-1">
              <span>2. Order Settings</span>
            </div>
            {orderSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {orderSettingsOpen && (
            <div className="space-y-3 pl-4 border-l-2 border-gray-700">
              <div className="bg-crypto-dark rounded border border-gray-700 p-3">
                <div className="flex justify-between items-center mb-3">
                  <Label className="text-sm text-gray-400">Base Order</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={config.baseOrderSize}
                      onChange={(e) => handleInputChange('baseOrderSize', e.target.value)}
                      className="w-20 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
                    />
                    <span className="text-sm text-gray-400">USDT</span>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-3">
                  <Label className="text-sm text-gray-400">Safety Order Size</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={config.safetyOrderSize}
                      onChange={(e) => handleInputChange('safetyOrderSize', e.target.value)}
                      className="w-20 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
                    />
                    <span className="text-sm text-gray-400">USDT</span>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-3">
                  <Label className="text-sm text-gray-400">Max Safety Orders</Label>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <div className="flex flex-col">
                        <button
                          onClick={() => adjustIntegerValue('maxSafetyOrders', 1, 1, 10)}
                          className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                        >
                          <ChevronUp className="h-2 w-2 text-gray-400" />
                        </button>
                        <button
                          onClick={() => adjustIntegerValue('maxSafetyOrders', -1, 1, 10)}
                          className="h-3 w-5 flex items-center justify-center hover:bg-gray-600 rounded-sm transition-colors"
                        >
                          <ChevronDown className="h-2 w-2 text-gray-400" />
                        </button>
                      </div>
                      <Input
                        value={config.maxSafetyOrders}
                        onChange={(e) => {
                          const value = e.target.value;
                          const numValue = parseInt(value) || 1;
                          if (numValue >= 1 && numValue <= 10) {
                            handleInputChange('maxSafetyOrders', value);
                          }
                        }}
                        className="w-12 h-6 bg-crypto-darker border-gray-600 text-white text-xs text-center"
                        min="1"
                        max="10"
                        type="number"
                      />
                    </div>
                  </div>
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

              {/* Balance and Required Information */}
              <div className="bg-crypto-dark rounded border border-gray-700 p-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Available</span>
                    <span className="text-orange-500 font-medium">
                      {balanceData ? parseFloat(balanceData.free || '0').toFixed(3) : '0.000'} USDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Required</span>
                    <span className="text-white font-medium">
                      {(() => {
                        const baseOrder = parseFloat(config.baseOrderSize) || 0;
                        const safetyOrderBase = parseFloat(config.safetyOrderSize) || 0;
                        const multiplier = config.safetyOrderSizeMultiplier[0] || 1.5;
                        const maxSafetyOrders = parseInt(config.maxSafetyOrders) || 5;
                        const activeSafetyOrders = parseInt(config.activeSafetyOrders) || maxSafetyOrders;
                        
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
              </div>
            </div>
          )}
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
                <Label className="text-sm text-gray-400 mb-3 block">Multipliers</Label>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm text-gray-400">Price Deviation</Label>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500 w-8">{config.priceDeviationMultiplier[0]}x</span>
                    </div>
                  </div>
                  <Slider
                    value={[config.priceDeviationMultiplier[0]]}
                    onValueChange={(value) => setConfig(prev => ({
                      ...prev,
                      priceDeviationMultiplier: [value[0]]
                    }))}
                    max={10}
                    min={1}
                    step={0.1}
                    className="w-full"
                  />
                  
                  <div className="flex justify-between items-center">
                    <Label className="text-sm text-gray-400">Safety Order Size</Label>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500 w-8">{config.safetyOrderSizeMultiplier[0]}x</span>
                    </div>
                  </div>
                  <Slider
                    value={[config.safetyOrderSizeMultiplier[0]]}
                    onValueChange={(value) => setConfig(prev => ({
                      ...prev,
                      safetyOrderSizeMultiplier: [value[0]]
                    }))}
                    max={10}
                    min={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
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
          <button
            onClick={() => setRiskManagementOpen(!riskManagementOpen)}
            className="flex items-center justify-between w-full text-sm text-gray-400 hover:text-white"
          >
            <div className="flex items-center space-x-1">
              <span>4. Risk Management</span>
            </div>
            {riskManagementOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {riskManagementOpen && (
            <div className="space-y-3 pl-4 border-l-2 border-gray-700">
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
          )}
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
      </div>
    </div>
  );
}