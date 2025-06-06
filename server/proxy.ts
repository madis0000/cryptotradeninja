import { Request, Response } from 'express';
import https from 'https';
import http from 'http';

export class BinanceProxy {
  private static alternativeHosts = [
    'api.binance.cc',
    'api.binance.org', 
    'api.binancezh.com'
  ];

  static async proxyRequest(req: Request, res: Response, targetUrl: string) {
    const url = new URL(targetUrl);
    
    // Try alternative hosts
    for (const host of this.alternativeHosts) {
      try {
        url.hostname = host;
        const result = await this.makeRequest(url.toString(), req.headers);
        
        if (result.success) {
          res.status(result.status).json(result.data);
          return;
        }
      } catch (error) {
        console.log(`[PROXY] ${host} failed:`, error.message);
        continue;
      }
    }
    
    // All proxies failed
    res.status(451).json({
      error: 'All Binance endpoints restricted from this location',
      message: 'Consider deploying to production for different server location'
    });
  }

  private static makeRequest(url: string, headers: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;
      
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoTradingBot/1.0)',
          ...headers
        },
        timeout: 5000
      };

      const req = client.get(url, options, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve({
              success: !jsonData.code || jsonData.code !== 0,
              status: response.statusCode,
              data: jsonData
            });
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
}