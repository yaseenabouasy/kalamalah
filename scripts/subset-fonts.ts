#!/usr/bin/env bun
/**
 * Font Subsetting Script
 * Downloads and subsets OFL fonts for web use
 * Run: bun run scripts/subset-fonts.ts
 */

import { $ } from 'bun';
import { existsSync, mkdirSync } from 'fs';

const FONTS_DIR = 'public/fonts';

async function run() {
  if (!existsSync(FONTS_DIR)) {
    mkdirSync(FONTS_DIR, { recursive: true });
  }

  console.log('📥 Downloading and subsetting fonts...');

  // 1. Inter Variable (Latin, ~45 KB)
  console.log('\n1. Inter Variable...');
  await $`wget -q "https://github.com/rsms/inter/releases/download/v4.0/InterVariable.ttf" -O ${FONTS_DIR}/InterVariable.ttf`;
  await $`pyftsubset ${FONTS_DIR}/InterVariable.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122" --flavor=woff2 --output-file=${FONTS_DIR}/Inter-var-latin.woff2`;

  // 2. Tajawal (Arabic)
  console.log('\n2. Tajawal...');
  if (existsSync(`${FONTS_DIR}/Tajawal-Regular.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Tajawal-Regular.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Tajawal-subset.woff2`;
  }
  if (existsSync(`${FONTS_DIR}/Tajawal-Bold.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Tajawal-Bold.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Tajawal-Bold-subset.woff2`;
  }

  // 3. Cairo Variable (Arabic + Latin, ~80 KB)
  console.log('\n3. Cairo Variable...');
  await $`wget -q "https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt,wght%5D.ttf" -O ${FONTS_DIR}/Cairo-VF.ttf`;
  await $`pyftsubset ${FONTS_DIR}/Cairo-VF.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+2000-206F,U+20AC,U+2122" --flavor=woff2 --output-file=${FONTS_DIR}/Cairo-subset.woff2`;

  // 4. IBM Plex Sans Arabic (fallback)
  console.log('\n4. IBM Plex Sans Arabic...');
  await $`wget -q "https://github.com/IBM/plex/raw/master/Arabic/fonts/woff2/IBMPlexSansArabic-VF.woff2" -O ${FONTS_DIR}/IBMPlexSansArabic-VF.woff2`;

  // 5. Quran fonts subset
  console.log('\n5. Quran fonts...');
  if (existsSync(`${FONTS_DIR}/UthmanicHafs_V22.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/UthmanicHafs_V22.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/UthmanicHafs-subset.woff2`;
  }
  if (existsSync(`${FONTS_DIR}/Kitab-Regular.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Kitab-Regular.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Kitab-subset.woff2`;
  }
  if (existsSync(`${FONTS_DIR}/Amiri-Regular.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/Amiri-Regular.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Amiri-subset.woff2`;
  }
  if (existsSync(`${FONTS_DIR}/KFGQPCNastaleeq-Regular.ttf`)) {
    await $`pyftsubset ${FONTS_DIR}/KFGQPCNastaleeq-Regular.ttf --unicodes="U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF" --flavor=woff2 --output-file=${FONTS_DIR}/Nastaleeq-subset.woff2`;
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

  // 7. Clean up TTF sources
  console.log('\n7. Cleaning up...');
  await $`rm -f ${FONTS_DIR}/*.ttf`;

  console.log('\n✅ Font subsetting complete!');
  console.log('Run `bun run build:static` to rebuild with new fonts.');
}

run().catch((err) => {
  console.error('❌ Font subsetting failed:', err);
  process.exit(1);
});