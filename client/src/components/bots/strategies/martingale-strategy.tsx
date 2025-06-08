import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ChevronUp, ChevronDown, Info } from "lucide-react";

interface MartingaleStrategyProps {
  className?: string;
  selectedSymbol: string;
}

export function MartingaleStrategy({ className, selectedSymbol }: MartingaleStrategyProps) {
  const [localDirection, setLocalDirection] = useState<"long" | "short">("long");
  const [config, setConfig] = useState({
    // Price Settings
    priceDeviation: "1",
    takeProfit: "1.5",
    takeProfitType: "fix",
    trailingProfit: "0.5",
    
    // Investment
    baseOrderSize: "7.5",
    safetyOrderSize: "7.5",
    maxSafetyOrders: "8",
    activeSafetyOrdersEnabled: false,
    activeSafetyOrders: "1",
    
    // Available
    available: "0.000",
    totalInvestment: "--",
    
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

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const baseCurrency = selectedSymbol.replace('USDT', '');

  return (
    <div className={`space-y-4 ${className}`}>
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
              <span className="text-sm text-gray-400">≥</span>
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
              <span className="text-sm text-gray-400">≥</span>
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
                  <Input
                    value={config.activeSafetyOrders}
                    onChange={(e) => {
                      const value = e.target.value;
                      const maxValue = parseInt(config.maxSafetyOrders) || 8;
                      const numValue = parseInt(value) || 1;
                      if (numValue >= 1 && numValue <= maxValue) {
                        handleInputChange('activeSafetyOrders', value);
                      }
                    }}
                    className="w-12 h-6 bg-crypto-darker border-gray-600 text-white text-xs text-center"
                    min="1"
                    max={config.maxSafetyOrders}
                    type="number"
                  />
                  <span className="text-xs text-gray-500">/ {config.maxSafetyOrders}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <div className="flex items-center space-x-1">
            <span className="text-gray-400">Available</span>
            <span className="text-orange-500 font-medium">{config.available} USDT</span>
            <Info className="w-3 h-3 text-gray-400" />
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Total Investment</span>
          <span className="text-gray-400">{config.totalInvestment} USDT</span>
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
    </div>
  );
}