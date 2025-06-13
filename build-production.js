#!/usr/bin/env node

/**
 * Optimized production build script for Replit deployment
 * Handles memory constraints and build timeouts
 */

import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';

console.log('🚀 Starting optimized production build...');

// Clean previous build
if (existsSync('dist')) {
  console.log('🧹 Cleaning previous build...');
  rmSync('dist', { recursive: true, force: true });
}

// Build client with increased memory and timeout handling
console.log('📦 Building client (frontend)...');
const clientBuild = spawn('node', [
  '--max-old-space-size=4096',
  './node_modules/.bin/vite',
  'build',
  '--mode', 'production'
], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' }
});

clientBuild.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ Client build failed');
    process.exit(1);
  }
  
  console.log('✅ Client build completed');
  console.log('🔧 Building server...');
  
  // Build server
  const serverBuild = spawn('./node_modules/.bin/esbuild', [
    'server/index.ts',
    '--platform=node',
    '--packages=external',
    '--bundle',
    '--format=esm',
    '--outdir=dist',
    '--minify'
  ], {
    stdio: 'inherit'
  });
  
  serverBuild.on('close', (serverCode) => {
    if (serverCode !== 0) {
      console.error('❌ Server build failed');
      process.exit(1);
    }
    
    console.log('✅ Server build completed');
    console.log('🎉 Production build successful!');
    console.log('');
    console.log('To start production server:');
    console.log('NODE_ENV=production node dist/index.js');
  });
});

// Handle timeout
setTimeout(() => {
  console.error('❌ Build timeout after 10 minutes');
  process.exit(1);
}, 10 * 60 * 1000);