import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Three.js ships as one lazily loaded chunk, so allow it past the default size warning.
export default defineConfig({ plugins: [react()], build: { chunkSizeWarningLimit: 700 } });
