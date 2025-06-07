import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface ChartRefreshButtonProps {
  onRefresh: () => void;
  isLoading?: boolean;
}

export function ChartRefreshButton({ onRefresh, isLoading = false }: ChartRefreshButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={isLoading}
      className="flex items-center gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      Refresh Chart
    </Button>
  );
}