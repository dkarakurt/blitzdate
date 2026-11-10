/**
 * BlitzSnap: sohbet sırasında oynanabilen tek "koz".
 * - Yalnızca uygulama içi kamerayla, o an çekilmiş fotoğraf.
 * - Alıcı açtığı an 5 saniye görür, sonra fotoğraf silinir.
 * - Her kişinin bir eşleşmede tek hakkı vardır.
 */

export const SNAP_VIEW_MS = 5000;
/** Çekim ile gönderim arasında izin verilen en uzun süre — eski kareyi göndermeyi engeller. */
export const SNAP_MAX_AGE_MS = 60_000;
export const SNAPS_PER_MATCH = 1;

export type SnapSource = 'camera' | 'gallery';

export interface CapturedPhoto {
  uri: string;
  source: SnapSource;
  capturedAt: number;
}

export type SnapState = 'sealed' | 'viewing' | 'deleted';

export interface Snap {
  id: string;
  from: string;
  uri: string | null;
  capturedAt: number;
  sentAt: number;
  state: SnapState;
  openedAt?: number;
}

export type SnapError = 'not-live-camera' | 'too-old' | 'no-snaps-left';

export function snapsLeft(sentCount: number): number {
  return Math.max(0, SNAPS_PER_MATCH - sentCount);
}

export function validateSnap(photo: CapturedPhoto, sentCount: number, now: number): SnapError | null {
  if (snapsLeft(sentCount) === 0) return 'no-snaps-left';
  if (photo.source !== 'camera') return 'not-live-camera';
  if (now - photo.capturedAt > SNAP_MAX_AGE_MS || now < photo.capturedAt) return 'too-old';
  return null;
}

export function createSnap(id: string, from: string, photo: CapturedPhoto, now: number): Snap {
  return { id, from, uri: photo.uri, capturedAt: photo.capturedAt, sentAt: now, state: 'sealed' };
}

/** Alıcı dokunduğunda açılır; zaten açılmış ya da silinmişse durum değişmez. */
export function openSnap(snap: Snap, now: number): Snap {
  if (snap.state !== 'sealed') return snap;
  return { ...snap, state: 'viewing', openedAt: now };
}

export function snapRemainingMs(snap: Snap, now: number): number {
  if (snap.state === 'sealed') return SNAP_VIEW_MS;
  if (snap.state === 'deleted' || snap.openedAt == null) return 0;
  return Math.max(0, SNAP_VIEW_MS - (now - snap.openedAt));
}

/** Süre dolduysa fotoğrafı tamamen siler (uri'yi de bırakır). */
export function tickSnap(snap: Snap, now: number): Snap {
  if (snap.state === 'viewing' && snapRemainingMs(snap, now) === 0) {
    return { ...snap, state: 'deleted', uri: null };
  }
  return snap;
}

export function ageLabel(capturedAt: number, now: number): string {
  const s = Math.max(0, Math.round((now - capturedAt) / 1000));
  if (s < 60) return `${s} sn önce`;
  return `${Math.round(s / 60)} dk önce`;
}
