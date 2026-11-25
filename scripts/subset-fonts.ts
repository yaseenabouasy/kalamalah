#!/usr/bin/env bun
/**
 * Font Subsetting Script
 * Subsets local TTF fonts to WOFF2 for web use
 * Run: bun run scripts/subset-fonts.ts
 * 
 * Note: For Inter and Cairo, download TTFs manually from:
 * - Inter: https://github.com/rsms/inter/releases (Inter-Variable.ttf)
 * - Cairo: https://github.com/google/fonts/tree/main/ofl/cairo
 * - IBM Plex Sans Arabic: https://github.com/IBM/plex/tree/master/Arabic/fonts/woff2
 */

import { $ } from 'bun';
import { existsSync, mkdirSync } from 'fs';

const FONTS_DIR = 'public/fonts';

async function run() {
  if (!existsSync(FONTS_DIR)) {
    mkdirSync(FONTS_DIR, { recursive: true });
  }

  console.log('🔧 Subsetting local fonts...');

  // 1. Kitab (Arabic) - subset from local TTF
  console.log('\n1. Kitab...');
  if (existsSync(`${FONTS_DIR}/Kitab-Regular.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Kitab-Regular.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Kitab-subset.woff2`;
    console.log('  ✓ Kitab-subset.woff2');
  }
  if (existsSync(`${FONTS_DIR}/Kitab-Bold.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Kitab-Bold.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Kitab-Bold-subset.woff2`;
    console.log('  ✓ Kitab-Bold-subset.woff2');
  }

  // 2. Amiri (Arabic) - subset from local TTF
  console.log('\n2. Amiri...');
  if (existsSync(`${FONTS_DIR}/Amiri-Regular.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Amiri-Regular.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Amiri-subset.woff2`;
    console.log('  ✓ Amiri-subset.woff2');
  }

  // 3. UthmanicHafs - already have WOFF2, just copy/rename
  console.log('\n3. UthmanicHafs...');
  if (existsSync(`${FONTS_DIR}/UthmanicHafs_V22.woff2`)) {
    await $`cp ${FONTS_DIR}/UthmanicHafs_V22.woff2 ${FONTS_DIR}/UthmanicHafs-subset.woff2`;
    console.log('  ✓ UthmanicHafs-subset.woff2 (copied)');
  }

  // 4. Nastaleeq - already have WOFF2
  console.log('\n4. Nastaleeq...');
  if (existsSync(`${FONTS_DIR}/KFGQPCNastaleeq-Regular.woff2`)) {
    await $`cp ${FONTS_DIR}/KFGQPCNastaleeq-Regular.woff2 ${FONTS_DIR}/Nastaleeq-subset.woff2`;
    console.log('  ✓ Nastaleeq-subset.woff2 (copied)');
  }

  // 5. Tajawal - check for local TTFs
  console.log('\n5. Tajawal...');
  if (existsSync(`${FONTS_DIR}/Tajawal-Regular.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Tajawal-Regular.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Tajawal-subset.woff2`;
    console.log('  ✓ Tajawal-subset.woff2');
  }
  if (existsSync(`${FONTS_DIR}/Tajawal-Bold.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Tajawal-Bold.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Tajawal-Bold-subset.woff2`;
    console.log('  ✓ Tajawal-Bold-subset.woff2');
  }

  // 6. Remove Apple proprietary fonts
  console.log('\n6. Removing Apple proprietary fonts...');
  const appleFonts = [
    'SF-Pro-Display-Regular.woff2',
    'SF-Pro-Display-Bold.woff2',
    'sfarabic.woff2',
  ];
  for (const f of appleFonts) {
    const path = `${FONTS_DIR}/${f}`;
    if (existsSync(path)) {
      await $`rm ${path}`;
      console.log(`  Removed ${f}`);
    }
  }

  // 7. Clean up TTF sources (keep only WOFF2)
  console.log('\n7. Cleaning up TTFs...');
  await $`rm -f ${FONTS_DIR}/*.ttf`;

  console.log('\n✅ Font subsetting complete!');
  console.log('For Inter and Cairo: download TTFs manually and run pyftsubset, or use Google Fonts CDN.');
  console.log('Run `bun run build:static` to rebuild with new fonts.');
}

run().catch((err) => {
  console.error('❌ Font subsetting failed:', err);
  process.exit(1);
});