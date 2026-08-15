import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // CRITICAL: Ensures asset paths work inside deep web portal iFrames
    build: {
        assetsDir: 'assets',
        outDir: 'dist',
        chunkSizeWarningLimit: 1000,
        assetsInlineLimit: 0, // Prevents converting audio files into base64 strings
    }
});