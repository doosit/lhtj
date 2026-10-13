/*
 * ============================================================================
 * 龙湖天街 签到 / 抽奖 / 滑块验证  —— Loon 专用单文件版
 * ============================================================================
 * 适用：Loon（iPhone / iPad），纯 JS、零依赖、单文件（复制即用）。
 * ============================================================================
 */

const $ = new Env("龙湖天街");
const ckName = "lhtj_data";
const tokenKey = "lhtj_captcha_token";

/* ========================== 常量 ========================== */
/* APP 抽奖组件/活动编号
 * 说明：龙湖的活动是「组件号 + 活动号」成对使用，且服务端对已结束活动统一返回
 *      803012（活动已结束），对不存在的活动号返回 801006（数据为空）。
 *      活动换期后编号会变，可在 Loon 里用存储键覆盖，或直接改这里。
 *   lhtj_activity_app -> 覆盖 APP 抽奖活动号（逗号分隔可写多个候选）
 *
 * 微信抽奖活动已结束（lottery_status=30），相关代码已移除。
 */
const component_app = "CF09V55S45360MKT";   // APP福利抽奖（2026-10-06 抓包确认有效）
const activity_app = "AP26W092U9CKJWLC";
const page_app = "PB09A55R33T0IUJG";        // APP 抽奖页面号
// 备用候选（脚本会按顺序尝试，第一个可用的即生效）
const ACTIVITY_CANDIDATES_APP = ["AP26W092U9CKJWLC", "AP26E022L8FTDAWH"];
const ACTIVITY_SIGN_WX = "11111111111686241863606037740000";
const ACTIVITY_SIGN_APP = "11111111111736501868255956070000";
const ACTIVITY_LOTTERY_OLD = "11111111111735633282374092760000";

const HOST_TASK = "https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod";
const HOST_LLT = "https://gw2c-hw-open.longfor.com/llt-gateway-prod";
const HOST_MEMBER = "https://longzhu-api.longfor.com/lmember-member-open-api-prod";
const GAIA_TASK = "c06753f1-3e68-437d-b592-b94656ea5517";
const GAIA_MEMBER = "d1eb973c-64ec-4dbe-b23b-22c8117c4e8e";
const GAIA_LLT = "2f9e3889-91d9-4684-8ff5-24d881438eaf";

const UA_MINI = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da";
const UA_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 &MAIAWebKit_iOS_com.longfor.supera_1.29.0_202609071056_Default_3.3.1.0";

// 滑块（顶象）
const SLIDER_HOST = "https://ly-ver.longhu.net";
const C1_HOST = "https://ly-sta.longhu.net";
// 小程序端用的是 /udid/w1（返回纯 JSON，免参数），H5/App 端用 /udid/c1（JSONP）。
// 两个通道返回的凭证都能用于 /api/a；w1 与小程序 UA 更匹配。
const CONSTID_PATH_DEFAULT = "c1";
const SLIDER_AK = "d1a43734fc59aeae9f1562dbd70fdf54";
const SLIDER_JSV = "1.3.41.372";
const JPEG_SCALE = 1;                 // 原尺寸还原列置换，与 PNG 拼图保持同一坐标系
const CAPTCHA_TTL = 180000;           // 缓存的 captcha token 有效期 ms

const RISK_CODES = ["862101", "4011", "4012", "4007", "8040012", "8040011", "4010"];
const RISK_PATTERN = /(风控|验证码|需要验证|验证失败|risk|captcha|拦截)/i;
const EXPIRED_PATTERN = /登录已过期|用户未登录|登录失效|token(?:已)?失效|请重新登录|请登录|未授权/i;
const REQUIRED_FIELDS = ["cookie", "token", "x-lf-dxrisk-token", "x-lf-channel", "x-lf-usertoken", "x-lf-bu-code", "x-lf-dxrisk-source"];

const notify = "";
const isHttpRequest = typeof $request !== "undefined" && $request &&
  typeof $request.url === "string" && /^https?:\/\//i.test($request.url);
$.notifyMsg = [];
$.title = "";
$.avatar = "";
$.ckStatus = true;
$.ckExpired = false;
$.doFlag = { true: "✅", false: "⛔️" };

/* ==========================================================================
 * 一、零依赖工具：inflate / JPEG 亮度解码 / 图片解码
 * ========================================================================== */

/** zlib/deflate 解压（按 puff.c 规范实现，用于解 PNG IDAT） */
function inflate(input) {
  const src = input;
  let inPos = 0, bitBuf = 0, bitCnt = 0;
  let out = new Uint8Array(1 << 16);
  let outLen = 0;
  const ensure = (n) => {
    if (outLen + n <= out.length) return;
    let cap = out.length;
    while (cap < outLen + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(out.subarray(0, outLen));
    out = nb;
  };
  const bits = (need) => {
    let val = bitBuf;
    while (bitCnt < need) {
      if (inPos >= src.length) throw new Error("inflate: unexpected end");
      val |= src[inPos++] << bitCnt;
      bitCnt += 8;
    }
    bitBuf = val >>> need;
    bitCnt -= need;
    return val & ((1 << need) - 1);
  };
  const buildHuff = (lengths) => {
    const counts = new Int32Array(16);
    for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
    counts[0] = 0;
    const offs = new Int32Array(16);
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    const symbols = new Int32Array(lengths.length);
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
    return { counts, symbols };
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bits(1);
      const count = h.counts[len];
      if (code - first < count) return h.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("inflate: bad huffman code");
  };
  const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  let fixedLit = null, fixedDist = null;
  const getFixed = () => {
    if (!fixedLit) {
      const ll = new Uint8Array(288);
      for (let i = 0; i < 144; i++) ll[i] = 8;
      for (let i = 144; i < 256; i++) ll[i] = 9;
      for (let i = 256; i < 280; i++) ll[i] = 7;
      for (let i = 280; i < 288; i++) ll[i] = 8;
      fixedLit = buildHuff(ll);
      fixedDist = buildHuff(new Uint8Array(30).fill(5));
    }
    return [fixedLit, fixedDist];
  };
  const codes = (lit, dist) => {
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) { ensure(1); out[outLen++] = sym; continue; }
      if (sym === 256) return;
      const li = sym - 257;
      const length = LEN_BASE[li] + bits(LEN_EXTRA[li]);
      const dsym = decode(dist);
      const d = DIST_BASE[dsym] + bits(DIST_EXTRA[dsym]);
      ensure(length);
      let from = outLen - d;
      for (let i = 0; i < length; i++) out[outLen++] = out[from + i];
    }
  };
  if (src.length < 2) throw new Error("inflate: too short");
  const cmf = src[inPos++], flg = src[inPos++];
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) throw new Error("inflate: bad header");
  for (;;) {
    const last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;
      const len = src[inPos] | (src[inPos + 1] << 8);
      inPos += 4;
      ensure(len);
      for (let i = 0; i < len; i++) out[outLen++] = src[inPos++];
    } else if (type === 1) {
      const f = getFixed(); codes(f[0], f[1]);
    } else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[order[i]] = bits(3);
      const clH = buildHuff(cl);
      const all = new Uint8Array(hlit + hdist);
      let i = 0;
      while (i < hlit + hdist) {
        const sym = decode(clH);
        if (sym < 16) { all[i++] = sym; continue; }
        let len = 0, count = 0;
        if (sym === 16) { len = all[i - 1]; count = 3 + bits(2); }
        else if (sym === 17) { len = 0; count = 3 + bits(3); }
        else { len = 0; count = 11 + bits(7); }
        while (count-- && i < all.length) all[i++] = len;
      }
      codes(buildHuff(all.subarray(0, hlit)), buildHuff(all.subarray(hlit)));
    } else {
      throw new Error("inflate: bad block type");
    }
    if (last) break;
  }
  return out.subarray(0, outLen);
}

/** JPEG 亮度解码（只解 Y 分量，支持采样降尺寸） */
const IDCT_COS = (() => {
  const t = new Float32Array(64);
  for (let x = 0; x < 8; x++) {
    for (let u = 0; u < 8; u++) t[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16) * (u === 0 ? Math.SQRT1_2 : 1);
  }
  return t;
})();

function idct8x8(block, out, stride, scratch) {
  const tmp = scratch || new Float32Array(64);
  for (let y = 0; y < 8; y++) {
    const b = y * 8;
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += IDCT_COS[x * 8 + u] * block[b + u];
      tmp[b + x] = s;
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += IDCT_COS[y * 8 + v] * tmp[v * 8 + x];
      const val = s * 0.25 + 128;
      out[y * stride + x] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  }
}

const JPEG_ZIGZAG = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

function jpegBuildHuff(bits, values) {
  const maxcode = new Int32Array(17), valptr = new Int32Array(17), mincode = new Int32Array(17);
  let code = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    if (bits[l] > 0) {
      valptr[l] = k; mincode[l] = code;
      code += bits[l]; k += bits[l];
      maxcode[l] = code - 1;
    } else maxcode[l] = -1;
    code <<= 1;
  }
  return { maxcode, valptr, mincode, values };
}
function jpegExtend(v, t) { return v < (1 << (t - 1)) ? v + (-1 << t) + 1 : v; }

function decodeJpegLuma(bytes, scale) {
  const st = scale && scale > 1 ? Math.round(scale) : 1;
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let off = 2;
  const qt = [], huffDC = [], huffAC = [];
  let frame = null, restartInterval = 0;
  while (off < bytes.length) {
    if (bytes[off] !== 0xff) { off++; continue; }
    let marker = bytes[off + 1];
    while (marker === 0xff) { off++; marker = bytes[off + 1]; }
    off += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) break;
    const len = (bytes[off] << 8) | bytes[off + 1];
    const segStart = off + 2, segEnd = off + len;
    if (marker === 0xdb) {
      let p = segStart;
      while (p < segEnd) {
        const pq = bytes[p] >> 4, tq = bytes[p] & 15; p++;
        const table = new Uint16Array(64);
        for (let i = 0; i < 64; i++) {
          if (pq) { table[i] = (bytes[p] << 8) | bytes[p + 1]; p += 2; } else table[i] = bytes[p++];
        }
        qt[tq] = table;
      }
    } else if (marker === 0xc4) {
      let p = segStart;
      while (p < segEnd) {
        const tc = bytes[p] >> 4, th = bytes[p] & 15; p++;
        const bits = new Uint8Array(17);
        let count = 0;
        for (let i = 1; i <= 16; i++) { bits[i] = bytes[p++]; count += bits[i]; }
        const values = new Uint8Array(count);
        for (let i = 0; i < count; i++) values[i] = bytes[p++];
        const t = jpegBuildHuff(bits, values);
        if (tc === 0) huffDC[th] = t; else huffAC[th] = t;
      }
    } else if (marker === 0xdd) {
      restartInterval = (bytes[segStart] << 8) | bytes[segStart + 1];
    } else if (marker === 0xc0 || marker === 0xc1) {
      const h = (bytes[segStart + 1] << 8) | bytes[segStart + 2];
      const w = (bytes[segStart + 3] << 8) | bytes[segStart + 4];
      const nf = bytes[segStart + 5];
      const comps = [];
      let p = segStart + 6;
      for (let i = 0; i < nf; i++) {
        comps.push({ id: bytes[p], h: bytes[p + 1] >> 4, v: bytes[p + 1] & 15, tq: bytes[p + 2] });
        p += 3;
      }
      frame = { w, h, comps };
    } else if (marker === 0xc2) {
      return null; // 渐进式不支持
    } else if (marker === 0xda) {
      if (!frame) return null;
      const ns = bytes[segStart];
      let p = segStart + 1;
      const scan = [];
      for (let i = 0; i < ns; i++) { scan.push({ id: bytes[p], dc: bytes[p + 1] >> 4, ac: bytes[p + 1] & 15 }); p += 2; }
      if (bytes[p] !== 0 || bytes[p + 1] !== 63) return null;
      return decodeJpegScan(bytes, segEnd, frame, scan, qt, huffDC, huffAC, restartInterval, st);
    }
    off = segEnd;
  }
  return null;
}

function decodeJpegScan(bytes, start, frame, scan, qt, huffDC, huffAC, restartInterval, st) {
  const W = frame.w, H = frame.h, comps = frame.comps;
  const yComp = comps[0];
  const maxH = Math.max.apply(null, comps.map((c) => c.h));
  const maxV = Math.max.apply(null, comps.map((c) => c.v));
  const mcux = Math.ceil(W / (8 * maxH)), mcuy = Math.ceil(H / (8 * maxV));
  const planeW = mcux * yComp.h * 8, planeH = mcuy * yComp.v * 8;
  const plane = new Float32Array(planeW * planeH);

  let pos = start, bitBuf = 0, bitCnt = 0;
  const nextByte = () => {
    while (pos < bytes.length) {
      const b = bytes[pos++];
      if (b !== 0xff) return b;
      const n = bytes[pos];
      if (n === 0x00) { pos++; return 0xff; }
      if (n >= 0xd0 && n <= 0xd7) { pos++; continue; }
      if (n === 0xff) continue;
      return 0;
    }
    return 0;
  };
  const getBit = () => { if (bitCnt === 0) { bitBuf = nextByte(); bitCnt = 8; } bitCnt--; return (bitBuf >> bitCnt) & 1; };
  const decodeHuff = (t) => {
    let code = getBit(), l = 1;
    while (l <= 16 && (t.maxcode[l] === -1 || code > t.maxcode[l])) { code = (code << 1) | getBit(); l++; }
    if (l > 16) return 0;
    return t.values[t.valptr[l] + code - t.mincode[l]] || 0;
  };
  const receive = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | getBit(); return v; };
  const receiveExtend = (n) => (n === 0 ? 0 : jpegExtend(receive(n), n));

  const pred = new Int32Array(comps.length);
  const scans = comps.map((comp) => scan.find((item) => item.id === comp.id));
  const blk = new Float32Array(64), pixels = new Float32Array(64), scratch = new Float32Array(64);
  let eobrun = 0, mcuCount = 0;
  for (let my = 0; my < mcuy; my++) {
    for (let mx = 0; mx < mcux; mx++) {
      if (restartInterval && mcuCount > 0 && mcuCount % restartInterval === 0) {
        bitBuf = 0; bitCnt = 0;
        while (pos < bytes.length && !(bytes[pos] === 0xff && bytes[pos + 1] >= 0xd0 && bytes[pos + 1] <= 0xd7)) pos++;
        if (pos < bytes.length) pos += 2;
        pred.fill(0); eobrun = 0;
      }
      mcuCount++;
      for (let ci = 0; ci < comps.length; ci++) {
        const comp = comps[ci];
        const sc = scans[ci];
        if (!sc) continue;
        for (let by = 0; by < comp.v; by++) {
          for (let bx = 0; bx < comp.h; bx++) {
            blk.fill(0);
            const t = decodeHuff(huffDC[sc.dc]);
            pred[ci] += receiveExtend(t);
            blk[0] = pred[ci] * ((qt[comp.tq] && qt[comp.tq][0]) || 1);
            if (eobrun > 0) eobrun--;
            else {
              let k = 1;
              while (k < 64) {
                const rs = decodeHuff(huffAC[sc.ac]);
                const r = rs >> 4, s = rs & 15;
                if (s === 0) {
                  if (r === 15) { k += 16; continue; }
                  eobrun = (1 << r) - 1 + (r ? receive(r) : 0);
                  break;
                }
                k += r;
                if (k > 63) break;
                const nat = JPEG_ZIGZAG[k];
                blk[nat] = receiveExtend(s) * ((qt[comp.tq] && qt[comp.tq][nat]) || 1);
                k++;
              }
            }
            if (ci === 0) {
              const outX = (mx * yComp.h + bx) * 8, outY = (my * yComp.v + by) * 8;
              if (outY < Math.min(planeH, H)) {
                idct8x8(blk, pixels, 8, scratch);
                const rows = Math.min(8, H - outY);
                const cols = Math.min(8, planeW - outX);
                for (let yy = 0; yy < rows; yy++) {
                  const dst = (outY + yy) * planeW + outX;
                  for (let xx = 0; xx < cols; xx++) plane[dst + xx] = pixels[yy * 8 + xx];
                }
              }
            }
          }
        }
      }
    }
  }
  const ow = Math.max(1, Math.floor(W / st)), oh = Math.max(1, Math.floor(H / st));
  const gray = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    const rowBase = y * st * planeW, dstBase = y * ow;
    for (let x = 0; x < ow; x++) gray[dstBase + x] = plane[rowBase + x * st];
  }
  return { w: ow, h: oh, gray, scale: st };
}

/** 统一解码：JPEG 走亮度解码，PNG 走 inflate + 逐行滤波 */
function decodeImage(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return decodeJpegLuma(bytes, JPEG_SCALE);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return decodePng(bytes);
  return null;
}

function readU32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }

function decodePng(bytes) {
  let off = 8, w = 0, h = 0, bitDepth = 8, colorType = 0;
  const idat = [];
  while (off + 8 <= bytes.length) {
    const len = readU32(bytes, off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const ds = off + 8;
    if (type === "IHDR") { w = readU32(bytes, ds); h = readU32(bytes, ds + 4); bitDepth = bytes[ds + 8]; colorType = bytes[ds + 9]; }
    else if (type === "IDAT") idat.push(bytes.subarray(ds, ds + len));
    else if (type === "IEND") break;
    off = ds + len + 4;
  }
  if (!w || !h || bitDepth !== 8) return null;
  let total = 0;
  for (let i = 0; i < idat.length; i++) total += idat[i].length;
  const rawIn = new Uint8Array(total);
  let p = 0;
  for (let i = 0; i < idat.length; i++) { rawIn.set(idat[i], p); p += idat[i].length; }
  // 优先用宿主提供的 inflate（更快），失败则回退内置实现
  let raw = null;
  try {
    if (typeof $utils !== "undefined" && $utils && typeof $utils.inflate === "function") raw = $utils.inflate(rawIn);
  } catch (e) { raw = null; }
  if (!raw || !raw.length) raw = inflate(rawIn);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
  if (!channels) return null;
  const stride = w * channels;
  const out = new Uint8Array(stride * h);
  let sp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[sp++];
    const row = raw.subarray(sp, sp + stride); sp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[x] = v;
    }
  }
  const gray = new Float32Array(w * h);
  let alpha = null;
  for (let i = 0, q = 0; i < w * h; i++, q += channels) {
    if (channels === 1 || channels === 2) gray[i] = out[q];
    else gray[i] = 0.299 * out[q] + 0.587 * out[q + 1] + 0.114 * out[q + 2];
    if (channels === 4 || channels === 2) {
      if (!alpha) alpha = new Uint8Array(w * h);
      alpha[i] = out[q + channels - 1];
    }
  }
  return { w, h, gray, alpha };
}

/* ==========================================================================
 * 一·五、顶象 ac 生成器（从小程序插件 wx16c573059683b2ca 提取，纯 JS 无浏览器依赖）
 *   ac = version + "#" + customBase64(_ua)
 *   _ua 由数据块拼接：[type(1) + length(2,BE) + 密文]，每块用各自的密钥异或
 *   块类型：1=TM 2=BR 3=SC 4=LO 5=CF 6=DI 7=EM 8=JSV 9=TK 10=temp 15=TC 16=TMV 17=SA 18=CA
 *   插件不用 Canvas/WebGL，只用 wx.getSystemInfoSync()，因此可移植到 Loon。
 * ========================================================================== */
/*
 * ac-plugin.js —— 顶象 ac 生成器（从小程序插件 wx16c573059683b2ca 提取，纯 JS 无浏览器依赖）
 *
 * 算法来源：插件 appservice.js 模块 4204（greenseer 内联实现），逐行移植。
 *   ac = version + "#" + customBase64(_ua)
 *   _ua = 各数据块拼接：[type(1字节) + 长度2字节 + 密文]
 *   块类型：1=TM 2=BR 3=SC 4=LO 5=CF 6=DI 7=EM 8=JSV 9=TK 10=temp 15=TC 16=TMV 17=SA 18=CA
 *
 * 重要：插件版只用 wx.getSystemInfoSync()，不需要 Canvas/WebGL，因此可移植到 Loon。
 */


/* ---------- 常量 ---------- */
const ALPHABET = "XmYj3u1PnvisIZUF8ThR/a6DfO+kW4JHrCELycAzSxleoQp02MtwV9Nd57qGgbKB=";
const DEFAULTS = {
  token: "", form: "", inputName: "ua",
  maxMDLog: 10, maxMMLog: 20, maxSALog: 250, maxKDLog: 10, maxFocusLog: 6,
  maxTCLog: 10, maxTMVLog: 20, MMInterval: 50, TMVInterval: 50,
};

/* ---------- 小工具（与插件一致） ---------- */
const isArray = Array.isArray;
const now = () => Date.now();
function pack(t, e, n) { return (t >> e) & ((1 << (8 * (n === undefined ? 1 : n))) - 1); }
function g(t) { return [pack(t, 8), pack(t, 0)]; }              // 数字 -> 2 字节（大端）
function h(t) { const e = []; if (!t) return e; for (let n = 0; n < t.length; n++) e.push(t.charCodeAt(n)); return e; }
function C(t) { return g(pack(t, 16, 2)).concat(g(pack(t, 0, 2))); } // 32 位 -> 4 字节
function M(t) { let e = ""; for (let n = 0; n < t.length; n++) e += String.fromCharCode(t[n]); return e; }
function each(t, e, n) {
  if (!t) return;
  let i = 0; const r = t.length;
  if (r === +r) for (; i < r && e.call(n, t[i], i, t) !== false; i++);
  else for (i in t) if (t.hasOwnProperty(i) && e.call(n, t[i], i, t) === false) break;
}
function flatten(t) { const e = []; each(t, (x) => { if (x !== undefined) { if (isArray(x)) e.push.apply(e, x); else e.push(x); } }); return e; }
function customB64(t) {
  if (!t) return "";
  let out = "", u = 0;
  while (u < t.length) {
    const e = t.charCodeAt(u++);
    const n = t.charCodeAt(u++);
    const i = t.charCodeAt(u++);
    const r = e >> 2;
    const a = ((3 & e) << 4) | (n >> 4);
    const o = ((15 & n) << 2) | (i >> 6);
    const c = 63 & i;
    let oo = o, cc = c;
    if (isNaN(n)) { oo = 64; cc = 64; } else if (isNaN(i)) { cc = 64; }
    out += ALPHABET.charAt(r) + ALPHABET.charAt(a) + ALPHABET.charAt(o || oo ? oo : o) + ALPHABET.charAt(cc);
  }
  return out;
}

/* ---------- 各数据块加密（逐一对应插件实现） ---------- */
function encTM(t) { let e = "", n = 0; for (; n < t.length; n++) { const i = t.charCodeAt(n); const r = ((i >> 4) + (i << 4) + 15273) & 255; e += String.fromCharCode(r); } return e; }
function encBR(t) { let e = "", n = 821; for (let i = 0; i < t.length; i++) { n = ((240 & (n << 4 ^ n)) + (n >> 7)) & 0xffff; e += String.fromCharCode(255 & (t.charCodeAt(i) ^ n)); } return e; }
function encSC(t) { let e = "", n = 43221; for (let i = 0; i < t.length; i++) { const r = t.charCodeAt(i) ^ n; n = (n * i % 256 + 24671) & 0xffffff; e += String.fromCharCode(255 & r); } return e; }
function encLO(t) { let e = "", n = 312; for (let i = 0; i < t.length; i++) { n = ((240 & (n << 2 ^ n)) + (n >> 5)) & 0xffff; e += String.fromCharCode(255 & (t.charCodeAt(i) ^ n)); } return e; }
function encCF(t) { let e = "", n = 34313; for (let i = 0; i < t.length; i++) { const r = t.charCodeAt(i) ^ n; n = r; e += String.fromCharCode(255 & r); } return e; }
function encDI(t) { let e = "", n = 156; for (let i = 0; i < t.length; i++) { n = ((240 & (n << 6 ^ n)) + (n >> 4)) & 0xffff; e += String.fromCharCode(255 & (t.charCodeAt(i) ^ n)); } return e; }
function encEM(t) { let e = "", n = 0; for (; n < t.length; n++) { const i = (t.charCodeAt(n) - 6) & 255; e += String.fromCharCode(((i >> 3) + (i << 5)) & 255); } return e; }
function encJSV(t) { let e = "", n = 32; const k = "VxMpoN86g7lA"; for (let i = 0; i < t.length; i++) { let r = t.charCodeAt(i); r ^= k.charCodeAt(n = (n + 3) % 12); e += String.fromCharCode(255 & r); } return e; }
function encTK(t) { let e = "", n = 2422; for (let i = 0; i < t.length; i++) { const r = t.charCodeAt(i) ^ n; n += 2; if (n >= 2147483647) n = 2372; e += String.fromCharCode(255 & r); } return e; }
function encTemp(t) { let e = "", n = 44; const k = "C6Br4b6f7NgK"; for (let i = 0; i < t.length; i++) { let r = t.charCodeAt(i); r ^= k.charCodeAt(n = (n + 4) % 12); e += String.fromCharCode(255 & r); } return e; }
function encTC(t) { let e = "", n = 62639; for (let i = 0; i < t.length; i++) { const r = t.charCodeAt(i) ^ n; n = r; e += String.fromCharCode(255 & r); } return e; }
function encTMV(t) { let e = "", n = 72; const k = "Vc6B8H8lDJ"; for (let i = 0; i < t.length; i++) { let r = t.charCodeAt(i); r ^= k.charCodeAt(n = (n + 1) % 10); e += String.fromCharCode(255 & r); } return e; }
function encSA(t) { let e = "", n = 33265; for (let i = 0; i < t.length; i++) { const r = 255 & (t.charCodeAt(i) ^ n); e += String.fromCharCode(r); n = r; } return e; }
function encCA(t) { let e = "", n = 147; for (let i = 0; i < t.length; i++) { n = ((240 & (n << 3 ^ n)) + (n >> 4)) & 0xffff; e += String.fromCharCode(255 & (t.charCodeAt(i) ^ n)); } return e; }

/* ---------- UA 主体 ---------- */
class UaGen {
  constructor(option) {
    this.option = Object.assign({}, DEFAULTS, option || {});
    this.version = this.option.version || "-1";
    this.jsv = this.option.jsv === undefined ? 1 : this.option.jsv;
    this.sys = this.option.sys || UaGen.defaultSys();
    this.genCharSet();
    this.reload(true);
  }
  /** 迷你程序环境提供；Loon 里用默认值 */
  static defaultSys() {
    return {
      system: "iOS 15.8", screenWidth: 390, screenHeight: 844,
      windowWidth: 375, windowHeight: 724, platform: "ios", version: "15.8",
      brand: "iPhone", model: "iPhone", language: "zh_CN", fontSizeSetting: 16,
      pixelRatio: 3, benchmarkLevel: 0,
    };
  }
  genCharSet() {
    let t = "";
    for (let n = 0; n < 256; n++) t += String.fromCharCode(n);
    this._chars = t;
  }
  reload(skipStart) {
    this.ua = ""; this._ua = ""; this._sa = []; this._ca = [];
    this.tm = now();
    this.counters = { sa: 0, mm: 0, md: 0, kd: 0, fo: 0, tc: 0, tmv: 0, mmInterval: 0, tmvInterval: 0 };
    if (!skipStart) this.start();
  }
  start() {
    this.getTM(); this.getBR(); this.getLO(); this.getCF(); this.getDI();
    this.getEM(); this.getJSV(); this.getTK(); this.getSC();
  }
  getUA() { return this.ua; }
  process(...args) {
    let t = args.length === 1 && isArray(args[0]) ? args[0] : args;
    return M(flatten(t));
  }
  app(type, payload) {
    const head = M([type].concat(g(payload.length)));
    this._ua += head + payload;
    this.ua = this.version + "#" + customB64(this._ua);
  }
  getTM() {
    const t = this.tm;
    const e = this.process(C(t / Math.pow(2, 32)).concat(C(t)));
    this.app(1, encTM(e));
  }
  getOS() {
    const s = String((this.sys && this.sys.system) || "");
    if (/iOS/i.test(s)) return 4;
    if (/Android/i.test(s)) return 7;
    return 0;
  }
  getBR() {
    const t = this.getOS();
    const e = this.process(t, 0, g(1), h("0"));
    this.app(2, encBR(e));
  }
  getLO() {
    const t = this.process(g(0), h(""), g(0), h(""));
    this.app(4, encLO(t));
  }
  getCF() {
    // 插件里是 [o(), d, D, l] 的随机挑选（画布指纹占位），这里用等价随机内容
    const pool = [String(Math.random()).slice(2), String(now()), String(this.sys.model || "iPhone"), this._chars.slice(0, 32)];
    const e = "" + pool[UaGen.rand(0, pool.length - 1)];
    const n = UaGen.rand(0, Math.max(0, e.length - 10));
    const i = UaGen.rand(2, 10);
    const r = this.process(g(n), g(i), h(e.substr(n, i)));
    this.app(5, encCF(r));
  }
  getDI() {
    this.app(6, encDI(this.process(0)));
  }
  getEM() {
    const t = parseInt("000000000000000000000000000000000000".substr(-32), 2) || 0;
    this.app(7, encEM(this.process(C(t))));
  }
  getJSV() {
    this.app(8, encJSV(this.process(C(this.jsv))));
  }
  getTK() {
    const t = this.option.token;
    if (t) this.app(9, encTK(this.process(g(t.length), h(t))));
  }
  getSC() {
    const t = this.sys;
    const e = [t.screenWidth, t.screenHeight, t.windowWidth, t.windowHeight, 0, 0, 0, 0, 0, 0].map((v) => g(v || 0));
    this.app(3, encSC(this.process(e)));
  }
  getTC(t) {
    const touch = (t.touches && t.touches[0]) || {};
    const n = now() - this.tm;
    const e = (t.target && t.target.id) || "";
    const r = this.process(C(n), g(parseInt(touch.pageX || 0, 10)), g(parseInt(touch.pageY || 0, 10)), C(touch.identifier || 0), g(e.length), h(e));
    this.app(15, encTC(r));
  }
  getTMV(t) {
    const touch = (t.touches && t.touches[0]) || {};
    const e = (t.target && t.target.id) || "";
    const n = now() - this.tm;
    const r = this.process(C(n), g(parseInt(touch.pageX || 0, 10)), g(parseInt(touch.pageY || 0, 10)), C(touch.identifier || 0), g(e.length), h(e));
    this.app(16, encTMV(r));
  }
  recordSA(t) {
    const e = now() - this.tm;
    const x = (t && t.x) || 0, y = (t && t.y) || 0;
    this._sa.push(encSA(this.process(C(e), g(x), g(y))));
  }
  sendSA() { this._sa.forEach((e) => this.app(17, e)); }
  recordCA(t) {
    const e = now() - this.tm;
    this._ca.push(encCA(this.process(C(e), g(t.x), g(t.y))));
  }
  sendCA() { this._ca.forEach((e) => this.app(18, e)); }
  reloadSA() { this.counters.sa = 0; this._sa = []; }
  sendTemp(e) {
    if (e && typeof e === "object") e = JSON.stringify(e);
    // 原始插件：两字节大端字符长度 + 字符字节；不得将长度数组转成整数。
    this.app(10, encTemp(this.process(g(e.length), h(e))));
  }
  static rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  /** 等价于插件的 bufFn：返回 [bufferLength, bytes...] */
  static utf8(s) {
    if (typeof Buffer !== "undefined") return Array.from(Buffer.from(s, "utf8"));
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  static bytes(a, b) {
    const out = [];
    out.push(255 & (a >> 0), 255 & (a >> 8), 255 & (a >> 16), 255 & (a >> 24));
    for (let i = 0; i < b.length; i++) out.push(b[i]);
    return out;
  }
}

/**
 * 生成 ac
 * @param {object} o { sid, x, y, jsv, version, sys, token, ua? }
 */
function createAc(o) {
  o = o || {};
  const gen = new UaGen({
    token: o.sid || o.token || "",
    jsv: o.jsv === undefined ? 1 : o.jsv,
    version: o.version || "-1",
    sys: o.sys,
  });
  gen.start();
  // sendTemp：插件里是 sendTemp("x=" + A + "&y=" + u)
  gen.sendTemp("x=" + Number(o.x || 0) + "&y=" + Number(o.y || 0));
  return gen.getUA();
}




/** 用插件算法生成 ac（Loon 环境） */
function buildAcPlugin(sid, x, y, sysInfo) {
  const gen = new UaGen({
    token: sid,
    jsv: 1,
    version: $.getdata("lhtj_ac_version") || "-1",
    sys: sysInfo || {
      system: "iOS 15.8", screenWidth: 390, screenHeight: 844,
      windowWidth: 375, windowHeight: 724, model: "iPhone", platform: "ios",
    },
  });
  gen.start();
  // 模拟滑动行为：一批位移采样 + 一次触摸开始/结束
  const steps = 12;
  const base = 760;
  for (let i = 1; i <= steps; i++) {
    gen.recordSA({ x: Math.round(base + (x * i) / steps), y: 320 });
  }
  gen.sendSA();
  gen.getTC({ touches: [{ pageX: base, pageY: 320, identifier: 0 }], target: { id: "" } });
  gen.getTMV({ touches: [{ pageX: base + x, pageY: 320, identifier: 0 }], target: { id: "" } });
  // 插件：sendTemp("x=" + (Math.round(dx)+10) + "&y=" + coverY)
  gen.sendTemp("x=" + (Math.round(x) + 10) + "&y=" + Number(y || 0));
  return gen.getUA();
}


/* H5 s_v3：官方 greenseer SDK 快照，来源 s.longfor.com/dx-captcha/libs/greenseer.js
 * SHA256 91029c5042861d98…；隔离运行，不修改 Loon 全局环境。
 * DOM 环境为适配层；不等同于真实浏览器指纹，服务端接受情况需验证。
 */
function h5Btoa(value) {
  const s = String(value), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i), b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
    const c = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
    if (a > 255 || b > 255 || c > 255) throw new Error("H5 Base64 输入非字节");
    const n = (a << 16) | (b << 8) | c;
    out += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63] +
      (i + 1 < s.length ? alphabet[(n >>> 6) & 63] : "=") + (i + 2 < s.length ? alphabet[n & 63] : "=");
  }
  return out;
}
function makeH5Env() {
  const nodeList = new Proxy([], { get: (t, k) => (k in t ? t[k] : () => false) });
  const el = () => ({
    style: {}, className: "", children: nodeList, childNodes: nodeList,
    appendChild() {}, removeChild() {}, insertBefore() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {}, getElementsByTagName() { return nodeList; },
    querySelector() { return null; }, querySelectorAll() { return nodeList; }, getContext() { return null; },
    parentNode: null, innerHTML: "", src: "", offsetWidth: 300, offsetHeight: 150,
  });
  const documentElement = Object.assign(el(), {
    clientWidth: 390, clientHeight: 844, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 390, height: 844 }),
  });
  const document = {
    createElement: el, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => nodeList, getElementsByTagName: () => nodeList,
    addEventListener() {}, removeEventListener() {}, attachEvent() {}, detachEvent() {},
    documentElement,
    body: Object.assign(el(), { scrollLeft: 0, scrollTop: 0, clientWidth: 390, clientHeight: 844 }),
    head: el(), cookie: "", referrer: "",
    createEvent: () => ({ initEvent() {} }),
    implementation: { hasFeature: () => true, createHTMLDocument: () => ({}) },
    readyState: "complete", createTextNode: (t) => ({ nodeValue: t }),
  };
  const navigator = {
    userAgent: UA_APP, platform: "iPhone", language: "zh-CN", languages: ["zh-CN", "zh"],
    cookieEnabled: true, appName: "Netscape", appVersion: "5.0 (iPhone)", vendor: "Apple Computer, Inc.",
    plugins: [], mimeTypes: [], webdriver: false, hardwareConcurrency: 4, deviceMemory: 4, maxTouchPoints: 5,
  };
  const t0 = Date.now();
  const performance = {
    timing: {
      navigationStart: t0 - 6000, domainLookupStart: t0 - 5900, domainLookupEnd: t0 - 5880,
      connectStart: t0 - 5880, connectEnd: t0 - 5800, requestStart: t0 - 5790,
      responseStart: t0 - 5600, responseEnd: t0 - 5590, domLoading: t0 - 5500,
      domInteractive: t0 - 4000, domContentLoadedEventStart: t0 - 3900,
      domContentLoadedEventEnd: t0 - 3890, domComplete: t0 - 3600,
      loadEventStart: t0 - 3590, loadEventEnd: t0 - 3580,
    },
    now: () => Date.now(),
  };
  const screen = { width: 390, height: 844, availWidth: 390, availHeight: 844, colorDepth: 24, pixelDepth: 24 };
  const location = {
    href: "https://longzhu.longfor.com/", protocol: "https:", hostname: "longzhu.longfor.com",
    host: "longzhu.longfor.com", origin: "https://longzhu.longfor.com", pathname: "/", search: "", hash: "",
  };
  const win = {
    document, navigator, performance, screen, location,
    addEventListener() {}, removeEventListener() {}, attachEvent() {}, detachEvent() {},
    setTimeout, clearTimeout: typeof clearTimeout === "function" ? clearTimeout : function () {},
    setInterval: function () {}, clearInterval: function () {},
    btoa: h5Btoa,
    atob: (s) => M(Array.from(base64ToBytes(s))),
    encodeURIComponent, decodeURIComponent, Math, Date, JSON, console,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    innerWidth: 390, innerHeight: 844, outerWidth: 390, outerHeight: 844,
    screenLeft: 0, screenTop: 0, screenX: 0, screenY: 0, devicePixelRatio: 3,
    pageXOffset: 0, pageYOffset: 0,
  };
  win.window = win; win.self = win; win.top = win; win.parent = win; win.globalThis = win;
  return win;
}


let h5Factory = null;
function loadH5Factory() {
  if (h5Factory) return h5Factory;
  const env = makeH5Env();
  (function () {
    var window = env, self = env, top = env, parent = env, globalThis = env;
    var document = env.document, navigator = env.navigator, location = env.location, screen = env.screen;
    var performance = env.performance, localStorage = env.localStorage, sessionStorage = env.sessionStorage;
    var btoa = env.btoa, atob = env.atob, setTimeout = env.setTimeout, clearTimeout = env.clearTimeout;
    var setInterval = env.setInterval, clearInterval = env.clearInterval;
    var module, exports, define;
/*! ctu-greenseer 2020-01-04 23:32:22 */
!function(t,r,e){!function(n){var o={};function i(t){return t.split("").reverse().join(e[0])}function a(t){if(!t)return e[0];for(var r="",n=47427,o=0;o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=i,r+=String.fromCharCode(a)}return r}function u(t){if(o[t])return o[t][c("P@G9GLD")];var a=o[t]={"i":t,"l":!1,"exports":{}};return n[t][i("llac")](a[r[1]],a,a[r[1]],u),a[i(e[1])]=!0,a[i(e[2])]}function c(t){if(!t)return r[2];for(var e="",n=23524,o=0;o<t.length;o++){var i=t.charCodeAt(o);i^="V587".charCodeAt(n=(n+1)%"V587".length),e+=String.fromCharCode(i)}return e}u[c(t[0])]=n,u[a("\ub920")]=o,u.d=function(t,e,n){u.o(t,e)||Object[a("\ub927\ub942\ub924\ub94d\ub923\ub946\ub916\ub964\ub90b\ub97b\ub91e\ub96c\ub918\ub961")](t,e,{"configurable":r[0],"enumerable":!0,"get":n})},u.n=function(t){var r=t&&t.__esModule?function(){return t["default"]}:function(){return t};return u.d(r,"a",r),r},u[r[5]]=function(t,r){return Object.prototype[i("ytreporPnwOsah")][i("llac")](t,r)},u[function(t){if(!t)return"";for(var e="",n=73745,o=r[3];o<t.length;o++){var i=t.charCodeAt(o)^n;n=n*o%256+r[4],e+=String.fromCharCode(i)}return e}("\u2061")]="",u(u[r[6]]=e[3])}([function(n,o,i){var a=r[7],u=e[4],c=r[8],f=r[9],s="l",h="c",d=e[5],v=e[1],l="sh",g=e[6],p="At",m="SJX;",C=t[1],w="scriptor",A=e[7],y="r",S=r[8],b="m",_=r[10],x="\ub942",E="\ub92c",M=r[11],T="a",R="p",V="n",P=t[2],D="[obj",L="ect ";H("\u2064\u096e\u095f\u09b1\u09a3\u0929\u099c\u09d8\u0997\u09c9"),o.__esModule=!0,o.now=o.isArray=o.isFunction=o[I("gnirtSsi")]=undefined,o[I("hcae")]=W,o.extend=function(t){for(var r,n,o=e[1],i=[][I("ecils")][h+"al"+o](arguments),a=i[O("Y]Y1AP")],u=1;u<a;u++)for(n in r=i[u])r.hasOwnProperty(n)&&(t[n]=r[n]);return t},o[e[8]]=function(t,r,n){for(var o,i=[],a=e[10],u=t[I(e[11])];a<u;a++)o=t[a],r[d+v](n,o,a,t)&&i.push(o);return i},o[e[9]]=function(e,n,o){for(var i=[],a=r[3],u=e.length;a<u;a++)i["pu"+l](n[t[3]](o,e[a],a,e));return i},o.some=function(t,r,n){for(var o=0,i=t[I("htgnel")];o<i;o++)if(r.call(n,t[o],o,t))return e[14];return!1},o.flatten=function(r){var e=[];return W(r,function(r){typeof r!==I(t[12])&&(j(r)?e=e.concat(r):e.push(r))}),e},o.random=function(r,e){return r+Math.floor(Math[H("\u2063\u097c\u0954\u09f5\u09bf\u0930")]()*(e-r+t[11]))},o.toCodeArray=function(t){for(var n=r[16],o=[],i=(t+="").length,a=e[10];a<i;a++)o.push(t[g+n+p](a));return o},o.toStr=function(t){var e=r[13];return String[O(m+C+e)].apply(String,t)},o.keys=function(t){var r=[];return W(t,function(t,e){r.push(e)}),r},o.isTouchDevice=function(){return I("tratshcuotno")in document.documentElement},o.propDefined=function(r,n){var o=[];Object.getOwnPropertyDescriptor&&o.push(Object["getOwnPropertyDe"+w](r,n));Object[t[5]]&&o[e[12]](!!Object.getOwnPropertyDescriptors(r)[n]);for(var i=0;i<o[e[13]];i++)if(o[i])return!0;return!1},o["isH"+a+"less"]=function(){var n=e[18],o=t[8],i=r[10],a=e[19],u=e[20],c=e[21];if(navigator[r[15]])return!0;try{var f=document[O(e[22])]("i"+A+y+S+b+_);f[O("FYY2WWO")]="allow-same-origin",f[t[9]][t[10]]=Y("\ub92d"+x+E+n),document[Y(M+"\ub92a\ub953")][T+R+o+i+V+P+a+u+"il"+c](f);var s=!!f.contentWindow[O("[YA?RYC9G")][H("\u2066\u0978\u0958\u09f5\u09a2\u0934\u0998\u09d4\u0986")];return document.body[Y("\ub931\ub954\ub939\ub956\ub920\ub945\ub906\ub96e\ub907\ub96b\ub90f")](f),s}catch(h){return!1}};i(1),o[O('\\Kd"GQY1')]=F(r[12]),o.isFunction=F(O("sMY5AQX8"));var j=o.isArray=Array.isArray||F("A"+u+"r"+c+"y");function Y(r){if(!r)return"";for(var e="",n=47427,o=t[4];o<r.length;o++){var i=r.charCodeAt(o),a=i^n;n=i,e+=String.fromCharCode(a)}return e}function O(t){if(!t)return"";for(var r="",n=23524,o=0;o<t.length;o++){var i=t.charCodeAt(o);n=(n+e[15])%"V587".length,i^="V587".charCodeAt(n),r+=String.fromCharCode(i)}return r}function F(t){return function(r){return{}[Y("\ub937\ub958\ub90b\ub97f\ub90d\ub964\ub90a\ub96d")].call(r)==D+L+t+"]"}}o.now=Date[t[6]]||function(){return+new Date};function I(r){return r.split(t[7]).reverse().join("")}function H(r){if(!r)return"";for(var n=t[7],o=73745,i=e[10];i<r.length;i++){var a=r.charCodeAt(i)^o;o=o*i%256+e[16],n+=String.fromCharCode(a)}return n}function W(t,n,o){if(t){var i=0,a=t.length;if(a===+a)for(;i<a&&n[r[14]](o,t[i],i,t)!==e[17];i++);else for(i in t)if(t.hasOwnProperty(i)&&!1===n["ca"+f+s](o,t[i],i,t))break}}},function(n,o,i){var a="_sta",u="Ful",c="isFunctio",f="V5",s=e[23],h=t[13],d=r[17],v=e[24],l=e[25],g=e[26],p=r[18],m=r[19],C=e[20],w=r[8],A=r[20],y=r[21],S=e[27],b="n",_="nc",x="type";o.__esModule=t[14],o.Promise=D;var E=i(0),M=0,T=r[22];function R(r,e){var n=[].slice,o=n.call(arguments,2),i=function(){},a=function(){return r.apply(this instanceof i?this:e,o["co"+_+"at"](n[L("llac")](arguments)))};return i[j("\u2061\u096f\u0955\u09e5\u09bf\u0929\u0997\u09c1\u0991")]=r[t[15]],a["proto"+x]=new i,a}function V(n,o){var i;if(n!==o)if((i=o)&&(r[3],E.isFunction)(i["the"+b]))try{o[P(t[16])](function(t){V(n,t)},function(t){n.reject(t)})}catch(a){n[e[28]](a)}else n.resolve(o);else n.reject(new TypeError("A promise cannot be resolved with itself."))}function P(t){if(!t)return"";for(var r=e[0],n=47427,o=0;o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=i,r+=String.fromCharCode(a)}return r}function D(t){var n=e[29],o=e[30];if(!(this instanceof D))return new D(t);this[a+"te"]=M,this[n+u+"fil"+o]=[],this._onRejected=[],this._value=null,this._reason=null,(r[3],E[L("noitcnuFsi")])(t)&&t(R(this.resolve,this),R(this[j("\u2063\u0978\u0950\u09f4\u09b3\u0929")],this))}function L(t){return t.split("").reverse().join("")}function j(t){if(!t)return"";for(var r="",n=73745,o=0;o<t.length;o++){var i=t.charCodeAt(o)^n;n=n*o%e[33]+2333,r+=String.fromCharCode(i)}return r}function Y(t){if(!t)return"";for(var r="",e=f+s,n=23524,o=0;o<t.length;o++){var i=t.charCodeAt(o);n=(n+1)%e.length,i^=e.charCodeAt(n),r+=String.fromCharCode(i)}return r}function O(t,r,e){return function(n){if((0,E[c+"n"])(r))try{var o=r(n);V(t,o)}catch(i){t.reject(i)}else t[e](n)}}D.prototype={"constructor":D,"then":function(t,e){var n=r[23],o=new D;return this._onFulfilled["pus"+h](O(o,t,"resolve")),this[r[24]].push(O(o,e,Y("G]]"+n))),this.flush(),o},"flush":function(){var t=this[d+"ta"+v];if(t!==M){var e=1===t?this[r[25]].slice():this[j("\u204e\u0972\u0954\u09c3\u09b5\u0937\u098b\u09d2\u0980\u09d8\u09a6")].slice(),n=1===t?this._value:this[r[26]];setTimeout(function(){(0,E.each)(e,function(t){try{t(n)}catch(r){}})},0),this[r[25]]=[],this._onRejected=[]}},"resolve":function(e){this[L("etats_")]===M&&(this[t[17]]=1,this[r[27]]=e,this.flush())},"reject":function(t){this._state===M&&(this._state=T,this[Y("jJR7FWY")]=t,this[P("\ub925\ub949\ub93c\ub94f\ub927")]())},"isPending":function(){return this._state===M},"isFulfilled":function(){return 1===this._state},"isRejected":function(){return this[l+"ate"]===T},"catch":function(t){return this.then(null,t)},"always":function(t){return this.then(t,t)}},D.defer=function(){var t={};return t[P(e[31])]=new D(function(r,e){t.resolve=r,t.reject=e}),t},D[g+"e"]=function(r){var n=D[e[32]]();r.length;return(0,E.each)(r,function(r){r[t[18]](function(t){n[p+"olve"](t)},function(t){n[P("\ub931\ub954\ub93e\ub95b\ub938\ub94c")](t)})}),n.promise},D.all=function(t){var r=e[27],n=D[L("refed")](),o=t[m+"ngth"],i=[];return(e[10],E[L(C+"c"+w+r)])(t,function(t,r){t.then(function(t){i[r]=t,0===--o&&n[L(e[34])](i)},function(t){n.reject(t)})}),n["pro"+A+"e"]},D[y+S]=function(t){return new D(function(r){r(t)})},D.reject=function(t){return new D(function(r,e){e(t)})}},function(n,o,i){r[6],r[28];var a="TLC",u="7VP",c="r P",f="VC",s="ent",h="eY",d="o",v=r[6],l="c",g="i",p=e[35];function m(n){var o=navigator.userAgent;if(!new RegExp(A("\u2062\u097c\u095c\u09f0\u09a2\u0934"),"i")[e[39]](o)||new RegExp("(mobile|chrome)",S("\\"))[r[31]](o))return n;var i=Math[A("\u2063\u0972\u094f\u09ff\u09b4")](document[t[21]][A("\u2072\u0971\u0953\u09f4\u09be\u0929\u09b9\u09d8\u0990\u09c9\u09aa")]/window[S("\\VY3Go^2AP")]*100)/100;return 1===i?n:Math.round(n*i)}function C(r){return r.split(t[7]).reverse().join(t[7])}function w(t){return t||window.event}function A(t){if(!t)return"";for(var r="",e=73745,n=0;n<t.length;n++){var o=t.charCodeAt(n)^e;e=e*n%256+2333,r+=String.fromCharCode(o)}return r}function y(t){return t.target||t["srcElem"+s]}function S(t){if(!t)return"";for(var r="",e=23524,n=0;n<t.length;n++){var o=t.charCodeAt(n);o^="V587".charCodeAt(e=(e+1)%"V587".length),r+=String.fromCharCode(o)}return r}o[C(r[29])]=!0,o.addHandler=function(r,n,o){var i=e[38],s=t[19];r.addEventListener?r[i+s](n,o,!0):r[S(a+u+c+f)]&&r[A("\u2070\u0969\u094e\u09f0\u09b3\u0935\u09ab\u09c7\u0991\u09d3\u09b6")](t[20]+n,o)},o[e[36]]=w,o[A("\u2076\u0978\u094e\u09c5\u09b1\u092f\u0989\u09d4\u0980")]=y,o.preventDefault=function(t){t.preventDefault?t[A("\u2061\u096f\u095f\u09e7\u09b5\u0933\u099a\u09f5\u0991\u09db\u09a3\u09c4\u09d4\u09c9")]():t[r[30]]=!1},o.getPageX=function(t){var r=t.pageX;r===undefined&&(r=t[S("VT^3[Lo")]+(document.body.scrollLeft||document.documentElement.scrollLeft));return parseInt(r,10)},o[S("R]C\x06T_R\x0f")]=function(n){var o=e[41],i=n["pag"+h];i===undefined&&(i=n.clientY+(document.body[S("F[E9YTc9E")]||document[r[35]][o+"ollTop"]));return parseInt(i,t[23])},o[A(e[37])]=function(t){var n=r[10],o=r[36],i=e[1],a=t[d+"ff"+v+n+"t"+o];a===undefined&&(t=w(t),a=t.clientX-Math[l+"e"+g+i](y(t)[A(r[37])]()[e[42]]));return m(a)},o.getOffsetY=function(t){var r=t.offsetY;r===undefined&&(t=w(t),r=t.clientY-Math.ceil(y(t).getBoundingClientRect().top));return m(r)},o.getButton=function(n){var o=t[22];if(document.implementation["hasFeatur"+o]("MouseEve"+p,e[40]))return n.button;if(new RegExp("^(0|1|3|5|7)$").test(n.button))return 0;if(new RegExp(C(r[32]))[r[31]](n.button))return 2;if(4===n[S(r[33])])return r[34]},o.getCharCode=function(t){return t.charCode||t.keyCode||e[10]}},function(n,o,i){e[43],e[44];var a="po",u=r[38],c=r[39],f="sh",s="charCod",h=t[24];function d(t){if(!t)return"";for(var r="",n=e[46],o=0;o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=i,r+=String.fromCharCode(a)}return r}function v(r,e,n){var o=t[25];return r>>e&Math[a+o](2,8*(void 0===n?t[11]:n))-1}function l(t){return[v(t,r[40]),v(t,r[3])]}function g(r){return l(v(r,16,2))[(n="tacnoc",n.split("").reverse().join(e[0]))](l(v(r,t[4],2)));var n}o[e[45]]=t[14],o.move=v,o[d("\ub921\ub952\ub960")]=l,o[d("\ub921\ub952\ub966")]=g,o.bs8=function(t){return g(t/Math.pow(2,r[41]))[e[48]](g(t))},o[function(t){if(!t)return"";for(var e="",n=73745,o=0;o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=n*o%256+r[4],e+=String.fromCharCode(a)}return e}("\u2073\u096e\u0949")]=function(t){var n=e[47],o=[];if(!t)return o;for(var i=r[3];i<t[u+c];i++)o[n+f](t[s+h](i));return o}},function(t,r,n){t.exports=n(e[50])},function(r,n,o){var i=t[27];function a(t){return t&&t.__esModule?t:{"default":t}}a(o(6));var u=a(o(8));var c=window._dx=window[function(r){if(!r)return"";for(var n=t[7],o=e[51],i=23524,a=0;a<r.length;a++){var u=r.charCodeAt(a);i=(i+1)%o.length,u^=o.charCodeAt(i),n+=String.fromCharCode(u)}return n}("j\\O")]||{};c.UA={"init":function(t){return new u["default"](t)}},r[i+"rts"]=c.UA},function(n,o,i){var a=r[43],u=t[30],c=t[31];function f(t){return m[t]||(m[t]=(r[3],v["default"])(t)),m[t]}o.__esModule=!0;var s,h=typeof Symbol===p("\u2077\u0968\u0954\u09f2\u09a4\u0934\u0981\u09df")&&typeof Symbol.iterator===C("lo"+a+u+"ys")?function(t){return typeof t}:function(r){return r&&"function"==typeof Symbol&&r[function(r){if(!r)return t[7];for(var n="",o="V587",i=23524,a=e[10];a<r.length;a++){var u=r.charCodeAt(a);i=(i+1)%o.length,u^=o.charCodeAt(i),n+=String.fromCharCode(u)}return n}(t[32])]===Symbol&&r!==Symbol[e[52]]?p("\u2062\u0964\u0957\u09f3\u09bf\u0931"):typeof r},d=i(7),v=(s=d)&&s.__esModule?s:{"default":s};function l(t){if(!t)return"";for(var e="",n=47427,o=r[3];o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=i,e+=String.fromCharCode(a)}return e}var g=i(e[53]);function p(e){if(!e)return"";for(var n="",o=73745,i=r[3];i<e.length;i++){var a=e.charCodeAt(i)^o;o=o*i%256+t[26],n+=String.fromCharCode(a)}return n}var m={};function C(t){return t.split("").reverse().join(r[2])}(t[4],g.addHandler)(window,"error",function(n){var o=t[33],i=r[44],a=e[54];if("object"!==(void 0===n?l("\ub936\ub958\ub93c\ub959\ub93f\ub956\ub938\ub95d\ub939"):h(n))&&(n=window.event),n){var u=n[e[55]]||n[p("\u2074\u096f\u0948\u09fe\u09a2\u0908\u099c\u09dd")]||"",s=n[l(o+"\ub923\ub94c")]||n.errorLine||"",d=n[t[34]]||n.errorCharacter||"",v=n[p("\u207c\u0978\u0949\u09e2\u09b1\u093a\u098b")]||n[e[56]]||"",g=new RegExp("ctu-greenseer|constid-js|captcha-ui").exec(u);g&&f(g[0])(t[35]+u+"\nline: "+s+C(" :loc\n")+d+c+"ms"+i+":"+a+v)}}),o["default"]=f(r[45])},function(n,o,i){r[46];var a="one",u=r[47];function c(r){if(!r)return"";for(var e=t[7],n=73745,o=t[4];o<r.length;o++){var i=r.charCodeAt(o)^n;n=n*o%256+2333,e+=String.fromCharCode(i)}return e}function f(t){return t.split("").reverse().join("")}function s(n){var o=t[36],i=e[23];if(!n)return"";for(var a=r[2],u=o+i,c=23524,f=0;f<n.length;f++){var s=n.charCodeAt(f);c=(c+e[15])%u.length,s^=u.charCodeAt(c),a+=String.fromCharCode(s)}return a}function h(r){if(!r)return"";for(var n=t[7],o=47427,i=e[10];i<r.length;i++){var a=r.charCodeAt(i),u=a^o;o=a,n+=String.fromCharCode(u)}return n}!function(r,e){t[37];n.exports=e()}(0,function(){return function(r){function n(e){if(o[e])return o[e][c("\u2074\u0965\u094a\u09fe\u09a2\u0929\u099d")];var i=o[e]={"i":e,"l":!1,"exports":{}};return r[e].call(i.exports,i,i.exports,n),i[t[38]]=!0,i[f("stropxe")]}var o={};return n.m=r,n.c=o,n[e[21]]=function(t,r,e){n[c("\u207e")](t,r)||Object[s("Q]Q?[]g$ZHR$AA")](t,r,{"configurable":!1,"enumerable":!0,"get":e})},n.n=function(t){var r=t&&t[f("eludoMse__")]?function(){return t["default"]}:function(){return t};return n.d(r,s("T"),r),r},n.o=function(t,r){return Object.prototype.hasOwnProperty.call(t,r)},n[c("\u2061")]=h(""),n(n[e[57]]=0)}([function(t,n,o){e[58],t[f(r[48])]=o(1)},function(n,o,i){var f="lengt",d=t[13],v=t[39];s("@KRvFLE?VL");var l={"server":"https://eventreport.dingxiang-inc.com/api/errMsgReport","appName":"","errMsg":"","time":t[4],"page":location[e[60]],"userAgent":navigator[t[40]]};n.exports=function(n){return function(){var o=arguments[r[50]]>0&&arguments[0]!==undefined?arguments[0]:{};c("\u2062\u0969\u0948\u09f8\u09be\u093a")==typeof o&&(o={"errMsg":o}),o=function(t){for(var r=arguments[e[59]+"h"],n=Array(r>1?r-1:0),o=1;o<r;o++)n[o-1]=arguments[o];for(var i=0;i<n[f+d];i++){var a=n[i];for(var u in a)t[u]=a[u]}return t}({},l,{"appName":n,"time":+new Date},o);var i=[];for(var s in o)new RegExp(t[41])[h("\ub937\ub952\ub921\ub955")](s)||i[r[51]](s+"="+encodeURIComponent(o[s]));!function(t){var n=new Image,o=h("\ub91c\ub96b\ub90e\ub96c\ub933\ub95f\ub930\ub957\ub908\ub961\ub90c\ub96b\ub934")+String(Math[r[49]]()).substring(e[53]);window[o]=n,n.onload=n[a+u+v]=function(){window[o]=null},n.src=t}(o.server+"?"+i.join(r[52]))}}}])})},function(n,o,i){var a="ASdr",u="s",c="Log",f=e[61],s=t[42],h=t[43],d=r[10],v=t[44],l=t[45],g=t[46],p=t[47],m=r[53],C=e[62],w=e[63],A=t[48],y=r[44],S=t[22],b=r[54],_=r[55],x=r[56],E=e[64],M=r[57],T=e[65],R=r[58],V=t[49],P=r[59],D=e[66],L=t[50],j=t[50],Y=t[51],O=e[57],F=t[52],I=e[57],H=r[17],W=t[53],X=t[54],B=t[55],G=e[67],N=e[61],K=e[68],J="p",$=e[69],k="lengt",Q="getAttribut",Z="e",U="h",q=r[39];o.__esModule=!0;var z=ft(i(9)),tt=i(1),rt=i(e[70]),et=i(e[53]),nt=i(0),ot=i(3);function it(r){return t[14]}var at=i(12);function ut(t){if(!t)return r[2];for(var n=e[0],o=47427,i=0;i<t.length;i++){var a=t.charCodeAt(i),u=a^o;o=a,n+=String.fromCharCode(u)}return n}var ct=i(13);function ft(t){return t&&t[pt("\u204e\u0942\u095f\u09e2\u099d\u0932\u098a\u09c4\u0998\u09d8")]?t:{"default":t}}var st=i(t[56]),ht=ft(i(15)),dt=ft(i(16));function vt(t){if(!t)return"";for(var e=r[2],n=r[60],o=r[3];o<t.length;o++){var i=t.charCodeAt(o);i^="V587".charCodeAt(n=(n+1)%"V587".length),e+=String.fromCharCode(i)}return e}function lt(t){return t&&t[mt("di")]?encodeURIComponent(t[vt(e[71])]):""}var gt=function(){var n="a",o="maxSA",i=r[62],ft=e[72],gt=e[73],Ct=r[63],wt=t[59],At=e[74],yt=t[60],St=e[75],bt=t[61],_t=r[64],xt=e[76],Et=e[77],Mt=t[62],Tt=t[63],Rt=r[10],Vt=r[65],Pt=e[78],Dt=t[64],Lt=e[79],jt=t[65],Yt=e[80],Ot=t[22],Ft=t[66],It=t[52],Ht=r[66],Wt=t[67],Xt=e[66],Bt=e[81],Gt=t[51];function Nt(i){!function(r,e){if(!(r instanceof e))throw new TypeError(t[101])}(this,Nt),this[ut("\ub931\ub954\ub938\ub957\ub936\ub952")](e[14]),this.init(i),this[r[67]]=this.eventThrottle(this[mt(a+"ocer")],{"counter":u+n,"max":o+c})}return Nt.prototype.getUA=function(){return this[t[68]]},Nt.prototype[r[68]]=function(n){this[mt("au")]="",this[t[69]]=vt(""),this["_s"+f]=[],this._ca=[],this.tm=(0,nt.now)(),this.counters={"sa":0,"mm":r[3],"md":0,"kd":0,"fo":0,"tc":e[10],"tmv":0,"mmInterval":0,"tmvInterval":t[4]},n||(this[t[70]](""),this[r[69]]())},Nt[ut("\ub933\ub941\ub92e\ub95a\ub935\ub941\ub938\ub948\ub92d")][pt("\u2078\u0973\u0953\u09e5")]=function(r){this[e[82]]=(0,nt.extend)({},ht["default"],r||{}),this[mt(t[71])]()},Nt["pr"+s+"to"+h+"yp"+d].start=function(){var n=this;this[e[83]](),this.getBR(),this[r[70]](),this[t[72]](),this.getDI(),this.getEM(),this[t[73]](),this[v+"tTK"](),z["default"][mt(r[71])](function(){n["getS"+l](),n[e[84]]()})},Nt[pt("\u2061\u096f\u0955\u09e5\u09bf\u0929\u0997\u09c1\u0991")][vt("THG")]=function(e,n){var o=r[39],a=t[74],u=t[42],c=(0,nt[t[75]])([e].concat((0,ot[mt("2sb")])(n[g+o])));this._ua+=[c,n][r[72]](""),this.ua=[dt["default"][vt("C]E%\\W"+a)],"#",(r[3],rt["bt"+u+p])(this[ut(m+"\ub969"+i)])].join(ut("")),this.option[pt(t[76])]&&this[vt("FAY5aWq9GU")](this[r[73]])},Nt.prototype.process=function(r){var n=e[85],o=[][mt("ecils")].call(arguments);return r=o[n+"gth"]===t[11]&&(0,nt[ut("\ub92a\ub959\ub918\ub96a\ub918\ub979\ub900")])(r)?r:o,r=(t[4],nt[C+"en"])(r),(t[4],nt.toStr)(r)},Nt.prototype.eventThrottle=function(n){var o=this,i=arguments.length>1&&arguments[r[34]]!==undefined?arguments[1]:{},a=i[ut(r[74])],u=i[pt("\u2072\u0972\u094f\u09ff\u09a4\u0938\u099c")],c=i.max,f=i.intervalCounter,s=i[pt("\u2078\u0973\u094e\u09f4\u09a2\u092b\u098f\u09dd")];return function(i){var h=r[75],d=t[77];i=(e[10],et[pt(h+"\u09d4\u09a6\u0938"+d)])(i),(0,nt[r[76]])(a)&&a(i),o[e[86]][u]>=o.option[c]||s&&(o.counters[f]=(o[vt("VWB8A]E%")][f]+e[15])%o["opt"+ft][s],o.counters[f]!==t[11])||(o.counters[u]+=1,n.call(o,i))}},Nt.prototype.bindDomEvents=function(){var n=e[57],o=e[87],i=t[25],a=t[78],u=r[77],c=e[27],f=e[88],s=e[89],h=r[78],d=this;if(!this[e[90]]){this[ut(e[91])]=!0,(r[3],et[pt("\u2070\u0979\u095e\u09d9\u09b1\u0933\u098a\u09dd\u0991\u09cf")])(document,ut("\ub92e\ub941\ub934\ub947\ub922\ub94f\ub920\ub956\ub933"),this[vt("PNR8Al_$ZLC:P")](this.getMM,{"before":function(t){d.isMouseDown&&d.recordSA(t)},"counter":"mm","max":"maxMMLog","intervalCounter":"mmInterval","interval":"MMInterval"})),(0,et[t[79]])(document,gt+w+Ct,function(r){d.recordCA((0,et[mt(t[80])])(r))}),(0,et[vt("T\\S\x1eTVS:PJ")])(document,t[81],this.eventThrottle(this.getMD,{"before":function(t){(0,et[mt("tegraTteg")])(t);0===(0,et.getButton)(t)&&it()&&(d.reloadSA(),d["i"+n+"Mo"+o+"seDo"+i+"n"]=!0)},"counter":"md","max":a+u+"DLog"})),(0,et[e[92]])(document,pt("\u207c\u0972\u094f\u09e2\u09b5\u0928\u099e"),function(){d.isMouseDown=!1}),(0,et[ut("\ub922\ub946\ub922\ub96a\ub90b\ub965\ub901\ub96d\ub908\ub97a")])(document,"keydown",this[e[93]](this.getKD,{"counter":vt("^\\"),"max":"maxKDLog"}));var v=this["ev"+c+wt+"t"+A+"hr"+At+"t"+f+"le"](this[y+S+"t"+b+_],{"counter":"fo","max":t[82]});document[e[94]]?(document["addEv"+s+x+"r"]("focus",v,!0),document[e[94]]("blur",v,!0)):document.attachEvent&&(document.attachEvent(vt("ZVQ9VMD?["),v),document[e[95]]("onfocusout",v)),nt[ut("\ub92a\ub959\ub90d\ub962\ub917\ub974\ub91c\ub958\ub93d\ub94b\ub922\ub941\ub924")]&&((0,et[mt("reldnaHdda")])(document,"touchstart",this.eventThrottle(this.getTC,{"before":function(t){(e[10],et.getTarget)(t);it()&&(d.reloadSA(),d.isTouchDown=e[14])},"counter":ut("\ub937\ub954"),"max":"maxTCLog"})),(0,et.addHandler)(document,"touchmove",this.eventThrottle(this[vt("R]C\x02xn")],{"before":function(n){var o=n[e[96]][t[4]];d.isTouchDown&&d[r[67]](o)},"counter":"tmv","max":h+"TMVLog","intervalCounter":"tmvInterval","interval":"TMVInterval"})),(0,et.addHandler)(document,"touchend",function(){d.isTouchDown=!1}),(0,et.addHandler)(document,"touchcancel",function(){d.isTouchDown=!1}))}},Nt[pt("\u2061\u096f\u0955\u09e5\u09bf\u0929\u0997\u09c1"+E)].getTM=function(){var t=this[vt("EJX5PKD")]((0,ot[e[97]])(this[e[98]]));this.app(1,(0,at[e[99]])(t))},Nt[ut(M+T+R)]["get"+yt]=function(){var n=(0,ct[mt("SOte"+St)])(),o=(0,ct.getBrowserAndVersion)(),i=o[e[10]],a=o[1],u=this.process(n,i,(r[3],ot.bs2)(a[mt("htgnel")]),(0,ot.bss)(a));this.app(e[53],(t[4],at["encry"+V])(u))},Nt.prototype[vt(e[100])]=function(){var r=this.process((t[4],st.getScreenInfo)());this.app(3,(0,at[t[83]])(r))},Nt.prototype.getLO=function(){var r=document.referrer||vt(""),n=location[mt("ferh")]||"",o=this.process((0,ot.bs2)(n[vt("Y]Y1AP")]),(0,ot[e[101]])(n),(0,ot.bs2)(r[ut(t[84])]),(0,ot.bss)(r));this.app(4,(0,at[ut("\ub926\ub948\ub92b\ub959\ub920\ub950\ub924\ub968\ub927")])(o))},Nt[e[52]][mt(bt+"g")]=function(){var n=e[102],o=[tt.Promise,ct[n+"wserAndVersion"],st.getScreenInfo,nt[pt("\u2065\u0972\u0979\u09fe\u09b4\u0938\u09af\u09c3\u0986\u09dc\u09bb")]],i=(0,nt[mt("modnar")])(0,o.length-1),a=r[2]+o[i],u=(0,nt.random)(t[4],a[vt("Y]Y1AP")]-10),c=(0,nt.random)(2,10),f=this.process((0,ot[e[103]])(u),(0,ot.bs2)(c),(0,ot.bss)(a.substr(u,c)));this.app(5,(0,at.encryptCF)(f))},Nt.prototype.getDI=function(){var n=0;n="__IE_DEVTOOLBAR_CONS"+_t+"E_"+xt+"MMAND_LINE"in window?4:window.outerHeight&&window.innerHeight&&window.outerHeight-window.innerHeight>r[79]?8:window[vt(t[85])]&&window.innerWidth&&window[pt("\u207e\u0968\u094e\u09f4\u09a2\u090a\u0987\u09d5\u0980\u09d5")]-window[ut(t[86])]>200?8:1;var o=this[t[87]](n);this.app(6,(e[10],at[vt("PVT$LHC\x12|")])(o))},Nt.prototype[e[104]]=function(){var n,o,i,a,u=r[10],c=e[69],f=e[105],s=t[88],h=r[80],d=(0,nt[vt("XYG")])([(t[4],nt.some)([t[89],pt(e[106]),"callPhantom","webdriver","_Selenium_IDE_Recorder",r[81],e[107]],function(t){return t in window}),(0,nt[t[90]])(["__driver_evaluate",ut("\ub91c\ub943\ub934\ub951\ub933\ub957\ub925\ub94c\ub93a\ub95f\ub92d\ub972\ub917\ub961\ub900\ub96c\ub919\ub978\ub90c\ub969"),"__selenium_evaluate","__fxdriver_evaluate","__driv"+u+"r_unwrap"+c+"ed","__webdriver_unwrapped",Et+Mt+"ed","__fxdriver_u"+f,"__webdriver_script_f"+Tt,"__webdriver_scri"+P+D],function(t){return t in document}),(0,nt[r[82]])(["selenium","webdriver",t[91]],function(r){var e=t[92];return document["document"+e][vt("R]C\x17ALE?WMC3")](r)}),new RegExp(ut("\ub913\ub97b\ub91a\ub974\ub900\ub96f\ub902\ub948\ub91b"),vt("\\")).test(navigator.userAgent),(0,nt["is"+s+"eadl"+Rt+"ss"])(),(n=r[44],o=t[43],i=t[57],a=[[navigator,pt(r[61])],[navigator,"platform"],[navigator,ut(t[58])],[navigator,vt("YYY1@YP3F")],[navigator,vt("VWX=\\]r8TZ[3Q")],[screen,ut("\ub934\ub95d\ub939\ub94d\ub925")],[screen,"hei"+n+U+o],[screen,"colo"+i+q]],(0,nt.some)(a,function(t){return(r[3],nt[vt("EJX&q]Q?[]S")])(t[r[3]],t[1])}))],function(r){return t[7]+(r?e[15]:0)})["jo"+h+Vt]("");d=parseInt(("00000000000000000000000000000000"+d)["sub"+Pt](-32),2);var v=this.process((t[4],ot.bs4)(d));this[vt("THG")](7,(0,at.encryptEM)(v))},Nt[mt(e[108])][mt("VSJteg")]=function(){var r=this.process((t[4],ot.bs4)(dt["default"][pt(t[93])]));this.app(8,(0,at.encryptJSV)(r))},Nt.prototype.getTK=function(){var t=e[109],n=this[pt(e[110])].token;n&&(n=this.process((0,ot[ut("\ub921\ub952\ub960")])(n.length),(0,ot[t+Dt])(n)),this.app(9,(0,at[ut(r[83])])(n)))},Nt.prototype[mt("MMteg")]=function(n){var o=t[94],i=lt((r[3],et[ut("\ub924\ub941\ub935\ub961\ub900\ub972\ub915\ub970\ub904")])(n)),a=(e[10],nt.now)()-this[pt("\u2065\u0970")],u=(e[10],et["getPag"+L])(n),c=(0,et.getPageY)(n),f=this.process((0,ot.bs4)(a),(0,ot[o+"2"])(u),(0,ot.bs2)(c),(0,ot.bs2)(i[e[13]]),(0,ot.bss)(i));this[vt("THG")](11,(0,at.encryptMM)(f))},Nt.prototype[pt("\u2076\u0978\u094e\u09dc\u0994")]=function(t){var n=lt((0,et.getTarget)(t)),o=(0,et.getButton)(t),i=(0,nt.now)()-this[mt("mt")],a=(e[10],et["getPag"+j])(t),u=(e[10],et.getPageY)(t),c=this.process((r[3],ot.bs4)(i),(0,ot[pt(r[84])])(a),(0,ot.bs2)(u),o,(0,ot[mt("2sb")])(n.length),(0,ot.bss)(n));this.app(12,(0,at[vt("PVT$LHC\x1bq")])(c)),this.counters[e[111]]<=2&&this.getDI()},Nt.prototype.getKD=function(n){var o=r[6],i=lt((0,et[vt("R]C\x02TJP3A")])(n)),a=(0,nt[t[6]])()-this[mt(t[95])],u=(0,et.getCharCode)(n);u===e[112]&&n[vt(r[85])]&&new RegExp("^[\\d\\w]"+Lt).test(n.key)&&(u=n.key.charCodeAt(0));var c=this["proce"+jt]((0,ot[vt(r[86])])(a),(0,ot["b"+o+"2"])(u),(t[4],ot[e[103]])(i.length),(0,ot.bss)(i));this.app(13,(r[3],at.encryptKD)(c)),this[e[86]].kd<=2&&this.getDI()},Nt.prototype.getFO=function(r){var n=lt((e[10],et[mt("tegraTteg")])(r)),o=(0,nt.now)()-this.tm,i=this.process((t[4],ot[mt("4sb")])(o),new RegExp(pt("\u2077\u0972\u0959\u09e4\u09a3")).test(r[ut("\ub937\ub94e\ub93e"+Yt)])?1:0,(0,ot[ut("\ub921\ub952\ub960")])(n[ut("\ub92f\ub94a\ub924\ub943\ub937\ub95f")]),(0,ot[Y+O+"s"])(n));this.app(14,(0,at.encryptFO)(i))},Nt["prot"+F+"yp"+Ot].getTC=function(n){var o=t[96],i=lt((0,et[o+"t"])(n)),a=(0,nt[vt("[W@")])()-this.tm,u=n.touches[0],c=this.process((0,ot[pt("\u2073\u096e\u090e")])(a),(0,ot[pt("\u2073\u096e\u0908")])(parseInt(u[Ft+"eX"]||r[3])),(0,ot[ut("\ub921\ub952\ub960")])(parseInt(u[e[113]]||0)),(0,ot[r[87]])(u.identifier||t[4]),(0,ot.bs2)(i[e[13]]),(0,ot.bss)(i));this[e[114]](e[115],(0,at.encryptTC)(c))},Nt.prototype.getTMV=function(n){var o=n.touches[0],i=lt((0,et.getTarget)(n)),a=(0,nt.now)()-this[ut("\ub937\ub95a")],u=this.process((r[3],ot[mt("4sb")])(a),(0,ot.bs2)(parseInt(o.pageX||0)),(e[10],ot[vt(t[97])])(parseInt(o[e[113]]||t[4])),(0,ot.bs4)(o.identifier||0),(t[4],ot.bs2)(i[vt("Y]Y1AP")]),(0,ot.bss)(i));this.app(r[88],(0,at[r[89]])(u))},Nt[mt("epytotorp")].recordSA=function(t){var e=(0,nt.now)()-this.tm,n=(0,et.getPageX)(t),o=(0,et[r[90]])(t),i=this.process((r[3],ot.bs4)(e),(0,ot[ut("\ub921\ub952\ub960")])(n),(0,ot[r[91]])(o));this[r[92]]["pu"+I+"h"]((0,at[pt("\u2074\u0973\u0959\u09e3\u09a9\u092d\u099a\u09e2\u09b5")])(i))},Nt.prototype.sendSA=function(){var r=this;(t[4],nt[vt("PYT>")])(this._sa,function(e){r[mt(t[98])](17,e)})},Nt[mt("epyt"+It+"or"+Ht)].reloadSA=function(){this.counters.sa=t[4],this[H+"a"]=[]},Nt.prototype[vt(W+Wt+"t\x17")]=function(n){var o=e[116],i=t[30],a=r[43],u=(0,et[ut(r[93])])(n);if(new RegExp(r[94]).test(u[mt("emaNssalc")])){var c=(t[4],nt[Xt+"o"+o])()-this["t"+i],f=(r[3],et[pt("\u2076\u0978\u094e\u09de\u09b6\u093b\u099d\u09d4\u0980\u09e5")])(n),s=(0,et.getOffsetY)(n),h=this.process((0,ot[Bt+"s"+X])(c),(0,ot[a+"s"+B])(f),(0,ot[t[99]])(s));this._ca[r[51]]((0,at[vt(e[117])])(h))}},Nt[pt("\u2061\u096f\u0955\u09e5\u09bf\u0929\u0997\u09c1\u0991")].spliceCA=function(t){this[ut("\ub91c\ub97f\ub91e")][mt("ecilps")](t,this[pt("\u204e\u097e\u095b")].length-t)},Nt[mt(t[100])][G+"ndCA"]=function(){var e=this;(t[4],nt.each)(this["_c"+N],function(t){e.app(r[95],t)})},Nt[K+"type"].sendTemp=function(t){var r=this[pt("\u2061\u096f\u0955\u09f2\u09b5\u092e\u099d")]((0,ot[mt("2s"+Gt)])(t[mt("htgnel")]),(e[10],ot.bss)(t));this.app(10,(0,at[pt("\u2074\u0973\u0959\u09e3\u09a9\u092d\u099a\u09e5\u09b1\u09f0\u0992")])(r))},Nt.prototype.syncToForm=function(t){var n=function(t,n){var o=(r[3],nt[vt('\\Kd"GQY1')])(t)?document.getElementById(t.split(e[118])[J+"o"+$]()):t[r[96]]?t:null;if(!o)return e[119];for(var i=o.getElementsByTagName("*"),a=void 0,u=0;u<i[k+"h"];u++)if(a=i[u],new RegExp("^(input|textarea)$","i").test(a.nodeName)&&a[Q+Z](vt("[YZ3"))==n)return a;return(a=document.createElement("input")).type="hidden",a.name=n,o.appendChild(a),a}(this.option.form,this.option.inputName);n&&(n.value=t)},Nt}();function pt(e){if(!e)return r[2];for(var n="",o=73745,i=0;i<e.length;i++){var a=e.charCodeAt(i)^o;o=o*i%t[29]+r[4],n+=String.fromCharCode(a)}return n}function mt(t){return t.split("").reverse().join(e[0])}o["default"]=gt},function(n,o,i){var a=e[120],u=r[66],c=e[121],f=e[57],s=r[10];o[a+"_esModule"]=!0;var h=i(10);var d,v=(d=h)&&d.__esModule?d:{"default":d};var l=i(e[15])[function(r){if(!r)return t[7];for(var e="",n=47427,o=0;o<r.length;o++){var i=r.charCodeAt(o),a=i^n;n=i,e+=String.fromCharCode(a)}return e}(r[97])].defer();(0,v["default"])(function(){l.resolve()}),o["default"]=l[u+"rom"+c+f+s]},function(n,o,i){var a=r[98],u=t[43],c=r[99];!function(r,e){t[14]?n.exports=e():"function"==typeof define&&"object"==typeof define.amd?define(e):this.domready=e()}(0,function(n){var o,i=[],f=document,s=f.documentElement,h=s.doScroll,d=(h?new RegExp(r[100]):new RegExp("^loaded|c")).test(f.readyState);function v(t){for(d=r[34];t=i.shift();)t()}return f.addEventListener&&f.addEventListener("DOMContentLoaded",o=function(){f.removeEventListener("DOMContentLoaded",o,!1),v()},!1),h&&f[e[95]]("onreadystatechange",o=function(){var n=e[122];new RegExp(function(n){var o=t[36];if(!n)return t[7];for(var i=e[0],a=o+"87",u=t[102],c=0;c<n.length;c++){var f=n.charCodeAt(c);u=(u+r[34])%a.length,f^=a.charCodeAt(u),i+=String.fromCharCode(f)}return i}(e[123]))["te"+a](f.readyState)&&(f[n+"vent"]("onreadystatechange",o),v())}),n=h?function(r){self!=top?d?r():i.push(r):function(){try{s[e[124]]("lef"+u)}catch(o){return setTimeout(function(){n(r)},t[104])}r()}()}:function(t){d?t():i["pu"+c](t)}})},function(n,o,i){var a=t[105],u=e[125],c=t[106],f="V58",s="7";function h(t){if(!t)return"";for(var r="",n=f+s,o=23524,i=0;i<t.length;i++){var a=t.charCodeAt(i);o=(o+e[15])%n.length,a^=n.charCodeAt(o),r+=String.fromCharCode(a)}return r}function d(e){if(!e)return"";for(var n=t[7],o=73745,i=0;i<e.length;i++){var a=e.charCodeAt(i)^o;o=o*i%r[42]+r[4],n+=String.fromCharCode(a)}return n}r[101],o[d("\u204e\u0942\u095f"+a+u+"\u09d8")]=!0,o[h(c+"X7")]=function(n){if(!n)return"";var o,i,a,u,c,f,s,g=h(""),p=0;for(;p<n[d("\u207d\u0978\u0954\u09f6\u09a4\u0935")];)o=n[d(r[102])](p++),i=n.charCodeAt(p++),a=n.charCodeAt(p++),u=o>>2,c=(o&e[126])<<t[107]|i>>4,f=(i&t[108])<<2|a>>6,s=63&a,isNaN(i)?f=s=64:isNaN(a)&&(s=64),g=g+v.charAt(u)+v[r[103]](c)+v[r[103]](f)+v[l("\ub920\ub948\ub929\ub95b\ub91a\ub96e")](s);return g};var v="XmYj3u1PnvisIZUF8ThR/a6DfO+kW4JHrCELycAzSxleoQp02MtwV9Nd57qGgbKB=";function l(t){if(!t)return"";for(var e="",n=r[104],o=r[3];o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=i,e+=String.fromCharCode(a)}return e}},function(n,o,i){r[105];var a=t[109],u=e[127],c="\ub92f\ub94a",f="\ub924\ub943",s="\ub937\ub95f",h="VPV$vW",d="\u0978",v="\u09f6",l="leng",g="th",p="charCo",m=e[128],C="om",w="VxM",A="fromCh",y="arCode",S=r[106],b=r[107],_="char",x="Code",E=r[108],M=t[38],T=t[22],R="n",V="g",P="h",D="\ub92f\ub94a\ub924",L="edoC",j="l",Y="n",O=r[105],F="\u0975",I="\u0993",H=t[110],W=e[129],X="\u09c9";function B(t){return t.split("").reverse().join("")}function G(t){if(!t)return e[0];for(var r="",n=73745,o=0;o<t.length;o++){var i=t.charCodeAt(o)^n;n=n*o%256+2333,r+=String.fromCharCode(i)}return r}function N(t){if(!t)return"";for(var r="",e=47427,n=0;n<t.length;n++){var o=t.charCodeAt(n),i=o^e;e=o,r+=String.fromCharCode(i)}return r}function K(n){if(!n)return"";for(var o=t[7],i=r[116],a=e[134],u=0;u<n.length;u++){var c=n.charCodeAt(u);a=(a+1)%i.length,c^=i.charCodeAt(a),o+=String.fromCharCode(c)}return o}o[K(t[111])]=t[14],o.encryptTM=function(r){for(var e="",n=t[119],o=0;o<r.length;o++){var i=r.charCodeAt(o),a=i>>4,u=i<<4,c=a+u+n&t[114];e+=String[t[115]](c)}return e},o.encryptBR=function(r){for(var n=e[131],o=t[7],i=821,a=0;a<r[N(c+f+s)];a++){var u=i<<4^i;i=(240&u)+(i>>7),o+=String[t[115]](255&(r[K(h+n)](a)^i))}return o},o.encryptSC=function(t){for(var n=e[135],o="",i=43221,a=r[3];a<t[G("\u207d"+d+"\u0954"+v+"\u09a4"+n)];a++){var u=t.charCodeAt(a),c=u^i;i=i*a%256+24671,o+=String.fromCharCode(c&e[132])}return o},o[N("\ub926\ub948\ub92b\ub959\ub920\ub950\ub924\ub968\ub927")]=function(e){for(var n=r[2],o=312,i=0;i<e[l+g];i++){var a=o<<2^o;o=(240&a)+(o>>5),n+=String[t[115]](255&(e[p+"deAt"](i)^o))}return n},o["encr"+a+"F"]=function(r){for(var e="",n=t[118],o=0;o<r.length;o++){var i=r.charCodeAt(o),a=i^n;n=a,e+=String.fromCharCode(255&a)}return e},o[e[130]]=function(e){for(var n="",o=t[116],i=156,a=0;a<e.length;a++){var u=i<<o^i;i=(240&u)+(i>>4),n+=String[B(r[113])]((e[r[110]](a)^i)&t[114])}return n},o.encryptEM=function(n){for(var o=N(""),i=r[114],a=0;a<n.length;a++){var u=n[t[113]](a)-i&e[132],c=u>>3,f=u<<5,s=c+f&255;o+=String.fromCharCode(s)}return o},o[t[112]]=function(t){for(var r=B(""),e=33265,n=0;n<t.length;n++){var o=255&(t.charCodeAt(n)^e);r+=String[m+C+"CharCode"](o),e=o}return r},o[B("VSJtpyrcne")]=function(e){for(var n=r[111],o=r[2],i=w+"poN"+n+"7lA",a=32,u=t[4];u<e.length;u++){var c=e.charCodeAt(u);a=(a+3)%i.length,c^=i.charCodeAt(a),o+=String[A+y](255&c)}return o},o.encryptTK=function(t){for(var e="",n=2422,o=0;o<t.length;o++){var i=t.charCodeAt(o),a=i^n;(n+=2)>=r[117]&&(n=2372),e+=String[G(S+b)](a&r[118])}return e},o[G("\u2074\u0973\u0959\u09e3\u09a9\u092d\u099a\u09e5\u09b1\u09f0\u0992")]=function(t){for(var n="",o=G("\u2052\u092b\u0978\u09e3\u09e4\u093f\u09d8\u09d7\u09c3\u09f3\u09a5\u09fa"),i=44,a=0;a<t[e[13]];a++){var u=t.charCodeAt(a);i=(i+r[112])%o[r[50]],u^=o.charCodeAt(i),n+=String[B("edoCrahCmorf")](255&u)}return n},o[r[109]]=function(r){for(var e="",n=84357,o=0;o<r.length;o++){var i=r[_+x+"At"](o),a=i^n;n=a,e+=String[t[115]](255&a)}return e},o[u+"ptMD"]=function(t){for(var r="",n=e[133],o=131,i=0;i<t.length;i++){var a=o<<8^o;o=(240&a)+(o>>n),r+=String.fromCharCode(255&(t[G("\u2072\u0975\u095b\u09e3\u0993\u0932\u098a\u09d4\u09b5\u09c9")](i)^o))}return r},o.encryptKD=function(t){for(var e="",n=0,o=0;o<t[E+"gth"];o++){var i=t[r[110]](o);i^="Dx54v57Tnvc"[K("VPV$vWS3tL")](n),++n>="Dx54v57Tnvc".length&&(n=0),e+=String.fromCharCode(255&i)}return e},o.encryptFO=function(r){for(var n="",o=e[50],i=0;i<r[M+T+R+V+"t"+P];i++){var a=r[t[113]](i)-2&255,u=o,c=a>>u,f=a<<8-u,s=c+f&t[114];n+=String[K("SJX;vPV$vWS3")](s)}return n},o.encryptTC=function(t){for(var r="",e=62639,n=0;n<t.length;n++){var o=t.charCodeAt(n),i=o^e;e=i,r+=String.fromCharCode(255&i)}return r},o.encryptTMV=function(t){for(var r="",e=B("JDl8H8B6cV"),n=72,o=0;o<t[N(D+"\ub943\ub937\ub95f")];o++){var i=t[G("\u2072\u0975\u095b\u09e3\u0993\u0932\u098a\u09d4\u09b5\u09c9")](o);n=(n+1)%e.length,i^=e.charCodeAt(n),r+=String[B(L+"rahCmorf")](255&i)}return r},o.encryptCA=function(e){for(var n=r[44],o=B(""),i=147,a=0;a<e[j+"e"+Y+n+O+"h"];a++){var u=i<<3^i;i=(u&r[115])+(i>>4),o+=String[N(t[117])](255&(e[G("\u2072"+F+"\u095b\u09e3"+I+"\u0932\u098a"+H+W+X)](a)^i))}return o}},function(n,o,i){var a=r[119],u=r[120],c=e[27],f=e[4],s=t[120],h=r[121],d=t[39],v=e[57],l=r[122],g="e",p="e",m="(?:ba?idubrowser|baiduhd)",C=t[121],w="n\\/([\\",A="d.]+).",y="*safar",S="i",b="m";t[122],o[M("eludoMse__")]=e[14],o.getOS=function(){var t=0,n=[[e[133],new RegExp(M("diordnA"),"i")],[4,new RegExp("iPhone","i")],[r[125],new RegExp("iPod","i")],[6,new RegExp("iPad",e[121])],[2,new RegExp("Linux","i")],[3,new RegExp("Mac","i")],[1,new RegExp(function(t){if(!t)return e[0];for(var r="",n=e[46],o=0;o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=i,r+=String.fromCharCode(a)}return r}("\ub914\ub97d\ub913"),r[80])]];return(0,_[e[139]])(n,function(r){if((x||E).match(r[1]))return t=r[0],!1}),t},o["get"+a+u+"ows"+c+f+s+"n"+h+"Ve"+d+v+"ion"]=function(){var n=e[136],o=e[137],i=t[123],a=r[3],u=[[6,new RegExp("qqbrowser\\/([\\d.]+)",M(e[121]))],[e[133],new RegExp(t[124],t[125])],[8,new RegExp("360s"+g,r[80])],[r[123],new RegExp("360e"+p,r[80])],[13,new RegExp("micromessenger\\/([\\d.]+)","i")],[11,new RegExp("taobrowser\\/([\\d"+n,"i")],[12,new RegExp(m+C,M("i"))],[14,new RegExp("miuibrowser\\/([0-9.]+)",T("\u2078"))],[2,new RegExp("msie ([\\d.]+)","i")],[5,new RegExp(r[124],"i")],[5,new RegExp(function(t){if(!t)return"";for(var e="",n=r[60],o=0;o<t.length;o++){var i=t.charCodeAt(o);i^="V587".charCodeAt(n=(n+1)%"V587".length),e+=String.fromCharCode(i)}return e}("ZHE\n\x1a\x10l\nQ\x16j}\x1c"),"i")],[e[138],new RegExp("uc?browser\\/([\\d.]+)",T("\u2078"))],[t[23],new RegExp("uc\\/([\\d.]+)",T("\u2078"))],[1,new RegExp("chrome\\/([\\d.]+)",e[121])],[4,new RegExp("versio"+w+A+y+S,"i")],[3,new RegExp("firefox\\/([\\d.]+)","i")]];return(0,_.each)(u,function(t){var e=r[8],n=r[28],o=E[b+e+"t"+n+"h"](t[1]);if(o)return a=t[0],i=o[1]||"0",!1}),i=i["sp"+o+"t"](".")[0],[a,i]};var _=i(e[10]),x=navigator.platform,E=navigator["userAge"+l];function M(t){return t.split("").reverse().join(r[2])}function T(t){if(!t)return"";for(var e=r[2],n=73745,o=0;o<t.length;o++){var i=t.charCodeAt(o)^n;n=n*o%256+2333,e+=String.fromCharCode(i)}return e}},function(n,o,i){var a=e[66],u=r[10];function c(t){return t.split(r[2]).reverse().join("")}c("tcirts esu"),o.__esModule=!0,o.getScreenInfo=function(){return(0,f[v("\ub92e\ub94f\ub93f")])(d,function(r){return(0,s.bs2)(r()||t[4])})};var f=i(t[4]),s=i(e[126]),h=window[function(e){if(!e)return t[7];for(var n=r[2],o=73745,i=r[3];i<e.length;i++){var a=e.charCodeAt(i),u=a^o;o=o*i%256+2333,n+=String.fromCharCode(u)}return n}(e[140])];var d=[function(){return h.width},function(){return h.height},function(){return h.availWidth},function(){return h.availHeight},function(){return Math[e[141]](window[e[142]])},function(){return Math[c("sba")](window.screenTop)},function(){return window.innerWidth||document[l(e[143])]&&document.documentElement.clientWidth||document[v("\ub921\ub94e\ub92a\ub953")][c("htdiWtneilc")]},function(){var t=r[126];return window["in"+a+"er"+t+u+"ight"]||document[v("\ub927\ub948\ub92b\ub95e\ub933\ub956\ub938\ub94c\ub909\ub965\ub900\ub96d\ub908\ub966\ub912")]&&document.documentElement.clientHeight||document[e[144]].clientHeight},function(){return window[l(e[145])]},function(){return window[l("ZMC3GpR?RPC")]}];function v(t){if(!t)return"";for(var r="",n=e[46],o=0;o<t.length;o++){var i=t.charCodeAt(o),a=i^n;n=i,r+=String.fromCharCode(a)}return r}function l(e){if(!e)return"";for(var n=t[7],o=r[116],i=23524,a=0;a<e.length;a++){var u=e.charCodeAt(a);i=(i+1)%o.length,u^=o.charCodeAt(i),n+=String.fromCharCode(u)}return n}},function(e,n,o){n.__esModule=!0,n["default"]={"token":"","form":"","inputName":"ua","maxMDLog":10,"maxMMLog":20,"maxSALog":250,"maxKDLog":10,"maxFocusLog":6,"maxTCLog":10,"maxTMVLog":r[127],"MMInterval":t[104],"TMVInterval":50}},function(n,o){var i=t[126];n["ex"+t[127]+"rts"]={"version":function(e){if(!e)return"";for(var n=r[2],o="V58"+i,a=t[102],u=0;u<e.length;u++){var c=e.charCodeAt(u);a=(a+t[11])%o.length,c^=o.charCodeAt(a),n+=String.fromCharCode(c)}return n}("FgAe"),"jsv":e[15]}}])}(["X","vPV$","d","call",0,"getOwnPropertyDescriptors","now","","p","style","display",1,"denifednu","h",!0,"prototype","\ub937\ub95f\ub93a\ub954","_state","then","Listener","on","documentElement","e",10,"eAt","w",2333,"expo",73745,256,"m","\n","VWY%AJB5AWE","\ub92f\ub946\ub928\ub94d","colno","url: ","V5","fun","l","r","userAgent","^(server)$","o","t","ge","C","leng","a","T","ptBR","eX","b","ot","G]T","4","2",14,"rDep","\ub92f\ub94e\ub920\ub947\ub932\ub953\ub934\ub951","n","BR","FCte","m_unwrapp","unc","s","ss","pag","9G\\","ua","_ua","syncToForm","trats","getCF","getJSV","Y","toStr","\u2077\u0972\u0948\u09fc","\u0980\u09c5","ma","addHandler","tnevEteg","mousedown","maxFocusLog","encryptSC","\ub92f\ub94a\ub924\ub943\ub937\ub95f","ZMC3Go^2AP","\ub92a\ub944\ub92a\ub94f\ub93d\ub96a\ub903\ub967\ub913\ub97b","process","H","phantom","some","driver","Element","\u207b\u096e\u094c","bs","mt","getTarge","WK\x05","ppa","bs2","epytotorp","Cannot call a class as a function",23524,47427,50,"\u09e2\u099d\u0932","WL",4,15,"yptC","\u09d4","jgR%xWS#Y]","encryptSA","charCodeAt",255,"fromCharCode",6,"\ub925\ub957\ub938\ub955\ub916\ub97e\ub91f\ub96d\ub92e\ub941\ub925\ub940",34313,15273,"A","[ \\/]([\\d.x]+)","use strict","0","edge\\/([\\d.]+)","i","7","po"],[!1,"exports","",0,2333,"o","s","ead","a","l","e","\ub921\ub94e","String","vWS3","call","webdriver","Code","_s","res","le","mis","resolv",2,"3VL","_onRejected","_onFulfilled","_reason","_value","c","eludoMse__","returnValue","test","$)6|2(^",'WMC"ZV',1,"documentElement","X","\u2076\u0978\u094e\u09d3\u09bf\u0928\u0980\u09d5\u099d\u09d3\u09a5\u09f2\u09d4\u09d4\u09d3\u0a7f\u0a68\u098f\u09af\u0932\u0954","leng","th",8,32,256,"b","g","ctu-greenseer","on","rro","stropxe","random","length","push","&","\ub91c","F","O","stene","\ub933\ub941\ub92e","\ub938\ub948\ub92d","pt_f",23524,"\u2064\u096e\u095f\u09e3\u0991\u093a\u098b\u09df\u0980","\ub908","k","OL","n","p","recordSA","reload","start","getLO","neht","join","ua","\ub921\ub944\ub922\ub94d\ub93f\ub95a","\u2076\u0978\u094e","isFunction","xM","max",200,"i","_selenium","some","\ub926\ub948\ub92b\ub959\ub920\ub950\ub924\ub970\ub93b","\u2073\u096e\u0908","^]N","WK\x03","bs4",16,"encryptTMV","getPageY","bs2","_sa","\ub924\ub941\ub935\ub961\ub900\ub972\ub915\ub970\ub904","dx_captcha_clickword_hits",18,"nodeType","\ub913\ub961\ub90e\ub963\ub90a\ub979\ub91c","st","sh","^loaded|^c","use strict","\u2072\u0975\u095b\u09e3\u0993\u0932\u098a\u09d4\u09b5\u09c9","charAt",47427,"t","\u2077\u096f\u0955\u09fc\u0993\u0935\u098f\u09c3\u09b7\u09d2","\u09a6\u09d4","len","encryptMM","charCodeAt","86g",4,"edoCrahCmorf",6,240,"V587",2147483647,255,"B","r","d","nt",9,"opera.+version\\/([\\d.ab]+)",5,"H",20],["","l","stropxe",4,"r","cal","char","f","filter","map",0,"htgnel","push","length",!0,1,2333,!1,"\ub949","C","h","d","VJR7A]r:PUR8A","87","te","_st","rac","e","reject","_on","led","\ub933\ub941\ub92e\ub943\ub92a\ub959\ub93c","defer",256,"evloser","nts","getEvent","\u2076\u0978\u094e\u09de\u09b6\u093b\u099d\u09d4\u0980\u09e5","addEvent","test","2.0","scr","left","use s","trict","__esModule",47427,"pu","concat","V58",5,"V587","prototype",2," ","filename","errorMessage","s","use strict","lengt","href","a","flatt","ic","\u0991","\ub95a\ub935\ub941","n","se","proto","p",11,"\\\\","ion","cl","o","g","CO","__seleniu","str","$","\ub95b","b","option","getTM","bindDomEvents","len","counters","u","t","entLi","binded","\ub921\ub948\ub926\ub942\ub927\ub943","addHandler","eventThrottle","addEventListener","attachEvent","touches","bs8","tm","encryptTM","R]C\x05v","bss","getBro","bs2","getEM","nwrapped","\u204e\u096d\u0952\u09f0\u09be\u0929\u0981\u09dc","callSelenium","epytotorp","bs","\u207e\u096d\u094e\u09f8\u09bf\u0933","md",229,"pageY","app",15,"w","PVT$LHC\x15t","#",null,"_","i","detachE","k[","doScroll","\u098a\u09c4\u0998",3,"encry","fr","\u09b5","encryptDI","S3tL",255,7,23524,"\u0935",".]+)","li",10,"each","\u2062\u097e\u0948\u09f4\u09b5\u0933","abs","screenLeft",'QWT#X]Y"pTR;PVC',"body","ZMC3Go^2AP",73745]);
  }).call(env);
  if (!env._dx || !env._dx.UA || typeof env._dx.UA.init !== "function") throw new Error("H5 SDK 未初始化");
  h5Factory = (sid) => env._dx.UA.init({ token: sid });
  return h5Factory;
}
async function createH5Ac(sid, submitX, submitY) {
  const ua = loadH5Factory()(sid);
  ua.start();
  const target = { className: "dx-captcha-slider-button", id: "", getBoundingClientRect: () => ({ top: 20, left: 20 }) };
  const baseX = 35, baseY = 220;
  const event = (x, y) => ({ pageX: x, pageY: y, clientX: x, clientY: y,
    button: 0, buttons: 1, target: target, timeStamp: Date.now() });
  // 真实经历的计时，避免所有轨迹数据都落在同一毫秒。
  const drag = Math.max(0, Number(submitX) - 10);
  ua.getMD(event(baseX, baseY));
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    await sleep(24);
    const p = i / steps;
    const x = Math.round(drag * (1 - Math.pow(1 - p, 3)));
    ua.getMM(event(baseX + x, baseY));
    ua.recordSA({ x: x, y: 0 });
  }
  ua.sendSA();
  // submitX 已为最终提交坐标；这里不再次加 10。
  ua.sendTemp("x=" + Math.round(submitX) + "&y=" + Math.round(submitY));
  const ac = ua.getUA();
  if (typeof ac !== "string" || !/^s_v3#[A-Za-z0-9+/=]+$/.test(ac)) throw new Error("H5 验证数据格式错误");
  return ac;
}

/* ==========================================================================
 * 二、请求层（Loon）
 * ========================================================================== */
function httpReq(o) {
  return new Promise((resolve) => {
    const opt = { url: o.url, headers: o.headers || {}, timeout: o.timeout || 15000,
      body: o.body, "auto-cookie": false };
    if (o.binary) opt["binary-mode"] = true;
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
    const cb = (err, resp, data) => {
      if (err) { log("请求失败：网络或超时错误"); return finish(null); }
      finish({ status: Number(resp && (resp.status || resp.statusCode)),
        headers: (resp && resp.headers) || {}, body: data });
    };
    try {
      const method = String(o.method || "GET").toLowerCase();
      if (!$.http || typeof $.http[method] !== "function") {
        log("请求失败：HTTP 客户端不可用"); return finish(null);
      }
      $.http[method](opt, cb);
    } catch (e) { log("请求失败：HTTP 客户端异常"); finish(null); }
  });
}

/** 不自动重试写操作，避免超时后重复签到或消耗抽奖机会。 */
async function apiRequest(o) {
  if ($.ckExpired) return null;
  const headers = Object.assign({}, o.headers || {});
  const body = o.body === undefined ? undefined : (o.form ? queryStr(o.body) : JSON.stringify(o.body));
  if (body !== undefined && !hasHeader(headers, "content-type")) {
    headers["Content-Type"] = o.form ? "application/x-www-form-urlencoded" : "application/json;charset=UTF-8";
  }
  const res = await httpReq({ url: o.url, method: o.method || "GET", headers, body, timeout: o.timeout });
  if (!res) return null;
  let obj = res.body;
  if (typeof obj === "string") { try { obj = JSON.parse(obj); } catch (e) { obj = null; } }
  if (obj && typeof obj === "object" && !Array.isArray(obj) && String(obj.code) !== "0000" &&
      EXPIRED_PATTERN.test(String(obj.message || obj.msg || ""))) {
    $.ckStatus = false; $.ckExpired = true;
  }
  if (!(res.status >= 200 && res.status < 300)) {
    log("请求失败：HTTP " + (res.status || "未知")); return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    log("请求失败：响应不是 JSON 对象"); return null;
  }
  return obj;
}

function hasHeader(h, name) {
  return Object.keys(h).some((k) => k.toLowerCase() === name);
}
function queryStr(o) {
  return Object.keys(o).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(o[k] === undefined || o[k] === null ? "" : o[k])}`).join("&");
}

/* ==========================================================================
 * 三、滑块验证（顶象）—— 轻量定位 + token 复用
 * ========================================================================== */

/**
 * o 字段解码（顶象插件模块 6225）：
 * 挑战响应里的 o 形如 "dingxiangxxxx..."，它编码了背景图 32 列的置换顺序。
 * 用它对背景图做列还原后，缺口匹配分数可从 ~0.2 提升到 ~0.9。
 */
function decodePermutation(o) {
  const out = [];
  const str = String(o || "");
  for (let r = 0; r < str.length; r++) {
    let a = str.charCodeAt(r);
    if (r === 32) break;
    let guard = 0;
    while (out.indexOf(a % 32) > -1 && guard++ < 64) a++;
    out[r] = a % 32;
  }
  return out;
}

/** 按置换还原背景图（第 perm[i] 列 -> 第 i 列），返回 {gray,w,h} */
function unshuffleByPerm(bg, perm) {
  const n = perm.length;
  if (n < 2) return bg;
  const w = bg.w, h = bg.h;
  const base = Math.floor(w / n);
  if (base < 1) return bg;
  const cols = [];
  for (let i = 0; i < n; i++) cols.push([i * base, i === n - 1 ? w : (i + 1) * base]);
  const out = new Float32Array(w * h);
  let x = 0;
  for (let i = 0; i < n; i++) {
    const src = Math.max(0, Math.min(n - 1, perm[i]));
    const x0 = cols[src][0], x1 = cols[src][1];
    const wc = x1 - x0;
    for (let y = 0; y < h; y++) {
      const srcRow = y * w + x0, dstRow = y * w + x;
      for (let k = 0; k < wc; k++) out[dstRow + k] = bg.gray[srcRow + k];
    }
    x += wc;
  }
  return { w: w, h: h, gray: out, scale: bg.scale || 1 };
}

/** 灰度图上的边缘图（Sobel 近似，归一化 0..255） */
function edgeMap(gray, w, h) {
  const out = new Float32Array(w * h);
  let max = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const m = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
      out[i] = m;
      if (m > max) max = m;
    }
  }
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] * 255) / max;
  return out;
}

/**
 * 边缘轮廓匹配：用拼图 alpha 轮廓在背景边缘图上做 NCC。
 * 返回 { x, y, score }，x/y 为采样图坐标（乘 scale 可还原到原图坐标）。
 */
function matchGapEdge(bgGray, bgW, bgH, piece, rowMin, rowMax) {
  if (!bgGray || !piece || !piece.gray || !piece.alpha) return null;
  const pw = piece.w, ph = piece.h, mask = piece.alpha;
  let minX = pw, minY = ph, maxX = -1, maxY = -1;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (mask[y * pw + x] > 127) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  if (tw >= bgW || th >= bgH) return null;
  const bgEdge = edgeMap(bgGray, bgW, bgH);
  const px = [], py = [], pc = [];
  let n = 0, tmu = 0;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = minX + x, sy = minY + y;
      if (mask[sy * pw + sx] <= 127) continue;
      let e = 0;
      if (sx === 0 || sx === pw - 1 || mask[sy * pw + sx - 1] <= 127 || mask[sy * pw + sx + 1] <= 127) e = 1;
      if (sy === 0 || sy === ph - 1 || mask[(sy - 1) * pw + sx] <= 127 || mask[(sy + 1) * pw + sx] <= 127) e = 1;
      px.push(x); py.push(y); pc.push(e); tmu += e; n++;
    }
  }
  if (n < 16) return null;
  tmu /= n;
  let tss = 0;
  for (let i = 0; i < n; i++) { pc[i] -= tmu; tss += pc[i] * pc[i]; }
  if (tss <= 1e-6) return null;
  const y0 = Math.max(0, rowMin === undefined ? 0 : rowMin);
  const y1 = Math.min(bgH - th, rowMax === undefined ? bgH - th : rowMax);
  let best = { score: -2, x: 0, y: 0 };
  for (let oy = y0; oy <= y1; oy++) {
    for (let ox = Math.max(0, Math.round(bgW * 0.05)); ox + tw <= bgW; ox++) {
      let wmu = 0;
      for (let i = 0; i < n; i++) wmu += bgEdge[(oy + py[i]) * bgW + ox + px[i]];
      wmu /= n;
      let num = 0, wss = 0;
      for (let i = 0; i < n; i++) {
        const wv = bgEdge[(oy + py[i]) * bgW + ox + px[i]] - wmu;
        num += pc[i] * wv; wss += wv * wv;
      }
      if (wss <= 1e-6) continue;
      const score = num / Math.sqrt(tss * wss);
      if (score > best.score) best = { score: score, x: ox, y: oy };
    }
  }
  return best.score > -2 ? { score: best.score, x: best.x - minX, y: best.y - minY } : null;
}

/** 颜色内容匹配（在采样图上做，粗到细） */
function matchGapColor(bgGray, bgW, bgH, piece, rowMin, rowMax) {
  if (!bgGray || !piece || !piece.gray || !piece.alpha) return null;
  const pw = piece.w, ph = piece.h, mask = piece.alpha, pg = piece.gray;
  if (pw >= bgW || ph >= bgH) return null;
  const pts = [];
  for (let y = 1; y < ph - 1; y++) {
    for (let x = 1; x < pw - 1; x++) {
      if (mask[y * pw + x] > 127 && mask[y * pw + x - 1] > 127 && mask[y * pw + x + 1] > 127
        && mask[(y - 1) * pw + x] > 127 && mask[(y + 1) * pw + x] > 127) pts.push(x, y, pg[y * pw + x]);
    }
  }
  const n = pts.length / 3;
  if (n < 100) return null;
  let vm = 0;
  for (let i = 2; i < pts.length; i += 3) vm += pts[i];
  vm /= n;
  let vss = 0;
  for (let i = 2; i < pts.length; i += 3) { pts[i] -= vm; vss += pts[i] * pts[i]; }
  if (vss <= 1e-6) return null;
  const maxOx = bgW - pw, maxOy = bgH - ph;
  const y0 = Math.max(0, rowMin === undefined ? 0 : rowMin);
  const y1 = Math.min(maxOy, rowMax === undefined ? maxOy : rowMax);
  const scoreAt = (ox, oy) => {
    let sum = 0, sum2 = 0, num = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const value = bgGray[(oy + pts[i + 1]) * bgW + ox + pts[i]];
      sum += value; sum2 += value * value; num += pts[i + 2] * value;
    }
    const wss = Math.max(0, sum2 - sum * sum / n);
    return wss <= 1e-6 ? -2 : num / Math.sqrt(vss * wss);
  };
  // 全位置稀疏筛选，再对前 8 个候选精算，避免步长 3 跳过窄峰。
  const stride = Math.max(1, Math.ceil(n / 96)), sample = [];
  let sampleMean = 0, sampleSS = 0;
  for (let i = 0; i < n; i += stride) { sample.push(i * 3); sampleMean += pts[i * 3 + 2]; }
  sampleMean /= sample.length;
  for (const i of sample) sampleSS += Math.pow(pts[i + 2] - sampleMean, 2);
  if (sampleSS <= 1e-6) return null;
  const candidates = [];
  for (let oy = Math.ceil(y0); oy <= y1; oy++) {
    for (let ox = Math.round(bgW * 0.05); ox <= maxOx; ox++) {
      let sum = 0, sum2 = 0, num = 0;
      for (const i of sample) {
        const value = bgGray[(oy + pts[i + 1]) * bgW + ox + pts[i]];
        sum += value; sum2 += value * value; num += (pts[i + 2] - sampleMean) * value;
      }
      const variance = Math.max(0, sum2 - sum * sum / sample.length);
      const score = variance <= 1e-6 ? -2 : num / Math.sqrt(sampleSS * variance);
      if (score > -2 && (candidates.length < 8 || score > candidates[candidates.length - 1].score)) {
        candidates.push({score: score, x: ox, y: oy});
        candidates.sort((a, b) => b.score - a.score);
        if (candidates.length > 8) candidates.pop();
      }
    }
  }
  let best = { score: -2, x: 0, y: 0 };
  for (const candidate of candidates) {
    const score = scoreAt(candidate.x, candidate.y);
    if (score > best.score) best = { score: score, x: candidate.x, y: candidate.y };
  }
  return best.score > -2 ? best : null;
}

function pieceAlphaTop(piece) {
  if (!piece || !piece.alpha) return null;
  const pw = piece.w, ph = piece.h;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (piece.alpha[y * pw + x] > 127) return y;
  return null;
}

/** 从一个挑战里定位缺口（返回原图坐标系 x） */
function locateGap(bg, piece, challengeY, oValue) {
  // 优先：用服务端返回的 o 字段做列置换还原（插件官方算法），定位精度最高
  if (oValue) {
    try {
      const perm = decodePermutation(oValue);
      if (perm.length > 1) {
        const restored = unshuffleByPerm(bg, perm);
        const r = locateGapInner(restored, piece, challengeY, "o");
        if (r) return r;
      }
    } catch (e) { /* 回退 */ }
  }
  return locateGapInner(bg, piece, challengeY, "raw");
}

function locateGapInner(bg, piece, challengeY, tag) {
  const scale = bg.scale || 1;
  const aTop = pieceAlphaTop(piece) || 0;
  // 几何约束：拼图 alpha 顶部应对齐 challenge.y（原图坐标）
  let rowMin, rowMax;
  if (challengeY !== undefined && challengeY !== null) {
    const expect = Math.round(challengeY / scale) - aTop;
    rowMin = Math.max(0, expect - 6);
    rowMax = Math.max(0, expect + 6);
  }
  const edge = matchGapEdge(bg.gray, bg.w, bg.h, piece,
    rowMin === undefined ? undefined : rowMin + aTop, rowMax === undefined ? undefined : rowMax + aTop);
  const color = matchGapColor(bg.gray, bg.w, bg.h, piece, rowMin, rowMax);
  let pick = null;
  if (edge && color) pick = color.score >= edge.score ? color : edge;
  else pick = color || edge;
  if (!pick || !Number.isFinite(pick.score) || pick.score < 0.35) return null;
  return { x: pick.x * scale, y: pick.y * scale, score: pick.score, from: tag + "/" + (pick === color ? "color" : "edge") };
}

// APP/H5 抓包：challenge.y 和提交 x 均为 300×150 显示坐标。
// 恢复后的背景是 400×200，先按显示比例约束图片搜索，再换算提交坐标。
function locateAppGap(bg, piece, challengeY, oValue, displayWidth, displayHeight) {
  const sx = displayWidth / (bg.w * (bg.scale || 1));
  const sy = displayHeight / (bg.h * (bg.scale || 1));
  if (!(sx > 0 && sy > 0) || !Number.isFinite(Number(challengeY))) return null;
  const restored = oValue ? unshuffleByPerm(bg, decodePermutation(oValue)) : bg;
  const expected = Math.round(Number(challengeY) / sy / (bg.scale || 1));
  const top = pieceAlphaTop(piece) || 0;
  const edge = matchGapEdge(restored.gray, restored.w, restored.h, piece, expected - 4 + top, expected + 4 + top);
  const color = matchGapColor(restored.gray, restored.w, restored.h, piece, expected - 4, expected + 4);
  const best = color && (!edge || color.score >= edge.score) ? color : edge;
  if (!best || best.score < 0.35) return null;
  return { x: Math.round(best.x * (bg.scale || 1) * sx), y: Number(challengeY),
    score: best.score, from: "h5/" + (best === color ? "color" : "edge") };
}

/** Loon binary-mode 返回 Uint8Array；兼容旧模拟器的 Base64 返回值。 */
async function readBinary(url, headers) {
  const res = await httpReq({ url: url, method: "GET", headers: headers, binary: true, timeout: 20000 });
  if (!res || !res.body) return null;
  if (!(res.status >= 200 && res.status < 300)) return null;
  const data = res.body;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return typeof data === "string" ? base64ToBytes(data) : null;
}

function base64ToBytes(b64) {
  const clean = String(b64).replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const out = new Uint8Array(clean.length * 3 / 4 | 0);
  let p = 0;
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const map = {};
  for (let i = 0; i < table.length; i++) map[table[i]] = i;
  let buffer = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "=") break;
    const v = map[ch];
    if (v === undefined) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[p++] = (buffer >> bits) & 0xff; }
  }
  return out.subarray(0, p);
}

/** 凭证地址：默认走小程序通道 w1；可被 lhtj_constid_path 覆盖（c1/w1） */
function constIdUrl(aid) {
  const p = $.getdata("lhtj_constid_path") || CONSTID_PATH_DEFAULT;
  return C1_HOST + "/udid/" + p + "?aid=" + encodeURIComponent(aid) + "&ak=" + SLIDER_AK + "&jsv=" + SLIDER_JSV;
}

function makeAid() {
  return "dx-" + Date.now() + "-" + (1000000 + Math.floor(Math.random() * 90000000)) + "-1";
}

/**
 * 外部求解服务：把 p1/p2/y 交给服务端（浏览器辅助或打码平台），拿回 token。
 * 约定响应：{ "token": "<verifyToken>", "c": "<constId>" } 或 { "token": "<verifyToken>:<constId>" }
 */
async function solveBySolver(solverUrl, log) {
  try {
    const aid = makeAid();
    let constId = "";
    const c1 = await httpReq({ url: constIdUrl(aid), timeout: 10000 });
    const m = String((c1 && c1.body) || "").replace(/&quot;/g, '"').match(/"data"\s*:\s*"([^"]+)"/);
    if (m) constId = m[1];
    const headers = { "User-Agent": UA_APP, Referer: "https://longzhu.longfor.com/", Origin: "https://longzhu.longfor.com", Accept: "*/*" };
    const q = "?w=300&h=150&s=50&ak=" + SLIDER_AK + "&c=" + encodeURIComponent(constId) + "&jsv=" + SLIDER_JSV
      + "&aid=" + encodeURIComponent(aid) + "&wp=1&de=0&uid=&lf=0&tpc=&_r=" + Math.random();
    const chRes = await httpReq({ url: SLIDER_HOST + "/api/a" + q, headers: headers, timeout: 10000 });
    let ch = null;
    try { ch = JSON.parse(chRes.body); } catch (e) { }
    if (!ch || !ch.sid) return "";
    const res = await apiRequest({
      url: solverUrl, method: "POST", timeout: 60000,
      body: { sid: ch.sid, aid: aid, c: constId, y: ch.y, p1: SLIDER_HOST + ch.p1, p2: SLIDER_HOST + ch.p2, ua: UA_APP },
    });
    if (!res) { log("滑块：外部服务无响应"); return ""; }
    let token = str(res.token || res.data || res.captchaToken);
    if (!token) { log("滑块：外部服务返回无效"); return ""; }
    if (token.indexOf(":") < 0) token = token + ":" + str(res.c || constId);
    log("滑块：外部服务返回 token 成功");
    return token;
  } catch (e) {
    log("滑块：外部服务异常 " + e);
    return "";
  }
}

/**
 * 轻量滑块：取 c1 -> /api/a -> 图片 -> 定位 -> 提交。
 * 外部服务优先，未配置或失败时调用内置滑块求解；不保证真实通过率。
 * @returns {Promise<string>} token 形如 "<token>:<c>"，失败返回 ""
 */
async function solveSlider(log) {
  $.sliderFailure = "";
  const failed = (reason) => { $.sliderFailure = reason; return ""; };
  // 0) 外部求解服务（可选）：在 Loon 里配置 config 键 lhtj_solver_url 即可启用
  //    服务端约定：POST JSON {sid, aid, c, y, p1, p2} -> {token} 或 {token, c}
  const solverUrl = $.getdata("lhtj_solver_url");
  if (solverUrl) {
    const ext = await solveBySolver(solverUrl, log);
    if (ext) return ext;
  }
  if ($.getdata("lhtj_enable_local_solver") === "false") {
    log("滑块：本地求解已被配置关闭");
    return failed("本地滑块被配置关闭");
  }
  // 同一验证会话的设备凭证、挑战、提交使用同一个 aid。
  const aid = makeAid();
  // 1) 动态凭证
  let constId = "";
  try {
    const t = await httpReq({ url: constIdUrl(aid), timeout: 10000 });
    const text = (t && t.body) || "";
    const un = String(text).replace(/&quot;/g, '"');
    const m = un.match(/"data"\s*:\s*"([^"]+)"/);
    if (m) constId = m[1];
  } catch (e) { }
  const headers = {
    "User-Agent": UA_APP,
    Referer: "https://longzhu.longfor.com/",
    Origin: "https://longzhu.longfor.com",
    Accept: "*/*",
  };
  const q = "?w=300&h=150&s=50&ak=" + SLIDER_AK + "&c=" + encodeURIComponent(constId) + "&jsv=" + SLIDER_JSV
    + "&aid=" + encodeURIComponent(aid) + "&wp=1&de=0&uid=&lf=0&tpc=&_r=" + Math.random();
  const chRes = await httpReq({ url: SLIDER_HOST + "/api/a" + q, headers: headers, timeout: 10000 });
  let ch = null;
  try { ch = JSON.parse(chRes.body); } catch (e) { }
  if (!ch || !ch.sid) { log("滑块：取挑战失败"); return failed("滑块挑战获取失败"); }

  progress("已获取挑战，处理图片");
  let x = 0, y = Number(ch.y || 0), from = "";
  try {
    const images = await Promise.all([
      readBinary(SLIDER_HOST + ch.p1, headers),
      readBinary(SLIDER_HOST + ch.p2, Object.assign({}, headers, { Accept: "image/*,*/*;q=0.8" }))
    ]);
    const p1 = images[0], p2 = images[1];
    if (!p1 || !p1.length) return failed("背景图片下载失败");
    if (!p2 || !p2.length) return failed("拼图图片下载失败");
    const format = (bytes) => {
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return "JPEG";
      if (bytes[0] === 0x89 && bytes[1] === 0x50) return "PNG" + (bytes.length >= 29 ? "，位深=" + bytes[24] + "，类型=" + bytes[25] + "，交错=" + bytes[28] : "");
      if (bytes[0] === 82 && bytes[1] === 73 && bytes[8] === 87 && bytes[9] === 69) return "WebP";
      return "非支持图片格式";
    };
    let bg, piece;
    try { bg = decodeImage(p1); } catch (e) { return failed("背景解码异常（" + format(p1) + "）"); }
    if (!bg) return failed("背景解码不支持（" + format(p1) + "）");
    try { piece = decodeImage(p2); } catch (e) { return failed("拼图解码异常（" + format(p2) + "）"); }
    if (!piece) return failed("拼图解码不支持（" + format(p2) + "）");
    if (!piece.alpha) return failed("拼图缺少透明轮廓（" + format(p2) + "）");
    const loc = locateAppGap(bg, piece, y, ch.o, 300, 150);
    if (!loc) return failed("图片已解码，缺口未达到匹配阈值（背景" + bg.w + "×" + bg.h + "，拼图" + piece.w + "×" + piece.h + "）");
    x = Math.round(loc.x); from = loc.from + "/" + loc.score.toFixed(2);
  } catch (e) { return failed("图片读取或缺口匹配过程异常"); }
  if (!Number.isFinite(x) || x <= 0) { log("滑块：无可靠定位，停止提交"); return failed("滑块图片解码或定位失败"); }

  // 用 H5 官方 SDK 生成 s_v3 ac
  let ac = "";
  try { ac = await createH5Ac(ch.sid, x, y); } catch (e) { log("滑块：ac 生成失败 " + e); }
  if (!ac) return failed("滑块验证数据生成失败");
  log("滑块：定位 dx=" + x + " -> 提交 x=" + Math.round(x) + " y=" + y + " (" + from + "), ac=" + (ac ? ac.length + "B" : "无"));
  // APP/H5 提交 x 已由显示坐标换算得出，不再套用小程序 +10。
  // 注意：ac 里 sendTemp 的 x/y 必须与提交值完全一致（插件源码 _getVerifyParams 保证）
  const submitX = Math.round(x);
  const body = queryStr({ ac: ac, ak: SLIDER_AK, c: constId, uid: "", jsv: SLIDER_JSV, sid: ch.sid, aid: aid, x: submitX, y: y });
  progress("提交 H5 滑块验证");
  const vr = await httpReq({ url: SLIDER_HOST + "/api/v1", method: "POST", headers: Object.assign({}, headers, { "Content-Type": "application/x-www-form-urlencoded" }), body: body, timeout: 12000 });
  let v = null;
  try { v = JSON.parse(vr.body); } catch (e) { }
  if (v && v.success && v.token) return v.token + ":" + constId;
  log("滑块：未通过（" + ((v && (v.code || v.msg)) || "无响应") + "）");
  const code = v && /^[0-9]{1,10}$/.test(String(v.code)) ? String(v.code) : "未知";
  return failed("滑块服务器未通过（code=" + code + "）");
}

/* ==========================================================================
 * 四、账号与缓存
 * ========================================================================== */
function loadUsers() {
  const raw = $.getdata(ckName);
  const parsed = $.toObj(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}
function saveUsers(list) { return $.setdata($.toStr(list) || "[]", ckName); }

function normalizeUser(r) {
  if (!r || typeof r !== "object") return null;
  const cookie = cleanCookie(r.cookie || r.Cookie || "");
  const token = str(r.token || r["x-lf-usertoken"] || r.xLfUsertoken);
  const u = {
    userName: str(r.userName || r.nick_name || "微信用户"),
    cookie: cookie,
    token: token,
    "x-lf-usertoken": str(r["x-lf-usertoken"] || r.xLfUsertoken || token),
    "x-lf-dxrisk-token": str(r["x-lf-dxrisk-token"] || r.xLfDxriskToken),
    "x-lf-channel": str(r["x-lf-channel"] || r.xLfChannel || "L0"),
    "x-lf-bu-code": str(r["x-lf-bu-code"] || r.xLfBuCode || "L00602"),
    "x-lf-dxrisk-source": str(r["x-lf-dxrisk-source"] || r.xLfDxriskSource || "2"),
  };
  if (!u.token && !u.cookie) return null;
  if (!u.userName || u.userName === "微信用户") u.userName = guessName(u);
  return u;
}
function guessName(u) {
  const m = /(?:^|;\s*)(?:mobile|phone)=(\d{11})/.exec(u.cookie || "");
  if (m) return m[1].replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
  const id = /(?:^|;\s*)(?:member_no|member_id|user_id|uid)=([^;]+)/.exec(u.cookie || "");
  return id ? id[1] : "微信用户";
}
function str(v) { return v === undefined || v === null ? "" : String(v).trim(); }
function cleanCookie(c) {
  const seen = Object.create(null), order = [];
  String(c || "").split(";").forEach((seg) => {
    const i = seg.indexOf("=");
    const k = (i < 0 ? seg : seg.slice(0, i)).trim();
    const v = i < 0 ? "" : seg.slice(i + 1).trim();
    if (!k) return;
    if (!(k in seen)) order.push(k);
    seen[k] = v;
  });
  return order.map((k) => k + "=" + seen[k]).join("; ");
}
function userKey(u) {
  const m = /(?:^|;\s*)(?:member_no|member_id|user_id|uid|openid|unionid)=([^;]+)/.exec(u.cookie || "");
  return m ? m[1] : (u.token || u.userName || "default");
}
// 同名用户不能作为身份依据；按 Cookie 稳定字段或相同凭证匹配。
function sameAccount(a, b) {
  const ids = (u) => {
    const result = Object.create(null);
    const aliases = { member_no: "member_no", member_id: "member_id", user_id: "user_id",
      uid: "uid", openid: "openid", unionid: "unionid", mobile: "phone", phone: "phone" };
    String(u.cookie || "").split(";").forEach((part) => {
      const i = part.indexOf("="), key = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
      if (i > 0 && aliases[key] && value) result[aliases[key]] = value;
    });
    return result;
  };
  const left = ids(a), right = ids(b);
  const shared = Object.keys(left).filter((key) => right[key]);
  if (shared.some((key) => left[key] !== right[key])) return false;
  if (shared.length) return true;
  return !!((a.token && a.token === b.token) ||
    (a["x-lf-usertoken"] && a["x-lf-usertoken"] === b["x-lf-usertoken"]) ||
    (a.cookie && a.cookie === b.cookie));
}

function removeExpiredUser(user) {
  // 重新读取存储，只删除本轮实际使用的旧凭证，避免误删期间更新的账号。
  const current = loadUsers();
  const left = current.filter((record) => {
    const account = normalizeUser(record);
    return !account || !sameAccount(account, user) || account.token !== user.token ||
      account["x-lf-usertoken"] !== user["x-lf-usertoken"] || account.cookie !== user.cookie;
  });
  if (left.length === current.length) return "旧凭证已被更新或移除";
  return saveUsers(left) ? "已删除过期账号，请重新抓取" : "过期账号删除失败，请检查存储";
}

function loadCaptchaToken(u) {
  const raw = $.getdata(tokenKey);
  const parsed = $.toObj(raw, {});
  const store = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  const rec = Object.prototype.hasOwnProperty.call(store, userKey(u)) ? store[userKey(u)] : null;
  if (!rec || !rec.token) return "";
  const age = Date.now() - Number(rec.at);
  if (!Number.isFinite(age) || age < 0 || age > CAPTCHA_TTL) return "";
  return rec.token;
}
function saveCaptchaToken(u, token) {
  const raw = $.getdata(tokenKey);
  const parsed = $.toObj(raw, {});
  const store = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  Object.defineProperty(store, userKey(u), { value: { token: token, at: Date.now() }, enumerable: true, configurable: true, writable: true });
  $.setdata($.toStr(store) || "{}", tokenKey);
}

/* ==========================================================================
 * 五、业务请求头与任务
 * ========================================================================== */
function taskHeaders(u, extra, captchaToken) {
  const h = {
    "user-agent": UA_MINI,
    cookie: u.cookie || "",
    token: u.token,
    "x-lf-usertoken": u["x-lf-usertoken"],
    "x-lf-dxrisk-token": u["x-lf-dxrisk-token"],
    "x-lf-dxrisk-source": u["x-lf-dxrisk-source"],
    "x-lf-bu-code": u["x-lf-bu-code"],
    "x-lf-channel": u["x-lf-channel"],
    "x-gaia-api-key": GAIA_TASK,
    origin: "https://longzhu.longfor.com",
    referer: "https://longzhu.longfor.com/",
    accept: "application/json, text/plain, */*",
  };
  if (captchaToken) h["x-lf-dxrisk-captcha-token"] = captchaToken;
  return Object.assign(h, extra || {});
}
function lltHeaders(u, captchaToken) {
  const h = {
    "user-agent": UA_APP,
    cookie: u.cookie || "",
    authtoken: u["x-lf-usertoken"] || u.token,
    bucode: u["x-lf-bu-code"],
    channel: u["x-lf-channel"],
    "x-gaia-api-key": GAIA_LLT,
    "x-lf-dxrisk-source": u["x-lf-dxrisk-source"] || "2",
    "x-lf-dxrisk-token": u["x-lf-dxrisk-token"],
    origin: "https://llt.longfor.com",
    referer: "https://llt.longfor.com/",
    accept: "application/json, text/plain, */*",
  };
  if (captchaToken) h["x-lf-dxrisk-captcha-token"] = captchaToken;
  return h;
}
function memberHeaders(u) {
  return {
    "User-Agent": UA_MINI,
    Referer: "https://servicewechat.com/wx50282644351869da/424/page-frame.html",
    token: u.token,
    "X-Gaia-Api-Key": GAIA_MEMBER,
    accept: "application/json, text/plain, */*",
  };
}

function isRisk(obj) {
  if (!obj || typeof obj !== "object" || String(obj.code) === "0000") return false;
  if (obj.code && RISK_CODES.indexOf(String(obj.code)) >= 0) return true;
  const msg = String(obj.message || obj.msg || "");
  return !!msg && RISK_PATTERN.test(msg);
}
function msgOf(obj) { return obj ? String(obj.message || obj.msg || obj.code || "") : ""; }

// 本次微信 H5 抓包：C2 / C20400 / 风控来源 5；不改变 APP 分支。
function createCaptchaSession(u, initialToken, solver) {
  return { token: initialToken || "", attempted: false, pending: null,
    beginTask() { this.attempted = false; this.failureReason = ""; },
    async refresh(rejectedToken) {
      if ($.ckExpired) return "";
      if (this.token && this.token !== rejectedToken) return this.token;
      if (this.pending) return this.pending;
      if (this.attempted) return "";
      this.attempted = true;
      this.pending = (async () => {
        const fresh = await (solver ? solver() : solveSlider(log));
        if (!fresh || fresh === rejectedToken) {
          this.failureReason = fresh ? "求解返回的验证码未更新" : ($.sliderFailure || "未取得有效滑块 token");
          return "";
        }
        this.token = fresh;
        saveCaptchaToken(u, fresh);
        return fresh;
      })();
      try { return await this.pending; } finally { this.pending = null; }
    }
  };
}
async function requestWithCaptcha(options, headersForToken, session, fallbackToken) {
  const sentToken = session ? session.token : (fallbackToken || "");
  let response = await apiRequest(Object.assign({}, options, { headers: headersForToken(sentToken) }));
  if (!session || !isRisk(response) || $.ckExpired) return response;
  progress("需要滑块验证，正在求解");
  const fresh = await session.refresh(sentToken);
  if (fresh && fresh !== sentToken) {
    progress("已取得验证结果，重试当前请求");
    response = await apiRequest(Object.assign({}, options, { headers: headersForToken(fresh) }));
    if (isRisk(response)) session.failureReason = "滑块已返回 token，但业务接口仍拒绝验证";
  }
  return response;
}

function signatureHeaders(u, activityNo, captchaToken) {
  return taskHeaders(u, activityNo === ACTIVITY_SIGN_WX ? {
    "x-lf-channel": "C2", "x-lf-bu-code": "C20400", "x-lf-dxrisk-source": "5"
  } : { "user-agent": UA_APP, "x-lf-channel": "L0", "x-lf-bu-code": "L00602", "x-lf-dxrisk-source": "2" }, captchaToken);
}

function wxTodaySign(info) {
  const days = info && info.seven_days_signs;
  if (!Array.isArray(days) || !days.length) return null;
  // 页面源码 todayCheck 使用第一项；日期字段完整时优先按服务器时间校验。
  const timestamp = Number(info.current_date_time);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    const d = new Date(timestamp + 8 * 3600000);
    return days.find((day) => day && Number(day.sign_year) === d.getUTCFullYear() &&
      Number(day.sign_month) === d.getUTCMonth() + 1 && Number(day.sign_day) === d.getUTCDate()) || null;
  }
  return days[0] || null;
}
function rewardUnit(type) {
  return Number(type) === 10 ? "珑珠券" : Number(type) === 20 ? "成长值" : Number(type) === 30 ? "珑珠" : "奖励类型" + String(type);
}
function receivedRewardText(info) {
  const rewards = info && info.day_received_rewards;
  if (!Array.isArray(rewards)) return "";
  const totals = Object.create(null);
  rewards.forEach((r) => {
    if (!r || !Number.isFinite(Number(r.reward_num)) || Number(r.reward_num) < 0) return;
    const unit = rewardUnit(r.reward_type);
    totals[unit] = (totals[unit] || 0) + Number(r.reward_num);
  });
  return Object.keys(totals).map((unit) => totals[unit] + " " + unit).join(" + ");
}
async function doWxSignin(u, label, captchaToken) {
  const result = (status, message, reward, risk) => {
    const line = label + "：" + message;
    log(line);
    return { status: status, message: message, reward: reward || 0, risk: !!risk };
  };
  const info = await pageInfo(u, ACTIVITY_SIGN_WX, captchaToken);
  if (info && info.risk) return result("risk", "需要验证", 0, true);
  if (!info) return result("unknown", "签到状态查询失败");
  const activityStatus = Number(info.task_show_status);
  if (Number.isFinite(activityStatus) && info.task_show_status != null && activityStatus !== 20) {
    return result("inactive", activityStatus < 20 ? "活动未开始" : "活动已结束");
  }
  const today = wxTodaySign(info);
  if (today && Number(today.sign_status) === 20) {
    const received = receivedRewardText(info);
    return result("already", "今日已签到" + (received ? "，今日已领取 " + received : ""));
  }
  if (!today || Number(today.sign_status) !== 10) return result("unknown", "今日签到状态未知，未提交签到");
  const reward = await doClock(u, ACTIVITY_SIGN_WX, label, captchaToken);
  if (reward < 0) return result("risk", "需要验证", 0, true);
  if (reward > 0) return result("signed", "签到成功，新增奖励见汇总", reward);
  if ($.clockAlready) return result("already", "今日已签到");
  const clockFailure = $.clockFailure;
  // is_popup=0 仅代表不弹窗；不能独立判定签到成功或已签到。
  const after = await pageInfo(u, ACTIVITY_SIGN_WX, captchaToken);
  if (after && after.risk) return result("risk", "状态复查需要验证", 0, true);
  const confirmed = wxTodaySign(after);
  if (confirmed && Number(confirmed.sign_status) === 20) {
    const received = receivedRewardText(after);
    return result("confirmed", "今日已签到（复查确认）" + (received ? "，今日已领取 " + received : ""));
  }
  return result("unknown", clockFailure || "签到接口成功但今日状态未确认，未重复提交");
}

/** 签到页信息 */
async function pageInfo(u, activityNo, captchaToken) {
  const res = await requestWithCaptcha({
    url: HOST_TASK + "/openapi/task/v1/signature/page-info",
    method: "POST", body: { activity_no: activityNo },
  }, (token) => signatureHeaders(u, activityNo, token), $.captchaSession, captchaToken);
  if (isRisk(res)) return { risk: true };
  return res && String(res.code) === "0000" ? res.data : null;
}
function todaySign(info) {
  if (!info || !Array.isArray(info.seven_days_signs)) return null;
  const serverTime = Number(info.current_date_time);
  const d = new Date((Number.isFinite(serverTime) && serverTime > 0 ? serverTime : Date.now()) + 8 * 3600000);
  return info.seven_days_signs.find((s) => s && Number(s.sign_year) === d.getUTCFullYear() &&
    Number(s.sign_month) === d.getUTCMonth() + 1 && Number(s.sign_day) === d.getUTCDate()) || null;
}
function signedToday(info) {
  const today = todaySign(info);
  return !!today && Number(today.sign_status) === 20;
}

function describeSign(info, label) {
  if (!info) return "";
  const days = Array.isArray(info.seven_days_signs) ? info.seven_days_signs : [];
  let signed = 0;
  for (let i = 0; i < days.length; i++) if (Number(days[i].sign_status) === 20) signed++;
  const t = todaySign(info);
  const done = t && Number(t.sign_status) === 20;
  const gifts = ((t && t.sign_rewards) || []).map((r) => r.reward_num + (r.reward_type === 10 ? "珑珠券" : r.reward_type === 30 ? "珑珠" : "成长值")).join("+");
  return label + "：近7天已签" + signed + "天" + (done ? "，今日已签" : t ? "，今日未签" : "，今日状态未知") + (gifts ? "，今日奖励 " + gifts : "");
}

function isAlreadySignedResponse(response) {
  if (!response || typeof response !== "object") return false;
  // 未证实 801810 的含义，不按这个码单独认定已签到。
  const message = String(response.message || response.msg || "").trim();
  return !/未签到|未签|尚未|还未|不能|无法/.test(message) &&
    /今日已签到|今天已签到|已签到|已经签到|重复签到|已完成.*签到/.test(message);
}

/** 签到 */
async function doClock(u, activityNo, label, captchaToken) {
  const res = await requestWithCaptcha({
    url: HOST_TASK + "/openapi/task/v1/signature/clock",
    method: "POST", body: { activity_no: activityNo },
  }, (token) => signatureHeaders(u, activityNo, token), $.captchaSession, captchaToken);
  $.clockFailure = ""; $.clockAlready = false;
  if (!res) { $.clockFailure = "签到请求网络、HTTP或解析失败"; return 0; }
  if (isAlreadySignedResponse(res)) { $.clockAlready = true; return 0; }
  if (isRisk(res)) return -1;
  if (String(res.code) !== "0000") {
    const code = /^[a-zA-Z0-9_-]{1,24}$/.test(String(res.code)) ? String(res.code) : "未知";
    const message = safeLogText(res.message || res.msg || "");
    $.clockFailure = (message || "未完成") + "（code=" + code + "）";
    log($.clockFailure); return 0;
  }
  const d = res.data || {};
  const rewards = Array.isArray(d.reward_info) ? d.reward_info : [];
  if (Number(d.is_popup) === 1 && rewards.length) {
    let total = 0;
    const details = [];
    for (const rw of rewards) {
      if (!rw) continue;
      const amount = Number(rw.reward_num);
      if (!Number.isFinite(amount) || amount < 0) continue;
      const type = Number(rw.reward_type);
      const unit = rewardUnit(type);
      if (!$.signRewards) $.signRewards = Object.create(null);
      $.signRewards[unit] = ($.signRewards[unit] || 0) + amount;
      details.push(amount + " " + unit);
      total += amount;
    }
    log($.doFlag[true] + " " + label + "：签到成功" + (details.length ? "，获得 " + details.join(" + ") : "，奖励数据未知"));
    return total;
  }
  log($.doFlag[true] + " " + label + "：签到请求成功，无新增奖励");
  return 0;
}

/** 每个渠道仅处理指定活动号。 */
async function doSignin(u, label, captchaToken, activityNo) {
  if (!activityNo || activityNo === ACTIVITY_SIGN_WX) return doWxSignin(u, label, captchaToken);
  const info = await pageInfo(u, activityNo, captchaToken);
  if (info && info.risk) return { risk: true, message: "需要验证" };
  if (!info) return { status: "unknown", message: "状态查询失败" };
  if (signedToday(info)) return { status: "already", message: "今日已签到", reward: 0 };
  const reward = await doClock(u, activityNo, label, captchaToken);
  if (reward < 0) return { risk: true, message: "需要验证" };
  if (reward > 0) return { status: "signed", message: "签到成功，新增奖励见汇总", reward: reward };
  if ($.clockAlready) return { status: "already", message: "今日已签到", reward: 0 };
  const clockFailure = $.clockFailure;
  const after = await pageInfo(u, activityNo, captchaToken);
  if (after && after.risk) return { risk: true, message: "状态复查需要验证" };
  return signedToday(after) ? { status: "confirmed", message: "今日已签到（复查确认）", reward: 0 } :
    { status: "unknown", message: clockFailure || "签到接口成功但今日状态未确认，未重复提交", reward: 0 };
}

/**
 * 抽奖（按官方 APP 流程，含滑块验证复用）
 *
 * 官方实测流程（2026-10-06 抓包「APP福利抽奖」）：
 *   1) GET  activity/common/component/info  确认活动状态（lottery_status / is_active）
 *   2) GET  auth/lottery/chance             查询可用抽奖机会
 *   3) POST auth/chance/check               抽奖前检查
 *   4) POST auth/lottery/sign               抽奖签到 → 获得机会
 *        └ 返回 862101「网络故障」= 需要滑块验证 → 拿 captcha token 后重试
 *   5) POST auth/lottery/click              抽奖
 *        └ 同样遇 862101 时用 captcha token 重试
 *
 * captcha token 形如 "<验证token>:<constid>"，由 solveSlider() 产出；
 * 复用脚本既有的滑块实现与缓存（lhtj_captcha_token_*），无需改动。
 */
async function doLottery(u, componentNo, activityNo, label, captchaToken, refreshCaptcha) {
  const override = $.getdata("lhtj_activity_app");
  const base = override ? override.split(",") : [activityNo].concat(ACTIVITY_CANDIDATES_APP);
  const candidates = [];
  base.map((x) => String(x).trim()).filter(Boolean).forEach((x) => { if (candidates.indexOf(x) < 0) candidates.push(x); });
  if (!candidates.length) candidates.push(activityNo);

  let risk = false;
  let lastMsg = "";
  const session = $.captchaSession || createCaptchaSession(u, captchaToken, refreshCaptcha);
  const callWithCaptcha = (url, method, body) => {
    // 领取机会和每次抽奖是独立验证动作；各自最多求解并重试一次。
    session.beginTask();
    return requestWithCaptcha({ url: url, method: method, body: body }, (token) => lltHeaders(u, token), session);
  };

  for (let ci = 0; ci < candidates.length; ci++) {
    const act = candidates[ci];
    const tag = label + (candidates.length > 1 ? "(#" + (ci + 1) + ")" : "");

    // ---- 1. 活动状态 ----
    const info = await callWithCaptcha( HOST_LLT + "/api/v1/activity/common/component/info?component_no=" + encodeURIComponent(componentNo) + "&activity_no=" + encodeURIComponent(act), "GET");
    if (info && String(info.code) === "0000") {
      const d = info.data || {};
      const status = Number(d.lottery_status);
      log("ℹ️ " + tag + "：活动状态 lottery_status=" + status + " is_active=" + d.is_active);
      if (Number.isFinite(status) && status !== 20) {
        lastMsg = status < 20 ? "活动未开始" : "活动已结束";
        log("⏭️ " + tag + "：" + lastMsg + "（活动 " + act + "，尝试下一个）");
        continue;
      }
    } else if (info && (String(info.code) === "803012" || /已结束/.test(msgOf(info)))) {
      lastMsg = msgOf(info) || "活动已结束";
      log("⏭️ " + tag + "：" + lastMsg + "（活动 " + act + " 已结束，尝试下一个）");
      continue;
    } else if (info && (String(info.code) === "801006" || /数据为空/.test(msgOf(info)))) {
      lastMsg = msgOf(info) || "活动号无效";
      log("⏭️ " + tag + "：" + lastMsg + "（活动号 " + act + " 无效，尝试下一个）");
      continue;
    }

    if (!info || String(info.code) !== "0000") return { risk: isRisk(info), done: false, message: "活动状态查询失败" };
    // ---- 2. 抽奖前检查 ----
    const chk = await callWithCaptcha(HOST_LLT + "/api/v1/activity/auth/chance/check", "POST",
      { component_no: componentNo, activity_no: act });
    if (isRisk(chk)) { risk = true; log("🛡️ " + tag + "：chance/check 触发风控"); return { risk: true, activity: act }; }
    if (!chk || String(chk.code) !== "0000") return { done: false, message: "抽奖资格检查失败" };

    // ---- 3. 抽奖签到（拿机会）----
    const sign = await callWithCaptcha(HOST_LLT + "/api/v1/activity/auth/lottery/sign", "POST",
      { component_no: componentNo, activity_no: act });
    if (isRisk(sign)) { risk = true; log("🛡️ " + tag + "签到：触发风控"); return { risk: true, activity: act }; }

    const signCode = sign ? String(sign.code) : "";
    const signMsg = msgOf(sign);
    if (signCode === "0000") {
      const got = Number((sign.data || {}).chance || 0);
      log($.doFlag[true] + " " + tag + "签到：成功" + (got > 0 ? "，获得 " + got + " 次抽奖机会" : ""));
    } else if (signCode === "863036" || /已签到|重复签到/.test(signMsg)) {
      log($.doFlag[true] + " " + tag + "签到：今日已签到（" + (signMsg || "无法重复签到") + "）");
    } else if (signCode === "803012" || /已结束/.test(signMsg)) {
      lastMsg = signMsg; log("⏭️ " + tag + "签到：" + signMsg + "（尝试下一个）"); continue;
    } else if (signCode === "801006" || /数据为空/.test(signMsg)) {
      lastMsg = signMsg; log("⏭️ " + tag + "签到：" + signMsg + "（尝试下一个）"); continue;
    } else {
      return { done: false, message: "抽奖签到失败" + (signCode ? "（" + signCode + "）" : "，响应未知") };
    }

    // ---- 4. 查询抽奖机会 ----
    const ch = await callWithCaptcha( HOST_LLT + "/api/v1/activity/auth/lottery/chance?component_no=" + encodeURIComponent(componentNo) + "&activity_no=" + encodeURIComponent(act), "GET");
    if (isRisk(ch)) { log("🛡️ " + tag + "：查询机会触发风控"); return { risk: true, activity: act }; }
    if (!ch || String(ch.code) !== "0000") {
      log("⛔️ " + tag + "：抽奖机会查询失败（" + msgOf(ch) + "）");
      return { risk: risk, activity: act, done: false, message: "抽奖机会查询失败或数据异常" };
    }
    let chance = Number((ch.data || {}).chance);
    if (!Number.isFinite(chance) || chance < 0 || !Number.isInteger(chance)) {
      log("⛔️ " + tag + "：抽奖机会数据异常"); return { risk: risk, activity: act, done: false, message: "抽奖机会查询失败或数据异常" };
    }
    if (chance <= 0) {
      log("ℹ️ " + tag + "：当前无可用抽奖机会（今日已用完或未满足条件）");
      return { risk: risk, activity: act, done: true, chance: 0, message: "无可用抽奖机会" };
    }
    log("🎟️ " + tag + "：可用抽奖机会 " + chance + " 次");

    // ---- 5. 抽奖 ----
    const results = [];
    let stopped = "";
    const times = Math.min(chance, 3);
    for (let i = 0; i < times; i++) {
      const d = await callWithCaptcha(HOST_LLT + "/api/v1/activity/auth/lottery/click", "POST",
        { component_no: componentNo, activity_no: act, batch_no: "" });
      if (isRisk(d)) { risk = true; log("🛡️ " + tag + "抽奖：触发风控"); break; }
      if (d && String(d.code) === "0000") {
        const dd = d.data || {};
        const num = Number(dd.reward_num || 0);
        const prize = dd.prize_name || dd.reward_name || dd.desc || (num > 0 ? num + "（类型 " + dd.reward_type + "）" : "谢谢参与");
        log($.doFlag[true] + " " + tag + "抽奖：" + (i + 1) + "/" + times + " → " + prize);
        results.push(prize);
      } else if (d && (String(d.code) === "863033" || /上限/.test(msgOf(d)))) {
        stopped = "已达抽奖上限";
        log("ℹ️ " + tag + "抽奖：" + stopped);
        break;
      } else {
        stopped = "抽奖失败或响应未知，未重试";
        log($.doFlag[false] + " " + tag + "抽奖：" + msgOf(d) + "（code=" + (d && d.code) + "）");
        break;
      }
      await sleep(600);
    }
    return { risk: risk, activity: act, done: !risk && !stopped, chance: chance,
      result: results.join("、"), message: (results.length ? "已抽 " + results.length + " 次：" + results.join("、") : "") +
        (stopped ? (results.length ? "；" : "") + stopped : !risk && chance > times ? "；其余机会留待下次" : "") };
  }

  log("⛔️ " + label + "：所有候选活动均不可用（" + (lastMsg || "未知原因") + "）");
  return { risk: risk, activity: candidates[0], done: false, message: "候选活动均不可用" };
}

async function doOldLottery(u) {
  const sign = await apiRequest({
    url: HOST_TASK + "/openapi/task/v1/lottery/sign", method: "POST",
    headers: taskHeaders(u, { "x-lf-usertoken": u.token }), body: { task_id: "", activity_no: ACTIVITY_LOTTERY_OLD }
  });
  if (!sign || String(sign.code) !== "0000") return { risk: isRisk(sign), done: false, message: "签到失败或响应未知" };
  const times = Number((sign.data || {}).ticket_times);
  if (!Number.isInteger(times) || times < 0) return { done: false, message: "机会数据异常" };
  if (!times) return { done: true, message: "无可用抽奖机会" };
  const prizes = [];
  for (let i = 0; i < Math.min(times, 3); i++) {
    const r = await apiRequest({ url: HOST_TASK + "/openapi/task/v1/lottery/luck", method: "POST",
      headers: taskHeaders(u, { "x-lf-usertoken": u.token }),
      body: { task_id: "", time: dateTime(), activity_no: ACTIVITY_LOTTERY_OLD, use_luck: 0 } });
    if (!r || String(r.code) !== "0000") return { done: false, risk: isRisk(r), result: prizes.join("、"),
      message: "已抽 " + prizes.length + " 次；后续失败或响应未知" };
    prizes.push(String((r.data || {}).desc || "抽奖完成，奖品信息未返回"));
    if (i + 1 < Math.min(times, 3)) await sleep(600);
  }
  return { done: true, message: "已抽 " + prizes.length + " 次：" + prizes.join("、") };
}

/* ==========================================================================
 * 六、主流程
 * ========================================================================== */
async function main() {
  const users = [];
  const raw = loadUsers();
  for (let i = 0; i < raw.length; i++) {
    const n = normalizeUser(raw[i]);
    if (n && !users.some((x) => sameAccount(x, n))) users.push(n);
  }
  // 只在内存中规范化和去重，不因解析失败覆盖原始账号存储。
  if (!users.length) {
    $.msg($.name, "⛔️ 未找到可用账号", "请先打开小程序签到页触发抓包");
    return;
  }
  log("⚙️ 发现 " + users.length + " 个账号");

  for (let idx = 0; idx < users.length; idx++) {
    const u = users[idx];
    $.accountIndex = (idx + 1) + "/" + users.length;
    $.results = {}; $.accountInfo = null; $.accountError = ""; $.captchaSession = null; $.streamedTasks = Object.create(null); $.currentTask = "";
    $.notifyMsg = [];
    $.ckStatus = true; $.ckExpired = false; $.title = ""; $.signRewards = Object.create(null);

    try {
      $.log("龙湖天街 · 账号 " + $.accountIndex + " · " + safeLogText(u.userName));
      // captcha token：缓存 / 环境变量注入
      let cap = loadCaptchaToken(u) || $.getdata("lhtj_captcha_token_" + userKey(u)) || $.getdata("lhtj_captcha_token_all") || "";
      $.captchaSession = createCaptchaSession(u, cap);
      if (cap) log("🔑 使用已缓存的 captcha token");

      // 签到
      $.currentTask = "微信签到";
      let r1 = await doSignin(u, "微信签到", cap, ACTIVITY_SIGN_WX);
      r1.verification = $.captchaSession.failureReason;
      $.results.wx = r1;
      streamTaskResult("wx", "微信签到", r1);
      $.captchaSession.beginTask();
      $.currentTask = "APP签到";
      let r2 = await doSignin(u, "APP签到", cap, ACTIVITY_SIGN_APP);

      r2.verification = $.captchaSession.failureReason;
      $.results.wx = r1; $.results.app = r2;
      streamTaskResult("app", "APP签到", r2);
      if ($.ckStatus) {
        // APP 福利抽奖（微信抽奖活动已结束，相关代码已移除）
        $.captchaSession.beginTask();
        $.currentTask = "APP抽奖";
        const lot = await doLottery(u, component_app, activity_app, "APP抽奖", cap);
        lot.verification = $.captchaSession.failureReason;
        $.results.lottery = lot;
        streamTaskResult("lottery", "APP抽奖", lot);
        if ($.getdata("lhtj_enable_old_lottery") === "true") {
          $.currentTask = "旧版抽奖";
          $.results.legacy = await doOldLottery(u);
          streamTaskResult("legacy", "旧版抽奖", $.results.legacy);
        }

        // 用户信息 / 珑珠
        const ui = await apiRequest({ url: HOST_MEMBER + "/api/member/v1/mine-info", method: "POST", headers: memberHeaders(u), body: { channel: u["x-lf-channel"], bu_code: u["x-lf-bu-code"], token: u.token } });
        const bi = await apiRequest({ url: HOST_MEMBER + "/api/member/v1/balance", method: "POST", headers: memberHeaders(u), body: { channel: u["x-lf-channel"], bu_code: u["x-lf-bu-code"], token: u.token } });
        const nick = (ui && ui.data && ui.data.nick_name) || u.userName;
        const growth = ui && String(ui.code) === "0000" && ui.data && ui.data.growth_value != null ? ui.data.growth_value : "查询失败";
        const level = ui && String(ui.code) === "0000" && ui.data && ui.data.level != null ? ui.data.level : "未知";
        const balance = bi && String(bi.code) === "0000" && bi.data && bi.data.balance != null ? bi.data.balance : "查询失败";
        const rewardText = Object.keys($.signRewards).map((unit) => $.signRewards[unit] + " " + unit).join(" + ");
        $.title = rewardText ? "本次签到获得 " + rewardText : "本次未确认新增签到奖励";
        $.accountInfo = { nick: nick, growth: growth, level: level, balance: balance };
      } else {
        $.notifyMsg.push("⛔️ " + u.userName + "：登录已过期，请重新抓包");

      }

    } catch (e) {
      log("⛔️ 当前账号执行异常，继续处理其他账号");
      $.accountError = "执行异常，部分任务未完成";
    }
    if ($.ckExpired) $.accountError = "登录已过期；" + removeExpiredUser(u);
    $.captchaSession = null;
    const summary = formatAccountResult(u);
    const taskNames = { wx: "微信签到", app: "APP签到", lottery: "APP抽奖" };
    Object.keys(taskNames).forEach((key) => { if (!$.streamedTasks[key]) streamTaskResult(key, taskNames[key], $.results[key]); });
    summary.split("\n").filter((line) => /^(新增签到奖励|账户|提示)：/.test(line)).forEach((line) => $.log(line));
    $.currentTask = "";
    notifyUser(summary);
    if (idx < users.length - 1) await sleep(1500);
  }
}

function taskResultText(r) {
  if (!r) return "未执行";
  let message = r.risk ? (r.result ? "已抽奖：" + r.result + "；后续滑块验证未通过" : "滑块验证未通过，本项未完成") :
    (r.message || (r.done === false ? "未完成" : r.done ? "已完成" : "结果未知"));
  if (r.risk && r.verification) message += "；" + r.verification;
  return safeLogText(message);
}
function streamTaskResult(key, name, result) {
  if (!$.streamedTasks) $.streamedTasks = Object.create(null);
  if ($.streamedTasks[key]) return;
  $.streamedTasks[key] = true;
  $.log(name + "：" + taskResultText(result));
}
function progress(message) {
  if ($.currentTask) $.log("验证进度 · " + $.currentTask + "：" + safeLogText(message));
}

function formatAccountResult(u) {
  const info = $.accountInfo;
  const lines = ["龙湖天街 · 账号 " + $.accountIndex + " · " + safeLogText(info ? info.nick : u.userName)];
  const names = { wx: "微信签到", app: "APP签到", lottery: "APP抽奖" };
  if ($.results.legacy) names.legacy = "旧版抽奖";
  Object.keys(names).forEach((key) => {
    const r = $.results[key];
    const message = taskResultText(r);
    lines.push(names[key] + "：" + safeLogText(message));
  });
  const rewards = Object.keys($.signRewards).map((unit) => $.signRewards[unit] + " " + unit).join(" + ");
  lines.push("新增签到奖励：" + (rewards || "无已确认新增奖励"));
  if (info) lines.push("账户：成长值 " + info.growth + "｜等级 " + (info.level === "未知" ? "未知" : "V" + info.level) + "｜珑珠 " + info.balance);
  if ($.accountError) lines.push("提示：" + $.accountError);
  $.title = "账号 " + $.accountIndex + ($.accountError ? " · 请检查" : " · 执行结果");
  return lines.join("\n");
}

function notifyUser(content) {
  if (!content) return;
  $.msg($.name, $.title || "", content, { "media-url": $.avatar });
}

/* ==========================================================================
 * 七、Cookie 抓取
 * ========================================================================== */
function captureCookie() {
  if (!$request || String($request.method).toUpperCase() === "OPTIONS") return;
  const raw = {};
  const hdrs = $request.headers || {};
  Object.keys(hdrs).forEach((k) => { raw[k.toLowerCase()] = hdrs[k]; });
  const cookie = cleanCookie(raw.cookie || "");
  if (!cookie && !raw.token && !raw["x-lf-usertoken"]) return;
  const rec = normalizeUser({
    cookie: cookie,
    token: raw.token,
    "x-lf-usertoken": raw["x-lf-usertoken"],
    "x-lf-dxrisk-token": raw["x-lf-dxrisk-token"],
    "x-lf-channel": raw["x-lf-channel"],
    "x-lf-bu-code": raw["x-lf-bu-code"],
    "x-lf-dxrisk-source": raw["x-lf-dxrisk-source"],
  });
  if (!rec) return;
  const list = loadUsers();
  let saved = rec, found = false;
  for (let i = 0; i < list.length; i++) {
    const old = normalizeUser(list[i]);
    if (!old || !sameAccount(old, rec)) continue;
    saved = Object.assign({}, old);
    Object.keys(rec).forEach((key) => {
      if (key !== "userName" && raw[key]) saved[key] = rec[key];
    });
    // 只捕获到一个 token 头时，同步其兼容字段，避免继续发送旧凭证。
    if (raw.token || raw["x-lf-usertoken"]) {
      saved.token = rec.token;
      saved["x-lf-usertoken"] = rec["x-lf-usertoken"];
    }
    list[i] = saved;
    found = true;
    // 历史重复记录合并到原位置。
    for (let j = list.length - 1; j > i; j--) {
      const other = normalizeUser(list[j]);
      if (other && sameAccount(other, rec)) list.splice(j, 1);
    }
    break;
  }
  if (!found) list.push(saved);
  if (!saveUsers(list)) { $.msg($.name, "⛔️ 保存失败", "账号未写入，请检查 Loon 存储"); return; }
  const missing = REQUIRED_FIELDS.filter((k) => !saved[k]);
  $.msg($.name, missing.length ? "⚠️ 部分Cookie已保存" : found ? "🎉 账号凭证已更新" : "🎉 新账号保存成功",
    missing.length ? "仍缺少：" + missing.join(",") : "当前共 " + list.length + " 个账号");
}

/* ==========================================================================
 * 八、Loon Env 兼容层
 * ========================================================================== */
function Env(name) {
  this.name = name;
  this.isNode = function () { return false; };
  this.log = function () {
    const args = Array.prototype.slice.call(arguments);
    console.log(args.join(" "));
  };
  this.logErr = function (e) { console.log("⛔️ " + (e && e.stack ? e.stack : e)); };
  this.getdata = function (k) {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
    return null;
  };
  this.setdata = function (v, k) {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
    return false;
  };
  this.getjson = function (k, d) { const v = this.getdata(k); if (!v) return d; try { return JSON.parse(v); } catch (e) { return d; } };
  this.setjson = function (o, k) { return this.setdata(JSON.stringify(o), k); };
  this.toObj = function (s, d) { try { return JSON.parse(s); } catch (e) { return d === undefined ? null : d; } };
  this.toStr = function (o, d) {
    try {
      if (typeof o === "string") return o;
      if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(o);
      return String(o);
    } catch (e) { return d === undefined ? null : d; }
  };
  this.msg = function (title, subtitle, content, opts) {
    if (typeof $notification !== "undefined") $notification.post(title, subtitle, content || "", opts || {});
  };
  let completed = false;
  this.done = function () {
    if (completed) return;
    completed = true;
    if (typeof $done !== "undefined") { if (isHttpRequest) $done({}); else $done(); }
  };
  // 优先官方 $httpClient，保留旧模拟器 $http 兼容。
  this.http = typeof $httpClient !== "undefined" ? $httpClient : (typeof $http !== "undefined" ? $http : null);
}

function safeLogText(value) {
  return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ")
    .replace(/\b(1\d{2})\d{4}(\d{4})\b/g, "$1****$2")
    .replace(/((?:token|authorization|cookie)\s*[:=]\s*)[^\s,;]+/gi, "$1[隐藏]")
    .slice(0, 240);
}
function log(m) { if ($.getdata("lhtj_debug") === "true") $.log("[调试] " + safeLogText(m)); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function dateTime() {
  const d = new Date(), p = (n) => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
// 调试开关：Loon 里把下面改成 true 可看详细日志
function debug(m) { log(m); }

/* ==========================================================================
 * 入口
 * ========================================================================== */
(async () => {
  try {
    if (isHttpRequest) captureCookie();
    else await main();
  } catch (e) {
    console.log("⛔️ 运行异常：" + (e && e.stack ? e.stack : e));
    $.msg($.name, "⛔️ 脚本异常", String(e && e.message ? e.message : e));
  } finally {
    $.done();
  }
})();
