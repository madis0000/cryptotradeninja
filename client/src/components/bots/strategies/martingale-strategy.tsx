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
}

export function MartingaleStrategy({ className, selectedSymbol }: MartingaleStrategyProps) {
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
      {/* Info Message */}
      <div className="text-xs text-gray-500 leading-relaxed">
        The default parameters proposed herein shall not be c... 
        <button className="text-orange-400 hover:text-orange-300 ml-1">More</button>
      </div>

      {/* Price Settings */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">1. Price Settings</h4>
        
        <div className="space-y-3">
          <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-600">Price Deviation</Label>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">{config.priceDeviation}</span>
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-600">Take Profit</Label>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">{config.takeProfit}</span>
              <span className="text-sm text-gray-500">%</span>
              <Select defaultValue="fix">
                <SelectTrigger className="w-16 h-7 border-gray-300 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fix">Fix</SelectItem>
                  <SelectItem value="variable">Variable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Investment */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">2. Investment</h4>
        
        <div className="space-y-3">
          <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-600">Base Order Size</Label>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">≥</span>
              <span className="text-sm font-medium">{config.baseOrderSize}</span>
              <span className="text-sm text-gray-500">USDT</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-600">DCA Order Size</Label>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">≥</span>
              <span className="text-sm font-medium">{config.dcaOrderSize}</span>
              <span className="text-sm text-gray-500">USDT</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
            <Label className="text-sm text-gray-600">Max DCA Orders</Label>
            <span className="text-sm font-medium">{config.maxDcaOrders}</span>
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <div className="flex items-center space-x-1">
            <span className="text-gray-600">Available</span>
            <span className="text-orange-500 font-medium">{config.available} USDT</span>
            <Info className="w-3 h-3 text-gray-400" />
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total Investment</span>
          <span className="text-gray-500">{config.totalInvestment} USDT</span>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="space-y-3">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-800"
        >
          <div className="flex items-center space-x-1">
            <span>Advanced (Optional)</span>
            <Info className="w-3 h-3 text-gray-400" />
          </div>
          {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {advancedOpen && (
          <div className="space-y-3 pl-4 border-l-2 border-gray-200">
            <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-600">Trigger Price</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={config.triggerPrice}
                  onChange={(e) => handleInputChange('triggerPrice', e.target.value)}
                  className="w-20 h-7 text-xs text-right border-gray-300"
                  placeholder=""
                />
                <span className="text-sm text-gray-500">USDT</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-600">Price deviation multiplier</Label>
              <span className="text-sm text-gray-500">{config.priceDeviationMultiplier}</span>
            </div>

            <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-600">DCA order size multiplier</Label>
              <span className="text-sm text-gray-500">{config.dcaOrderSizeMultiplier}</span>
            </div>

            <div className="bg-gray-50 rounded border p-3 flex justify-between items-center">
              <Label className="text-sm text-gray-600">Cooldown between rounds</Label>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{config.cooldownBetweenRounds}</span>
                <span className="text-sm text-gray-500">Sec</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Price Range */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-600">Price Range</h4>
        <div className="grid grid-cols-2 gap-3">
          <Input
            value={config.lowerPrice}
            onChange={(e) => handleInputChange('lowerPrice', e.target.value)}
            placeholder="Lower"
            className="h-8 text-sm border-gray-300"
          />
          <Input
            value={config.upperPrice}
            onChange={(e) => handleInputChange('upperPrice', e.target.value)}
            placeholder="Upper"
            className="h-8 text-sm border-gray-300"
          />
        </div>
      </div>
    </div>
  );
}