// Nalogix Mobile – entry point (see MOBILE_PLAN.md for the phases).
import { startRouter } from './router.js';
import { restore } from './state.js';
import { store } from './store.js';
import { toast } from './ui.js';
import './screens/data.js';
import './screens/cases.js';
import './screens/gen.js';
import './screens/stats.js';
import { registerSW, installHints } from './pwa.js';
import { platform, handleBackButton } from './native.js';
import { isSheetOpen, closeSheet } from './screens/sheet.js';
import { App, go } from './router.js';
document.documentElement.dataset.platform = platform;
import { S, on } from './state.js';
import { $, nf } from './ui.js';

// tab-bar badges
const badges = () => {
  $('#badgeGen').hidden = !S.selected.size;
  $('#badgeGen').textContent = S.selected.size > 999 ? '999+' : nf(S.selected.size);
};
for (const ev of ['data', 'selection', 'restored']) on(ev, badges);

startRouter();
restore().catch((err) => toast('error', 'Не може да се вчитаат зачуваните податоци', err.message, 7000));
store.persist();
registerSW();
handleBackButton({
  dialogOpen: () => !$('#dialog').hidden,
  closeDialog: () => { const d = $('#dialog'); d.hidden = true; d.innerHTML = ''; if (history.state && history.state.dialog) history.back(); },
  sheetOpen: isSheetOpen,
  closeSheet: () => closeSheet(),
  tab: () => App.tab,
  goHome: () => go('data'),
});
installHints();
