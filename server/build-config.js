/**
 * Build configuration for production deployment
 * This script ensures proper esbuild configuration for Replit deployment
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buildConfig = {
  entryPoints: [join(__dirname, 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outdir: join(__dirname, '..', 'dist'),
  packages: 'external',
  external: [
    'pg-native',
    'canvas',
    'sharp',
    '@replit/vite-plugin-cartographer',
    '@replit/vite-plugin-runtime-error-modal'
  ],
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  minify: true,
  sourcemap: false,
  treeShaking: true,
  logLevel: 'info'
};

try {
  await build(buildConfig);
  console.log('✅ Server build completed successfully');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}