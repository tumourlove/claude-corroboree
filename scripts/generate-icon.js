#!/usr/bin/env node
/**
 * Generate Claude Corroboree app icon — 16-bit SNES-style pixel art
 *
 * Design: A ceremonial gathering circle (corroboree) with a glowing campfire
 * at center, surrounded by seated figures, with a terminal cursor motif.
 * Earth tones: ochre, burnt orange, deep red, charcoal, with fire glow.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// === PALETTE (SNES-style limited palette) ===
const C = {
  _:  [0, 0, 0, 0],           // transparent
  K:  [20, 18, 28, 255],      // near-black (outline)
  D:  [45, 40, 50, 255],      // dark charcoal
  G:  [70, 62, 72, 255],      // mid gray-purple
  M:  [100, 88, 96, 255],     // medium gray
  O:  [204, 140, 50, 255],    // ochre/gold
  o:  [170, 110, 40, 255],    // dark ochre
  B:  [140, 60, 30, 255],     // burnt sienna
  R:  [180, 45, 35, 255],     // deep red
  r:  [130, 35, 28, 255],     // darker red
  F:  [255, 180, 50, 255],    // fire yellow
  f:  [240, 120, 40, 255],    // fire orange
  W:  [255, 230, 180, 255],   // warm white (fire core)
  E:  [100, 75, 55, 255],     // earth brown
  e:  [75, 55, 42, 255],      // dark earth
  S:  [55, 45, 60, 255],      // shadow
  T:  [80, 200, 120, 255],    // terminal green
  t:  [50, 140, 80, 255],     // dark terminal green
  C1: [255, 100, 60, 255],    // ember 1
  C2: [220, 80, 45, 255],     // ember 2
  H:  [140, 100, 70, 255],    // highlight brown
};

// 32x32 pixel art sprite
// Legend: _ transparent, K outline, D dark, G gray, O ochre, B burnt, R red
// F fire yellow, f fire orange, W fire core, E earth, T terminal green
const sprite = [
  // Row 0-1: top edge, mostly transparent
  '________________________________',
  '________________________________',
  // Row 2-3: hint of smoke/sparks above
  '______________Kf______________',
  '_____________KfFK_____________',
  // Row 4-5: more smoke wisps
  '____________Kf_fK____________',
  '___________K_fFf_K___________',
  // Row 6: terminal bracket motif top
  '_______KKK___fF___KKK________',
  '______KTtK__KfFK__KtTK_______',
  // Row 7-8: gathering circle top arc with figures
  '_____KTK_KKKKffKKKK_KTK______',
  '____KtK_KoOBKWFKBOoK_KtK_____',
  // Row 9-10: figures sitting around fire (top)
  '___KTK_KrRKKfWfKKRrK_KTK____',
  '___KK__KRrKfFWFfKrRK__KK____',
  // Row 11-12: fire blazing, figures on sides
  '__KoK__KBKKfFWFfKKBK__KoK___',
  '__KOK_KrRKfFWWWfKRrK_KOK___',
  // Row 13-14: fire core, peak intensity
  '__KoK_KBrKFFWWWFFKrBK_KoK___',
  '__KOK_KRBKfFWWWfKBRK_KOK___',
  // Row 15-16: fire middle
  '__KoK_KrBKfFFWFFfKBrK_KoK___',
  '__KOK__KRKffFWFffKRK__KOK___',
  // Row 17-18: fire lower, figures
  '__KoK__KBKKffFffKKBK__KoK___',
  '___KK__KrRKKfFfKKRrK__KK____',
  // Row 19-20: figures sitting around fire (bottom)
  '___KTK_KRrKKfffKKrRK_KTK____',
  '___KtK_KoOBKKfKKBOoK_KtK____',
  // Row 21-22: gathering circle bottom arc
  '____KTK_KKKKKKKKKKKtK_______',
  '_____KtTK__________KTtK______',
  // Row 23-24: terminal bracket motif bottom
  '______KTKK________KKTK_______',
  '_______KKK________KKK________',
  // Row 25-26: ground/earth texture
  '________KeEeEeEeEeK__________',
  '_________KEKEKEKEK___________',
  // Row 27-28: earth fading
  '__________KeEeEeK____________',
  '___________KKKK_____________',
  // Row 29-31: bottom edge
  '________________________________',
  '________________________________',
  '________________________________',
];

// Better approach: define pixel art as a 2D array directly with palette keys
function createIcon() {
  const SIZE = 32;

  // Define the sprite as a proper 32x32 grid using palette keys
  // This is a campfire with gathering figures and terminal cursor elements
  const grid = new Array(SIZE).fill(null).map(() => new Array(SIZE).fill('_'));

  // Helper to set pixels symmetrically (mirror horizontally around center)
  function sym(row, col, color) {
    if (row >= 0 && row < SIZE && col >= 0 && col < SIZE) {
      grid[row][col] = color;
      const mirror = SIZE - 1 - col;
      if (mirror >= 0 && mirror < SIZE) {
        grid[row][mirror] = color;
      }
    }
  }

  // Helper to set a single pixel
  function px(row, col, color) {
    if (row >= 0 && row < SIZE && col >= 0 && col < SIZE) {
      grid[row][col] = color;
    }
  }

  // Helper to fill a horizontal line
  function hline(row, c1, c2, color) {
    for (let c = c1; c <= c2; c++) px(row, c, color);
  }

  // === BACKGROUND: dark circular ground ===
  // Draw a filled dark circle for the ground/gathering area
  const cx = 15.5, cy = 17;
  for (let r = 8; r < 28; r++) {
    for (let c = 4; c < 28; c++) {
      const dx = c - cx, dy = (r - cy) * 1.2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 11) {
        px(r, c, 'e');
      }
      if (dist < 12 && dist >= 11) {
        px(r, c, 'K');
      }
    }
  }

  // Inner lighter earth ring
  for (let r = 10; r < 26; r++) {
    for (let c = 6; c < 26; c++) {
      const dx = c - cx, dy = (r - cy) * 1.2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 9) {
        px(r, c, 'E');
      }
    }
  }

  // === CAMPFIRE at center ===
  // Fire core (white-yellow)
  px(14, 15, 'W'); px(14, 16, 'W');
  px(15, 15, 'W'); px(15, 16, 'W');
  px(13, 15, 'W'); px(13, 16, 'F');
  px(16, 15, 'F'); px(16, 16, 'W');

  // Fire yellow layer
  px(12, 15, 'F'); px(12, 16, 'F');
  px(13, 14, 'F'); px(13, 17, 'F');
  px(14, 14, 'F'); px(14, 17, 'F');
  px(15, 14, 'F'); px(15, 17, 'F');
  px(16, 14, 'F'); px(16, 17, 'F');
  px(17, 15, 'F'); px(17, 16, 'F');

  // Fire orange layer
  px(11, 15, 'f'); px(11, 16, 'f');
  px(12, 14, 'f'); px(12, 17, 'f');
  px(13, 13, 'f'); px(13, 18, 'f');
  px(14, 13, 'f'); px(14, 18, 'f');
  px(15, 13, 'f'); px(15, 18, 'f');
  px(16, 13, 'f'); px(16, 18, 'f');
  px(17, 14, 'f'); px(17, 17, 'f');
  px(18, 15, 'f'); px(18, 16, 'f');

  // Fire red outer glow
  px(10, 15, 'C1'); px(10, 16, 'C1');
  px(11, 14, 'C1'); px(11, 17, 'C1');
  px(12, 13, 'C2'); px(12, 18, 'C2');
  px(13, 12, 'C2'); px(13, 19, 'C2');
  px(14, 12, 'R');  px(14, 19, 'R');
  px(15, 12, 'R');  px(15, 19, 'R');
  px(16, 12, 'C2'); px(16, 19, 'C2');
  px(17, 13, 'C2'); px(17, 18, 'C2');
  px(18, 14, 'C1'); px(18, 17, 'C1');
  px(19, 15, 'r');  px(19, 16, 'r');

  // Fire tip / flame tongue reaching up
  px(10, 14, 'f');  px(10, 17, 'r');
  px(9, 15, 'C1');  px(9, 16, 'f');
  px(8, 16, 'C2');
  px(8, 15, 'r');

  // Sparks above fire
  px(7, 14, 'F');
  px(6, 17, 'f');
  px(5, 15, 'C1');

  // === LOG/WOOD pieces under fire ===
  px(18, 13, 'B'); px(18, 18, 'B');
  px(19, 13, 'o'); px(19, 14, 'B'); px(19, 17, 'B'); px(19, 18, 'o');
  px(20, 14, 'o'); px(20, 15, 'B'); px(20, 16, 'B'); px(20, 17, 'o');

  // === SEATED FIGURES (4 around the fire) ===
  // Each figure: 3-4 pixels tall, earth/ochre tones

  // Top figure (facing down toward fire)
  px(8, 14, 'O'); px(8, 17, 'O');  // heads - two figures at top
  px(9, 13, 'o'); px(9, 14, 'O'); // body left
  px(9, 17, 'O'); px(9, 18, 'o'); // body right
  px(10, 13, 'B'); // legs
  px(10, 18, 'B');

  // Bottom figures
  px(22, 14, 'O'); px(22, 17, 'O');
  px(22, 13, 'o'); px(22, 18, 'o');
  px(21, 14, 'O'); px(21, 17, 'O');
  px(21, 13, 'B'); px(21, 18, 'B');
  px(23, 14, 'B'); px(23, 17, 'B');

  // Left figures
  px(14, 8, 'O');  px(15, 8, 'O');
  px(14, 9, 'o');  px(15, 9, 'o');
  px(16, 8, 'B');  px(16, 9, 'B');
  px(13, 8, 'O');  // head

  // Right figures
  px(14, 23, 'O'); px(15, 23, 'O');
  px(14, 22, 'o'); px(15, 22, 'o');
  px(16, 23, 'B'); px(16, 22, 'B');
  px(13, 23, 'O'); // head

  // === TERMINAL CURSOR BRACKETS (> _) ===
  // Left bracket >
  px(25, 8, 'T');
  px(26, 9, 'T');
  px(27, 8, 'T');

  // Right bracket (blinking cursor)
  px(26, 20, 'T'); px(26, 21, 'T'); px(26, 22, 'T');

  // Small > prompt on bottom
  px(25, 19, 't');

  // === DECORATIVE DOTS around circle (like ceremonial markings) ===
  // Top arc dots
  px(7, 10, 'O'); px(7, 21, 'O');
  px(6, 12, 'o'); px(6, 19, 'o');

  // Side dots
  px(12, 6, 'O');  px(12, 25, 'O');
  px(17, 6, 'O');  px(17, 25, 'O');

  // Bottom arc dots
  px(24, 10, 'o'); px(24, 21, 'o');
  px(25, 12, 'O'); px(25, 19, 'O');

  // === OUTER RING decorative pattern ===
  // Small dashes around the circle perimeter (like ceremonial body paint marks)
  const ringDots = [
    [5, 13, 'R'], [5, 18, 'R'],
    [6, 9, 'r'],  [6, 22, 'r'],
    [8, 7, 'R'],  [8, 24, 'R'],
    [11, 5, 'r'], [11, 26, 'r'],
    [14, 5, 'R'], [14, 26, 'R'],
    [17, 5, 'r'], [17, 26, 'r'],
    [20, 6, 'R'], [20, 25, 'R'],
    [23, 8, 'r'], [23, 23, 'r'],
    [25, 11, 'R'], [25, 20, 'R'],
    [26, 14, 'r'], [26, 17, 'r'],
  ];

  for (const [r, c, color] of ringDots) {
    px(r, c, color);
  }

  // === OUTLINE the ground circle more clearly ===
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== '_') continue;
      // Check if adjacent to a non-transparent, non-outline pixel
      let adj = false;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
          const v = grid[nr][nc];
          if (v !== '_' && v !== 'K') {
            adj = true;
            break;
          }
        }
      }
      if (adj) {
        grid[r][c] = 'K';
      }
    }
  }

  return grid;
}

async function generateIcons() {
  const SIZE = 32;
  const grid = createIcon();

  // Convert grid to raw RGBA pixel data
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const idx = (r * SIZE + c) * 4;
      const color = C[grid[r][c]] || C['_'];
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = color[3];
    }
  }

  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Create 32x32 base image
  const base32 = sharp(pixels, {
    raw: { width: SIZE, height: SIZE, channels: 4 }
  });

  // Save 32x32 (nearest neighbor to keep pixel art crispy)
  await base32.clone()
    .png()
    .toFile(path.join(assetsDir, 'icon-32.png'));
  console.log('Created assets/icon-32.png (32x32)');

  // Scale up to 256x256 with nearest-neighbor interpolation (keeps pixel art sharp)
  await base32.clone()
    .resize(256, 256, { kernel: 'nearest' })
    .png()
    .toFile(path.join(assetsDir, 'icon-256.png'));
  console.log('Created assets/icon-256.png (256x256)');

  // Scale to 128x128 for medium size
  await base32.clone()
    .resize(128, 128, { kernel: 'nearest' })
    .png()
    .toFile(path.join(assetsDir, 'icon-128.png'));
  console.log('Created assets/icon-128.png (128x128)');

  // Scale to 48x48 (common Windows size — use 32->48 with nearest neighbor,
  // slight blur is OK since 48 isn't a clean multiple)
  await base32.clone()
    .resize(48, 48, { kernel: 'nearest' })
    .png()
    .toFile(path.join(assetsDir, 'icon-48.png'));
  console.log('Created assets/icon-48.png (48x48)');

  // Generate ICO file (Windows icon with multiple sizes embedded)
  // ICO format: header + directory entries + image data
  await generateIco(assetsDir);

  console.log('\nAll icons generated in assets/');
}

async function generateIco(assetsDir) {
  // Read the PNG files we just created
  const sizes = [16, 32, 48, 256];
  const pngBuffers = [];

  // Generate 16x16 from 32x32
  const base = sharp(path.join(assetsDir, 'icon-32.png'));
  const png16 = await base.clone().resize(16, 16, { kernel: 'nearest' }).png().toBuffer();
  const png32 = await sharp(path.join(assetsDir, 'icon-32.png')).png().toBuffer();
  const png48 = await sharp(path.join(assetsDir, 'icon-48.png')).png().toBuffer();
  const png256 = await sharp(path.join(assetsDir, 'icon-256.png')).png().toBuffer();

  const images = [
    { size: 16, data: png16 },
    { size: 32, data: png32 },
    { size: 48, data: png48 },
    { size: 256, data: png256 },
  ];

  // ICO file format
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;

  let dataOffset = headerSize + dirEntrySize * numImages;
  const dirEntries = [];

  for (const img of images) {
    dirEntries.push({
      width: img.size === 256 ? 0 : img.size,  // 0 means 256
      height: img.size === 256 ? 0 : img.size,
      dataSize: img.data.length,
      dataOffset: dataOffset,
    });
    dataOffset += img.data.length;
  }

  // Build ICO buffer
  const totalSize = dataOffset;
  const ico = Buffer.alloc(totalSize);

  // Header: reserved(2) + type(2, 1=icon) + count(2)
  ico.writeUInt16LE(0, 0);      // reserved
  ico.writeUInt16LE(1, 2);      // type = icon
  ico.writeUInt16LE(numImages, 4); // count

  // Directory entries
  for (let i = 0; i < numImages; i++) {
    const entry = dirEntries[i];
    const offset = headerSize + i * dirEntrySize;
    ico.writeUInt8(entry.width, offset);        // width
    ico.writeUInt8(entry.height, offset + 1);   // height
    ico.writeUInt8(0, offset + 2);              // color palette
    ico.writeUInt8(0, offset + 3);              // reserved
    ico.writeUInt16LE(1, offset + 4);           // color planes
    ico.writeUInt16LE(32, offset + 6);          // bits per pixel
    ico.writeUInt32LE(entry.dataSize, offset + 8);  // data size
    ico.writeUInt32LE(entry.dataOffset, offset + 12); // data offset
  }

  // Image data (PNG format embedded in ICO)
  for (let i = 0; i < numImages; i++) {
    images[i].data.copy(ico, dirEntries[i].dataOffset);
  }

  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
  console.log('Created assets/icon.ico (multi-size ICO)');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
