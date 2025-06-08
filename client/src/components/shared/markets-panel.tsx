import { useState } from "react";
import { Input } from "@/components/ui/input";

interface TradingPair {
  symbol: string;
  price: string;
  change: string;
  volume: string;
  changeType: "positive" | "negative";
}

interface MarketsPanelProps {
  className?: string;
  onSymbolSelect?: (symbol: string) => void;
  selectedSymbol?: string;
}

export function MarketsPanel({ className = "", onSymbolSelect, selectedSymbol }: MarketsPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Mock data for trading pairs
  const tradingPairs: TradingPair[] = [
    { symbol: "1INCHUSDT", price: "0.3317", change: "-6.15%", volume: "3.3M", changeType: "negative" },
    { symbol: "BTCUSDT", price: "106244.38", change: "+0.48%", volume: "1.2B", changeType: "positive" },
    { symbol: "ETHUSDT", price: "3847.12", change: "+2.15%", volume: "800M", changeType: "positive" },
    { symbol: "ICPUSDT", price: "5.635", change: "+9.58%", volume: "42M", changeType: "positive" },
    { symbol: "ADAUSDT", price: "0.8945", change: "-1.23%", volume: "156M", changeType: "negative" },
    { symbol: "DOGEUSDT", price: "0.3421", change: "+5.67%", volume: "89M", changeType: "positive" },
    { symbol: "SOLUSDT", price: "198.45", change: "+3.21%", volume: "234M", changeType: "positive" },
    { symbol: "AVAXUSDT", price: "38.92", change: "-2.11%", volume: "67M", changeType: "negative" },
    { symbol: "DOTUSDT", price: "7.234", change: "+1.89%", volume: "45M", changeType: "positive" },
    { symbol: "LINKUSDT", price: "23.45", change: "-0.95%", volume: "123M", changeType: "negative" },
    { symbol: "BNBUSDT", price: "695.23", change: "+1.34%", volume: "567M", changeType: "positive" },
    { symbol: "XRPUSDT", price: "2.156", change: "-2.87%", volume: "234M", changeType: "negative" },
  ];

  const filteredPairs = tradingPairs.filter(pair =>
    pair.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`bg-crypto-dark border-r border-gray-800 flex flex-col ${className}`}>
      {/* Market Search */}
      <div className="p-3 border-b border-gray-800">
        <Input
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-crypto-darker border-gray-700 text-white text-sm h-8"
        />
      </div>

      {/* Market Headers */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-400">
          <span>Pair</span>
          <span className="text-right">Last Price</span>
          <span className="text-right">24h Change</span>
          <span className="text-right">24h Volume</span>
        </div>
      </div>

      {/* Market List */}
      <div className="flex-1 overflow-y-auto">
        {filteredPairs.map((pair) => (
          <div
            key={pair.symbol}
            onClick={() => onSymbolSelect?.(pair.symbol)}
            className={`px-3 py-2 cursor-pointer hover:bg-gray-800/50 border-b border-gray-800/50 ${
              selectedSymbol === pair.symbol ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : ''
            }`}
          >
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-white font-medium truncate">{pair.symbol}</div>
              <div className="text-white text-right">{pair.price}</div>
              <div className={`text-right ${
                pair.changeType === 'positive' ? 'text-green-400' : 'text-red-400'
              }`}>
                {pair.change}
              </div>
              <div className="text-gray-400 text-right">{pair.volume}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}