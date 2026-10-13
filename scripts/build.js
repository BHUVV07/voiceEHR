import { build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function buildAll() {
  console.log('🚀 [VoiceFlow AI] Starting production build...\n');

  // 1. Build Popup and Options HTML pages
  console.log('📦 Step 1/3: Building Popup & Options UI...');
  await build({
    root: rootDir,
    plugins: [react()],
    base: '',
    build: {
      outDir: path.resolve(rootDir, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.resolve(rootDir, 'popup.html'),
          options: path.resolve(rootDir, 'options.html'),
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  });

  // 2. Build Content Script as standalone IIFE
  console.log('\n📦 Step 2/3: Building Content Script (IIFE)...');
  await build({
    root: rootDir,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [react()],
    build: {
      outDir: path.resolve(rootDir, 'dist'),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(rootDir, 'src/content/content-script.ts'),
        name: 'VoiceFlowContent',
        formats: ['iife'],
        fileName: () => 'content.js',
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
  });

  // 3. Build Background Service Worker
  console.log('\n📦 Step 3/3: Building Background Service Worker (ESM)...');
  await build({
    root: rootDir,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      outDir: path.resolve(rootDir, 'dist'),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(rootDir, 'src/background/service-worker.ts'),
        formats: ['es'],
        fileName: () => 'background.js',
      },
    },
  });

  console.log('\n✅ [VoiceFlow AI] Extension build completed successfully!');
  console.log('👉 Unpacked extension is ready in: ./dist\n');
}

buildAll().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
