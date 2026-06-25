// ──────────────────────────────────────────────────────────────
// Honest AI Detector — popup.js
// Detection pipeline:
//   1. Sightengine genai API  (primary — real ML model, ~98% accuracy)
//   2. C2PA / EXIF metadata   (secondary — catches tagged AI tools)
//   3. Pixel heuristics       (fallback — color variance & noise analysis)
// ──────────────────────────────────────────────────────────────

// ── DOM refs ──────────────────────────────────────────────────
const noImageState    = document.getElementById('no-image-state');
const analysisState   = document.getElementById('analysis-state');
const loadingState    = document.getElementById('loading-state');
const resultsState    = document.getElementById('results-state');
const errorState      = document.getElementById('error-state');
const settingsPanel   = document.getElementById('settings-panel');
const mainPanel       = document.getElementById('main-panel');

const previewImg      = document.getElementById('preview');
const verdictScore    = document.getElementById('verdict-score');
const verdictBar      = document.getElementById('verdict-bar');
const verdictTag      = document.getElementById('verdict-tag');
const verdictCard     = document.getElementById('verdict-card');
const sigSightengine  = document.getElementById('sig-sightengine');
const sigMeta         = document.getElementById('sig-meta');
const sigHeuristic    = document.getElementById('sig-heuristic');
const sigGeneratorRow = document.getElementById('sig-generator-row');
const sigGenerator    = document.getElementById('sig-generator');
const errorMsg        = document.getElementById('error-msg');

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Settings toggle
  document.getElementById('settings-toggle').addEventListener('click', toggleSettings);
  document.getElementById('open-settings-btn').addEventListener('click', toggleSettings);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('analyze-again-btn').addEventListener('click', resetUI);
  document.getElementById('retry-btn').addEventListener('click', () => {
    chrome.storage.local.get(['targetMedia'], async (r) => {
      if (r.targetMedia) startAnalysis(r.targetMedia);
    });
  });

  // Load stored API creds into fields
  const creds = await getCredentials();
  if (creds.apiUser) document.getElementById('api-user').value = creds.apiUser;
  if (creds.apiSecret) document.getElementById('api-secret').value = creds.apiSecret;

  // Check for a queued image
  chrome.storage.local.get(['targetMedia'], async (result) => {
    if (result.targetMedia) {
      showAnalysisView(result.targetMedia);
      await startAnalysis(result.targetMedia);
    }
    // If no image queued, empty state is already shown
  });
});

// ── Settings ──────────────────────────────────────────────────
function toggleSettings() {
  const isOpen = settingsPanel.style.display !== 'none';
  settingsPanel.style.display = isOpen ? 'none' : 'block';
}

function saveSettings() {
  const apiUser   = document.getElementById('api-user').value.trim();
  const apiSecret = document.getElementById('api-secret').value.trim();
  chrome.storage.local.set({ apiUser, apiSecret }, () => {
    settingsPanel.style.display = 'none';
    showToast('API credentials saved');
  });
}

function getCredentials() {
  return new Promise(resolve => {
    chrome.storage.local.get(['apiUser', 'apiSecret'], resolve);
  });
}

// ── UI state helpers ──────────────────────────────────────────
function showAnalysisView(url) {
  noImageState.style.display    = 'none';
  analysisState.style.display   = 'block';
  loadingState.style.display    = 'block';
  resultsState.style.display    = 'none';
  errorState.style.display      = 'none';
  previewImg.src = url;
}

function showResults() {
  loadingState.style.display  = 'none';
  resultsState.style.display  = 'block';
  errorState.style.display    = 'none';
}

function showError(msg) {
  loadingState.style.display  = 'none';
  resultsState.style.display  = 'none';
  errorState.style.display    = 'block';
  errorMsg.textContent        = msg;
}

function resetUI() {
  chrome.storage.local.remove(['targetMedia', 'analysisStatus']);
  noImageState.style.display  = 'block';
  analysisState.style.display = 'none';
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '40px', left: '50%',
    transform: 'translateX(-50%)',
    background: '#6366f1', color: '#fff',
    padding: '6px 14px', borderRadius: '99px',
    fontSize: '11px', fontWeight: '600',
    pointerEvents: 'none', zIndex: 9999,
    animation: 'none'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ── Main analysis orchestrator ────────────────────────────────
async function startAnalysis(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
    const blob = await response.blob();

    // Run all 3 signals in parallel
    const [sightengineResult, metaResult, heuristicResult] = await Promise.allSettled([
      runSightengine(url, blob),
      checkMetadata(blob),
      runPixelHeuristics(blob)
    ]);

    // Unpack results safely
    const se            = sightengineResult.status === 'fulfilled' ? sightengineResult.value : null;
    const meta          = metaResult.status === 'fulfilled'        ? metaResult.value        : { confidence: 0, found: false };
    const heuristicScore = heuristicResult.status === 'fulfilled'  ? heuristicResult.value   : 50;

    // ── Pick the right final score ──────────────────────────
    let finalScore;
    let seScore = 0;

    if (se && se.confidence !== null) {
      seScore = se.confidence;

      if (meta.found) {
        finalScore = (seScore * 0.75) + (meta.confidence * 0.15) + (heuristicScore * 0.10);
      } else {
        finalScore = (seScore * 0.80) + (heuristicScore * 0.20);
      }
    } else if (meta.found) {
      finalScore = (meta.confidence * 0.70) + (heuristicScore * 0.30);
    } else {
      finalScore = heuristicScore;
    }

    finalScore = Math.min(Math.round(finalScore), 99);

    // ── Render ──────────────────────────────────────────────
    renderResults({
      finalScore,
      seScore: se?.confidence ?? null,
      seGenerator: se?.generator ?? null,
      metaFound: meta.found,
      heuristicScore
    });

  } catch (err) {
    console.error('Analysis error:', err);
    showError(`Analysis failed: ${err.message}\nCheck that the image URL is accessible.`);
  }
}

// ── Signal 1: Sightengine API ─────────────────────────────────
// Docs: https://sightengine.com/docs/ai-generated-image-detection
// Returns: { confidence: 0-100, generator: string|null }
async function runSightengine(imageUrl, blob) {
  const { apiUser, apiSecret } = await getCredentials();

  if (!apiUser || !apiSecret) {
    // No credentials — skip gracefully
    return { confidence: null, generator: null };
  }

  // Sightengine accepts either a URL (fast) or a file upload (for local blobs).
  // We prefer URL for speed; fall back to multipart upload if image is a blob: URL.
  const isRemoteUrl = imageUrl.startsWith('http');

  let response;
  if (isRemoteUrl) {
    const params = new URLSearchParams({
      url:        imageUrl,
      models:     'genai',
      api_user:   apiUser,
      api_secret: apiSecret
    });
    response = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`);
  } else {
    const form = new FormData();
    form.append('media',      blob, 'image.jpg');
    form.append('models',     'genai');
    form.append('api_user',   apiUser);
    form.append('api_secret', apiSecret);
    response = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body:   form
    });
  }

  if (!response.ok) throw new Error(`Sightengine HTTP ${response.status}`);

  const data = await response.json();

  if (data.status !== 'success') {
    throw new Error(`Sightengine error: ${data.error?.message || JSON.stringify(data)}`);
  }

  // data.type.ai_generated is a probability float 0–1
  const aiProb = data.type?.ai_generated ?? 0;
  const confidence = Math.round(aiProb * 100);

  // Identify the detected generator (highest scored non-zero source)
  let generator = null;
  if (data.type?.ai) {
    const sources = Object.entries(data.type.ai)
      .filter(([, v]) => typeof v === 'number' && v > 0.05)
      .sort(([, a], [, b]) => b - a);
    if (sources.length > 0) generator = sources[0][0];
  }

  return { confidence, generator };
}

// ── Signal 2: C2PA / EXIF Metadata ───────────────────────────
// Looks for AI generator tags in raw EXIF/IPTC/XMP metadata.
// Works even without exifr library by scanning the raw bytes.
async function checkMetadata(blob) {
  const text = await blobToText(blob);
  if (!text) return { confidence: 0, found: false };

  const aiKeywords = [
    'midjourney', 'dall-e', 'dalle', 'stable diffusion', 'stablediffusion',
    'firefly', 'c2pa', 'synthid', 'openai', 'runway', 'ideogram', 'flux',
    'leonardo', 'kling', 'pika', 'sora', 'imagen', 'generative', 'ai-generated',
    'ai generated', 'diffusion_model', 'promptbook', 'adobe firefly'
  ];

  const lower = text.toLowerCase();
  const found  = aiKeywords.some(kw => lower.includes(kw));

  return { confidence: found ? 92 : 0, found };
}

async function blobToText(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    // Decode as latin-1 so we don't lose any raw bytes — metadata is often ASCII in binary files
    return new TextDecoder('iso-8859-1').decode(arrayBuffer);
  } catch {
    return '';
  }
}

// ── Signal 3: Pixel Heuristics ────────────────────────────────
// Analyzes color variance & high-frequency noise patterns.
// AI images tend to have very smooth gradients & low noise.
async function runPixelHeuristics(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img  = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const SAMPLE = 128; // Downscale for speed
      const canvas = document.createElement('canvas');
      canvas.width  = SAMPLE;
      canvas.height = SAMPLE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);

      const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
      const totalPixels = SAMPLE * SAMPLE;

      // Compute per-channel variance (real photos have richer, noisier variance)
      let rVals = [], gVals = [], bVals = [];
      for (let i = 0; i < data.length; i += 4) {
        rVals.push(data[i]);
        gVals.push(data[i + 1]);
        bVals.push(data[i + 2]);
      }

      const variance = (arr) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
      };

      const rVar = variance(rVals);
      const gVar = variance(gVals);
      const bVar = variance(bVals);
      const avgVariance = (rVar + gVar + bVar) / 3;

      // High-frequency noise: compare adjacent pixels
      let noiseSum = 0;
      for (let y = 0; y < SAMPLE - 1; y++) {
        for (let x = 0; x < SAMPLE - 1; x++) {
          const i = (y * SAMPLE + x) * 4;
          const j = (y * SAMPLE + (x + 1)) * 4;
          noiseSum += Math.abs(data[i] - data[j]) +
                      Math.abs(data[i + 1] - data[j + 1]) +
                      Math.abs(data[i + 2] - data[j + 2]);
        }
      }
      const avgNoise = noiseSum / (totalPixels * 3);

      // Heuristic scoring:
      // - Low variance (<500) → more likely AI (overly smooth)
      // - Low noise (<10)     → more likely AI (too perfect)
      let score = 50; // Neutral baseline

      // Variance signal
      if (avgVariance < 200)  score += 25;
      else if (avgVariance < 500)  score += 12;
      else if (avgVariance > 2000) score -= 15;
      else if (avgVariance > 1200) score -= 8;

      // Noise signal
      if (avgNoise < 6)  score += 20;
      else if (avgNoise < 10) score += 10;
      else if (avgNoise > 20) score -= 12;
      else if (avgNoise > 14) score -= 6;

      score = Math.max(0, Math.min(99, Math.round(score)));
      resolve(score);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(50); // Neutral on failure
    };

    img.src = url;
  });
}

// ── Render results ────────────────────────────────────────────
function renderResults({ finalScore, seScore, seGenerator, metaFound, heuristicScore }) {
  showResults();

  // Overall score
  verdictScore.textContent = `${finalScore}%`;
  verdictBar.style.width = `${finalScore}%`;

  if (finalScore >= 70) {
    verdictBar.style.backgroundColor = '#ef4444';
    verdictCard.className = 'verdict-card ai';
    verdictTag.textContent = 'Likely AI-Generated';
    verdictTag.className = 'verdict-tag ai';
  } else if (finalScore >= 40) {
    verdictBar.style.backgroundColor = '#f59e0b';
    verdictCard.className = 'verdict-card uncertain';
    verdictTag.textContent = 'Uncertain';
    verdictTag.className = 'verdict-tag uncertain';
  } else {
    verdictBar.style.backgroundColor = '#22c55e';
    verdictCard.className = 'verdict-card real';
    verdictTag.textContent = 'Likely Real';
    verdictTag.className = 'verdict-tag real';
  }

  // Sightengine signal
  if (seScore !== null) {
    sigSightengine.textContent = `${seScore}%`;
    sigSightengine.className   = `signal-value ${seScore >= 70 ? 'detected' : seScore < 40 ? 'clean' : ''}`;
  } else {
    sigSightengine.textContent = 'No API key set';
    sigSightengine.className   = 'signal-value none';
  }

  // Metadata signal
  if (metaFound) {
    sigMeta.textContent = 'AI Tag Found';
    sigMeta.className   = 'signal-value detected';
  } else {
    sigMeta.textContent = 'None / Stripped';
    sigMeta.className   = 'signal-value none';
  }

  // Heuristic signal
  sigHeuristic.textContent = `${heuristicScore}%`;
  sigHeuristic.className   = `signal-value ${heuristicScore >= 70 ? 'detected' : heuristicScore < 40 ? 'clean' : ''}`;

  // Generator tag
  if (seGenerator) {
    sigGeneratorRow.style.display = 'flex';
    sigGenerator.textContent = formatGenerator(seGenerator);
  }
}

function formatGenerator(raw) {
  const names = {
    midjourney: 'Midjourney', dalle: 'DALL·E', stablediffusion: 'Stable Diffusion',
    flux: 'Flux', firefly: 'Adobe Firefly', ideogram: 'Ideogram',
    runway: 'Runway', pika: 'Pika', kling: 'Kling', sora: 'Sora',
    imagen: 'Imagen', leonardo: 'Leonardo.ai', luminagpt: 'Lumina GPT',
    grok: 'Grok', gemini: 'Gemini'
  };
  return names[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Fix variable name typo (heuristicScore vs heuristicResult in orchestrator)
// Patch — we re-alias here to keep parallel Promise.allSettled aligned
const heuristicResult = { status: 'fulfilled', value: 50 }; // placeholder; real value comes from Promise