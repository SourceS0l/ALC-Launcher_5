// Read-only BACnet/IP client for the co-pilot. It can ONLY read: Who-Is/I-Am discovery and ReadProperty.
// There is deliberately no WriteProperty or any other command here, so nothing in this module can change a
// device. main.js exposes these reads to the AI; the AI never gets a way to write.
const dgram = require('dgram');

const OBJ_TYPES = { 0: 'analog-input', 1: 'analog-output', 2: 'analog-value', 3: 'binary-input', 4: 'binary-output',
  5: 'binary-value', 8: 'device', 13: 'multi-state-input', 14: 'multi-state-output', 19: 'multi-state-value',
  10: 'file', 15: 'notification-class', 16: 'program', 17: 'schedule', 20: 'trend-log', 40: 'char-string-value' };
// point-like objects the co-pilot lists (sensors, commands, setpoints); skip files, programs, schedules, etc.
const POINT_TYPES = new Set([0, 1, 2, 3, 4, 5, 13, 14, 19]);
// BACnet engineering units: a high-confidence subset; others are returned as the raw number for the user to map.
const UNITS = { 95: '', 98: '%', 62: '°C', 63: 'K', 64: '°F', 2: 'mA', 3: 'A', 4: 'Ω', 5: 'V',
  73: 'W', 74: 'kW', 48: 'cfm', 55: 'psi', 58: 'in. w.c.', 76: 'ppm', 82: 'ft', 118: '°F·delta' };
const EVENT_STATES = ['normal', 'fault', 'offnormal', 'high-limit', 'low-limit', 'life-safety-alarm'];
const PROP = { objectList: 76, presentValue: 85, objectName: 77, units: 117, description: 28, eventState: 36, statusFlags: 111 };

// ---- decoding ----
function readTag(a, pos) {   // -> { tagNum, isContext, isOpen, isClose, len, dataPos }
  let b = a[pos], tagNum = b >> 4, isContext = (b & 8) !== 0, lenField = b & 7, p = pos + 1;
  if (tagNum === 15) { tagNum = a[p++]; }   // extended tag number
  let isOpen = false, isClose = false, len = lenField;
  if (isContext && lenField === 6) { isOpen = true; len = 0; }
  else if (isContext && lenField === 7) { isClose = true; len = 0; }
  else if (lenField === 5) { len = a[p++]; if (len === 254) { len = a.readUInt16BE(p); p += 2; } else if (len === 255) { len = a.readUInt32BE(p); p += 4; } }
  return { tagNum, isContext, isOpen, isClose, len, dataPos: p, boolVal: lenField };
}
function decodeValue(a, pos) {   // one application-tagged value -> { kind, value, next }
  const t = readTag(a, pos), d = a.slice(t.dataPos, t.dataPos + t.len), next = t.dataPos + t.len;
  const uint = () => { let v = 0; for (const b of d) v = v * 256 + b; return v; };
  switch (t.tagNum) {
    case 1: return { kind: 'boolean', value: t.boolVal === 1, next: t.dataPos };   // app boolean: value is in the length nibble
    case 2: return { kind: 'unsigned', value: uint(), next };
    case 3: { let v = uint(); if (d.length && d[0] & 0x80) v -= 2 ** (8 * d.length); return { kind: 'signed', value: v, next }; }
    case 4: return { kind: 'real', value: d.length >= 4 ? d.readFloatBE(0) : 0, next };
    case 5: return { kind: 'double', value: d.length >= 8 ? d.readDoubleBE(0) : 0, next };
    case 7: { const cs = d[0], raw = d.slice(1); return { kind: 'string', value: cs === 4 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString(cs === 0 ? 'utf8' : 'latin1'), next }; }
    case 8: return { kind: 'bitstring', value: [...d.slice(1)], next };   // [unusedBits removed] raw bytes
    case 9: return { kind: 'enumerated', value: uint(), next };
    case 12: { const n = d.readUInt32BE(0); return { kind: 'objectid', value: { type: n >>> 22, instance: n & 0x3fffff }, next }; }
    default: return { kind: 'raw', value: [...d], next };
  }
}
// Parse a ReadProperty ACK's value region: everything between opening tag 3 and closing tag 3.
function parseAckValues(a) {
  let pos = 3;   // after PDU type, invokeId, service choice
  // skip whole tags (object-id, property-id, optional array index) until the opening tag 3 (0x3e)
  while (pos < a.length && a[pos] !== 0x3e && a[pos] !== 0x3f) { const t = readTag(a, pos), np = t.dataPos + t.len; if (np <= pos) break; pos = np; }
  if (a[pos] !== 0x3e) return [];
  pos++;
  const vals = [];
  while (pos < a.length && a[pos] !== 0x3f) { const v = decodeValue(a, pos); if (v.next <= pos) break; vals.push(v); pos = v.next; }
  return vals;
}

// ---- encoding ----
const ctxUnsigned = (tag, v) => v <= 255 ? [tag << 4 | 0x09, v] : v <= 65535 ? [tag << 4 | 0x0a, v >> 8, v & 255] : [tag << 4 | 0x0c, v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255];
const objIdBytes = (type, inst) => { const n = (type << 22 | inst) >>> 0; return [n >>> 24 & 255, n >> 16 & 255, n >> 8 & 255, n & 255]; };

class Bacnet {
  constructor() { this.sock = null; this.invoke = 0; this.pending = new Map(); this.onIAm = null; }
  open(port = 47808) {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', e => { if (!this.sock) reject(e); });
      sock.on('message', (buf, rinfo) => this._recv(buf, rinfo));
      sock.bind({ port, exclusive: false }, () => { sock.setBroadcast(true); this.sock = sock; resolve(); });
    });
  }
  close() { try { this.sock.close(); } catch {} this.sock = null; for (const p of this.pending.values()) clearTimeout(p.timer); this.pending.clear(); }
  _frame(target, apdu) {
    const npdu = target.net != null ? [0x01, 0x24, target.net >> 8, target.net & 255, target.sadr.length, ...target.sadr, 0xff] : [0x01, 0x04];
    const body = [...npdu, ...apdu], len = body.length + 4;
    return Buffer.from([0x81, 0x0a, len >> 8, len & 255, ...body]);
  }
  _recv(buf, rinfo) {
    if (buf.length < 6 || buf[0] !== 0x81) return;
    const fn = buf[1]; let i = 4;
    if (fn === 0x04) i = 10; else if (fn !== 0x0a && fn !== 0x0b) return;   // 0x0b broadcast, 0x0a unicast, 0x04 forwarded
    const ctl = buf[i + 1]; i += 2;
    if (ctl & 0x80) return;
    let snet = null, sadr = null;
    if (ctl & 0x20) i += 3 + buf[i + 2];                                   // DNET/DLEN/DADR (skip)
    if (ctl & 0x08) { snet = buf.readUInt16BE(i); const l = buf[i + 2]; sadr = [...buf.slice(i + 3, i + 3 + l)]; i += 3 + l; }
    if (ctl & 0x20) i += 1;
    const a = buf.slice(i), src = { ip: fn === 0x04 ? [...buf.slice(4, 8)].join('.') : rinfo.address, port: fn === 0x04 ? buf.readUInt16BE(8) : rinfo.port, net: snet, sadr };
    const type = a[0] & 0xf0;
    if (a[0] === 0x10 && a[1] === 0x00 && this.onIAm) return this.onIAm(a, src);   // unconfirmed I-Am
    const invoke = a[1], p = this.pending.get(invoke);
    if (!p) return;
    this.pending.delete(invoke); clearTimeout(p.timer);
    if (type === 0x30) p.resolve(a);                                       // complex ACK
    else if (type === 0x50) p.reject(new Error('BACnet error (class ' + a[4] + ' code ' + a[6] + ')'));
    else if (type === 0x60) p.reject(new Error('BACnet reject'));
    else if (type === 0x70) p.reject(new Error('BACnet abort'));
    else p.resolve(a);
  }
  _send(target, apduNoInvoke, ms = 4000) {
    const id = (this.invoke = (this.invoke + 1) & 0xff);
    const apdu = [0x00, 0x05, id, ...apduNoInvoke];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timed out')); }, ms);
      this.pending.set(id, { resolve, reject, timer });
      this.sock.send(this._frame(target, apdu), target.port || 47808, target.ip, err => { if (err) { clearTimeout(timer); this.pending.delete(id); reject(err); } });
    });
  }
  async readProperty(target, objType, objInst, propId, arrayIndex) {
    const svc = [0x0c, 0x0c, ...objIdBytes(objType, objInst), ...ctxUnsigned(1, propId)];
    if (arrayIndex != null) svc.push(...ctxUnsigned(2, arrayIndex));
    const ack = await this._send(target, svc);
    return parseAckValues(ack);
  }
}

// Find devices. targets = addresses to send Who-Is to. In "field" mode these are subnet broadcasts and we
// bind 47808 to catch broadcast I-Am. In "server" mode (unicast:true) we unicast a global Who-Is straight to
// the WebCTRL server from an ephemeral port (bindPort 0), so it coexists with a BACnet program that owns
// 47808 locally. seed devices (e.g. a known server instance) are included so they can be read even if the
// server answers I-Am by broadcast, which we would not catch on an ephemeral port.
async function discover(targets, { ms = 3500, bindPort = 47808, seed = [], unicast = false } = {}) {
  const bac = new Bacnet();
  await bac.open(bindPort);
  const devs = new Map();
  for (const s of seed) devs.set(s.instance, { instance: s.instance, ip: s.ip, port: s.port || 47808, net: s.net != null ? s.net : null, sadr: s.sadr || null, vendorId: s.vendorId || 0, name: '' });
  bac.onIAm = (a, src) => {
    if (a[2] !== 0xc4) return;
    const obj = a.readUInt32BE(3), instance = obj & 0x3fffff;
    let pos = 7; const max = decodeValue(a, pos); pos = max.next; const seg = decodeValue(a, pos); pos = seg.next; const vnd = decodeValue(a, pos);
    if (!devs.has(instance)) devs.set(instance, { instance, ip: src.ip, port: src.port, net: src.net, sadr: src.sadr, vendorId: vnd.value, name: '' });
  };
  const fn = unicast ? 0x0a : 0x0b, whoIs = [0x01, 0x20, 0xff, 0xff, 0x00, 0xff, 0x10, 0x08];
  for (const b of targets) try { bac.sock.send(Buffer.from([0x81, fn, 0x00, whoIs.length + 4, ...whoIs]), 47808, b); } catch {}
  await new Promise(r => setTimeout(r, ms));
  for (const d of [...devs.values()].slice(0, 300)) {
    try { const v = await bac.readProperty(d, 8, d.instance, PROP.objectName); if (v[0] && v[0].kind === 'string') d.name = v[0].value; } catch {}
  }
  bac.close();
  return [...devs.values()];
}

// Read the point list of one device: name, present value, units, alarm state for each point-like object.
async function readPoints(target, instance, { cap = 400, onProgress, bindPort = 47808 } = {}) {
  const bac = new Bacnet();
  await bac.open(bindPort);
  try {
    const dev = { ...target };
    const countV = await bac.readProperty(dev, 8, instance, PROP.objectList, 0);
    const count = Math.min(countV[0] ? countV[0].value : 0, cap);
    // object identifiers by array index, a few at a time
    const ids = [];
    for (let i = 1; i <= count; i += 8) {
      const batch = await Promise.all(Array.from({ length: Math.min(8, count - i + 1) }, (_, k) =>
        bac.readProperty(dev, 8, instance, PROP.objectList, i + k).then(v => v[0] && v[0].value).catch(() => null)));
      for (const o of batch) if (o && POINT_TYPES.has(o.type)) ids.push(o);
      if (onProgress) onProgress(Math.min(i + 7, count), count);
    }
    const points = [];
    for (let i = 0; i < ids.length; i += 6) {
      const batch = ids.slice(i, i + 6);
      await Promise.all(batch.map(async o => {
        const p = { type: OBJ_TYPES[o.type] || 'type-' + o.type, instance: o.instance };
        const grab = async (prop, into) => { try { const v = await bac.readProperty(dev, o.type, o.instance, prop); if (v[0]) into(v[0]); } catch {} };
        await grab(PROP.objectName, v => p.name = v.value);
        await grab(PROP.presentValue, v => p.value = v.kind === 'real' ? Math.round(v.value * 1000) / 1000 : v.value);
        await grab(PROP.units, v => { p.unitsCode = v.value; p.units = UNITS[v.value] != null ? UNITS[v.value] : ''; });
        await grab(PROP.eventState, v => p.state = EVENT_STATES[v.value] || 'state-' + v.value);
        points.push(p);
      }));
      if (onProgress) onProgress(count, count, points.length, ids.length);
    }
    return { count, points };
  } finally { bac.close(); }
}

module.exports = { Bacnet, discover, readPoints, decodeValue, parseAckValues, readTag, OBJ_TYPES, UNITS, EVENT_STATES, PROP, ctxUnsigned, objIdBytes };
