import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, Info } from "lucide-react";

interface MartingaleStrategyProps {
  className?: string;
  selectedSymbol: string;
  direction: "long" | "short";
}

export function MartingaleStrategy({ className, selectedSymbol, direction }: MartingaleStrategyProps) {
  const [config, setConfig] = useState({
    // Price Settings
    priceDeviation: "1",
    takeProfit: "1.5",
    
    // Investment
    baseOrderSize: "7.5",
    dcaOrderSize: "7.5",
    maxDcaOrders: "8",
    
    // Available
    available: "0.000",
    totalInvestment: "--",
    
    // Advanced Settings
    advancedEnabled: false,
    triggerPrice: "",
    priceDeviationMultiplier: "0.1 - 10",
    dcaOrderSizeMultiplier: "0.1 - 10",
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
              <Select defaultValue="fix">
                <SelectTrigger className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-crypto-darker border-gray-600">
                  <SelectItem value="fix" className="text-white hover:bg-gray-700">Fix</SelectItem>
                  <SelectItem value="variable" className="text-white hover:bg-gray-700">Variable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Investment */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">2. Investment</h4>
        
        <div className="space-y-3">
          <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-400">Base Order Size</Label>
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
            <Label className="text-sm text-gray-400">DCA Order Size</Label>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-400">≥</span>
              <Input
                value={config.dcaOrderSize}
                onChange={(e) => handleInputChange('dcaOrderSize', e.target.value)}
                className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
              />
              <span className="text-sm text-gray-400">USDT</span>
            </div>
          </div>

          <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-400">Max DCA Orders</Label>
            <Input
              value={config.maxDcaOrders}
              onChange={(e) => handleInputChange('maxDcaOrders', e.target.value)}
              className="w-16 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
            />
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
            <span>Advanced (Optional)</span>
            <Info className="w-3 h-3 text-gray-400" />
          </div>
          {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {advancedOpen && (
          <div className="space-y-3 pl-4 border-l-2 border-gray-700">
            <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-400">Trigger Price</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={config.triggerPrice}
                  onChange={(e) => handleInputChange('triggerPrice', e.target.value)}
                  className="w-20 h-7 bg-crypto-darker border-gray-600 text-white text-xs text-right"
                  placeholder=""
                />
                <span className="text-sm text-gray-400">USDT</span>
              </div>
            </div>

            <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-400">Price deviation multiplier</Label>
              <span className="text-sm text-gray-400">{config.priceDeviationMultiplier}</span>
            </div>

            <div className="bg-crypto-dark rounded border border-gray-700 p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-400">DCA order size multiplier</Label>
              <span className="text-sm text-gray-400">{config.dcaOrderSizeMultiplier}</span>
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

      {/* Price Range */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">Price Range</h4>
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
  );
}