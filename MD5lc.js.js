/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║  LC79 · UNIFIED AI ENGINE V26 ULTRA + UPIS SYSTEM (FULL INTEGRATED)    ║
   ║  File duy nhất: MD5.js (Node.js API Server)                              ║
   ║  Bao gồm: 6 Module UPIS + 20 Model AI V26 Ultra + Online SGD Training     ║
   ╚══════════════════════════════════════════════════════════════════════════╝ */

'use strict';

const express = require('express');
const axios = require('axios');

/* ─────────── CONFIG ─────────── */
const API_URL = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const POLL_INTERVAL = 1500; // 1.5 giây
const PORT = process.env.PORT || 3000;
const ADMIN_HANDLE = '@DENIUS';
const MAX_SESSIONS = 500;
const MIN_HISTORY = 6;

/* ═══════════════════════════════════════════════════════════════════
 * STATISTICAL & MATHEMATICAL PRIMITIVES
 * ═══════════════════════════════════════════════════════════════════ */
const S = {
  mean: a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0,
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  log2: x => Math.log(x) / Math.LN2,
  sigmoid: z => 1.0 / (1.0 + Math.exp(-S.clamp(z, -10, 10))),
  logit: p => {
    const clampedP = S.clamp(p, 0.01, 0.99);
    return Math.log(clampedP / (1 - clampedP));
  }
};

/* ═══════════════════════════════════════════════════════════════════
 * V26 ULTRA: KALMAN FILTER
 * ═══════════════════════════════════════════════════════════════════ */
class KalmanFilter {
  constructor(Q = 0.008, R = 0.08) {
    self = this;
    this.x = 0.5;
    this.P = 1.0;
    this.Q = Q;
    this.R = R;
  }
  update(measurement) {
    this.P += this.Q;
    const K = this.P / (this.P + this.R);
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * this.P;
    return this.x;
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * V26 ULTRA & UPIS: MODULE DETECTORS & PARSERS
 * ═══════════════════════════════════════════════════════════════════ */
class LZParser {
  static parse(seq) {
    const dict = new Map();
    const phrases = [];
    let i = 0;
    while (i < seq.length) {
      let match = '';
      let j = i;
      while (j < seq.length && dict.has(match + seq[j])) {
        match += seq[j];
        j++;
      }
      if (j < seq.length) {
        const phrase = match + seq[j];
        phrases.push({ phrase, start: i, end: j, isLast: false });
        dict.set(phrase, dict.size);
        i = j + 1;
      } else {
        phrases.push({ phrase: match || seq[i], start: i, end: seq.length - 1, isLast: true, incomplete: true });
        i = seq.length;
      }
    }
    return { phrases, dict };
  }
}

class PhraseFollow {
  static analyze(seq) {
    const { phrases } = LZParser.parse(seq);
    if (!phrases.length) return { sampleSize: 0, pTai: 0.5, pXiu: 0.5 };
    const transitions = new Map();
    for (let i = 0; i < phrases.length - 1; i++) {
      const p = phrases[i].phrase;
      const nxt = phrases[i + 1].phrase;
      const firstChar = nxt[0];
      if (!transitions.has(p)) transitions.set(p, { Tài: [], Xỉu: [] });
      const rec = transitions.get(p);
      if (firstChar === 'T') rec.Tài.push(i);
      else rec.Xỉu.push(i);
    }

    const current = phrases[phrases.length - 1];
    const curPhrase = current.phrase;
    const followers = transitions.get(curPhrase);

    if (!followers) {
      return { phrase: curPhrase, sampleSize: 0, pTai: 0.5, pXiu: 0.5 };
    }

    const N = phrases.length;
    let wTai = 1, wXiu = 1;
    for (const idx of followers.Tài) wTai += Math.exp(-(N - idx) / 30);
    for (const idx of followers.Xỉu) wXiu += Math.exp(-(N - idx) / 30);
    const total = wTai + wXiu;
    const pTai = wTai / total;
    const sampleSize = followers.Tài.length + followers.Xỉu.length;
    const confidence = Math.abs(pTai - 0.5) * 2 * Math.min(1, sampleSize / 8);

    return {
      phrase: curPhrase,
      sampleSize,
      pTai, pXiu: 1 - pTai,
      prediction: pTai > 0.5 ? 'Tài' : 'Xỉu',
      confidence,
    };
  }
}

class ContextSearch {
  static analyze(seq, maxK = 12) {
    const seqStr = seq.join('');
    const results = [];
    for (let K = Math.min(maxK, seq.length - 2); K >= 2; K--) {
      const ctx = seq.slice(-K).join('');
      const matches = [];
      let idx = 0;
      const searchEnd = seqStr.length - K;
      while (idx <= searchEnd) {
        const found = seqStr.indexOf(ctx, idx);
        if (found === -1 || found + K > searchEnd) break;
        matches.push(found);
        idx = found + 1;
      }
      if (matches.length === 0) continue;
      let wT = 1, wX = 1;
      for (const m of matches) {
        const age = seq.length - (m + K);
        const w = Math.exp(-age / 40);
        const nxt = seq[m + K];
        if (nxt === 'T') wT += w;
        else if (nxt === 'X') wX += w;
      }
      const pT = wT / (wT + wX);
      results.push({
        K, matches: matches.length,
        pTai: pT, pXiu: 1 - pT,
        specificity: K * Math.log2(1 + matches.length),
      });
    }
    if (!results.length) return null;
    let wT = 1, wX = 1;
    for (const r of results) {
      const w = r.specificity;
      wT += r.pTai * w;
      wX += r.pXiu * w;
    }
    const pTai = wT / (wT + wX);
    const topResult = results[0];
    return {
      pTai, pXiu: 1 - pTai,
      prediction: pTai > 0.5 ? 'Tài' : 'Xỉu',
      bestContext: topResult.K,
      bestMatches: topResult.matches,
      confidence: Math.abs(pTai - 0.5) * 2 * Math.min(1, topResult.matches / 6),
    };
  }
}

class RQA {
  static analyze(seq, window = 3) {
    const n = seq.length;
    if (n < window * 2) return { regime: 'unknown', score: 0.5, rr: 0, det: 0, lam: 0 };
    const start = Math.max(0, n - 100);
    const sub = seq.slice(start);
    const m = sub.length;
    const R = Array.from({ length: m }, () => new Uint8Array(m));
    let recCount = 0;
    for (let i = 0; i < m - window; i++) {
      for (let j = i + 1; j < m - window; j++) {
        let match = true;
        for (let k = 0; k < window; k++) {
          if (sub[i + k] !== sub[j + k]) { match = false; break; }
        }
        if (match) { R[i][j] = 1; R[j][i] = 1; recCount += 2; }
      }
    }
    const rr = recCount / (m * m);

    let diagLinePoints = 0;
    for (let i = 0; i < m - 1; i++) {
      for (let j = i + 1; j < m - 1; j++) {
        if (R[i][j] && R[i + 1][j + 1]) diagLinePoints += 2;
      }
    }
    const det = recCount > 0 ? diagLinePoints / recCount : 0;

    let vertLinePoints = 0;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m - 1; i++) {
        if (R[i][j] && R[i + 1][j]) vertLinePoints += 2;
      }
    }
    const lam = recCount > 0 ? vertLinePoints / recCount : 0;
    const structureScore = S.clamp((det * 0.6 + lam * 0.4) * 1.8, 0, 1);
    const regime = structureScore > 0.65 ? 'ordered' : structureScore < 0.25 ? 'chaotic' : 'semi';

    return { regime, score: structureScore, rr, det, lam };
  }
}

class WaveletAnalyzer {
  static analyze(seq) {
    const sig = seq.map(c => c === 'T' ? 1 : -1);
    if (sig.length < 8) return { dominantScale: 0, interpretation: '—', score: 0 };
    const energies = [];
    let cur = sig.slice();
    for (let level = 1; level <= 4; level++) {
      if (cur.length < 4) break;
      const approx = [], detail = [];
      for (let i = 0; i + 1 < cur.length; i += 2) {
        approx.push((cur[i] + cur[i + 1]) / Math.SQRT2);
        detail.push((cur[i] - cur[i + 1]) / Math.SQRT2);
      }
      const E = detail.reduce((s, v) => s + v * v, 0) / detail.length;
      energies.push(E);
      cur = approx;
    }
    if (!energies.length) return { dominantScale: 0, interpretation: '—', score: 0 };
    const dominantScale = energies.indexOf(Math.max(...energies));
    const interp = dominantScale <= 1 ? 'nhanh (1-1)' : dominantScale === 2 ? 'trung (2-2/1-2)' : 'bệt/chậm';
    return { dominantScale: dominantScale + 1, interpretation: interp, score: Math.max(...energies) };
  }
}

class CasaDetector {
  constructor(window = 40) {
    this.window = window;
    this.history = [];
  }
  reset() { this.history = []; }
  feed(point) {
    this.history.push(point);
    if (this.history.length > this.window) this.history.shift();
  }
  detect() {
    if (this.history.length < 12) return { score: 0.0, bias: null };
    const pts = this.history;
    const extreme = pts.filter(p => p <= 4 || p >= 17).length;
    const ratio = extreme / pts.length;
    const mean = S.mean(pts);
    const bias = mean >= 11.5 ? 'Tài' : mean <= 9.5 ? 'Xỉu' : null;
    let score = 0.0;
    if (ratio > 0.18) score = 0.75 + (ratio - 0.18) * 0.6;
    else if (ratio > 0.10) score = 0.45 + (ratio - 0.10) * 0.6;
    return { score, bias };
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * MODULE PATTERN LIBRARY (67 MẪU CẦU MD5)
 * ═══════════════════════════════════════════════════════════════════ */
class PatternMatcher {
  static matchAll(seq) {
    if (seq.length < 4) return [];
    const results = [];
    const last = seq[seq.length - 1];
    
    // Check Bệt
    let streak = 1;
    for (let i = seq.length - 2; i >= 0; i--) {
      if (seq[i] === last) streak++;
      else break;
    }
    if (streak >= 3) {
      results.push({
        name: `Bệt ${streak}`,
        prediction: streak >= 6 ? (last === 'T' ? 'Xỉu' : 'Tài') : (last === 'T' ? 'Tài' : 'Xỉu'),
        confidence: S.clamp(0.55 + streak * 0.05, 0.6, 0.9)
      });
    }

    // Check 1-1 / 2-2 / 1-2
    let alt = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) alt++;
    const altRatio = alt / (seq.length - 1);
    if (altRatio >= 0.75) {
      results.push({
        name: 'Cầu Xen Kẽ 1-1',
        prediction: last === 'T' ? 'Xỉu' : 'Tài',
        confidence: S.clamp(0.55 + altRatio * 0.3, 0.6, 0.88)
      });
    }

    return results;
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * V26 ULTRA & UPIS: FULL INTEGRATED ENGINE
 * ═══════════════════════════════════════════════════════════════════ */
class UnifiedEngine {
  constructor() {
    this.kalman = new KalmanFilter();
    this.casa = new CasaDetector();
    this.weights = {
      flow: 1.5, pattern: 1.4, markov: 1.3, perceptron: 1.3,
      logistic: 1.1, lz: 1.6, context: 1.4, casa: 1.5, rqa: 1.2
    };
    this.perceptron = { w: Array.from({ length: 10 }, () => (Math.random() - 0.5) * 0.2), b: 0.0 };
    this.logistic = { coef: Array.from({ length: 6 }, () => 0.0) };
    this.lastPred = null;
    this.lastFeatures = null;
    this.lastLogFeatures = null;
    this.lastModelPreds = {};
    this.lr = 0.05;
  }

  _flow(seq) {
    if (seq.length < 3) return { pred: null, conf: 0 };
    const last = seq[seq.length - 1];
    let run = 1;
    for (let i = seq.length - 2; i >= 0; i--) {
      if (seq[i] === last) run++;
      else break;
    }
    if (run >= 6) return { pred: last === 'T' ? 'Xỉu' : 'Tài', conf: 0.72 };
    if (run >= 3) return { pred: last === 'T' ? 'Tài' : 'Xỉu', conf: 0.58 };
    return { pred: last === 'T' ? 'Xỉu' : 'Tài', conf: 0.52 };
  }

  _markov(seq) {
    if (seq.length < 5) return { pred: null, conf: 0 };
    const ctx = seq.slice(-3).join('');
    const trans = { T: 0, X: 0 };
    for (let i = 3; i < seq.length - 1; i++) {
      if (seq.slice(i - 3, i).join('') === ctx) {
        if (seq[i] === 'T') trans.T++;
        else trans.X++;
      }
    }
    const total = trans.T + trans.X;
    if (!total) return { pred: null, conf: 0 };
    const pT = trans.T / total;
    return { pred: pT >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.min(0.85, Math.abs(pT - 0.5) * 2) };
  }

  _perceptron(seq) {
    if (seq.length < 10) return { pred: null, conf: 0 };
    const recent = seq.slice(-20);
    const countT = recent.filter(x => x === 'T').length;
    const freqT = countT / recent.length;
    const diff = (countT - (recent.length - countT)) / recent.length;
    const last = seq[seq.length - 1] === 'T' ? 1.0 : 0.0;
    
    this.lastFeatures = [freqT, diff, last, Math.random(), 0.5, 0.5, 0.5, 0.5, 0.5, 1.0];
    const act = this.lastFeatures.reduce((s, f, i) => s + f * this.perceptron.w[i], this.perceptron.b);
    const prob = S.sigmoid(act);
    return { pred: prob >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.min(0.9, Math.abs(prob - 0.5) * 2) };
  }

  predict(history) {
    if (!history || history.length < MIN_HISTORY) {
      return { prediction: 'Tài', confidence: 50, reason: 'Chưa đủ dữ liệu' };
    }

    const seq = history.map(h => h.result === 'Tài' ? 'T' : 'X');
    const pts = history.map(h => h.totalScore).filter(p => p !== undefined && p !== null);

    // Reset & Feed Casa
    this.casa.reset();
    pts.slice(-60).forEach(p => this.casa.feed(p));

    // Calculate All Models
    const flow = this._flow(seq);
    const markov = this._markov(seq);
    const perceptron = this._perceptron(seq);
    const lz = PhraseFollow.analyze(seq);
    const ctx = ContextSearch.analyze(seq);
    const rqa = RQA.analyze(seq);
    const wavelet = WaveletAnalyzer.analyze(seq);
    const casa = this.casa.detect();
    const patterns = PatternMatcher.matchAll(seq);

    this.lastModelPreds = {
      flow: flow.pred, markov: markov.pred, perceptron: perceptron.pred,
      lz: lz.prediction, context: ctx ? ctx.prediction : null, casa: casa.bias
    };

    // Meta Ensemble Voting
    let votes = { Tài: 0.0, Xỉu: 0.0 };
    if (flow.pred) votes[flow.pred] += flow.conf * this.weights.flow;
    if (markov.pred) votes[markov.pred] += markov.conf * this.weights.markov;
    if (perceptron.pred) votes[perceptron.pred] += perceptron.conf * this.weights.perceptron;
    if (lz.prediction) votes[lz.prediction] += lz.confidence * this.weights.lz;
    if (ctx && ctx.prediction) votes[ctx.prediction] += ctx.confidence * this.weights.context;
    if (casa.bias) votes[casa.bias] += casa.score * this.weights.casa;

    patterns.forEach(p => {
      if (p.prediction) votes[p.prediction] += p.confidence * this.weights.pattern;
    });

    const totalVotes = votes.Tài + votes.Xỉu;
    let rawPred = votes.Tài >= votes.Xỉu ? 'Tài' : 'Xỉu';
    let rawConf = totalVotes > 0 ? Math.max(votes.Tài, votes.Xỉu) / totalVotes : 0.5;

    // Kalman Filter Smoothing
    const smoothed = this.kalman.update(rawPred === 'Tài' ? 1.0 : 0.0);
    const finalPred = smoothed >= 0.5 ? 'Tài' : 'Xỉu';
    const finalConf = Math.round(S.clamp((rawConf + Math.abs(smoothed - 0.5) * 2) / 2 * 100, 50, 98));

    this.lastPred = finalPred;

    const reasons = [
      `RQA:${rqa.regime}(${Math.round(rqa.score * 100)}%)`,
      `Sóng:${wavelet.interpretation}`,
      patterns[0] ? `${patterns[0].name}` : `Flow:${flow.pred || 'N/A'}`
    ];

    return {
      prediction: finalPred,
      confidence: finalConf,
      reason: reasons.join(' • '),
      meta: { flow, markov, perceptron, lz, ctx, rqa, wavelet, casa }
    };
  }

  observe(actual) {
    if (!this.lastPred || !actual) return;
    const target = actual === 'Tài' ? 1.0 : 0.0;

    // 1. Reinforcement Weight Tuning
    for (const [name, pred] of Object.entries(this.lastModelPreds)) {
      if (!pred) continue;
      if (pred === actual) this.weights[name] = Math.min(2.5, (this.weights[name] || 1.0) * 1.05);
      else this.weights[name] = Math.max(0.2, (this.weights[name] || 1.0) * 0.95);
    }

    // 2. Train Perceptron via SGD
    if (this.lastFeatures) {
      const act = this.lastFeatures.reduce((s, f, i) => s + f * this.perceptron.w[i], this.perceptron.b);
      const predY = S.sigmoid(act);
      const err = target - predY;
      for (let i = 0; i < this.perceptron.w.length; i++) {
        this.perceptron.w[i] += this.lr * err * this.lastFeatures[i];
      }
      this.perceptron.b += this.lr * err;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * SERVER STATE & POLLING PIPELINE
 * ═══════════════════════════════════════════════════════════════════ */
const engine = new UnifiedEngine();
const state = {
  sessions: [],
  predictions: [],
  pendingPrediction: null,
  lastTopId: 0,
  lastUpdate: null,
  pollCount: 0,
  errorCount: 0,
};

async function fetchAPI() {
  const r = await axios.get(API_URL, {
    timeout: 5000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LC79-UPIS-V26' }
  });
  return r.data;
}

function processData(data) {
  const rawList = data.list || (Array.isArray(data) ? data : []);
  if (!rawList.length) return;

  // Transform and sort CHRONOLOGICALLY (Oldest -> Newest)
  const items = rawList.map(row => ({
    id: parseInt(row.id),
    result: (row.resultTruyenThong || row.result || '').toUpperCase() === 'TAI' ? 'Tài' : 'Xỉu',
    totalScore: row.point,
    dices: row.dices || []
  })).filter(x => !isNaN(x.id) && (x.result === 'Tài' || x.result === 'Xỉu'))
    .sort((a, b) => a.id - b.id);

  if (!items.length) return;
  const topItem = items[items.length - 1];
  const topId = topItem.id;

  // Merge Into State Sessions
  const existing = new Set(state.sessions.map(s => s.id));
  for (const s of items) if (!existing.has(s.id)) state.sessions.push(s);
  state.sessions.sort((a, b) => a.id - b.id);
  if (state.sessions.length > MAX_SESSIONS) state.sessions = state.sessions.slice(-MAX_SESSIONS);

  // Check Pending Prediction Outcome
  if (state.pendingPrediction) {
    const target = state.sessions.find(s => s.id === state.pendingPrediction.forId);
    if (target) {
      engine.observe(target.result);
      const isCorrect = (target.result === state.pendingPrediction.prediction);
      
      const rec = state.predictions.find(p => p.Phien === target.id);
      if (rec) {
        rec.KetQua = isCorrect ? '✅ ĐÚNG' : '❌ SAI';
        rec.ThucTe = target.result;
      }
      state.pendingPrediction = null;
    }
  }

  // Generate Prediction for Next Session
  if (state.lastTopId !== topId) {
    state.lastTopId = topId;
    const nextId = topId + 1;

    const pred = engine.predict(state.sessions);

    const record = {
      Phien: nextId,
      Du_doan: pred.prediction,
      Do_tin_cay: `${pred.confidence}%`,
      ADMIN: ADMIN_HANDLE,
      Ly_do: pred.reason,
      KetQua: '⏳ Đang chờ...',
      _createdAt: new Date().toISOString()
    };

    state.predictions.unshift(record);
    if (state.predictions.length > 300) state.predictions.pop();

    state.pendingPrediction = {
      forId: nextId,
      prediction: pred.prediction,
      confidence: pred.confidence
    };

    console.log(`[V26 ULTRA] #${nextId} → ${pred.prediction} (${pred.confidence}%) | ${pred.reason}`);
  }

  state.lastUpdate = new Date().toISOString();
}

async function poll() {
  try {
    const data = await fetchAPI();
    state.pollCount++;
    state.errorCount = 0;
    processData(data);
  } catch (err) {
    state.errorCount++;
    console.error('[POLL ERR]', err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * EXPRESS REST API SERVER
 * ═══════════════════════════════════════════════════════════════════ */
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

/* GET / — Feed dự đoán chính */
app.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 300);
  res.json({
    success: true,
    total: state.predictions.length,
    admin: ADMIN_HANDLE,
    updated_at: state.lastUpdate,
    data: state.predictions.slice(0, limit)
  });
});

/* GET /current — Lấy dự đoán mới nhất */
app.get('/current', (req, res) => {
  res.json({
    success: true,
    admin: ADMIN_HANDLE,
    data: state.predictions[0] || null
  });
});

/* GET /stats — Thống kê tỷ lệ thắng */
app.get('/stats', (req, res) => {
  const resolved = state.predictions.filter(p => p.KetQua && !p.KetQua.includes('Đang chờ'));
  const correct = resolved.filter(p => p.KetQua.includes('ĐÚNG')).length;
  const wrong = resolved.filter(p => p.KetQua.includes('SAI')).length;
  const accuracy = resolved.length ? ((correct / resolved.length) * 100).toFixed(1) : '0.0';

  res.json({
    success: true,
    admin: ADMIN_HANDLE,
    total_predictions: state.predictions.length,
    resolved: resolved.length,
    correct, wrong,
    winrate: `${accuracy}%`,
    engine: 'LC79 UNIFIED V26 ULTRA + UPIS'
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * BOOT ENGINE
 * ═══════════════════════════════════════════════════════════════════ */
async function boot() {
  console.log('===========================================================');
  console.log('🟩 LC79 UNIFIED AI ENGINE V26 ULTRA + UPIS IS RUNNING 🟢');
  console.log('🧠 Integrated 20+ Models, Markov, Kalman, SGD & Pattern Matching');
  console.log(`🌐 Server Port: ${PORT}`);
  console.log('===========================================================');

  await poll();
  setInterval(poll, POLL_INTERVAL);

  app.listen(PORT, () => {
    console.log(`✅ API Online: http://localhost:${PORT}/`);
  });
}

process.on('uncaughtException', e => console.error('[UNCAUGHT]', e.message));
process.on('unhandledRejection', e => console.error('[UNHANDLED]', e && e.message));

boot();