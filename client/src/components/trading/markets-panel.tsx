import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface MarketsPanelProps {
  className?: string;
}

export function MarketsPanel({ className }: MarketsPanelProps) {
  const [selectedQuote, setSelectedQuote] = useState("USDT");
  const [searchTerm, setSearchTerm] = useState("");

  const quotes = ["USDT", "USDC", "BTC"];

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
        <CardContent className="p-0 h-[calc(100%-120px)]">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl text-gray-500 mb-4">
                <i className="fas fa-coins"></i>
              </div>
              <p className="text-gray-500 text-sm">Markets List</p>
              <p className="text-gray-600 text-xs">Quote: {selectedQuote}</p>
              <p className="text-gray-600 text-xs">Search: {searchTerm || "All"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}