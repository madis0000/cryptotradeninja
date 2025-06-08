import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

interface MarketsResponse {
  quote: string;
  count: number;
  markets: Market[];
}

interface MarketsPanelProps {
  className?: string;
}

export function MarketsPanel({ className }: MarketsPanelProps) {
  const [selectedQuote, setSelectedQuote] = useState("USDT");
  const [searchTerm, setSearchTerm] = useState("");

  const quotes = ["USDT", "USDC", "BTC"];

  const { data: marketsData, isLoading, error } = useQuery<MarketsResponse>({
    queryKey: ['/api/markets', { quote: selectedQuote }],
    queryFn: async () => {
      const response = await fetch(`/api/markets?quote=${selectedQuote}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch markets: ${response.status}`);
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const markets = marketsData?.markets || [];

  // Filter markets based on search term
  const filteredMarkets = markets.filter((market: Market) =>
    market.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    market.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={className}>
      <Card className="bg-crypto-dark border-0 h-full rounded-none">
        <CardHeader className="px-4 py-6">
          <div className="w-full">
            <input 
              type="text" 
              placeholder="Search markets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-crypto-accent"
            />
          </div>
          <div className="flex space-x-2 mt-3">
            {quotes.map((quote) => (
              <button
                key={quote}
                onClick={() => setSelectedQuote(quote)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  selectedQuote === quote
                    ? 'text-blue-400 border-blue-400 bg-blue-400/10'
                    : 'text-crypto-light border-gray-700 hover:text-blue-300 hover:border-blue-500'
                }`}
              >
                {quote}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-120px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-2xl text-gray-500 mb-2">
                  <i className="fas fa-spinner fa-spin"></i>
                </div>
                <p className="text-gray-500 text-sm">Loading markets...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-2xl text-red-500 mb-2">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <p className="text-red-400 text-sm">Failed to load markets</p>
              </div>
            </div>
          ) : (
            <div className="px-2">
              <div className="grid grid-cols-3 gap-1 py-2 px-2 text-xs font-medium text-gray-400 border-b border-gray-800">
                <span>Pair</span>
                <span className="text-right">24h Change</span>
                <span className="text-right">Price</span>
              </div>
              {filteredMarkets.map((market: Market) => (
                <div 
                  key={market.symbol}
                  className="grid grid-cols-3 gap-1 py-2 px-2 text-xs hover:bg-gray-800/50 cursor-pointer border-b border-gray-800/30"
                >
                  <div className="text-white">
                    <div className="font-medium">{market.baseAsset}/{market.quoteAsset}</div>
                  </div>
                  <div className="text-right text-gray-400">--</div>
                  <div className="text-right text-gray-400">--</div>
                </div>
              ))}
              {filteredMarkets.length === 0 && !isLoading && (
                <div className="flex items-center justify-center py-8">
                  <p className="text-gray-500 text-sm">No markets found</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}