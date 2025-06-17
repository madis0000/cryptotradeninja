import { Card, CardContent } from "@/components/ui/card";

export default function PortfolioPage() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
        <Card className="bg-crypto-dark border-gray-800 w-full max-w-2xl">
          <CardContent className="p-12 text-center">
            <div className="w-24 h-24 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-tools text-crypto-accent text-3xl"></i>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Portfolio Under Construction</h1>
            <p className="text-crypto-light text-lg mb-6">
              We're working hard to bring you an amazing portfolio experience.
            </p>
            <div className="flex items-center justify-center space-x-2 text-crypto-accent">
              <div className="w-2 h-2 bg-crypto-accent rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-crypto-accent rounded-full animate-bounce delay-75"></div>
              <div className="w-2 h-2 bg-crypto-accent rounded-full animate-bounce delay-150"></div>
            </div>
            <p className="text-sm text-crypto-light mt-6">
              Check back soon for portfolio tracking, analytics, and more!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
