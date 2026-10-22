/**
 * Minimal reader for the ESA WorldCover 2021 land-cover map (10 m, open data on S3, CC-BY 4.0).
 * Each 3°×3° file is a Cloud Optimized GeoTIFF: 36000 px, 1024 px tiles, Deflate, uint8.
 * We parse the first IFD once per file, then range-fetch and inflate only the tile we need,
 * so no GeoTIFF dependency is bundled. Ocean files do not exist (404): read as open water.
 */
import zlib from 'node:zlib';

const BASE = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_';
const SIZE = 36000;
const WATER = 80;

const ifds = new Map(); // file -> Promise<{ tw, th, offsets, counts } | null>
const tiles = new Map(); // file:index -> Promise<Uint8Array | null>, small LRU per container
const MAX_TILES = 12;

const pad = (n, w) => String(Math.abs(n)).padStart(w, '0');
const fileName = (tLat, tLon) => `${tLat < 0 ? 'S' : 'N'}${pad(tLat, 2)}${tLon < 0 ? 'W' : 'E'}${pad(tLon, 3)}`;

async function range(url, start, length) {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal: AbortSignal.timeout(8_000) });
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) throw new Error(`WorldCover ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

async function readIfd(url) {
    const head = await range(url, 0, 65536);
    if (!head) return null;
    if (head.readUInt16LE(0) !== 0x4949 || head.readUInt16LE(2) !== 42) throw new Error('WorldCover: unexpected TIFF');
    const at = head.readUInt32LE(4);
    const n = head.readUInt16LE(at);
    const tags = {};
    for (let i = 0; i < n; i++) {
        const e = at + 2 + i * 12;
        tags[head.readUInt16LE(e)] = { type: head.readUInt16LE(e + 2), count: head.readUInt32LE(e + 4), value: e + 8 };
    }
    const scalar = (t) => (t.type === 3 ? head.readUInt16LE(t.value) : head.readUInt32LE(t.value));
    const array = async (t) => {
        const size = t.type === 16 ? 8 : 4;
        const off = head.readUInt32LE(t.value);
        const buf = off + t.count * size <= head.length ? head.subarray(off, off + t.count * size) : await range(url, off, t.count * size);
        return Array.from({ length: t.count }, (_, i) => (size === 8 ? Number(buf.readBigUInt64LE(i * size)) : buf.readUInt32LE(i * size)));
    };
    if (scalar(tags[259]) !== 8) throw new Error('WorldCover: unexpected compression');
    return { tw: scalar(tags[322]), th: scalar(tags[323]), offsets: await array(tags[324]), counts: await array(tags[325]) };
}

async function readTile(url, ifd, index) {
    const key = `${url}:${index}`;
    if (!tiles.has(key)) {
        if (tiles.size >= MAX_TILES) tiles.delete(tiles.keys().next().value);
        const p = range(url, ifd.offsets[index], ifd.counts[index]).then((buf) => (buf ? new Uint8Array(zlib.inflateSync(buf)) : null));
        p.catch(() => tiles.delete(key));
        tiles.set(key, p);
    }
    return tiles.get(key);
}

/**
 * Land-cover shares around a point: { 10: 0.62, 50: 0.3, ... } over a square of ±halfPx pixels
 * (10 m each). Classes: 10 trees, 20 shrubs, 30 grassland, 40 cropland, 50 built-up, 60 bare,
 * 70 snow, 80 water, 90 wetland, 95 mangroves, 100 moss & lichen.
 */
export async function landCover(lat, lon, halfPx = 10) {
    const tLat = Math.floor(lat / 3) * 3;
    const tLon = Math.floor(lon / 3) * 3;
    const url = `${BASE}${fileName(tLat, tLon)}_Map.tif`;
    if (!ifds.has(url)) {
        const p = readIfd(url);
        p.catch(() => ifds.delete(url));
        ifds.set(url, p);
    }
    const ifd = await ifds.get(url);
    if (!ifd) return { [WATER]: 1 };
    const cx = Math.floor(((lon - tLon) / 3) * SIZE);
    const cy = Math.floor(((tLat + 3 - lat) / 3) * SIZE);
    const across = Math.ceil(SIZE / ifd.tw);
    const counts = {};
    let total = 0;
    const step = Math.max(1, Math.floor(halfPx / 5)); // ~100 samples are plenty
    for (let y = Math.max(0, cy - halfPx); y <= Math.min(SIZE - 1, cy + halfPx); y += step) {
        for (let x = Math.max(0, cx - halfPx); x <= Math.min(SIZE - 1, cx + halfPx); x += step) {
            const tile = await readTile(url, ifd, Math.floor(y / ifd.th) * across + Math.floor(x / ifd.tw));
            const v = tile ? tile[(y % ifd.th) * ifd.tw + (x % ifd.tw)] : WATER;
            if (!v) continue; // nodata
            counts[v] = (counts[v] || 0) + 1;
            total++;
        }
    }
    if (!total) return { [WATER]: 1 };
    for (const k of Object.keys(counts)) counts[k] = Math.round((counts[k] / total) * 100) / 100;
    return counts;
}
