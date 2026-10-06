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
const CONSTID_PATH_DEFAULT = "w1";
const SLIDER_AK = "d1a43734fc59aeae9f1562dbd70fdf54";
const SLIDER_JSV = "1.3.41.372";
const JPEG_SCALE = 1;                 // 原尺寸还原列置换，与 PNG 拼图保持同一坐标系
const CAPTCHA_TTL = 180000;           // 缓存的 captcha token 有效期 ms

const RISK_CODES = ["4011", "4012", "4007", "8040012", "8040011", "4010"];
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
    // 插件：process(g(e.length), h(e)) —— 注意长度是"字符数两字节 + UTF8 长度"的拼接
    this.app(10, encTemp(this.process(UaGen.bytes(g(e.length), UaGen.utf8(e)))));
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
  for (let oy = y0; oy <= y1; oy += 2) {
    for (let ox = Math.max(0, Math.round(bgW * 0.05)); ox + tw <= bgW; ox += 2) {
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
    if (!token) { log("滑块：外部服务返回无效：" + $.toStr(res).slice(0, 120)); return ""; }
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
 * 外部服务优先；本地实验实现须显式开启，不对真实通过率作保证。
 * @returns {Promise<string>} token 形如 "<token>:<c>"，失败返回 ""
 */
async function solveSlider(log) {
  // 0) 外部求解服务（可选）：在 Loon 里配置 config 键 lhtj_solver_url 即可启用
  //    服务端约定：POST JSON {sid, aid, c, y, p1, p2} -> {token} 或 {token, c}
  const solverUrl = $.getdata("lhtj_solver_url");
  if (solverUrl) {
    const ext = await solveBySolver(solverUrl, log);
    if (ext) return ext;
  }
  if ($.getdata("lhtj_enable_local_solver") !== "true") {
    log("滑块：请在小程序完成验证或配置外部服务；本地实验求解默认关闭");
    return "";
  }
  // 1) 动态凭证
  let constId = "";
  try {
    const t = await httpReq({ url: constIdUrl(makeAid()), timeout: 10000 });
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
  const aid = makeAid();
  const q = "?w=300&h=150&s=50&ak=" + SLIDER_AK + "&c=" + encodeURIComponent(constId) + "&jsv=" + SLIDER_JSV
    + "&aid=" + encodeURIComponent(aid) + "&wp=1&de=0&uid=&lf=0&tpc=&_r=" + Math.random();
  const chRes = await httpReq({ url: SLIDER_HOST + "/api/a" + q, headers: headers, timeout: 10000 });
  let ch = null;
  try { ch = JSON.parse(chRes.body); } catch (e) { }
  if (!ch || !ch.sid) { log("滑块：取挑战失败"); return ""; }

  let x = 0, y = Number(ch.y || 0), from = "";
  try {
    const images = await Promise.all([
      readBinary(SLIDER_HOST + ch.p1, headers),
      readBinary(SLIDER_HOST + ch.p2, Object.assign({}, headers, { Accept: "image/*,*/*;q=0.8" }))
    ]);
    const p1 = images[0], p2 = images[1];
    const bg = decodeImage(p1);
    const piece = decodeImage(p2);
    if (bg && piece) {
      const loc = locateGap(bg, piece, y, ch.o);
      if (loc) { x = Math.round(loc.x); from = loc.from + "/" + loc.score.toFixed(2); }
    }
  } catch (e) { log("滑块：图片处理失败 " + e); }
  if (!Number.isFinite(x) || x <= 0) { log("滑块：无可靠定位，停止提交"); return ""; }

  // 用插件算法生成 ac
  let ac = "";
  try { ac = buildAcPlugin(ch.sid, x, y); } catch (e) { log("滑块：ac 生成失败 " + e); }
  log("滑块：定位 dx=" + x + " -> 提交 x=" + (Math.round(x) + 10) + " y=" + y + " (" + from + "), ac=" + (ac ? ac.length + "B" : "无"));
  // 提交：x 按插件公式 A = round(dx) + 10
  // 注意：ac 里 sendTemp 的 x/y 必须与提交值完全一致（插件源码 _getVerifyParams 保证）
  const submitX = Math.round(x) + 10;
  const body = queryStr({ ac: ac, ak: SLIDER_AK, c: constId, uid: "", jsv: SLIDER_JSV, sid: ch.sid, aid: aid, x: submitX, y: y });
  const vr = await httpReq({ url: SLIDER_HOST + "/api/v1", method: "POST", headers: Object.assign({}, headers, { "Content-Type": "application/x-www-form-urlencoded" }), body: body, timeout: 12000 });
  let v = null;
  try { v = JSON.parse(vr.body); } catch (e) { }
  if (v && v.success && v.token) return v.token + ":" + constId;
  log("滑块：未通过（" + ((v && (v.code || v.msg)) || "无响应") + "）");
  return "";
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
function signatureHeaders(u, activityNo, captchaToken) {
  return taskHeaders(u, activityNo === ACTIVITY_SIGN_WX ? {
    "x-lf-channel": "C2", "x-lf-bu-code": "C20400", "x-lf-dxrisk-source": "5"
  } : null, captchaToken);
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
    log(line); $.notifyMsg.push(line);
    return { status: status, reward: reward || 0, risk: !!risk };
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
  // is_popup=0 仅代表不弹窗；不能独立判定签到成功或已签到。
  const after = await pageInfo(u, ACTIVITY_SIGN_WX, captchaToken);
  if (after && after.risk) return result("risk", "状态复查需要验证", 0, true);
  const confirmed = wxTodaySign(after);
  if (confirmed && Number(confirmed.sign_status) === 20) {
    const received = receivedRewardText(after);
    return result("confirmed", "今日已签到（复查确认）" + (received ? "，今日已领取 " + received : ""));
  }
  return result("unknown", "未确认签到成功，未重复提交");
}

/** 签到页信息 */
async function pageInfo(u, activityNo, captchaToken) {
  const res = await apiRequest({
    url: HOST_TASK + "/openapi/task/v1/signature/page-info",
    method: "POST", headers: signatureHeaders(u, activityNo, captchaToken), body: { activity_no: activityNo },
  });
  if (isRisk(res)) return { risk: true };
  return res && String(res.code) === "0000" ? res.data : null;
}
function todaySign(info) {
  if (!info || !Array.isArray(info.seven_days_signs)) return null;
  const d = new Date(Date.now() + 8 * 3600000);
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

/** 签到 */
async function doClock(u, activityNo, label, captchaToken) {
  const res = await apiRequest({
    url: HOST_TASK + "/openapi/task/v1/signature/clock",
    method: "POST", headers: signatureHeaders(u, activityNo, captchaToken), body: { activity_no: activityNo },
  });
  if (!res) return 0;
  if (isRisk(res)) return -1;
  if (String(res.code) !== "0000") { log($.doFlag[false] + " " + label + "：" + msgOf(res)); return 0; }
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
  const acts = [activityNo];
  let reward = 0;
  for (let i = 0; i < acts.length; i++) {
    const info = await pageInfo(u, acts[i], captchaToken);
    if (info && info.risk) return { reward: reward, risk: true };
    if (!info) { log("⛔️ " + label + "：签到状态查询失败"); continue; }
    log("ℹ️ " + describeSign(info, label));
    if (signedToday(info)) { log($.doFlag[true] + " " + label + "：今日已签到"); continue; }
    const r = await doClock(u, acts[i], label, captchaToken);
    if (r < 0) { log("🛡️ " + label + "：触发风控"); return { reward: reward, risk: true }; }
    reward += r;
    if (r > 0) return { reward: reward, risk: false };
  }
  return { reward: reward, risk: false };
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
async function doLottery(u, componentNo, activityNo, label, captchaToken) {
  const override = $.getdata("lhtj_activity_app");
  const base = override ? override.split(",") : [activityNo].concat(ACTIVITY_CANDIDATES_APP);
  const candidates = [];
  base.map((x) => String(x).trim()).filter(Boolean).forEach((x) => { if (candidates.indexOf(x) < 0) candidates.push(x); });
  if (!candidates.length) candidates.push(activityNo);

  let risk = false;
  let lastMsg = "";
  let cap = captchaToken || "";

  // 需要验证时重新求一次 captcha token（每账号最多一次）
  let solverTried = !!cap;
  const needCaptcha = async () => {
    if (solverTried) return cap;
    solverTried = true;
    const t = await solveSlider(log);
    if (t) { cap = t; saveCaptchaToken(u, t); log("🔑 已获取 captcha token"); }
    else log("⛔️ 滑块未通过，继续尝试（可能被风控拦截）");
    return cap;
  };

  /** 带风控重试的请求：862101 -> 解滑块 -> 用新 token 重试一次 */
  const callWithCaptcha = async (url, method, body) => {
    let r = await apiRequest({ url: url, method: method, headers: lltHeaders(u, cap), body: body });
    if (r && String(r.code) === "862101") {
      log("🛡️ " + label + "：需要滑块验证（862101），尝试求解…");
      const newCap = await needCaptcha();
      if (newCap && newCap !== cap) {
        r = await apiRequest({ url: url, method: method, headers: lltHeaders(u, newCap), body: body });
      } else if (newCap) {
        r = await apiRequest({ url: url, method: method, headers: lltHeaders(u, newCap), body: body });
      }
    }
    return r;
  };

  for (let ci = 0; ci < candidates.length; ci++) {
    const act = candidates[ci];
    const tag = label + (candidates.length > 1 ? "(#" + (ci + 1) + ")" : "");

    // ---- 1. 活动状态 ----
    const info = await apiRequest({
      url: HOST_LLT + "/api/v1/activity/common/component/info?component_no=" + encodeURIComponent(componentNo) + "&activity_no=" + encodeURIComponent(act),
      method: "GET", headers: lltHeaders(u, cap),
    });
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

    // ---- 2. 抽奖前检查 ----
    const chk = await callWithCaptcha(HOST_LLT + "/api/v1/activity/auth/chance/check", "POST",
      { component_no: componentNo, activity_no: act });
    if (isRisk(chk)) { risk = true; log("🛡️ " + tag + "：chance/check 触发风控"); return { risk: true, activity: act }; }
    if (chk && String(chk.code) === "0000") debug("chance/check -> " + JSON.stringify(chk.data));

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
      lastMsg = signMsg || signCode;
      log($.doFlag[false] + " " + tag + "签到：" + lastMsg + "（code=" + signCode + "）");
    }

    // ---- 4. 查询抽奖机会 ----
    const ch = await apiRequest({
      url: HOST_LLT + "/api/v1/activity/auth/lottery/chance?component_no=" + encodeURIComponent(componentNo) + "&activity_no=" + encodeURIComponent(act),
      method: "GET", headers: lltHeaders(u, cap),
    });
    if (isRisk(ch)) { log("🛡️ " + tag + "：查询机会触发风控"); return { risk: true, activity: act }; }
    if (!ch || String(ch.code) !== "0000") {
      log("⛔️ " + tag + "：抽奖机会查询失败（" + msgOf(ch) + "）");
      return { risk: risk, activity: act, done: false };
    }
    let chance = Number((ch.data || {}).chance);
    if (!Number.isFinite(chance) || chance < 0 || !Number.isInteger(chance)) {
      log("⛔️ " + tag + "：抽奖机会数据异常"); return { risk: risk, activity: act, done: false };
    }
    if (chance <= 0) {
      log("ℹ️ " + tag + "：当前无可用抽奖机会（今日已用完或未满足条件）");
      return { risk: risk, activity: act, done: true, chance: 0 };
    }
    log("🎟️ " + tag + "：可用抽奖机会 " + chance + " 次");

    // ---- 5. 抽奖 ----
    const results = [];
    const times = Math.min(chance, 3);
    for (let i = 0; i < times; i++) {
      const d = await callWithCaptcha(HOST_LLT + "/api/v1/activity/auth/lottery/click", "POST",
        { component_no: componentNo, activity_no: act, batch_no: "" });
      if (isRisk(d)) { risk = true; log("🛡️ " + tag + "抽奖：触发风控"); break; }
      if (d && String(d.code) === "0000") {
        const dd = d.data || {};
        const num = Number(dd.reward_num || 0);
        const prize = dd.reward_name || dd.desc || (num > 0 ? num + "（类型 " + dd.reward_type + "）" : "谢谢参与");
        log($.doFlag[true] + " " + tag + "抽奖：" + (i + 1) + "/" + times + " → " + prize);
        results.push(prize);
      } else if (d && (String(d.code) === "863033" || /上限/.test(msgOf(d)))) {
        log("ℹ️ " + tag + "抽奖：" + (msgOf(d) || "已达今日抽奖上限"));
        break;
      } else {
        log($.doFlag[false] + " " + tag + "抽奖：" + msgOf(d) + "（code=" + (d && d.code) + "）");
        break;
      }
      await sleep(600);
    }
    return { risk: risk, activity: act, done: true, chance: chance, result: results.join("、") };
  }

  log("⛔️ " + label + "：所有候选活动均不可用（" + (lastMsg || "未知原因") + "）");
  return { risk: risk, activity: candidates[0], done: false };
}

async function doOldLottery(u) {
  const sign = await apiRequest({
    url: HOST_TASK + "/openapi/task/v1/lottery/sign",
    method: "POST", headers: taskHeaders(u, { "x-lf-usertoken": u.token }), body: { task_id: "", activity_no: ACTIVITY_LOTTERY_OLD },
  });
  if (sign && String(sign.code) === "0000") {
    const times = Number((sign.data || {}).ticket_times || 0);
    log("ℹ️ 旧版抽奖签到：获得 " + times + " 次机会");
    for (let i = 0; i < Math.min(times, 3); i++) {
      const r = await apiRequest({
        url: HOST_TASK + "/openapi/task/v1/lottery/luck",
        method: "POST", headers: taskHeaders(u, { "x-lf-usertoken": u.token }),
        body: { task_id: "", time: dateTime(), activity_no: ACTIVITY_LOTTERY_OLD, use_luck: 0 },
      });
      if (r && String(r.code) === "0000") log($.doFlag[true] + " 旧版抽奖：获得 " + ((r.data || {}).desc || ""));
      else break;
      await sleep(600);
    }
  } else if (sign) log("ℹ️ 旧版抽奖：" + msgOf(sign));
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
    log("🚀 开始任务：" + u.userName);
    $.notifyMsg = [];
    $.ckStatus = true; $.ckExpired = false; $.title = ""; $.signRewards = Object.create(null);

    try {
      let solverAttempted = false;
      const refreshCaptcha = async () => {
        if (solverAttempted || $.ckExpired) return "";
        solverAttempted = true;
        return solveSlider(log);
      };
      // captcha token：缓存 / 环境变量注入
      let cap = loadCaptchaToken(u) || $.getdata("lhtj_captcha_token_" + userKey(u)) || $.getdata("lhtj_captcha_token_all") || "";
      if (cap) log("🔑 使用已缓存的 captcha token");

      // 签到
      let r1 = await doSignin(u, "每日签到", cap, ACTIVITY_SIGN_WX);
      let r2 = await doSignin(u, "APP每日签到", cap, ACTIVITY_SIGN_APP);

      // 触发风控时才去走滑块（节省请求）
      if (r1.risk || r2.risk) {
        log("🛡️ 触发风控，尝试求解滑块…");
        cap = await refreshCaptcha();
        if (cap) {
          saveCaptchaToken(u, cap);
          if (r1.risk) r1 = await doSignin(u, "每日签到(验证后)", cap, ACTIVITY_SIGN_WX);
          if (r2.risk) r2 = await doSignin(u, "APP每日签到(验证后)", cap, ACTIVITY_SIGN_APP);
        } else {
          log("⛔️ 滑块未通过，跳过需要验证的步骤");
        }
      }

      if ($.ckStatus) {
        // APP 福利抽奖（微信抽奖活动已结束，相关代码已移除）
        const lot = await doLottery(u, component_app, activity_app, "APP抽奖", cap);
        if (lot.risk) {
          const cap2 = await refreshCaptcha();
          if (cap2) {
            saveCaptchaToken(u, cap2);
            await doLottery(u, component_app, activity_app, "APP抽奖(验证后)", cap2);
          }
        }
        if ($.getdata("lhtj_enable_old_lottery") === "true") await doOldLottery(u);

        // 用户信息 / 珑珠
        const ui = await apiRequest({ url: HOST_MEMBER + "/api/member/v1/mine-info", method: "POST", headers: memberHeaders(u), body: { channel: u["x-lf-channel"], bu_code: u["x-lf-bu-code"], token: u.token } });
        const bi = await apiRequest({ url: HOST_MEMBER + "/api/member/v1/balance", method: "POST", headers: memberHeaders(u), body: { channel: u["x-lf-channel"], bu_code: u["x-lf-bu-code"], token: u.token } });
        const nick = (ui && ui.data && ui.data.nick_name) || u.userName;
        const growth = ui && String(ui.code) === "0000" && ui.data && ui.data.growth_value != null ? ui.data.growth_value : "查询失败";
        const level = ui && String(ui.code) === "0000" && ui.data && ui.data.level != null ? ui.data.level : "未知";
        const balance = bi && String(bi.code) === "0000" && bi.data && bi.data.balance != null ? bi.data.balance : "查询失败";
        const rewardText = Object.keys($.signRewards).map((unit) => $.signRewards[unit] + " " + unit).join(" + ");
        $.title = rewardText ? "本次签到获得 " + rewardText : "本次未确认新增签到奖励";
        $.notifyMsg.push("当前用户：" + nick + "\n成长值：" + growth + "　等级：V" + level + "　珑珠：" + balance);
      } else {
        $.notifyMsg.push("⛔️ " + u.userName + "：登录已过期，请重新抓包");

      }

    } catch (e) {
      log("⛔️ 当前账号执行异常，继续处理其他账号");
      $.notifyMsg.push("⛔️ 当前账号执行异常，请查看日志");
    }
    if ($.ckExpired) $.notifyMsg.push("⛔️ " + removeExpiredUser(u));
    notifyUser($.notifyMsg.join("\n"));
    if (idx < users.length - 1) await sleep(1500);
  }
}

function notifyUser(content) {
  if (!content) return;
  log(($.title || "任务完成") + "\n" + content);
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

function log(m) { $.log(m); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function dateTime() {
  const d = new Date(), p = (n) => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
// 调试开关：Loon 里把下面改成 true 可看详细日志
function debug(m) { if (false) console.log("[debug] " + m); }

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
