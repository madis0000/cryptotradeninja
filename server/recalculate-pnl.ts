import { storage } from './storage';
import { BotLoggerManager } from './bot-logger';

interface CyclePnLRecalculation {
  cycleId: number;
  botId: number;
  tradingPair: string;
  oldProfit: string;
  newProfit: number;
  totalInvested: number;
  totalReceived: number;
  correctionApplied: boolean;
  filledBuyOrders: number;
  filledSellOrders: number;
}

export class PnLRecalculator {
  
  /**
   * Recalculate P&L for all completed cycles using accurate calculation method
   */
  static async recalculateAllCompletedCycles(): Promise<CyclePnLRecalculation[]> {
    console.log(`[P&L RECALCULATOR] ===== STARTING P&L RECALCULATION FOR ALL COMPLETED CYCLES =====`);
    
    try {
      // Get all completed cycles
      const completedCycles = await this.getAllCompletedCycles();
      console.log(`[P&L RECALCULATOR] Found ${completedCycles.length} completed cycles to recalculate`);
      
      const recalculationResults: CyclePnLRecalculation[] = [];
      let correctedCount = 0;
      
      for (const cycle of completedCycles) {
        const result = await this.recalculateCyclePnL(cycle.id, cycle.bot_id, cycle.trading_pair, cycle.cycle_profit);
        if (result) {
          recalculationResults.push(result);
          if (result.correctionApplied) {
            correctedCount++;
          }
        }
      }
      
      // Log summary
      console.log(`[P&L RECALCULATOR] ===== RECALCULATION SUMMARY =====`);
      console.log(`[P&L RECALCULATOR] Total Cycles Processed: ${recalculationResults.length}`);
      console.log(`[P&L RECALCULATOR] Cycles Corrected: ${correctedCount}`);
      console.log(`[P&L RECALCULATOR] Cycles Already Accurate: ${recalculationResults.length - correctedCount}`);
      
      if (correctedCount > 0) {
        console.log(`[P&L RECALCULATOR] ===== CORRECTED CYCLES =====`);
        recalculationResults
          .filter(r => r.correctionApplied)
          .forEach(cycle => {
            console.log(`[P&L RECALCULATOR] Cycle ${cycle.cycleId} (${cycle.tradingPair}): ${cycle.oldProfit} → $${cycle.newProfit.toFixed(2)}`);
          });
      }
      
      return recalculationResults;
      
    } catch (error) {
      console.error(`[P&L RECALCULATOR] Error recalculating cycles:`, error);
      return [];
    }
  }
  
  /**
   * Recalculate P&L for a specific cycle using accurate method
   */
  static async recalculateCyclePnL(
    cycleId: number, 
    botId: number, 
    tradingPair: string, 
    currentProfit: string
  ): Promise<CyclePnLRecalculation | null> {
    try {
      console.log(`[P&L RECALCULATOR] Processing cycle ${cycleId} (${tradingPair})`);
      
      // Get all cycle orders
      const allOrders = await storage.getCycleOrders(cycleId);
      
      // Calculate actual total investment from filled buy orders
      const filledBuyOrders = allOrders.filter(ord => 
        (ord.orderType === 'base_order' || ord.orderType === 'safety_order') && 
        ord.side === 'BUY' && 
        ord.status === 'filled' &&
        ord.price && ord.quantity
      );
      
      const totalInvested = filledBuyOrders.reduce((sum, ord) => {
        return sum + (parseFloat(ord.quantity) * parseFloat(ord.price || '0'));
      }, 0);
      
      // Calculate actual total received from filled sell orders
      const filledSellOrders = allOrders.filter(ord => 
        ord.orderType === 'take_profit' && 
        ord.side === 'SELL' && 
        ord.status === 'filled' &&
        ord.price && ord.quantity
      );
      
      const totalReceived = filledSellOrders.reduce((sum, ord) => {
        return sum + (parseFloat(ord.quantity) * parseFloat(ord.price || '0'));
      }, 0);
      
      // Calculate correct profit
      const calculatedProfit = totalReceived - totalInvested;
      const oldProfit = parseFloat(currentProfit);
      const difference = Math.abs(calculatedProfit - oldProfit);
      const needsCorrection = difference > 0.01; // Allow for small rounding differences
      
      console.log(`[P&L RECALCULATOR]   Buy Orders: ${filledBuyOrders.length}, Invested: $${totalInvested.toFixed(2)}`);
      console.log(`[P&L RECALCULATOR]   Sell Orders: ${filledSellOrders.length}, Received: $${totalReceived.toFixed(2)}`);
      console.log(`[P&L RECALCULATOR]   Current P&L: $${oldProfit.toFixed(2)}, Calculated: $${calculatedProfit.toFixed(2)}`);
      console.log(`[P&L RECALCULATOR]   Difference: $${difference.toFixed(2)}, Needs Correction: ${needsCorrection}`);
      
      // Apply correction if needed
      if (needsCorrection) {
        await storage.updateBotCycle(cycleId, {
          cycleProfit: calculatedProfit.toString()
        });
        
        console.log(`[P&L RECALCULATOR] ✅ Updated cycle ${cycleId} P&L: ${currentProfit} → ${calculatedProfit.toFixed(2)}`);
        
        // Log the correction
        const logger = BotLoggerManager.getLogger(botId, tradingPair);
        logger.logCustom('INFO', 'P&L_CORRECTION', `Recalculated cycle ${cycleId} P&L from ${currentProfit} to ${calculatedProfit.toFixed(2)}`, {
          cycleId,
          oldProfit: currentProfit,
          newProfit: calculatedProfit,
          totalInvested,
          totalReceived,
          difference,
          filledBuyOrders: filledBuyOrders.length,
          filledSellOrders: filledSellOrders.length
        });
      }
      
      return {
        cycleId,
        botId,
        tradingPair,
        oldProfit: currentProfit,
        newProfit: calculatedProfit,
        totalInvested,
        totalReceived,
        correctionApplied: needsCorrection,
        filledBuyOrders: filledBuyOrders.length,
        filledSellOrders: filledSellOrders.length
      };
      
    } catch (error) {
      console.error(`[P&L RECALCULATOR] Error recalculating cycle ${cycleId}:`, error);
      return null;
    }
  }
  
  /**
   * Get all completed cycles from database
   */
  private static async getAllCompletedCycles(): Promise<any[]> {
    try {
      const query = `
        SELECT 
          bc.id,
          bc.bot_id,
          tb.trading_pair,
          bc.cycle_number,
          bc.cycle_profit,
          bc.total_invested,
          bc.status,
          bc.completed_at
        FROM bot_cycles bc
        JOIN trading_bots tb ON bc.bot_id = tb.id
        WHERE bc.status = 'completed'
        ORDER BY bc.completed_at DESC
      `;
      
      // Using direct database access since we need this specific query
      const { db } = await import('./db');
      const result = await db.execute(query);
      return result.rows || [];
      
    } catch (error) {
      console.error(`[P&L RECALCULATOR] Error fetching completed cycles:`, error);
      return [];
    }
  }
  
  /**
   * Generate a detailed P&L correction report
   */
  static async generateCorrectionReport(): Promise<void> {
    console.log(`[P&L RECALCULATOR] ===== GENERATING P&L CORRECTION REPORT =====`);
    
    const results = await this.recalculateAllCompletedCycles();
    
    if (results.length === 0) {
      console.log(`[P&L RECALCULATOR] No cycles found for correction report`);
      return;
    }
    
    // Group by trading pair for analysis
    const byTradingPair = results.reduce((acc, result) => {
      if (!acc[result.tradingPair]) {
        acc[result.tradingPair] = [];
      }
      acc[result.tradingPair].push(result);
      return acc;
    }, {} as Record<string, CyclePnLRecalculation[]>);
    
    // Generate report for each trading pair
    Object.entries(byTradingPair).forEach(([tradingPair, cycles]) => {
      const corrected = cycles.filter(c => c.correctionApplied);
      const totalPnL = cycles.reduce((sum, c) => sum + c.newProfit, 0);
      const totalInvested = cycles.reduce((sum, c) => sum + c.totalInvested, 0);
      
      console.log(`[P&L RECALCULATOR] === ${tradingPair} REPORT ===`);
      console.log(`[P&L RECALCULATOR]   Total Cycles: ${cycles.length}`);
      console.log(`[P&L RECALCULATOR]   Corrected Cycles: ${corrected.length}`);
      console.log(`[P&L RECALCULATOR]   Total P&L: $${totalPnL.toFixed(2)}`);
      console.log(`[P&L RECALCULATOR]   Total Invested: $${totalInvested.toFixed(2)}`);
      console.log(`[P&L RECALCULATOR]   ROI: ${totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) : 0}%`);
      
      if (corrected.length > 0) {
        console.log(`[P&L RECALCULATOR]   Corrected Cycles Details:`);
        corrected.forEach(c => {
          console.log(`[P&L RECALCULATOR]     Cycle ${c.cycleId}: ${c.oldProfit} → $${c.newProfit.toFixed(2)}`);
        });
      }
    });
    
    console.log(`[P&L RECALCULATOR] ===== CORRECTION REPORT COMPLETE =====`);
  }
}