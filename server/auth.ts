import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
  };
}

export async function hashPassword(password: string): Promise<string> {
  try {
    return await bcrypt.hash(password, SALT_ROUNDS);
  } catch (error) {
    console.error('[AUTH] Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('[AUTH] Error comparing password:', error);
    throw new Error('Failed to verify password');
  }
}

export function generateToken(userId: number, username: string, email: string): string {
  try {
    return jwt.sign(
      { id: userId, username, email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  } catch (error) {
    console.error('[AUTH] Error generating token:', error);
    throw new Error('Failed to generate authentication token');
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      (req as AuthenticatedRequest).user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email
      };
      next();
    } catch (jwtError) {
      console.error('[AUTH] Invalid token:', jwtError);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('[AUTH] Unexpected auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}