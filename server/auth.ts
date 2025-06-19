import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

const JWT_SECRET = process.env.JWT_SECRET || 'crypto-bot-secret-key-2024';
const JWT_EXPIRES_IN = '7d';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
  };
}

export const generateToken = (userId: number, username: string, email: string): string => {
  return jwt.sign(
    { id: userId, username, email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.log(`[AUTH] 🔐 ===== AUTHENTICATION CHECK =====`);
  console.log(`[AUTH] 🔐 Request method: ${req.method}`);
  console.log(`[AUTH] 🔐 Request URL: ${req.url}`);
  
  const authHeader = req.headers['authorization'];
  console.log(`[AUTH] 🔐 Auth header present: ${!!authHeader}`);
  console.log(`[AUTH] 🔐 Auth header value: ${authHeader ? authHeader.substring(0, 20) + '...' : 'none'}`);
  
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  console.log(`[AUTH] 🔐 Token extracted: ${!!token}`);

  if (!token) {
    console.log(`[AUTH] ❌ No token provided`);
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  console.log(`[AUTH] 🔐 Token decoded successfully: ${!!decoded}`);
  console.log(`[AUTH] 🔐 Decoded user ID: ${decoded?.id}`);
  
  if (!decoded) {
    console.log(`[AUTH] ❌ Invalid token`);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await storage.getUser(decoded.id);
    console.log(`[AUTH] 🔐 User found in database: ${!!user}`);
    console.log(`[AUTH] 🔐 User active: ${user?.isActive}`);
    
    if (!user || !user.isActive) {
      console.log(`[AUTH] ❌ User not found or inactive`);
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    console.log(`[AUTH] ✅ Authentication successful for user: ${user.username} (ID: ${user.id})`);
    next();
  } catch (error) {
    console.error(`[AUTH] 💥 Authentication error:`, error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireAuth = authenticateToken;