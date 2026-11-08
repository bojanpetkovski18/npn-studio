// Screen 3 – Анализа: key figures, debt by place (tap → filtered list), debt bands, natural vs legal persons.
// Single-series charts in one accent hue; every bar is labelled, so nothing relies on colour alone.
import { $, esc, ICON, nf, plural, moneyShort, compact } from '../ui.js';
import { S, on } from '../state.js';
import { registerScreen, go, App } from '../router.js';
import { setPlace } from './cases.js';

function render() {
  const el = $('#statsBody');
  const V = S.cases;
  if (!V.length) {
    el.innerHTML = `<div class="empty"><div class="art">${ICON.chart}</div><h3>Нема податоци за анализа</h3><p>Вчитајте ги табелите во „Податоци“.</p><button class="btn primary" id="sToData">Оди на Податоци</button></div>`;
    $('#sToData').onclick = () => go('data');
    return;
  }
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const debt = sum(V, (c) => c.vkupenDolg);
  const costs = sum(V, (c) => c.vkupnoTroshoci);
  const warn = V.filter((c) => c.warnings.some((w) => w.level !== 'info')).length;

  const byPlace = new Map();
  for (const c of V) { const p = byPlace.get(c.mesto) || { n: 0, d: 0 }; p.n++; p.d += c.vkupenDolg; byPlace.set(c.mesto, p); }
  const places = [...byPlace.entries()].map(([label, p]) => ({ label, ...p })).sort((a, b) => b.d - a.d);
  const top = places.slice(0, 10);
  const rest = places.slice(10);
  const maxP = top.length ? top[0].d : 1;

  const bands = [[0, 6000, '< 6'], [6000, 10000, '6–10'], [10000, 20000, '10–20'], [20000, 50000, '20–50'], [50000, 100000, '50–100'], [100000, Infinity, '> 100']]
    .map(([a, b, label]) => ({ label, n: V.filter((c) => c.vkupenDolg >= a && c.vkupenDolg < b).length }));
  const maxB = Math.max(1, ...bands.map((b) => b.n));

  const fiz = V.filter((c) => c.tip === 'fizicko');
  const dF = sum(fiz, (c) => c.vkupenDolg);
  const dP = debt - dF;

  el.innerHTML = `
    <div class="tiles">
      <div class="tile"><span><i></i>Тужби</span><b>${nf(V.length)}</b><small>${nf(S.selected.size)} избрани</small></div>
      <div class="tile"><span><i style="background:var(--accent-2)"></i>Фактури</span><b>${nf(S.itemCount)}</b><small>${(S.itemCount / V.length).toFixed(1).replace('.', ',')} по тужба</small></div>
      <div class="tile"><span><i style="background:var(--ok)"></i>Главен долг</span><b>${compact(debt)}</b><small>ден.</small></div>
      <div class="tile"><span><i style="background:var(--warn)"></i>Предупредувања</span><b>${nf(warn)}</b><small>${warn ? 'за проверка' : 'сè е во ред'}</small></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Долг по место</h2><span class="hint">допрете за листа</span></div>
      ${top.map((p) => `<button class="hbar tap" data-place="${esc(p.label)}" style="width:100%;text-align:left">
        <span class="hl">${esc(p.label)}</span><span class="hv">${moneyShort(p.d)} ден. · ${nf(p.n)}</span>
        <span class="ht" style="width:${Math.max(1, (p.d / maxP) * 100)}%"></span></button>`).join('')}
      ${rest.length ? `<p class="note">+ ${plural(rest.length, 'друго место', 'други места')} · ${moneyShort(sum(rest, (r) => r.d))} ден.</p>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Тужби по висина на долг</h2><span class="hint">илј. ден.</span></div>
      <div class="cols" role="img" aria-label="${bands.map((b) => `${b.label}: ${b.n}`).join(', ')}">
        ${bands.map((b) => `<div class="col"><em>${nf(b.n)}</em><i style="height:${(b.n / maxB) * 100}%"></i></div>`).join('')}
      </div>
      <div class="xl">${bands.map((b) => `<span>${b.label}</span>`).join('')}</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Физички и правни лица</h2><span class="hint">удел во долгот</span></div>
      <div class="split" role="img" aria-label="Физички ${Math.round((dF / debt) * 100)}%, правни ${Math.round((dP / debt) * 100)}%"><i style="width:${(dF / debt) * 100}%"></i><i style="width:${(dP / debt) * 100}%"></i></div>
      <div class="legend"><span>Физички ${nf(fiz.length)} · ${Math.round((dF / debt) * 100)}%</span><span>Правни ${nf(V.length - fiz.length)} · ${Math.round((dP / debt) * 100)}%</span></div>
      <div class="sum-row" style="margin-top:10px"><span>Трошоци по постапката</span><b>${moneyShort(costs)} ден.</b></div>
    </div>`;
}

$('#statsBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-place]');
  if (!b) return;
  setPlace(b.dataset.place);
  go('cases');
});

on('data', () => { if (App.tab === 'stats') render(); });
on('cases', () => { if (App.tab === 'stats') render(); });
registerScreen('stats', { show: render });
