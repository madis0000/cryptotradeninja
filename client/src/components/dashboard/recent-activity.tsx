import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RecentActivity() {
  return (
    <Card className="bg-crypto-dark border-gray-800">
      <CardHeader>
        <CardTitle className="text-white">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-history text-crypto-accent text-2xl"></i>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Coming Soon</h3>
          <p className="text-crypto-light">This section will be redesigned</p>
        </div>
      </CardContent>
    </Card>
  );
}
