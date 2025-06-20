import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  orderId?: string;
  price?: string;
  quantity?: string;
  errorMessage?: string;
}

interface MartingaleProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botId?: string; // Accept existing bot ID instead of creating new one
  botConfig: {
    symbol: string;
    baseOrderSize: string;
    safetyOrderSize: string;
    maxSafetyOrders: number;
    activeSafetyOrders?: number;
    takeProfit: string;
    priceDeviation: string;
    priceDeviationMultiplier: number;
  };
  onComplete?: (botId: string) => void;
  onError?: (error: string) => void;
}

export function MartingaleProgressDialog({
  open,
  onOpenChange,
  botId,
  botConfig,
  onComplete,
  onError
}: MartingaleProgressDialogProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<OrderStep[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize steps based on bot configuration
  useEffect(() => {
    if (open && botConfig) {
      const safetyOrderCount = botConfig.activeSafetyOrders || botConfig.maxSafetyOrders;
      
      const initialSteps: OrderStep[] = [
        {
          id: 'base_order',
          title: 'Base Order',
          description: `Market buy ${botConfig.baseOrderSize} USDT of ${botConfig.symbol}`,
          status: 'pending'
        },
        {
          id: 'take_profit',
          title: 'Take Profit Order',
          description: `Sell order at +${botConfig.takeProfit}% profit`,
          status: 'pending'
        }
      ];

      // Add safety orders
      for (let i = 1; i <= safetyOrderCount; i++) {
        const deviation = parseFloat(botConfig.priceDeviation) * Math.pow(botConfig.priceDeviationMultiplier, i - 1);
        initialSteps.push({
          id: `safety_order_${i}`,
          title: `Safety Order ${i}`,
          description: `Buy order at -${deviation.toFixed(1)}% from base price`,
          status: 'pending'
        });
      }

      setSteps(initialSteps);
      setCurrentStep(0);
      setOverallProgress(0);
      
      // Start the order placement process
      if (!isProcessing) {
        setIsProcessing(true);
        startOrderPlacement();
      }
    }
  }, [open, botConfig]);

  // Monitor order placement progress with enhanced polling
  const monitorOrderPlacementProgress = async (botId: string) => {
    try {
      // Poll for order status updates more frequently
      let attempts = 0;
      const maxAttempts = 30; // Increased timeout for comprehensive monitoring
      let baseOrderCompleted = false;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const token = localStorage.getItem('token');
        const cycleResponse = await fetch(`/api/bot-cycles/${botId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        // Handle bot deletion case - stop polling if bot doesn't exist
        if (cycleResponse.status === 404) {
          console.log(`[PROGRESS DIALOG] Bot ${botId} was deleted, stopping polling`);
          updateStepStatus('base_order', 'error', undefined, undefined, undefined, 'Bot was deleted during monitoring');
          onError?.('Bot was deleted during order placement monitoring');
          return;
        }
        
        if (cycleResponse.ok) {
          const cycles = await cycleResponse.json();
          if (cycles.length > 0) {
            const ordersResponse = await fetch(`/api/bot-orders/${botId}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
            
            // Handle bot deletion case for orders API
            if (ordersResponse.status === 404) {
              console.log(`[PROGRESS DIALOG] Bot ${botId} orders not found, bot was likely deleted`);
              updateStepStatus('base_order', 'error', undefined, undefined, undefined, 'Bot was deleted during monitoring');
              onError?.('Bot was deleted during order placement monitoring');
              return;
            }
            
            if (ordersResponse.ok) {
              const orders = await ordersResponse.json();
              const baseOrder = orders.find((order: any) => order.orderType === 'base_order');
              const takeProfitOrder = orders.find((order: any) => order.orderType === 'take_profit');
              const safetyOrders = orders.filter((order: any) => order.orderType === 'safety_order');
              
              // Check base order status
              if (baseOrder && !baseOrderCompleted) {
                if (baseOrder.status === 'filled') {
                  updateStepStatus('base_order', 'completed', baseOrder.exchangeOrderId, baseOrder.filledPrice || baseOrder.price, baseOrder.filledQuantity || baseOrder.quantity);
                  setCurrentStep(1);
                  setOverallProgress(25);
                  baseOrderCompleted = true;
                  updateStepStatus('take_profit', 'processing');
                } else if (baseOrder.status === 'failed') {
                  throw new Error(`Base order failed: ${baseOrder.errorMessage || 'Unknown error'}`);
                }
              }
              
              // Check take profit order status
              if (takeProfitOrder && baseOrderCompleted) {
                if (takeProfitOrder.status === 'placed') {
                  updateStepStatus('take_profit', 'completed', takeProfitOrder.exchangeOrderId, takeProfitOrder.price, takeProfitOrder.quantity);
                  setCurrentStep(2);
                  setOverallProgress(50);
                  updateStepStatus('safety_order_1', 'processing');
                } else if (takeProfitOrder.status === 'failed') {
                  updateStepStatus('take_profit', 'error', undefined, undefined, undefined, takeProfitOrder.errorMessage || 'Take profit order failed due to PRICE_FILTER');
                }
              }
              
              // Check safety orders status
              if (safetyOrders.length > 0) {
                let placedSafetyOrders = 0;
                safetyOrders.forEach((order: any, index: number) => {
                  const stepId = `safety_order_${index + 1}`;
                  if (order.status === 'placed') {
                    updateStepStatus(stepId, 'completed', order.exchangeOrderId, order.price, order.quantity);
                    placedSafetyOrders++;
                  } else if (order.status === 'failed') {
                    updateStepStatus(stepId, 'error', undefined, undefined, undefined, order.errorMessage || 'Safety order failed due to PRICE_FILTER');
                  } else if (order.status === 'pending') {
                    updateStepStatus(stepId, 'processing');
                  }
                });
                
                // Update overall progress based on placed safety orders
                if (placedSafetyOrders > 0) {
                  setCurrentStep(3);
                  setOverallProgress(75 + (placedSafetyOrders * 25 / safetyOrders.length));
                }
              }
              
              // Complete if we have successful base order
              if (baseOrderCompleted && attempts > 5) {
                setTimeout(() => {
                  onComplete?.(botId);
                }, 2000);
                return;
              }
            }
          }
        }
        
        attempts++;
      }
      
      if (!baseOrderCompleted) {
        throw new Error('Order placement timeout - unable to confirm base order status');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to monitor order placement';
      updateStepStatus('base_order', 'error', undefined, undefined, undefined, errorMessage);
      throw error;
    }
  };


  // Create bot and place orders via API
  const createBotWithOrders = async () => {
    updateStepStatus('base_order', 'processing');
    
    try {
      // Call the actual bot creation API
      const token = localStorage.getItem('token');
      const response = await fetch('/api/bots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: `Martingale Bot - ${botConfig.symbol}`,
          strategy: 'martingale',
          tradingPair: botConfig.symbol,
          direction: 'long',
          baseOrderAmount: botConfig.baseOrderSize,
          safetyOrderAmount: botConfig.safetyOrderSize,
          maxSafetyOrders: botConfig.maxSafetyOrders,
          activeSafetyOrdersEnabled: false,
          activeSafetyOrders: botConfig.activeSafetyOrders || 1,
          priceDeviation: botConfig.priceDeviation,
          takeProfitPercentage: botConfig.takeProfit,
          takeProfitType: 'fix',
          trailingProfitPercentage: '0.5',
          triggerType: 'market',
          priceDeviationMultiplier: botConfig.priceDeviationMultiplier.toString(),
          safetyOrderSizeMultiplier: '2.0',
          cooldownBetweenRounds: 60,
          exchangeId: 1 // Default to first exchange for now
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const bot = await response.json();
      console.log('[PROGRESS DIALOG] Bot created successfully:', bot);
      
      // Don't prematurely mark base order as completed - let monitoring detect it
      updateStepStatus('base_order', 'processing');
      
      // Monitor order placement progress with correct bot ID
      await monitorOrderPlacementProgress(bot.id.toString());
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create bot and place orders';
      updateStepStatus('base_order', 'error', undefined, undefined, undefined, errorMessage);
      throw error;
    }
  };

  // Start order placement process
  const startOrderPlacement = async () => {
    try {
      if (botId) {
        // Monitor existing bot instead of creating new one
        await monitorOrderPlacementProgress(botId);
      } else {
        throw new Error('No bot ID provided for monitoring');
      }
    } catch (error) {
      console.error('Error in bot monitoring:', error);
      const errorMessage = error instanceof Error ? error.message : 'Bot monitoring failed';
      updateStepStatus('base_order', 'error', undefined, undefined, undefined, errorMessage);
      onError?.(errorMessage);
    }
  };

  // Place take profit order (legacy function - now handled in monitoring)
  const placeTakeProfitOrder = async () => {
    updateStepStatus('take_profit', 'processing');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const takeProfitPrice = (5.993 * (1 + parseFloat(botConfig.takeProfit) / 100)).toFixed(3);
      updateStepStatus('take_profit', 'completed', 'TP-12345', takeProfitPrice, botConfig.baseOrderSize);
      setCurrentStep(2);
      setOverallProgress(66);
      
      // Place safety orders
      await placeSafetyOrders();
    } catch (error) {
      updateStepStatus('take_profit', 'error', undefined, undefined, undefined, 'Failed to place take profit order');
      throw error;
    }
  };

  // Place safety orders
  const placeSafetyOrders = async () => {
    const safetyOrderCount = botConfig.activeSafetyOrders || botConfig.maxSafetyOrders;
    
    for (let i = 1; i <= safetyOrderCount; i++) {
      const stepId = `safety_order_${i}`;
      updateStepStatus(stepId, 'processing');
      
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const deviation = parseFloat(botConfig.priceDeviation) * Math.pow(botConfig.priceDeviationMultiplier, i - 1);
        const orderPrice = (5.993 * (1 - deviation / 100)).toFixed(3);
        
        updateStepStatus(stepId, 'completed', `SO-${12345 + i}`, orderPrice, botConfig.safetyOrderSize);
        setCurrentStep(2 + i);
        setOverallProgress(66 + (34 * i / safetyOrderCount));
      } catch (error) {
        updateStepStatus(stepId, 'error', undefined, undefined, undefined, `Failed to place safety order ${i}`);
        throw error;
      }
    }
    
    // Complete the process
    setOverallProgress(100);
    setIsProcessing(false);
    
    // Notify completion after a short delay
    setTimeout(() => {
      onComplete?.('martingale-bot-123');
    }, 1000);
  };

  // Update step status
  const updateStepStatus = (stepId: string, status: OrderStep['status'], orderId?: string, price?: string, quantity?: string, errorMessage?: string) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, orderId, price, quantity, errorMessage }
        : step
    ));
  };

  const getStepIcon = (step: OrderStep, index: number) => {
    if (step.status === 'completed') {
      return <CheckCircle className="h-5 w-5 text-green-400" />;
    } else if (step.status === 'error') {
      return <AlertCircle className="h-5 w-5 text-red-400" />;
    } else if (step.status === 'processing') {
      return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />;
    } else {
      return <Circle className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-crypto-dark border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Creating Martingale Bot</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Overall Progress</span>
              <span className="text-white">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Steps List */}
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  step.status === 'completed' && "bg-green-900/20 border-green-700/50",
                  step.status === 'error' && "bg-red-900/20 border-red-700/50",
                  step.status === 'processing' && "bg-blue-900/20 border-blue-700/50",
                  step.status === 'pending' && "bg-gray-900/20 border-gray-700/50"
                )}
              >
                {getStepIcon(step, index)}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-white">{step.title}</h4>
                    {step.orderId && (
                      <span className="text-xs text-gray-400">#{step.orderId}</span>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-1">{step.description}</p>
                  
                  {step.price && step.quantity && (
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-green-400">Price: {step.price}</span>
                      <span className="text-blue-400">Qty: {step.quantity}</span>
                    </div>
                  )}
                  
                  {step.errorMessage && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-xs text-red-700 font-medium">Error Details:</p>
                      <p className="text-xs text-red-600 mt-1">{step.errorMessage}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}