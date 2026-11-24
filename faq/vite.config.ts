import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { linkPreviewsDev, linkPreviewsMeta } from './link-previews/server'

const linkPreviews = {
  root: fileURLToPath(new URL('.', import.meta.url)),
  siteUrl: 'https://joeylovespizza.github.io/AIWG',
  siteName: 'AI at Wolf Greenfield',
  title: 'Frequently asked questions',
  description: 'We answer common questions about how Wolf Greenfield uses artificial intelligence (AI) in our legal work.',
}

export default defineConfig({
  // linkPreviewsDev exists only under `npm run dev` (the Link Previews tool
  // at /link-previews/ and its endpoints); linkPreviewsMeta writes the share
  // tags into index.html in dev and in the build.
  plugins: [react(), linkPreviewsDev(linkPreviews), linkPreviewsMeta(linkPreviews)],
  // Relative asset paths, so the built site works from any folder or host path.
  base: './',
  server: { port: 5183 },
})
