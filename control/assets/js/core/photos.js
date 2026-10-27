/* 사진 압축·보관 — IndexedDB 용량 관리 */
import * as db from './db.js';
import { state } from './data.js';
import { uid } from './utils.js';

export async function compressImage(file, { maxWidth = 1600, quality = 0.72, maxBytes = 420000 } = {}) {
  if (!file?.type?.startsWith('image/')) throw new Error('이미지 파일만 첨부할 수 있습니다.');
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('이미지를 열 수 없습니다.'));
    i.src = dataUrl;
  });
  let scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
  let q = quality;
  let out = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    out = canvas.toDataURL('image/jpeg', q);
    const bytes = Math.round((out.length * 3) / 4);
    if (bytes <= maxBytes) break;
    scale *= 0.82;
    q = Math.max(0.45, q - 0.08);
  }
  return { dataUrl: out, width: img.width, height: img.height, bytes: Math.round((out.length * 3) / 4) };
}

export async function savePhoto(incidentId, file) {
  const cfg = state.settings.photo || {};
  const est = await db.estimateStorage();
  if (est && est.ratio > (cfg.blockAt || 0.88)) {
    throw new Error(`저장 공간이 부족합니다(${Math.round(est.ratio * 100)}%). 사진 정리 후 다시 시도하세요.`);
  }
  const img = await compressImage(file, { maxWidth: cfg.maxWidth || 1600, quality: cfg.quality || 0.72 });
  const row = {
    id: uid('pho'),
    incidentId,
    dataUrl: img.dataUrl,
    bytes: img.bytes,
    originalName: file.name,
    createdAt: new Date().toISOString(),
  };
  await db.put('photos', row);
  return { id: row.id, dataUrl: row.dataUrl, bytes: row.bytes };
}

export async function getPhoto(id) {
  return db.get('photos', id);
}

export async function photosFor(ids = []) {
  const out = [];
  for (const id of ids) {
    const p = await getPhoto(id);
    if (p) out.push(p);
  }
  return out;
}

export async function photoUsage() {
  const photos = await db.getAll('photos');
  const bytes = photos.reduce((s, p) => s + (p.bytes || 0), 0);
  return { count: photos.length, bytes };
}

export async function cleanupPhotos({ keepDays = 180 } = {}) {
  const all = await db.getAll('photos');
  const referenced = new Set(state.incidents.flatMap((i) => i.photos || []));
  const cutoff = Date.now() - keepDays * 86400000;
  const remove = all.filter((p) => !referenced.has(p.id) || new Date(p.createdAt).getTime() < cutoff);
  await db.bulkDel('photos', remove.map((p) => p.id));
  return { removed: remove.length, bytes: remove.reduce((s, p) => s + (p.bytes || 0), 0) };
}

export async function deletePhoto(id) {
  await db.del('photos', id);
}
