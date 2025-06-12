import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Download, RefreshCw, Trash2, Eye, Clock, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BotLogData {
  botId: number;
  tradingPair: string;
  logFilePath: string;
  totalLines: number;
  logs: string[];
}

interface SystemLogData {
  totalLines: number;
  logs: string[];
}

export default function BotLogsPage() {
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const [logLines, setLogLines] = useState(100);
  const [viewMode, setViewMode] = useState<'bot' | 'system'>('bot');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available bots
  const { data: bots } = useQuery<any[]>({
    queryKey: ["/api/bots"],
  });

  // Fetch bot logs
  const { data: botLogs, isLoading: botLogsLoading, refetch: refetchBotLogs } = useQuery<BotLogData>({
    queryKey: [`/api/bot-logs/${selectedBotId}?lines=${logLines}`],
    enabled: viewMode === 'bot' && selectedBotId !== null,
  });

  // Fetch system logs
  const { data: systemLogs, isLoading: systemLogsLoading, refetch: refetchSystemLogs } = useQuery<SystemLogData>({
    queryKey: [`/api/system-logs?lines=${logLines}`],
    enabled: viewMode === 'system',
  });

  // Clear bot logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async (botId: number) => {
      return apiRequest(`/api/bot-logs/${botId}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Bot logs cleared successfully"
      });
      refetchBotLogs();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear bot logs",
        variant: "destructive"
      });
    }
  });

  // Download bot logs
  const downloadBotLogs = async (botId: number) => {
    try {
      // Get the authentication token from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`/api/bot-logs/${botId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to download logs');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bot_${botId}_logs.log`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Bot logs downloaded successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download bot logs",
        variant: "destructive"
      });
    }
  };

  const formatLogEntry = (log: string) => {
    // Extract timestamp and content
    const match = log.match(/^(\[[\d-]+\s[\d:]+\])\s*(.*)$/);
    if (!match) return { timestamp: '', content: log, level: 'info' };
    
    const [, timestamp, content] = match;
    
    // Determine log level from content
    let level = 'info';
    if (content.includes('ERROR') || content.includes('❌')) level = 'error';
    else if (content.includes('WARN') || content.includes('⚠️')) level = 'warning';
    else if (content.includes('SUCCESS') || content.includes('✅')) level = 'success';
    else if (content.includes('STRATEGY') || content.includes('🚀')) level = 'strategy';
    
    return { timestamp, content, level };
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'strategy': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const activeBots = bots?.filter(bot => bot.isActive) || [];
  const selectedBot = bots?.find(bot => bot.id === selectedBotId);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bot Logs & Analytics</h1>
          <p className="text-muted-foreground">
            View detailed strategy operations, order placements, and system events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Live Logging
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Log Viewer
            </CardTitle>
            <CardDescription>
              Configure log viewing options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">View Mode</label>
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'bot' | 'system')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bot">Bot Logs</SelectItem>
                  <SelectItem value="system">System Logs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {viewMode === 'bot' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Bot</label>
                <Select 
                  value={selectedBotId?.toString() || ""} 
                  onValueChange={(value) => setSelectedBotId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a bot" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBots.map((bot) => (
                      <SelectItem key={bot.id} value={bot.id.toString()}>
                        {bot.name} ({bot.tradingPair})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Log Lines</label>
              <Select value={logLines.toString()} onValueChange={(value) => setLogLines(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">Last 50 lines</SelectItem>
                  <SelectItem value="100">Last 100 lines</SelectItem>
                  <SelectItem value="200">Last 200 lines</SelectItem>
                  <SelectItem value="500">Last 500 lines</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Button 
                onClick={() => viewMode === 'bot' ? refetchBotLogs() : refetchSystemLogs()}
                className="w-full"
                size="sm"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh Logs
              </Button>

              {viewMode === 'bot' && selectedBotId && (
                <>
                  <Button 
                    onClick={() => downloadBotLogs(selectedBotId)}
                    variant="outline"
                    className="w-full"
                    size="sm"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                  
                  <Button 
                    onClick={() => clearLogsMutation.mutate(selectedBotId)}
                    variant="destructive"
                    className="w-full"
                    size="sm"
                    disabled={clearLogsMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear Logs
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Log Display */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {viewMode === 'bot' && selectedBot ? (
                <>Bot Logs - {selectedBot.name} ({selectedBot.tradingPair})</>
              ) : viewMode === 'system' ? (
                'System Logs'
              ) : (
                'Select a bot to view logs'
              )}
            </CardTitle>
            <CardDescription>
              {viewMode === 'bot' && botLogs ? (
                `Showing ${botLogs.logs.length} of ${botLogs.totalLines} log entries`
              ) : viewMode === 'system' && systemLogs ? (
                `Showing ${systemLogs.logs.length} of ${systemLogs.totalLines} log entries`
              ) : (
                'Real-time strategy operations and order tracking'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] w-full rounded border">
              <div className="p-4 space-y-1">
                {viewMode === 'bot' && botLogsLoading && (
                  <div className="text-center text-muted-foreground py-8">
                    Loading bot logs...
                  </div>
                )}
                
                {viewMode === 'system' && systemLogsLoading && (
                  <div className="text-center text-muted-foreground py-8">
                    Loading system logs...
                  </div>
                )}

                {viewMode === 'bot' && !selectedBotId && (
                  <div className="text-center text-muted-foreground py-8">
                    Please select a bot to view its logs
                  </div>
                )}

                {viewMode === 'bot' && selectedBotId && botLogs && botLogs.logs.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No logs found for this bot
                  </div>
                )}

                {viewMode === 'system' && systemLogs && systemLogs.logs.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No system logs found
                  </div>
                )}

                {/* Bot Logs */}
                {viewMode === 'bot' && botLogs?.logs && (
                  <pre className="text-xs font-mono whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed">
                    {botLogs.logs.join('\n')}
                  </pre>
                )}

                {/* System Logs */}
                {viewMode === 'system' && systemLogs?.logs && (
                  <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">
                    {systemLogs.logs.join('\n')}
                  </pre>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}