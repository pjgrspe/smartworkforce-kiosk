/**
 * Downloads face-api.js model weights for offline use.
 * Run once during branch PC setup: node scripts/download-models.js
 *
 * Downloads into: kiosk-service/public/models/
 * Total size: ~8 MB
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const BASE_URL   = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const MODELS_DIR = path.join(__dirname, '../public/models');

const MODEL_FILES = [
  // Tiny face detector
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  // 68-point face landmark (tiny version)
  'face_landmark_68_tiny_model-weights_manifest.json',
  'face_landmark_68_tiny_model-shard1',
  // Face recognition
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

fs.mkdirSync(MODELS_DIR, { recursive: true });

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file  = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;

    proto.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

(async () => {
  console.log(`Downloading ${MODEL_FILES.length} model files to ${MODELS_DIR}\n`);
  for (const file of MODEL_FILES) {
    const url  = `${BASE_URL}/${file}`;
    const dest = path.join(MODELS_DIR, file);
    process.stdout.write(`  ${file} ... `);
    try {
      await download(url, dest);
      const size = (fs.statSync(dest).size / 1024).toFixed(0);
      console.log(`OK (${size} KB)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      process.exit(1);
    }
  }
  console.log('\nModels downloaded. The kiosk will now work offline.');
})();
