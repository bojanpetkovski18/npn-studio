// Platform adapter: the same UI runs as a PWA in the browser and as a native Android app (Capacitor).
// In the Android WebView there is no Web Share API and <a download> does nothing, so sharing/saving the ZIP
// goes through the native Filesystem + Share plugins there.
import { Capacitor, SystemBars, SystemBarsStyle, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App as CapApp } from '@capacitor/app';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'web' | 'android' | 'ios'

// base64 of a byte range (multiple of 3 bytes -> chunks concatenate into valid base64 when appended)
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Writes a Blob to the device in ~3 MB chunks (avoids one huge string over the native bridge). Returns the file URI. */
async function writeChunked(blob, path, directory, onProgress) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 3 * 1024 * 1024;
  for (let off = 0; off < bytes.length || off === 0; off += CHUNK) {
    const data = b64(bytes.subarray(off, Math.min(bytes.length, off + CHUNK)));
    if (off === 0) await Filesystem.writeFile({ path, data, directory, recursive: true });
    else await Filesystem.appendFile({ path, data, directory });
    if (onProgress) onProgress(Math.min(1, (off + CHUNK) / bytes.length));
    if (bytes.length === 0) break;
  }
  return (await Filesystem.getUri({ path, directory })).uri;
}

export function canShareFiles() {
  if (isNative) return true;
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.zip', { type: 'application/zip' })] })); } catch { return false; }
}

/** Opens the system share sheet with the ZIP. Resolves false if the user dismissed it. */
export async function shareFile(blob, name, text) {
  if (isNative) {
    const uri = await writeChunked(blob, `share/${name}`, Directory.Cache);
    try {
      await Share.share({ title: name, text, files: [uri], dialogTitle: 'Сподели ги предлозите' });
      return true;
    } catch (err) {
      if (/cancel/i.test(err && err.message)) return false;
      throw err;
    }
  }
  const file = new File([blob], name, { type: 'application/zip' });
  try {
    await navigator.share({ files: [file], title: name, text });
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
    throw err;
  }
}

/** Saves the ZIP on the device. Returns a human-readable location. */
export async function saveFile(blob, name) {
  if (isNative) {
    await writeChunked(blob, `Nalogix/${name}`, Directory.Documents);
    return `Documents/Nalogix/${name}`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return `Преземања/${name}`;
}

/** Removes shared copies from the app cache (they are only needed while the share sheet is open). */
export async function cleanShareCache() {
  if (!isNative) return;
  try { await Filesystem.rmdir({ path: 'share', directory: Directory.Cache, recursive: true }); } catch {}
}

/**
 * Android hardware/gesture back, handled explicitly (Capacitor's default walks the WebView history, which does
 * not reliably close overlays): close the open dialog / sheet first, then go back to the first tab, then minimise
 * the app (instead of killing it, so unsaved state and a running generation survive).
 */
export function handleBackButton({ dialogOpen, closeDialog, sheetOpen, closeSheet, tab, goHome }) {
  if (!isNative) return;
  CapApp.addListener('backButton', () => {
    if (dialogOpen()) return closeDialog();
    if (sheetOpen()) return closeSheet();
    if (tab() !== 'data') return goHome();
    CapApp.minimizeApp();
  });
}

const ThemeBars = registerPlugin('ThemeBars'); // app-local Android plugin (MainActivity registers it)

/** Keeps the Android status/navigation bars in step with the app theme (not just the device theme). */
export async function syncSystemBars(dark) {
  if (!isNative) return;
  try { await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }); } catch {}
  try { await ThemeBars.setBackground({ color: dark ? '#121319' : '#f2f3f7' }); } catch {}
}
