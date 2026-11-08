// Service-worker registration, update prompt and "install the app" hints.
import { $, toast, dialog, ICON } from './ui.js';
import { isNative } from './native.js';

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferredPrompt = null;

export function registerSW() {
  if (isNative || !('serviceWorker' in navigator)) return; // the Android app ships its files inside the APK
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!secure) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offerUpdate = (w) => {
      if (!w || !navigator.serviceWorker.controller) return; // first install: nothing to update
      const close = dialog(`<h3>Нова верзија</h3><p>Достапна е нова верзија на Nalogix. Вашите податоци остануваат.</p>
        <div class="actions"><button class="btn primary block" id="updNow">Освежи сега</button><button class="btn ghost block" id="updLater">Подоцна</button></div>`);
      $('#updLater').onclick = close;
      $('#updNow').onclick = () => { w.postMessage('skipWaiting'); close(); };
    };
    if (reg.waiting) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed') offerUpdate(w); });
    });
    // check for updates when the app comes back to the foreground
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

/** Shows an install button (Android/desktop Chrome) or the iOS "Add to Home Screen" hint. */
export function installHints() {
  if (isNative) return; // already an installed app
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.documentElement.classList.add('can-install');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.documentElement.classList.remove('can-install');
    toast('ok', 'Nalogix е инсталиран', 'Отворете го од почетниот екран.');
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-install]')) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      document.documentElement.classList.remove('can-install');
    } else if (isIOS()) {
      const close = dialog(`<h3>Додај на почетен екран</h3><p>Во Safari допрете <b>Сподели</b> ${ICON.share.replace('<svg', '<svg style="display:inline;width:18px;height:18px;vertical-align:-3px"')} и потоа <b>„Додај на почетен екран“</b>. Nalogix потоа работи како апликација, и без интернет.</p>
        <div class="actions"><button class="btn primary block" id="iosOk">Во ред</button></div>`);
      $('#iosOk').onclick = close; // (no inline onclick: the CSP blocks inline handlers)
    }
  });
  if (isIOS() && !isStandalone()) document.documentElement.classList.add('can-install');
}
