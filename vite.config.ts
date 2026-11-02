import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Обычная сборка (`npm run build`) — папка dist/ для любого статического хостинга.
// Сборка в один файл (`npm run build:single`) — dist/index.html со всем внутри:
// удобно отправить файлом или опубликовать там, где нельзя загрузить папку.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
