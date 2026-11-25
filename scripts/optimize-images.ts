#!/usr/bin/env bun
/**
 * Image Optimization Script
 * Converts images to AVIF/WebP with proper sizes
 * Run: bun run scripts/optimize-images.ts
 */

import { $ } from 'bun';
import { existsSync } from 'fs';

async function run() {
  console.log('🖼️ Optimizing images...');

  // 1. Logo
  console.log('\n1. Logo...');
  if (existsSync('public/images/round-logo.png')) {
    await $`sharp public/images/round-logo.png -resize 64x64 -quality 50 -effort 9 public/images/round-logo-64.avif`;
    await $`sharp public/images/round-logo.png -resize 192x192 public/images/round-logo-192.webp`;
    await $`sharp public/images/round-logo.png -resize 512x512 public/images/round-logo-512.png`;
    console.log('  ✓ round-logo-64.avif, round-logo-192.webp, round-logo-512.png');
  }

  // 2. Posters (heavily blurred, low quality is fine)
  console.log('\n2. Posters...');
  if (existsSync('public/media/scenes/forest-poster.webp')) {
    await $`sharp public/media/scenes/forest-poster.webp -resize 640x360 -quality 30 -effort 9 public/media/scenes/forest-poster.avif`;
    console.log('  ✓ forest-poster.avif');
  }
  if (existsSync('public/media/scenes/rain-poster.webp')) {
    await $`sharp public/media/scenes/rain-poster.webp -resize 640x360 -quality 30 -effort 9 public/media/scenes/rain-poster.avif`;
    console.log('  ✓ rain-poster.avif');
  }

  // 3. OG cover (if exists)
  console.log('\n3. OG Cover...');
  if (existsSync('public/images/og-cover.jpg')) {
    await $`sharp public/images/og-cover.jpg -resize 1200x630 -quality 80 public/images/og-cover.avif`;
    await $`sharp public/images/og-cover.jpg -resize 1200x630 -quality 80 public/images/og-cover.webp`;
    console.log('  ✓ og-cover.avif, og-cover.webp');
  }

  // 4. Reciter avatars (if local files exist)
  console.log('\n4. Reciter avatars...');
  // This would process any local reciter images
  // For now, avatars come from API

  console.log('\n✅ Image optimization complete!');
  console.log('Run `bun run build:static` to rebuild with optimized images.');
}

run().catch((err) => {
  console.error('❌ Image optimization failed:', err);
  process.exit(1);
});