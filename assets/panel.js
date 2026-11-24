/* Panel de ofertas de empleo en internet.
   Solo lee JSON agregados de datos/ (los genera Procesamiento/panel/generar_datos_panel.py).
   Los recuentos de 1 a 9 vienen como "<10": se enseñan así y no se dibujan. */
'use strict';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let NF;
try { NF = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 }); }
catch (e) { NF = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }); }
const NF1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const NFC = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const fmt = v => v === '<10' ? '<10' : (num(v) == null ? '—' : NF.format(v));
const fmtP = v => v == null ? '—' : NF1.format(v) + ' %';
const fmtE = v => v == null ? '—' : NF.format(Math.round(v)) + ' €';
const pctDe = (a, b) => (num(a) == null || !num(b)) ? null : 100 * a / b;
const ejeNum = v => Math.abs(v) >= 10000 ? NFC.format(v) : NF.format(v);
const NOMBRE_TIPO = { directo: 'Con portal directo', agregador: 'Solo agregadores' };
const AGREGADORES = new Set(['Bebee', 'Talent', 'JobLeads', 'JobToday', 'Tideri', 'LifeWorq', 'Glassdoor']);
const nombreMes = m => {
  const [mm, aa] = m.split('-');
  return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+mm - 1] + ' ' + aa;
};
const mesCorto = m => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+m.slice(0, 2) - 1] + ' ' + m.slice(5);
function el(tag, attrs = {}, texto) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v);
  }
  if (texto != null) e.textContent = texto;
  return e;
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let MESES = [], EVOL = [], D = null;
const CACHE = {};
const S = { mes: null, ccaa: '*', area: '*', portal: '*', tipo: '*' };
const UI = { mapaNivel: 'ccaa', mapaMetrica: 'n', evoInd: 'pct_teletrabajo', portalesVista: 'ofertas',
  solapModo: 'n', areaMetrica: 'n', agr: null, agrCampo: 'origen_dominio' };

// ---------------------------------------------------------------------------
// Colores (de los tokens CSS; paleta de referencia validada)
// ---------------------------------------------------------------------------
// Rampa petróleo de un solo tono (OKLCH h=188), validada: ordinal monótona, saltos >= 0,06 y
// el paso más cercano a la superficie por encima de 2:1 en cada tema.
const RAMPA_ORD = {
  light: ['#48b6ad', '#1fa098', '#008b83', '#00746d', '#005d58', '#004843'],
  dark: ['#00746d', '#008b83', '#1fa098', '#48b6ad', '#73c9c1', '#9cdcd6', '#c0ece7'],
};
const RAMPA_SEQ = {
  light: ['#e0f8f5', '#c0ece7', '#9cdcd6', '#73c9c1', '#48b6ad', '#1fa098', '#008b83', '#00746d', '#005d58', '#004843'],
  dark: ['#0f2e2c', '#004843', '#005d58', '#00746d', '#008b83', '#1fa098', '#48b6ad', '#73c9c1', '#c0ece7'],
};
function modo() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
let C = {};
function leerColores() {
  const cs = getComputedStyle(document.documentElement);
  const g = v => cs.getPropertyValue(v).trim();
  C = { ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), grid: g('--grid'), axis: g('--axis'),
    surface: g('--surface'), surface2: g('--surface-2'), nodata: g('--nodata'), up: g('--up'), down: g('--down'),
    s: [1, 2, 3, 4, 5, 6, 7, 8].map(i => g('--s' + i)), m: modo() };
  C.ord = RAMPA_ORD[C.m]; C.seq = RAMPA_SEQ[C.m];
}
function rampa(n) {   // n pasos ordinales espaciados
  const r = C.ord; if (n <= 1) return [r[4]];
  return Array.from({ length: n }, (_, i) => r[Math.round(i * (r.length - 1) / (n - 1))]);
}
function colorSeq(t) {   // color de la rampa secuencial en la posición t (0-1), aproximado al paso más cercano
  if (t == null || isNaN(t)) return null;
  const r = C.seq; return r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];
}
function tintaSobre(hex) {   // blanco o casi negro según la luminancia del relleno
  const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
  const L = x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  const lum = 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b);
  return lum > 0.4 ? '#0b0b0b' : '#ffffff';
}

// ---------------------------------------------------------------------------
// Gráficas: base común
// ---------------------------------------------------------------------------
const CH = {};
function graf(id) {
  if (!CH[id]) CH[id] = echarts.init(document.getElementById(id), null, { renderer: 'svg' });
  return CH[id];
}
function base(extra = {}) {
  return Object.assign({
    animationDuration: 700, animationEasing: 'cubicOut', animationDurationUpdate: 550, animationEasingUpdate: 'cubicInOut',
    textStyle: { fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', color: C.ink2 },
    tooltip: { confine: true, backgroundColor: C.surface, borderColor: C.grid, borderWidth: 1, padding: [8, 10],
      textStyle: { color: C.ink, fontSize: 13 }, extraCssText: 'border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.12);' },
  }, extra);
}
const ejeCat = (o = {}) => Object.assign({ type: 'category', axisLine: { lineStyle: { color: C.axis } }, axisTick: { show: false },
  axisLabel: { color: C.ink2, fontSize: 12 } }, o);
const ejeVal = (o = {}) => Object.assign({ type: 'value', splitLine: { lineStyle: { color: C.grid, width: 1 } },
  axisLine: { show: false }, axisLabel: { color: C.muted, fontSize: 11, formatter: ejeNum } }, o);
const BARRA = r => ({ borderRadius: r });   // extremo redondeado de 4px, base recta
const tipFila = (color, valor, nombre) =>
  `<div style="display:flex;gap:8px;align-items:center"><span style="width:12px;height:2px;background:${color};display:inline-block"></span>` +
  `<b>${valor}</b><span style="color:${C.ink2}">${esc(nombre)}</span></div>`;
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function vacio(id, texto) {
  const g = graf(id);
  g.clear();
  g.setOption({ graphic: [{ type: 'text', left: 'center', top: 'middle',
    style: { text: texto, fill: C.muted, font: '14px Segoe UI, system-ui, sans-serif', width: 280, overflow: 'break', align: 'center' } }] });
}

// Vista de tabla de cada tarjeta (accesible, sin depender del ratón)
function tabla(cardId, cols, filas) {
  const card = document.getElementById(cardId); if (!card) return;
  let herr = $('.herr', card);
  if (!herr) { herr = el('div', { class: 'herr' }); $('.card-cab', card).appendChild(herr); }
  if (!$('.btn-tabla', herr)) {
    const b = el('button', { class: 'btn-tabla', type: 'button', 'aria-pressed': 'false' }, 'Tabla');
    b.addEventListener('click', () => {
      const on = card.classList.toggle('ver-tabla'); b.setAttribute('aria-pressed', on);
      if (!on) Object.values(CH).forEach(c => c.resize());
    });
    herr.appendChild(b);
  }
  const caja = $('.tabla-vista', card); if (!caja) return;
  caja.textContent = '';
  const t = el('table', { class: 't' }); const th = el('tr');
  cols.forEach(c => th.appendChild(el('th', {}, c)));
  t.appendChild(el('thead')).appendChild(th);
  const tb = el('tbody');
  filas.forEach(f => { const tr = el('tr'); f.forEach(v => tr.appendChild(el('td', {}, v))); tb.appendChild(tr); });
  t.appendChild(tb); caja.appendChild(t);
}

// ---------------------------------------------------------------------------
// Filtros -> qué "corte" de los datos usar
// ---------------------------------------------------------------------------
// Cortes que genera el script: c=Comunidad|t=Tipo, a=Área|t=Tipo, a=Área|c=Comunidad, p=Portal.
// Cada gráfica que sirve de filtro ignora su propio filtro (el mapa enseña todas
// las comunidades, con la elegida marcada).
function claveCorte(ignora) {
  const s = Object.assign({}, S); if (ignora) s[ignora] = '*';
  const nota = [];
  let k;
  if (s.portal !== '*') {
    k = `p=${s.portal}`;
    if (s.ccaa !== '*' || s.area !== '*' || s.tipo !== '*') nota.push('El portal se cruza solo con el mes: se ignoran comunidad, área y tipo de oferta.');
  } else if (s.area !== '*' && s.ccaa !== '*') {
    k = `a=${s.area}|c=${s.ccaa}`;
    if (s.tipo !== '*') nota.push('Área y comunidad a la vez no se cruzan con el tipo de oferta.');
  } else if (s.area !== '*') k = `a=${s.area}|t=${s.tipo}`;
  else k = `c=${s.ccaa}|t=${s.tipo}`;
  if (!D.cortes[k] && /\|t=(directo|agregador)$/.test(k)) {
    nota.push('Este mes no separa por tipo de oferta (no tiene tabla de grupos).');
    k = k.replace(/\|t=.*$/, '|t=*');
  }
  return { k, c: D.cortes[k] || null, nota };
}
const corte = ignora => claveCorte(ignora).c;
function nFiltro() {
  const p = [];
  if (S.ccaa !== '*') p.push(S.ccaa); if (S.area !== '*') p.push(S.area);
  if (S.portal !== '*') p.push('ofertas con ' + S.portal); if (S.tipo !== '*') p.push(NOMBRE_TIPO[S.tipo].toLowerCase());
  return p.length ? p.join(' · ') : 'Toda España';
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------
async function json(ruta) {
  const r = await fetch(ruta, { cache: 'no-cache' });
  if (!r.ok) throw new Error(ruta + ': ' + r.status);
  return r.json();
}
async function cargarMes(m) {
  if (!CACHE[m]) CACHE[m] = await json(`datos/mes_${m}.json`);
  return CACHE[m];
}

// ---------------------------------------------------------------------------
// Atlas (es-atlas, IGN): casar nombres del INE con los del atlas
// ---------------------------------------------------------------------------
const ALIAS_REGION = { baleares: 'balears', gerona: 'girona', lerida: 'lleida', orense: 'ourense', guipuzcoa: 'gipuzkoa',
  vizcaya: 'bizkaia', alava: 'araba', nafarroa: 'navarra', 'castellon plana': 'castello', valenciana: 'valenciana',
  'valencia': 'valencia' };
function normRegion(s) {
  s = String(s ?? '').trim();
  if (s.includes(',')) { const [a, b] = s.split(','); s = `${b} ${a}`; }
  s = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const relleno = new Set(['a', 'de', 'del', 'la', 'las', 'el', 'los', 'comunidad', 'comunitat', 'foral', 'principado',
    'region', 'ciudad', 'autonoma', 'illes', 'islas', 'pais']);
  s = s.split(' ').filter(w => w && !relleno.has(w)).join(' ');
  return ALIAS_REGION[s] || s;
}
function clavesRegion(n) {
  const k = new Set([normRegion(n)]);
  String(n ?? '').split('/').forEach(p => k.add(normRegion(p)));
  k.delete(''); return k;
}
const DESPL_CANARIAS = [8.8, 6.3];
const CANARIAS = new Set(['canarias', 'palmas', 'santa cruz tenerife']);
function moverCoords(c, d) { return typeof c[0] === 'number' ? [c[0] + d[0], c[1] + d[1]] : c.map(x => moverCoords(x, d)); }
const ATLAS = { ccaa: null, prov: null, claves: { ccaa: new Map(), prov: new Map() } };
async function cargarAtlas() {
  const urls = { ccaa: ['https://cdn.jsdelivr.net/npm/es-atlas@0.6.0/es/autonomous_regions.json', 'autonomous_regions'],
    prov: ['https://cdn.jsdelivr.net/npm/es-atlas@0.6.0/es/provinces.json', 'provinces'] };
  for (const [nivel, [url, obj]] of Object.entries(urls)) {
    const topo = await json(url);
    const geo = topojson.feature(topo, topo.objects[obj]);
    geo.features.forEach(f => {
      if (CANARIAS.has(normRegion(f.properties.name))) f.geometry.coordinates = moverCoords(f.geometry.coordinates, DESPL_CANARIAS);
      clavesRegion(f.properties.name).forEach(k => ATLAS.claves[nivel].set(k, f.properties.name));
    });
    echarts.registerMap('es-' + nivel, geo);
    ATLAS[nivel] = geo;
  }
}
const aAtlas = (nivel, nombre) => {
  for (const k of clavesRegion(nombre)) if (ATLAS.claves[nivel].has(k)) return ATLAS.claves[nivel].get(k);
  return null;
};

// ---------------------------------------------------------------------------
// Cabecera: meses, KPIs, filtros, chips
// ---------------------------------------------------------------------------
function pintarMeses() {
  const caja = $('#meses'); caja.textContent = '';
  MESES.forEach(m => {
    const b = el('button', { class: 'mes-chip', type: 'button', 'aria-pressed': String(m.mes === S.mes) }, nombreMes(m.mes));
    b.addEventListener('click', () => cambiarMes(m.mes));
    caja.appendChild(b);
  });
}
const KPI_ANT = {};
function contar(elm, desde, hasta, f) {
  if (hasta == null) { elm.textContent = '—'; return; }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { elm.textContent = f(hasta); return; }
  const t0 = performance.now(), dur = 900;
  const paso = t => {
    const x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 3);
    elm.textContent = f(desde + (hasta - desde) * e);
    if (x < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
function pintarKpis() {
  const c = corte(); const k = D.kpis;
  const n = c ? num(c.n) : null;
  const conMod = c && c.modalidad ? Object.entries(c.modalidad).filter(([x]) => x !== 'Sin dato').reduce((a, [, v]) => a + (num(v) || 0), 0) : null;
  const items = [
    { id: 'n', lbl: S.mes === '11-2026' || D.con_exclusiones ? 'Ofertas únicas que cuentan' : 'Ofertas únicas', v: n, f: x => NF.format(Math.round(x)),
      sub: c && c.n === '<10' ? 'menos de 10' : (D.con_exclusiones && n === num(k.ofertas) ? `${NF.format(k.finales_antes_exclusiones)} finales, ${NF.format(k.finales_antes_exclusiones - k.ofertas)} excluidas` : nFiltro()), hero: true },
    { id: 'p', lbl: 'Portales', v: k.num_portales, f: x => NF.format(Math.round(x)), sub: 'con ofertas este mes' },
    { id: 'a', lbl: 'Solo de agregadores', v: c && c.tipo ? pctDe(c.tipo.agregador, n) : null, f: x => NF1.format(x) + ' %', sub: 'ninguna copia en portal directo' },
    { id: 's', lbl: 'Salario mediano', v: c && c.sal ? c.sal.med ?? null : null, f: x => NF.format(Math.round(x / 100) * 100) + ' €', sub: 'bruto anual, de las que lo dicen' },
    { id: 't', lbl: 'En teletrabajo', v: c && c.modalidad ? pctDe(c.modalidad['Teletrabajo'], conMod) : null, f: x => NF1.format(x) + ' %', sub: 'de las que dicen la modalidad' },
    { id: 'v', lbl: 'Ya vistas antes', v: c && c.vistas != null ? pctDe(c.vistas, n) : null, f: x => NF1.format(x) + ' %', sub: 'en meses anteriores' },
  ];
  const caja = $('#kpis');
  if (!caja.children.length) {
    items.forEach(it => {
      const d = el('div', { class: 'kpi' + (it.hero ? ' hero-n' : ''), id: 'kpi-' + it.id });
      d.append(el('div', { class: 'lbl' }), el('div', { class: 'val' }), el('div', { class: 'sub' }));
      caja.appendChild(d);
    });
  }
  items.forEach(it => {
    const d = $('#kpi-' + it.id);
    $('.lbl', d).textContent = it.lbl; $('.sub', d).textContent = it.sub;
    const v = $('.val', d);
    if (it.id === 'n' && c && c.n === '<10') { v.textContent = '<10'; return; }
    contar(v, KPI_ANT[it.id] ?? 0, it.v, it.f); KPI_ANT[it.id] = it.v ?? 0;
  });
  $('#hPortales').textContent = NF.format(k.num_portales);
  $('#hEyebrow').textContent = `datos de ${nombreMes(S.mes)}`;
}
function opciones(sel, valores, todas, etiqueta = v => v) {
  const s = $(sel); s.textContent = '';
  s.appendChild(el('option', { value: '*' }, todas));
  valores.forEach(v => s.appendChild(el('option', { value: v }, etiqueta(v))));
}
function pintarFiltros() {
  const keys = Object.keys(D.cortes);
  const ccaas = keys.filter(k => /^c=.*\|t=\*$/.test(k)).map(k => k.slice(2, -4)).filter(x => x !== '*').sort((a, b) => a.localeCompare(b, 'es'));
  const areas = keys.filter(k => /^a=.*\|t=\*$/.test(k)).map(k => k.slice(2, -4)).sort((a, b) => a.localeCompare(b, 'es'));
  const ports = keys.filter(k => k.startsWith('p=')).map(k => k.slice(2)).sort((a, b) => a.localeCompare(b, 'es'));
  if (S.ccaa !== '*' && !ccaas.includes(S.ccaa)) S.ccaa = '*';
  if (S.area !== '*' && !areas.includes(S.area)) S.area = '*';
  if (S.portal !== '*' && !ports.includes(S.portal)) S.portal = '*';
  opciones('#fCcaa', ccaas, 'Toda España');
  opciones('#fArea', areas, 'Todas las áreas');
  opciones('#fPortal', ports, 'Todos los portales', p => AGREGADORES.has(p) ? p + ' (agregador)' : p);
  sincronizarFiltros();
}
function sincronizarFiltros() {
  $('#fCcaa').value = S.ccaa; $('#fArea').value = S.area; $('#fPortal').value = S.portal;
  $$('#fTipo button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.tipo)));
  const chips = $('#chips'); chips.textContent = '';
  const def = [['ccaa', S.ccaa], ['area', S.area], ['portal', S.portal], ['tipo', S.tipo === '*' ? '*' : NOMBRE_TIPO[S.tipo]]];
  let hay = false;
  def.forEach(([k, v]) => {
    if (v === '*') return; hay = true;
    const ch = el('span', { class: 'chip' }, v);
    const x = el('button', { type: 'button', 'aria-label': 'Quitar filtro ' + v }, '×');
    x.addEventListener('click', () => { S[k] = '*'; actualizar(); });
    ch.appendChild(x); chips.appendChild(ch);
  });
  if (hay) {
    const l = el('button', { class: 'limpiar', type: 'button' }, 'Quitar filtros');
    l.addEventListener('click', () => { Object.assign(S, { ccaa: '*', area: '*', portal: '*', tipo: '*' }); actualizar(); });
    chips.appendChild(l);
  }
  $('#notaFiltro').textContent = claveCorte().nota.join(' ');
  guardarHash();
}
function guardarHash() {
  const p = new URLSearchParams();
  Object.entries(S).forEach(([k, v]) => { if (v && v !== '*') p.set(k, v); });
  history.replaceState(null, '', '#' + p.toString());
}
function leerHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  ['mes', 'ccaa', 'area', 'portal', 'tipo'].forEach(k => { if (p.get(k)) S[k] = p.get(k); });
}
function alternar(dim, valor) { S[dim] = S[dim] === valor ? '*' : valor; actualizar(); }

// ---------------------------------------------------------------------------
// 01 Mapa y ranking
// ---------------------------------------------------------------------------
function datosGeo(nivel) {
  const c = corte('ccaa');
  if (!c) return null;
  const tabla = nivel === 'ccaa' ? c.ccaa : c.prov;
  if (!tabla) return null;
  return Object.entries(tabla).filter(([k]) => k !== 'Sin ubicación').map(([nombre, v]) => {
    const [n, sal, tele, conMod] = v;
    return { nombre, n: num(n), nTxt: fmt(n), sal: sal ?? null, tele: pctDe(tele, conMod), teleTxt: fmt(tele), conMod };
  });
}
const METRICA = {
  n: { t: 'Ofertas', v: d => d.n, f: v => NF.format(v) },
  sal: { t: 'Salario mediano', v: d => d.sal, f: v => fmtE(v) },
  tele: { t: '% en teletrabajo', v: d => d.tele, f: v => fmtP(v) },
};
function pintarMapa() {
  const nivel = UI.mapaNivel, met = METRICA[UI.mapaMetrica];
  let datos = datosGeo(nivel);
  const btnProv = $('#mapaNivel button[data-v="prov"]');
  const hayProv = !!(corte('ccaa') && corte('ccaa').prov);
  btnProv.disabled = !hayProv; btnProv.title = hayProv ? '' : 'Sin provincias para este filtro';
  if (!datos && nivel === 'prov') { UI.mapaNivel = 'ccaa'; segPulsado('#mapaNivel', 'ccaa'); return pintarMapa(); }
  $('#tMapa').textContent = `${met.t} por ${nivel === 'ccaa' ? 'comunidad' : 'provincia'}`;
  $('#dMapa').textContent = `${nombreMes(S.mes)} · ${nFiltroSin('ccaa')}`;
  if (!datos || !ATLAS.ccaa) { vacio('gMapa', ATLAS.ccaa ? 'Sin datos para este filtro' : 'No se ha podido cargar el mapa'); return; }
  const serie = datos.map(d => ({ name: aAtlas(nivel, d.nombre) || d.nombre, value: met.v(d), d,
    selected: nivel === 'ccaa' && d.nombre === S.ccaa }));
  const vals = serie.map(x => x.value).filter(v => v != null);
  const g = graf('gMapa');
  g.setOption(base({
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => {
      const d = p.data && p.data.d; if (!d) return `${esc(p.name)}<br><span style="color:${C.muted}">sin ofertas</span>`;
      return `<div style="font-weight:600;margin-bottom:4px">${esc(d.nombre)}</div>` +
        tipFila(C.s[0], d.nTxt, 'ofertas') + tipFila(C.s[0], fmtE(d.sal), 'salario mediano') + tipFila(C.s[0], fmtP(d.tele), 'en teletrabajo');
    } }),
    visualMap: { type: 'continuous', min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 1,
      inRange: { color: C.seq }, calculable: false, orient: 'horizontal', left: 10, bottom: 6, itemWidth: 10, itemHeight: 160,
      text: [met.f(vals.length ? Math.max(...vals) : 0), met.f(vals.length ? Math.min(...vals) : 0)], textStyle: { color: C.ink2, fontSize: 11 } },
    series: [{ type: 'map', map: 'es-' + nivel, roam: false, aspectScale: 0.82, layoutCenter: ['50%', '48%'], layoutSize: '98%',
      selectedMode: nivel === 'ccaa' ? 'single' : false,
      itemStyle: { areaColor: C.nodata, borderColor: C.surface, borderWidth: 1 },
      emphasis: { label: { show: false }, itemStyle: { areaColor: C.s[1], borderColor: C.surface } },
      select: { label: { show: false }, itemStyle: { areaColor: C.s[1], borderColor: C.ink, borderWidth: 2 } },
      label: { show: false }, data: serie }],
  }), true);
  g.off('click');
  g.on('click', p => { if (nivel === 'ccaa' && p.data && p.data.d) alternar('ccaa', p.data.d.nombre); });
  tabla('cMapa', [nivel === 'ccaa' ? 'Comunidad' : 'Provincia', 'Ofertas', 'Salario mediano', '% teletrabajo'],
    datos.sort((a, b) => (b.n ?? 0) - (a.n ?? 0)).map(d => [d.nombre, d.nTxt, fmtE(d.sal), fmtP(d.tele)]));
  pintarRankingGeo(datos, met, nivel);
}
function nFiltroSin(dim) { const s = S[dim]; S[dim] = '*'; const t = nFiltro(); S[dim] = s; return t; }
function pintarRankingGeo(datos, met, nivel) {
  const filas = datos.filter(d => met.v(d) != null).sort((a, b) => met.v(b) - met.v(a)).slice(0, nivel === 'ccaa' ? 19 : 20);
  $('#tRankGeo').textContent = nivel === 'ccaa' ? 'Comunidades' : 'Las 20 primeras provincias';
  $('#dRankGeo').textContent = met.t;
  if (!filas.length) { vacio('gRankGeo', 'Sin datos suficientes'); return; }
  const hay = S.ccaa !== '*' && nivel === 'ccaa';
  const g = graf('gRankGeo');
  g.setOption(base({
    grid: { left: 8, right: 64, top: 4, bottom: 4, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => tipFila(C.s[0], met.f(p.value), p.name) }),
    xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: filas.map(d => d.nombre), axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 16, data: filas.map(d => ({ value: met.v(d),
      itemStyle: { color: C.s[0], opacity: hay && d.nombre !== S.ccaa ? 0.35 : 1, ...BARRA([0, 4, 4, 0]) } })),
    label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => met.f(p.value) } }],
  }), true);
  g.off('click');
  g.on('click', p => { if (nivel === 'ccaa') alternar('ccaa', p.name); });
  tabla('cRankGeo', [nivel === 'ccaa' ? 'Comunidad' : 'Provincia', met.t], filas.map(d => [d.nombre, met.f(met.v(d))]));
}

// ---------------------------------------------------------------------------
// 02 Evolución
// ---------------------------------------------------------------------------
function pintarEvolucion() {
  let titulo = 'Ofertas únicas por mes', valor = e => num(e.ofertas);
  if (S.ccaa !== '*') { titulo = `Ofertas en ${S.ccaa}`; valor = e => num((e.ccaa || {})[S.ccaa]); }
  else if (S.area !== '*') { titulo = `Ofertas de ${S.area}`; valor = e => num((e.areas || {})[S.area]); }
  $('#tEvo').textContent = titulo;
  $('#dEvo').textContent = 'Noviembre: solo las que cuentan (sin exclusiones R0-R6). Filtros de comunidad o área; el resto no aplica.';
  const g = graf('gEvo');
  g.setOption(base({
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: C.surface2, opacity: .6 } },
      formatter: ps => { const e = EVOL[ps[0].dataIndex];
        return `<div style="font-weight:600">${nombreMes(e.mes)}</div>` + tipFila(C.s[0], fmt(ps[0].value), 'ofertas') +
          (e.aviso ? `<div style="max-width:240px;white-space:normal;color:${C.muted};font-size:12px;margin-top:4px">${esc(e.aviso)}</div>` : ''); } }),
    xAxis: ejeCat({ data: EVOL.map(e => mesCorto(e.mes)) }), yAxis: ejeVal(),
    series: [{ type: 'bar', barMaxWidth: 24, data: EVOL.map(e => ({ value: valor(e),
      itemStyle: { color: C.s[0], opacity: e.mes === S.mes ? 1 : 0.45, ...BARRA([4, 4, 0, 0]) } })),
    label: { show: true, position: 'top', color: C.ink2, fontSize: 11, formatter: p => p.value == null ? '' : ejeNum(p.value) } }],
  }), true);
  g.off('click'); g.on('click', p => cambiarMes(EVOL[p.dataIndex].mes));
  tabla('cEvo', ['Mes', 'Ofertas'], EVOL.map(e => [nombreMes(e.mes), fmt(valor(e))]));

  const ind = UI.evoInd;
  const nombres = { pct_teletrabajo: '% en teletrabajo', pct_indefinido: '% indefinidos (de los que dicen contrato)',
    salario_mediano: 'Salario mediano (€)', pct_con_salario: '% que publica salario' };
  const f = ind === 'salario_mediano' ? fmtE : fmtP;
  const g2 = graf('gEvoInd');
  g2.setOption(base({
    grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: C.axis } },
      formatter: ps => `<div style="font-weight:600">${nombreMes(EVOL[ps[0].dataIndex].mes)}</div>` + tipFila(C.s[6], f(ps[0].value), nombres[ind]) }),
    xAxis: ejeCat({ data: EVOL.map(e => mesCorto(e.mes)), boundaryGap: true }),
    yAxis: ejeVal({ scale: ind === 'salario_mediano', axisLabel: { color: C.muted, fontSize: 11, formatter: v => ind === 'salario_mediano' ? ejeNum(v) : v + ' %' } }),
    series: [{ type: 'line', data: EVOL.map(e => e[ind]), connectNulls: false, symbol: 'circle', symbolSize: 10,
      lineStyle: { width: 2, color: C.s[6] }, itemStyle: { color: C.s[6], borderColor: C.surface, borderWidth: 2 },
      areaStyle: { color: C.s[6], opacity: 0.08 },
      label: { show: true, position: 'top', color: C.ink2, fontSize: 11, formatter: p => p.value == null ? '' : f(p.value) } }],
  }), true);
  tabla('cEvoInd', ['Mes', nombres[ind]], EVOL.map(e => [nombreMes(e.mes), f(e[ind])]));
}

// ---------------------------------------------------------------------------
// 03 Embudo y exclusiones
// ---------------------------------------------------------------------------
function pintarEmbudo() {
  const e = D.embudo;
  if (!e) { vacio('gEmbudo', 'Este mes no tiene log del procesamiento'); vacio('gExcl', 'Sin datos'); $('#dEmbudo').textContent = ''; return; }
  const pasos = [];
  pasos.push(['Filas recogidas', e.filas_unido]);
  if (num(e.fuera_sin_contrato)) pasos.push([e.sin_contrato_y_antiguas ? 'Con contrato y recientes' : 'Con contrato laboral', e.filas_dedup ?? e.filas_unido - e.fuera_sin_contrato]);
  const dedup = (e.filas_dedup ?? e.filas_unido) - e.repetidas;
  pasos.push(['Ofertas distintas', dedup]);
  let x = dedup;
  if (num(e.antiguas)) { x -= e.antiguas; pasos.push(['De los últimos 60 días', x]); }
  if (num(e.antiguas_texto)) { x -= e.antiguas_texto; pasos.push(['Sin las de otras fechas (texto)', x]); }
  if (x !== e.finales) pasos.push(['Ofertas finales', e.finales]);
  else pasos[pasos.length - 1][0] = 'Ofertas finales';
  if (num(e.cuentan) && e.cuentan !== e.finales) pasos.push(['Cuentan (sin R0-R6)', e.cuentan]);
  $('#dEmbudo').textContent = `${nombreMes(S.mes)} · procesado el ${D.fecha_proceso ? D.fecha_proceso.slice(0, 10).split('-').reverse().join('-') : '—'}`;
  const g = graf('gEmbudo'); const max = pasos[0][1];
  g.setOption(base({
    grid: { left: 8, right: 120, top: 6, bottom: 6, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => {
      const i = p.dataIndex, prev = i ? pasos[i - 1][1] : null;
      return `<div style="font-weight:600">${esc(pasos[i][0])}</div>` + tipFila(C.s[0], NF.format(p.value), `(${NF1.format(100 * p.value / max)} % de lo recogido)`) +
        (prev ? `<div style="color:${C.muted}">−${NF.format(prev - p.value)} frente al paso anterior</div>` : ''); } }),
    xAxis: ejeVal({ show: false, max }), yAxis: ejeCat({ inverse: true, data: pasos.map(p => p[0]), axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 24, data: pasos.map((p, i) => ({ value: p[1],
      itemStyle: { color: rampa(pasos.length)[i], ...BARRA([0, 4, 4, 0]) } })),
    label: { show: true, position: 'right', color: C.ink2, fontSize: 12,
      formatter: p => NF.format(p.value) + (p.dataIndex ? `  (${NF1.format(100 * p.value / max)} %)` : '') } }],
  }), true);
  tabla('cEmbudo', ['Paso', 'Cifra', '% de lo recogido'], pasos.map(p => [p[0], NF.format(p[1]), NF1.format(100 * p[1] / max) + ' %']));
  const ex = Object.entries(e.exclusiones || {});
  if (!ex.length) { vacio('gExcl', 'Este mes se procesó sin las exclusiones R0-R6'); tabla('cExcl', ['Regla', 'Ofertas'], []); return; }
  const g2 = graf('gExcl');
  ex.sort((a, b) => (num(b[1]) || 0) - (num(a[1]) || 0));
  g2.setOption(base({
    grid: { left: 24, right: 56, top: 6, bottom: 6, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => tipFila(C.s[1], fmt(ex[p.dataIndex][1]), ex[p.dataIndex][0]) }),
    xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: ex.map(x => x[0]), axisLine: { show: false },
      axisLabel: { color: C.ink2, fontSize: 12, width: 180, overflow: 'truncate' } }),
    series: [{ type: 'bar', barMaxWidth: 18, data: ex.map(x => ({ value: num(x[1]) || 0, itemStyle: { color: C.s[1], ...BARRA([0, 4, 4, 0]) } })),
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => fmt(ex[p.dataIndex][1]) } }],
  }), true);
  tabla('cExcl', ['Regla', 'Ofertas'], ex.map(x => [x[0], fmt(x[1])]));
}

// ---------------------------------------------------------------------------
// 04 Portales, solapamiento, combinaciones
// ---------------------------------------------------------------------------
function pintarPortales() {
  const P = (D.portales || []).filter(p => p.portal !== 'Sin portal');
  const conGrupos = P.some(p => p.ofertas != null);
  $('#dPortales').textContent = conGrupos ? `${nombreMes(S.mes)} · todo el mes (no depende de los filtros). (A) = agregador.`
    : 'Este mes no tiene tabla de grupos: solo se sabe el portal de la copia que se queda.';
  const vista = conGrupos ? UI.portalesVista : 'gana';
  const nom = p => p.portal + (p.agregador ? ' (A)' : '');
  let filas, series, leyenda = null;
  const g = graf('gPortales');
  if (vista === 'ofertas') {
    filas = P.filter(p => num(p.ofertas)).sort((a, b) => b.ofertas - a.ofertas).slice(0, 30);
    const uni = p => num(p.unicas) || 0;
    series = [
      { name: 'Solo en este portal', type: 'bar', stack: 'x', barMaxWidth: 16, data: filas.map(p => ({ value: uni(p), itemStyle: { color: C.s[0], opacity: op(p) } })) },
      { name: 'También en otros', type: 'bar', stack: 'x', barMaxWidth: 16, data: filas.map(p => ({ value: p.ofertas - uni(p), itemStyle: { color: C.s[2], opacity: op(p), ...BARRA([0, 4, 4, 0]) } })),
        label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: q => ejeNum(filas[q.dataIndex].ofertas) } },
    ];
    leyenda = ['Solo en este portal', 'También en otros'];
  } else if (vista === 'filas') {
    filas = P.filter(p => num(p.ofertas)).sort((a, b) => (num(b.crudas ?? b.filas) || 0) - (num(a.crudas ?? a.filas) || 0)).slice(0, 30);
    series = [
      { name: 'Filas recogidas', type: 'bar', barMaxWidth: 10, barGap: '20%', data: filas.map(p => ({ value: num(p.crudas ?? p.filas) || 0, itemStyle: { color: C.s[6], opacity: op(p), ...BARRA([0, 4, 4, 0]) } })) },
      { name: 'Ofertas en las que aparece', type: 'bar', barMaxWidth: 10, data: filas.map(p => ({ value: p.ofertas, itemStyle: { color: C.s[0], opacity: op(p), ...BARRA([0, 4, 4, 0]) } })) },
    ];
    leyenda = ['Filas recogidas', 'Ofertas en las que aparece'];
  } else if (vista === 'pct') {
    filas = P.filter(p => num(p.ofertas) >= 100).map(p => Object.assign({}, p, { pu: pctDe(num(p.unicas) || 0, p.ofertas) }))
      .sort((a, b) => b.pu - a.pu).slice(0, 30);
    series = [{ name: '% solo aquí', type: 'bar', barMaxWidth: 16, data: filas.map(p => ({ value: p.pu, itemStyle: { color: C.s[0], opacity: op(p), ...BARRA([0, 4, 4, 0]) } })),
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: q => fmtP(q.value) } }];
  } else {
    filas = P.filter(p => num(p.gana)).sort((a, b) => b.gana - a.gana).slice(0, 30);
    series = [{ name: 'Ofertas (copia que se queda)', type: 'bar', barMaxWidth: 16, data: filas.map(p => ({ value: p.gana, itemStyle: { color: C.s[0], opacity: op(p), ...BARRA([0, 4, 4, 0]) } })),
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: q => ejeNum(q.value) } }];
  }
  function op(p) { return S.portal !== '*' && p.portal !== S.portal ? 0.35 : 1; }
  g.setOption(base({
    legend: leyenda ? { data: leyenda, top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: C.ink2 } } : undefined,
    grid: { left: 8, right: 56, top: leyenda ? 30 : 4, bottom: 4, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: C.surface2, opacity: .5 } },
      formatter: ps => { const p = filas[ps[0].dataIndex];
        return `<div style="font-weight:600">${esc(nom(p))}</div>` +
          (p.crudas != null || p.filas != null ? tipFila(C.s[6], fmt(p.crudas ?? p.filas), 'filas recogidas') : '') +
          (p.ofertas != null ? tipFila(C.s[0], fmt(p.ofertas), 'ofertas en las que aparece') : '') +
          (p.unicas != null ? tipFila(C.s[0], fmt(p.unicas), 'solo en este portal') : '') +
          tipFila(C.s[2], fmt(p.gana), 'veces que su copia es la que se queda'); } }),
    xAxis: ejeVal({ axisLabel: { color: C.muted, fontSize: 11, formatter: v => vista === 'pct' ? v + ' %' : ejeNum(v) } }),
    yAxis: ejeCat({ inverse: true, data: filas.map(nom), axisLine: { show: false } }),
    series,
  }), true);
  g.off('click');
  g.on('click', p => { const x = filas[p.dataIndex]; if (D.cortes['p=' + x.portal]) alternar('portal', x.portal); });
  tabla('cPortales', ['Portal', 'Filas recogidas', 'Ofertas en las que aparece', 'Solo aquí', 'Copia que se queda'],
    [...P].sort((a, b) => (num(b.ofertas ?? b.gana) || 0) - (num(a.ofertas ?? a.gana) || 0))
      .map(p => [nom(p), fmt(p.crudas ?? p.filas), fmt(p.ofertas), fmt(p.unicas), fmt(p.gana)]));
  pintarNPortales(); pintarSolape(); pintarUpset();
}
function pintarNPortales() {
  const s = D.solapamiento;
  if (!s) { vacio('gNPort', 'Este mes no tiene tabla de grupos'); $('#mkPortales').textContent = ''; return; }
  const ks = Object.keys(s.n_portales); const vals = ks.map(k => num(s.n_portales[k]) || 0); const tot = vals.reduce((a, b) => a + b, 0);
  const g = graf('gNPort');
  g.setOption(base({
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => tipFila(C.s[0], NF.format(p.value), `ofertas en ${ks[p.dataIndex]} portal${ks[p.dataIndex] === '1' ? '' : 'es'} (${NF1.format(100 * p.value / tot)} %)`) }),
    xAxis: ejeCat({ data: ks.map(k => k + (k === '1' ? ' portal' : '')) }), yAxis: ejeVal(),
    series: [{ type: 'bar', barMaxWidth: 24, data: vals.map((v, i) => ({ value: v, itemStyle: { color: rampa(ks.length)[i], ...BARRA([4, 4, 0, 0]) } })),
      label: { show: true, position: 'top', color: C.ink2, fontSize: 11, formatter: p => NF1.format(100 * p.value / tot) + ' %' } }],
  }), true);
  tabla('cNPort', ['Portales', 'Ofertas', '%'], ks.map((k, i) => [k, fmt(s.n_portales[k]), NF1.format(100 * vals[i] / tot) + ' %']));
  const caja = $('#mkPortales'); caja.textContent = '';
  [['En un solo portal', fmtP(100 * vals[0] / tot)], ['En 2 o más', fmtP(100 * (tot - vals[0]) / tot)],
    ['Grupos de duplicados', fmt(D.embudo && D.embudo.grupos)]].forEach(([l, v]) => {
    const d = el('div', { class: 'mk' }); d.append(el('div', { class: 'lbl' }, l), el('div', { class: 'val' }, v)); caja.appendChild(d);
  });
}
function pintarSolape() {
  const s = D.solapamiento;
  if (!s) { vacio('gSolap', 'Este mes no tiene tabla de grupos'); return; }
  const P = s.portales, M = s.matriz, pct = UI.solapModo === 'pct';
  const datos = [];
  P.forEach((a, i) => P.forEach((b, j) => {
    if (i === j) return;
    const v = num(M[i][j]);
    const val = v == null ? null : (pct ? 100 * v / num(M[i][i]) : v);
    datos.push([j, i, val == null ? '-' : +val.toFixed(1), M[i][j]]);
  }));
  const vals = datos.map(d => d[2]).filter(v => v !== '-');
  const maxV = vals.length ? Math.max(...vals) : 1;
  const conEtq = datos.map(d => ({ value: d, label: { color: d[2] !== '-' && colorSeq(d[2] / maxV) ? tintaSobre(colorSeq(d[2] / maxV)) : C.ink } }));
  const g = graf('gSolap');
  const movil = innerWidth < 700;
  g.setOption(base({
    grid: { left: 8, right: 16, top: 8, bottom: 60, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => {
      const [j, i, , n] = p.data.value; return `<div style="font-weight:600">${esc(P[i])} y ${esc(P[j])}</div>` +
        tipFila(C.s[0], fmt(n), 'ofertas en los dos') + tipFila(C.s[0], fmtP(pctDe(n, M[i][i])), `de las de ${P[i]}`) +
        tipFila(C.s[0], fmtP(pctDe(n, M[j][j])), `de las de ${P[j]}`); } }),
    xAxis: ejeCat({ data: P, position: 'bottom', axisLabel: { color: C.ink2, fontSize: movil ? 10 : 11, rotate: movil ? 90 : 45, interval: 0 }, splitArea: { show: false } }),
    yAxis: ejeCat({ data: P, inverse: true, axisLabel: { color: C.ink2, fontSize: 11, interval: 0 } }),
    visualMap: { min: 0, max: vals.length ? Math.max(...vals) : 1, inRange: { color: C.seq }, show: true, orient: 'horizontal',
      right: 10, bottom: 0, itemWidth: 10, itemHeight: 140, calculable: false, textStyle: { color: C.ink2, fontSize: 11 },
      formatter: v => pct ? Math.round(v) + ' %' : ejeNum(Math.round(v)) },
    series: [{ type: 'heatmap', data: conEtq, itemStyle: { borderColor: C.surface, borderWidth: 2, borderRadius: 3 },
      label: { show: !movil, fontSize: 10, formatter: p => p.data.value[2] === '-' ? '' : (pct ? Math.round(p.data.value[2]) : ejeNum(p.data.value[2])) },
      emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1 } } }],
  }), true);
  tabla('cSolap', ['Portal', ...P], P.map((a, i) => [a, ...P.map((b, j) => i === j ? fmt(M[i][i]) : (pct ? fmtP(pctDe(M[i][j], M[i][i])) : fmt(M[i][j])))]));
}
function pintarUpset() {
  const s = D.solapamiento;
  if (!s || !s.combinaciones.length) { vacio('gUpset', 'Este mes no tiene tabla de grupos'); return; }
  const combos = s.combinaciones;
  const cuenta = {}; combos.forEach(c => c.portales.forEach(p => { cuenta[p] = (cuenta[p] || 0) + 1; }));
  const ports = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  const puntos = [];
  combos.forEach((c, i) => ports.forEach((p, j) => puntos.push({ value: [i, j], dentro: c.portales.includes(p) })));
  const g = graf('gUpset');
  g.setOption(base({
    grid: [{ left: 120, right: 16, top: 16, height: '48%' }, { left: 120, right: 16, top: '60%', bottom: 8 }],
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const c = combos[p.dataIndex ?? p.value[0]] || combos[p.value[0]];
      return `<div style="font-weight:600;max-width:260px;white-space:normal">${c.portales.map(esc).join(' + ')}</div>` + tipFila(C.s[0], fmt(c.n), 'ofertas'); } }),
    xAxis: [ejeCat({ gridIndex: 0, data: combos.map((_, i) => i), axisLabel: { show: false }, axisLine: { show: false } }),
      ejeCat({ gridIndex: 1, data: combos.map((_, i) => i), axisLabel: { show: false }, axisLine: { show: false } })],
    yAxis: [ejeVal({ gridIndex: 0 }), ejeCat({ gridIndex: 1, data: ports, inverse: true, axisLine: { show: false },
      axisLabel: { color: C.ink2, fontSize: 11, interval: 0 } })],
    series: [
      { type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: 22, data: combos.map(c => ({ value: num(c.n) || 0, itemStyle: { color: C.s[0], ...BARRA([4, 4, 0, 0]) } })),
        label: { show: innerWidth > 700, position: 'top', color: C.ink2, fontSize: 10, formatter: p => ejeNum(p.value) } },
      { type: 'custom', xAxisIndex: 1, yAxisIndex: 1, silent: true, data: combos.map((c, i) => [i, ...c.portales.map(p => ports.indexOf(p))]),
        renderItem: (params, api) => {
          const ys = params.dataIndex !== undefined ? combos[params.dataIndex].portales.map(p => ports.indexOf(p)) : [];
          if (ys.length < 2) return null;
          const a = api.coord([params.dataIndex, Math.min(...ys)]), b = api.coord([params.dataIndex, Math.max(...ys)]);
          return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: C.s[0], lineWidth: 2 } };
        } },
      { type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, symbolSize: 11, data: puntos.map(p => ({ value: p.value,
        itemStyle: { color: p.dentro ? C.s[0] : C.nodata, borderColor: C.surface, borderWidth: 2 } })), z: 3,
        tooltip: { formatter: p => { const c = combos[p.value[0]]; return `<div style="font-weight:600;max-width:260px;white-space:normal">${c.portales.map(esc).join(' + ')}</div>` + tipFila(C.s[0], fmt(c.n), 'ofertas'); } } },
    ],
  }), true);
  tabla('cUpset', ['Portales', 'Ofertas'], combos.map(c => [c.portales.join(' + '), fmt(c.n)]));
}

// ---------------------------------------------------------------------------
// 05 Agregadores
// ---------------------------------------------------------------------------
function pintarAgregadores() {
  const A = D.agregadores;
  if (!A) { vacio('gAgrComp', 'Este mes no tiene tabla de grupos'); vacio('gAgr', 'Sin datos'); $('#agrTabs').textContent = ''; $('#mkAgr').textContent = ''; return; }
  const nombres = Object.keys(A).sort((a, b) => (A[b].filas_por_oferta || 0) - (A[a].filas_por_oferta || 0));
  const g = graf('gAgrComp');
  g.setOption(base({
    grid: { left: 8, right: 48, top: 4, bottom: 4, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const a = A[nombres[p.dataIndex]];
      return `<div style="font-weight:600">${esc(nombres[p.dataIndex])}</div>` + tipFila(C.s[1], NF1.format(a.filas_por_oferta), 'filas por oferta') +
        tipFila(C.s[1], fmt(a.filas), 'filas') + tipFila(C.s[1], fmt(a.ofertas), 'ofertas') +
        tipFila(C.s[1], fmtP(pctDe(a.con_directo, a.ofertas)), 'también en un portal directo'); } }),
    xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: nombres, axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 18, data: nombres.map(n => ({ value: A[n].filas_por_oferta,
      itemStyle: { color: C.s[1], opacity: UI.agr && UI.agr !== n ? 0.4 : 1, ...BARRA([0, 4, 4, 0]) } })),
    label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => NF1.format(p.value) } }],
  }), true);
  g.off('click'); g.on('click', p => { UI.agr = nombres[p.dataIndex]; pintarAgregadores(); });
  tabla('cAgrComp', ['Agregador', 'Filas', 'Ofertas', 'Filas por oferta', '% con portal directo', '% con otro agregador'],
    nombres.map(n => { const a = A[n]; return [n, fmt(a.filas), fmt(a.ofertas), NF1.format(a.filas_por_oferta),
      fmtP(pctDe(a.con_directo, a.ofertas)), fmtP(pctDe(a.con_otro_agregador, a.ofertas))]; }));

  if (!UI.agr || !A[UI.agr]) UI.agr = nombres.includes('Talent') ? 'Talent' : nombres[0];
  const tabs = $('#agrTabs'); tabs.textContent = '';
  Object.keys(A).sort().forEach(n => {
    const b = el('button', { type: 'button', 'aria-pressed': String(n === UI.agr) }, n);
    b.addEventListener('click', () => { UI.agr = n; pintarAgregadores(); });
    tabs.appendChild(b);
  });
  const a = A[UI.agr];
  $('#tAgr').textContent = `${UI.agr}: de dónde vienen sus ofertas`;
  const mk = $('#mkAgr'); mk.textContent = '';
  [['Filas recogidas', fmt(a.filas)], ['Ofertas únicas', fmt(a.ofertas)], ['Filas por oferta', NF1.format(a.filas_por_oferta)],
    ['También en portal directo', fmtP(pctDe(a.con_directo, a.ofertas))], ['En otro agregador', fmtP(pctDe(a.con_otro_agregador, a.ofertas))]]
    .forEach(([l, v]) => { const d = el('div', { class: 'mk' }); d.append(el('div', { class: 'lbl' }, l), el('div', { class: 'val' }, v)); mk.appendChild(d); });
  const campos = [['origen_dominio', 'Web de origen'], ['proveedor', 'Proveedor o feed'], ['origen_tipo', 'Tipo de origen']].filter(([c]) => a[c]);
  if (!campos.length) { $('#dAgr').textContent = 'Este mes no guarda el origen de las ofertas de los agregadores.'; vacio('gAgr', 'Sin origen guardado este mes'); tabla('cAgr', ['Origen', 'Filas'], []); return; }
  if (!campos.find(c => c[0] === UI.agrCampo)) UI.agrCampo = campos[0][0];
  const campo = UI.agrCampo, et = campos.find(c => c[0] === campo)[1];
  $$('#cAgr .seg-campo').forEach(x => x.remove());
  const tb = el('div', { class: 'seg seg-campo', style: 'margin:12px 0 4px' });
  campos.forEach(([c, t]) => { const b = el('button', { type: 'button', 'aria-pressed': String(c === campo) }, t);
    b.addEventListener('click', () => { UI.agrCampo = c; pintarAgregadores(); }); tb.appendChild(b); });
  $('#gAgr').before(tb);
  $('#dAgr').textContent = `${et}, en % de sus filas recogidas en ${nombreMes(S.mes)} (antes de deduplicar).`;
  const ent = Object.entries(a[campo]); const tot = ent.reduce((s, [, v]) => s + (num(v) || 0), 0);
  const g2 = graf('gAgr');
  g2.setOption(base({
    grid: { left: 8, right: 56, top: 8, bottom: 4, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => tipFila(C.s[1], fmt(ent[p.dataIndex][1]), `filas de ${ent[p.dataIndex][0]}`) }),
    xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: ent.map(e => e[0]), axisLine: { show: false },
      axisLabel: { color: C.ink2, fontSize: 12, width: 190, overflow: 'truncate' } }),
    series: [{ type: 'bar', barMaxWidth: 18, data: ent.map(([k, v]) => ({ value: 100 * (num(v) || 0) / tot,
      itemStyle: { color: k === 'Otros' || k === '(sin dato)' ? C.nodata : C.s[1], ...BARRA([0, 4, 4, 0]) } })),
    label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => fmtP(p.value) } }],
  }), true);
  tabla('cAgr', [et, 'Filas', '%'], ent.map(([k, v]) => [k, fmt(v), fmtP(100 * (num(v) || 0) / tot)]));
}

// ---------------------------------------------------------------------------
// 06 Condiciones: barras segmentadas y áreas
// ---------------------------------------------------------------------------
const COLOR_CAT = {
  contrato: { 'Indefinido': 0, 'Temporal': 1, 'Fijo discontinuo': 2, 'Prácticas/Formación': 3, 'Otro': 4 },
  jornada: { 'Completa': 0, 'Parcial': 1, 'Otra': 2 },
  modalidad: { 'Presencial': 0, 'Híbrido': 1, 'Teletrabajo': 2 },
  tipo: { 'directo': 0, 'agregador': 1 },
};
function segmentada(caja, titulo, dist, colores, etiqueta = k => k) {
  const ent = Object.entries(dist || {}).filter(([k]) => k !== 'Sin dato');
  const sinDato = num((dist || {})['Sin dato']) || 0;
  const tot = ent.reduce((a, [, v]) => a + (num(v) || 0), 0);
  const fila = el('div', { class: 'seg-fila' });
  const tit = el('div', { class: 'seg-tit' });
  tit.append(el('b', {}, titulo), el('span', {}, sinDato ? `sin dato: ${fmtP(100 * sinDato / (tot + sinDato))}` : ''));
  fila.appendChild(tit);
  const bar = el('div', { class: 'seg-bar', role: 'img', 'aria-label': titulo + ': ' + ent.map(([k, v]) => `${etiqueta(k)} ${fmtP(pctDe(num(v) || 0, tot))}`).join(', ') });
  ent.forEach(([k, v], i) => {
    const n = num(v) || 0; if (!n) return;
    const color = colores(k, i); const pc = 100 * n / tot;
    const p = el('div', { class: 'p', tabindex: '0', style: `flex-grow:${pc};background:${color};color:${tintaSobre(color)}` });
    if (pc >= 9) p.textContent = NF.format(Math.round(pc)) + ' %';
    const info = `<b>${fmtP(pc)}</b> ${esc(etiqueta(k))}<br><span style="color:${C.muted}">${fmt(v)} ofertas</span>`;
    p.addEventListener('pointermove', ev => tip(info, ev.clientX, ev.clientY));
    p.addEventListener('pointerleave', () => tip());
    p.addEventListener('focus', () => { const r = p.getBoundingClientRect(); tip(info, r.left + r.width / 2, r.top); });
    p.addEventListener('blur', () => tip());
    bar.appendChild(p);
  });
  fila.appendChild(bar);
  const ley = el('div', { class: 'leyenda' });
  ent.forEach(([k, v], i) => { if (!num(v)) return; const s = el('span'); const ic = el('i'); ic.style.background = colores(k, i); s.append(ic, etiqueta(k)); ley.appendChild(s); });
  fila.appendChild(ley);
  caja.appendChild(fila);
  return ent.map(([k, v]) => [titulo, etiqueta(k), fmt(v), fmtP(pctDe(num(v) || 0, tot))]);
}
function tip(html, x, y) {
  const t = $('#tip');
  if (!html) { t.style.opacity = 0; return; }
  t.innerHTML = html; t.style.opacity = 1;
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.min(innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
  t.style.top = Math.max(8, y - h - 12) + 'px';
}
function pintarCondiciones() {
  const c = corte();
  const s1 = $('#segs1'), s2 = $('#segs2'); s1.textContent = ''; s2.textContent = '';
  $('#dSegs').textContent = `${nombreMes(S.mes)} · ${nFiltro()} · ${fmt(c && c.n)} ofertas`;
  if (!c || !c.contrato) { s1.appendChild(el('div', { class: 'vacio' }, 'Menos de 10 ofertas con este filtro')); tabla('cSegs', ['Variable', 'Valor', 'Ofertas', '%'], []); return; }
  const cat = v => (k, i) => C.s[COLOR_CAT[v][k] ?? i];
  let filas = [];
  filas = filas.concat(segmentada(s1, 'Contrato', c.contrato, cat('contrato')));
  filas = filas.concat(segmentada(s1, 'Jornada', c.jornada, cat('jornada')));
  filas = filas.concat(segmentada(s1, 'Modalidad', c.modalidad, cat('modalidad')));
  if (c.tipo && (num(c.tipo.directo) || 0) + (num(c.tipo.agregador) || 0) > 0 && D.solapamiento)
    filas = filas.concat(segmentada(s1, 'Tipo de oferta', c.tipo, cat('tipo'), k => NOMBRE_TIPO[k]));
  tabla('cSegs', ['Variable', 'Valor', 'Ofertas', '% de las que lo dicen'], filas);
  let f2 = [];
  const ord = dist => { const n = Object.keys(dist).filter(k => k !== 'Sin dato').length; const r = rampa(n); return (k, i) => r[i]; };
  f2 = f2.concat(segmentada(s2, 'Experiencia', c.experiencia, ord(c.experiencia)));
  f2 = f2.concat(segmentada(s2, 'Estudios', c.estudios, ord(c.estudios)));
  tabla('cSegs2', ['Variable', 'Valor', 'Ofertas', '% de las que lo dicen'], f2);
  pintarAreas();
}
function pintarAreas() {
  const c = corte('area');
  const met = UI.areaMetrica;
  if (!c || !c.areas) { vacio('gAreas', 'Sin datos de áreas para este filtro'); return; }
  const val = v => { const [n, ind, conC, tel, hib, conM, sal] = v;
    return { n: num(n), indef: pctDe(ind, conC), tele: pctDe(tel, conM), hib: pctDe(hib, conM), sal: sal ?? null,
      conC: num(conC), conM: num(conM) }; };
  const nombres = { n: 'Ofertas', indef: '% indefinidos (de las que dicen contrato)', tele: '% teletrabajo (de las que dicen modalidad)',
    hib: '% híbrido (de las que dicen modalidad)', sal: 'Salario mediano' };
  const f = met === 'sal' ? fmtE : (met === 'n' ? fmt : fmtP);
  const minimo = met === 'n' ? 0 : 30;
  const filas = Object.entries(c.areas).map(([a, v]) => Object.assign({ area: a }, val(v)))
    .filter(x => x[met] != null && (met === 'n' || met === 'sal' || (met === 'indef' ? x.conC >= minimo : x.conM >= minimo)))
    .sort((a, b) => b[met] - a[met]);
  const g = graf('gAreas');
  g.setOption(base({
    grid: { left: 20, right: 72, top: 4, bottom: 4, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const x = filas[p.dataIndex];
      return `<div style="font-weight:600">${esc(x.area)}</div>` + tipFila(C.s[0], fmt(x.n), 'ofertas') + tipFila(C.s[0], fmtP(x.indef), 'indefinidos') +
        tipFila(C.s[0], fmtP(x.tele), 'teletrabajo') + tipFila(C.s[0], fmtP(x.hib), 'híbrido') + tipFila(C.s[0], fmtE(x.sal), 'salario mediano'); } }),
    xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: filas.map(x => x.area), axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 18, data: filas.map(x => ({ value: x[met],
      itemStyle: { color: x.area === AREA_OTROS ? C.nodata : C.s[0], opacity: S.area !== '*' && x.area !== S.area ? 0.35 : 1, ...BARRA([0, 4, 4, 0]) } })),
    label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => f(p.value) } }],
  }), true);
  g.off('click'); g.on('click', p => alternar('area', filas[p.dataIndex].area));
  tabla('cAreas', ['Área', 'Ofertas', '% indefinidos', '% teletrabajo', '% híbrido', 'Salario mediano'],
    Object.entries(c.areas).map(([a, v]) => { const x = val(v); return [a, fmt(v[0]), fmtP(x.indef), fmtP(x.tele), fmtP(x.hib), fmtE(x.sal)]; }));
}
const AREA_OTROS = 'Otras / sin clasificar';

// ---------------------------------------------------------------------------
// 07 Salarios
// ---------------------------------------------------------------------------
function pintarSalarios() {
  const c = corte();
  const mk = $('#mkSal'); mk.textContent = '';
  if (!c || !c.sal) { ['gHist', 'gSalExp', 'gSalEst', 'gSalCont'].forEach(id => vacio(id, 'Menos de 10 ofertas con este filtro')); return; }
  const s = c.sal, B = D.sal_bordes;
  [['Mediana', fmtE(s.med)], ['Percentil 25', fmtE(s.p25)], ['Percentil 75', fmtE(s.p75)], ['Publican salario', fmtP(pctDe(s.n, c.n))]]
    .forEach(([l, v]) => { const d = el('div', { class: 'mk' }); d.append(el('div', { class: 'lbl' }, l), el('div', { class: 'val' }, v)); mk.appendChild(d); });
  $('#dHist').textContent = `${nombreMes(S.mes)} · ${nFiltro()} · ${fmt(s.n)} ofertas con salario, en tramos de 2.500 €`;
  const etq = B.map((b, i) => i === B.length - 1 ? `${b / 1000}k+` : `${b / 1000}-${B[i + 1] / 1000}k`);
  const h = s.hist.map(v => num(v) || 0);
  const iMed = s.med != null ? B.findIndex((b, i) => s.med >= b && (i === B.length - 1 || s.med < B[i + 1])) : -1;
  const g = graf('gHist');
  g.setOption(base({
    grid: { left: 8, right: 12, top: 30, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: C.surface2, opacity: .6 } },
      formatter: ps => `<div style="font-weight:600">${etq[ps[0].dataIndex].replace('k', ' mil €')}</div>` + tipFila(C.s[0], fmt(s.hist[ps[0].dataIndex]), 'ofertas') }),
    xAxis: ejeCat({ data: etq, axisLabel: { color: C.muted, fontSize: 10, interval: innerWidth < 700 ? 5 : 3 } }), yAxis: ejeVal(),
    series: [{ type: 'bar', barCategoryGap: '8%', data: h.map((v, i) => ({ value: v, itemStyle: { color: C.s[0], ...BARRA([3, 3, 0, 0]) } })),
      markLine: iMed >= 0 ? { symbol: 'none', silent: true, lineStyle: { color: C.ink, width: 1, type: 'solid' },
        label: { formatter: 'Mediana ' + fmtE(s.med), color: C.ink, fontSize: 11, position: 'end' }, data: [{ xAxis: iMed }] } : undefined }],
  }), true);
  tabla('cHist', ['Tramo (€/año)', 'Ofertas'], etq.map((e, i) => [e, fmt(s.hist[i])]));

  const barras = (id, cardId, dist, orden, titulo) => {
    if (!dist) { vacio(id, 'Este cruce no está para área y comunidad a la vez: quita uno de los dos filtros'); return; }
    const ks = orden.filter(k => dist[k]);
    const g2 = graf(id);
    g2.setOption(base({
      grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => tipFila(C.s[0], fmtE(p.value), `${ks[p.dataIndex]} (${fmt(dist[ks[p.dataIndex]][1])} con salario)`) }),
      xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: ks, axisLine: { show: false } }),
      series: [{ type: 'bar', barMaxWidth: 16, data: ks.map(k => ({ value: dist[k][0], itemStyle: { color: C.s[0], ...BARRA([0, 4, 4, 0]) } })),
        label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => p.value == null ? 'pocas' : fmtE(p.value) } }],
    }), true);
    tabla(cardId, [titulo, 'Salario mediano', 'Ofertas con salario'], ks.map(k => [k, fmtE(dist[k][0]), fmt(dist[k][1])]));
  };
  barras('gSalExp', 'cSalExp', c.sal_experiencia, ['No se requiere', 'Más de 6 meses', 'Más de 2 años', 'Más de 5 años'], 'Experiencia');
  barras('gSalEst', 'cSalEst', c.sal_estudios, ['Sin estudios', 'Estudios primarios', 'Primera etapa de secundaria', 'Segunda etapa de secundaria',
    'Postsecundaria no superior', 'Educación superior FP', 'Grado y diplomatura', 'Máster y licenciatura', 'Doctorado'], 'Estudios');
  if (c.sal_contrato) {
    const mezcla = {};
    Object.entries(c.sal_contrato).forEach(([k, v]) => { mezcla[k] = v; });
    Object.entries(c.sal_jornada || {}).forEach(([k, v]) => { mezcla['Jornada ' + k.toLowerCase()] = v; });
    barras('gSalCont', 'cSalKpi', mezcla, ['Indefinido', 'Temporal', 'Fijo discontinuo', 'Prácticas/Formación', 'Jornada completa', 'Jornada parcial'], 'Contrato o jornada');
  } else vacio('gSalCont', 'Sin cruce para este filtro');
}

// ---------------------------------------------------------------------------
// 08 Lo que se pide
// ---------------------------------------------------------------------------
function rankingBarras(id, cardId, lista, color, conDelta, extraTip) {
  if (!lista || !lista.length) { vacio(id, 'Nada llega al mínimo de 50 ofertas'); tabla(cardId, ['', ''], []); return; }
  const g = graf(id);
  const delta = x => (x.ant === undefined || !conDelta) ? null : (x.ant == null ? 'nuevo' : (num(x.ant) && num(x.n) ? (100 * (x.n - x.ant) / x.ant) : null));
  g.setOption(base({
    grid: { left: 8, right: conDelta ? 120 : 60, top: 4, bottom: 4, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const x = lista[p.dataIndex], d = delta(x);
      return `<div style="font-weight:600">${esc(x.t)}</div>` + tipFila(color, fmt(x.n), 'ofertas') + (extraTip ? extraTip(x) : '') +
        (d == null ? '' : `<div style="color:${C.muted}">${d === 'nuevo' ? 'No estaba entre los primeros el mes anterior' : `Mes anterior: ${fmt(x.ant)}`}</div>`); } }),
    xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: lista.map(x => x.t), axisLine: { show: false },
      axisLabel: { color: C.ink2, fontSize: 12, width: innerWidth < 700 ? 120 : 210, overflow: 'truncate' } }),
    series: [{ type: 'bar', barMaxWidth: 16, data: lista.map(x => ({ value: num(x.n) || 0, itemStyle: { color, ...BARRA([0, 4, 4, 0]) } })),
      label: { show: true, position: 'right', fontSize: 11, color: C.ink2, formatter: p => { const d = delta(lista[p.dataIndex]);
        const v = NF.format(p.value); if (d == null) return v; if (d === 'nuevo') return `${v}  {n|nuevo}`;
        return `${v}  {${d >= 0 ? 'u' : 'd'}|${d >= 0 ? '▲' : '▼'} ${NF.format(Math.abs(Math.round(d)))} %}`; },
      rich: { u: { color: C.up, fontWeight: 600, fontSize: 11 }, d: { color: C.down, fontWeight: 600, fontSize: 11 }, n: { color: C.muted, fontSize: 11 } } } }],
  }), true);
  tabla(cardId, ['', 'Ofertas', 'Mes anterior'], lista.map(x => [x.t, fmt(x.n), x.ant === undefined ? '—' : (x.ant == null ? 'fuera del ranking' : fmt(x.ant))]));
}
function pintarPide() {
  const prev = MESES[MESES.findIndex(m => m.mes === S.mes) - 1];
  $('#dTit').textContent = `${nombreMes(S.mes)} · todo el mes` + (prev ? ` · cambio frente a ${nombreMes(prev.mes)}` : '');
  rankingBarras('gTit', 'cTit', (D.titulos || []).slice(0, 25), C.s[0], true);
  const n = num(D.kpis.ofertas);
  const idi = Object.entries(D.idiomas || {}).map(([t, v]) => ({ t, n: v })).filter(x => num(x.n));
  rankingBarras('gIdi', 'cIdi', idi, C.s[6], false, x => tipFila(C.s[6], fmtP(pctDe(x.n, n)), 'de las ofertas del mes'));
  rankingBarras('gSk', 'cSk', (D.skills || []).slice(0, 15), C.s[2], true);
}

// ---------------------------------------------------------------------------
// 09 Vida de las ofertas
// ---------------------------------------------------------------------------
function pintarVida() {
  const c = corte();
  if (!c || !c.antig) vacio('gAntig', 'Menos de 10 ofertas con este filtro');
  else {
    const ks = Object.keys(c.antig).filter(k => k !== 'Sin fecha');
    const tot = ks.reduce((a, k) => a + (num(c.antig[k]) || 0), 0);
    $('#dAntig').textContent = `${nombreMes(S.mes)} · ${nFiltro()} · días desde la publicación (la más antigua conocida) hasta que se recogió.`;
    const r = rampa(ks.length);
    const g = graf('gAntig');
    g.setOption(base({
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => tipFila(r[p.dataIndex], fmt(c.antig[ks[p.dataIndex]]), ks[p.dataIndex]) }),
      xAxis: ejeCat({ data: ks, axisLabel: { color: C.ink2, fontSize: 11, interval: 0 } }), yAxis: ejeVal(),
      series: [{ type: 'bar', barMaxWidth: 28, data: ks.map((k, i) => ({ value: num(c.antig[k]) || 0, itemStyle: { color: r[i], ...BARRA([4, 4, 0, 0]) } })),
        label: { show: true, position: 'top', color: C.ink2, fontSize: 11, formatter: p => NF1.format(100 * p.value / tot) + ' %' } }],
    }), true);
    tabla('cAntig', ['Antigüedad', 'Ofertas'], Object.entries(c.antig).map(([k, v]) => [k, fmt(v)]));
  }
  const v = D.vida;
  if (!v) { vacio('gVistas', 'Este mes no tiene histórico'); return; }
  const filas = Object.entries(v.vistas_por_portal).map(([p, [n, vi]]) => ({ p, n: num(n), vi, pc: pctDe(vi, n) }))
    .filter(x => x.pc != null).sort((a, b) => b.n - a.n).slice(0, 20).sort((a, b) => b.pc - a.pc);
  if (!filas.length || filas.every(x => !x.pc)) { vacio('gVistas', 'Es el primer mes del histórico: todas cuentan como nuevas'); return; }
  const g = graf('gVistas');
  g.setOption(base({
    grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const x = filas[p.dataIndex];
      return `<div style="font-weight:600">${esc(x.p)}</div>` + tipFila(C.s[0], fmtP(x.pc), 'ya vistas') + tipFila(C.s[0], fmt(x.vi), `de ${fmt(x.n)} ofertas`); } }),
    xAxis: ejeVal({ show: false, max: 100 }), yAxis: ejeCat({ inverse: true, data: filas.map(x => x.p), axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 14, data: filas.map(x => ({ value: x.pc, itemStyle: { color: AGREGADORES.has(x.p) ? C.s[1] : C.s[0], ...BARRA([0, 4, 4, 0]) } })),
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => fmtP(p.value) } }],
    legend: { show: false },
  }), true);
  tabla('cVistas', ['Portal', 'Ofertas', 'Ya vistas', '%'], filas.map(x => [x.p, fmt(x.n), fmt(x.vi), fmtP(x.pc)]));
}

// ---------------------------------------------------------------------------
// 10 Calidad
// ---------------------------------------------------------------------------
function pintarCalidad() {
  const q = D.calidad;
  if (!q) { vacio('gCal', 'Este mes no tiene resumen de calidad'); return; }
  const P = [...q.portales].sort((a, b) => (num(b.filas) || 0) - (num(a.filas) || 0));
  const V = q.variables;
  const alto = Math.max(360, P.length * 22 + 110);
  $('#gCal').style.height = alto + 'px';
  $('#dCal').textContent = `${nombreMes(S.mes)} · ${P.length} portales con 10 filas o más`;
  const datos = [];
  P.forEach((p, i) => V.forEach((v, j) => { const x = p.pct[j];
    datos.push({ value: [j, i, x == null ? '-' : x], label: { color: x == null ? C.ink : tintaSobre(colorSeq(x / 100)) } }); }));
  const g = graf('gCal'); g.resize();
  g.setOption(base({
    grid: { left: 8, right: 12, top: 40, bottom: 44, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const d = p.data.value; return `<div style="font-weight:600">${esc(P[d[1]].portal)}</div>` +
      tipFila(C.s[0], d[2] === '-' ? '—' : fmtP(d[2]), `con ${V[d[0]]}`) + `<div style="color:${C.muted}">${fmt(P[d[1]].filas)} filas</div>`; } }),
    xAxis: ejeCat({ data: V, position: 'top', axisLabel: { color: C.ink2, fontSize: 11, interval: 0, rotate: innerWidth < 700 ? 60 : 0 } }),
    yAxis: ejeCat({ data: P.map(p => p.portal), inverse: true, axisLabel: { color: C.ink2, fontSize: 11, interval: 0 } }),
    visualMap: { min: 0, max: 100, inRange: { color: C.seq }, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 160,
      calculable: false, text: ['100 %', '0 %'], textStyle: { color: C.ink2, fontSize: 11 } },
    series: [{ type: 'heatmap', data: datos, itemStyle: { borderColor: C.surface, borderWidth: 2, borderRadius: 3 },
      label: { show: innerWidth >= 700, fontSize: 10, formatter: p => p.data.value[2] === '-' ? '' : Math.round(p.data.value[2]) } }],
  }), true);
  tabla('cCal', ['Portal', 'Filas', ...V], P.map(p => [p.portal, fmt(p.filas), ...p.pct.map(v => v == null ? '—' : NF.format(v) + ' %')]));
}

// ---------------------------------------------------------------------------
// 11 Metodología
// ---------------------------------------------------------------------------
function pintarMetodo() {
  const cr = D.criterios;
  if (!cr) vacio('gCrit', 'Este mes no tiene tabla de grupos');
  else {
    const ent = Object.entries(cr).sort((a, b) => (num(b[1]) || 0) - (num(a[1]) || 0));
    const g = graf('gCrit');
    g.setOption(base({
      grid: { left: 24, right: 60, top: 4, bottom: 4, containLabel: true },
      tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => tipFila(C.s[6], fmt(ent[p.dataIndex][1]), ent[p.dataIndex][0]) }),
      xAxis: ejeVal({ show: false }), yAxis: ejeCat({ inverse: true, data: ent.map(e => e[0]), axisLine: { show: false },
        axisLabel: { color: C.ink2, fontSize: 11, width: innerWidth < 700 ? 130 : 220, overflow: 'truncate' } }),
      series: [{ type: 'bar', barMaxWidth: 14, data: ent.map(e => ({ value: num(e[1]) || 0, itemStyle: { color: C.s[6], ...BARRA([0, 4, 4, 0]) } })),
        label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => ejeNum(p.value) } }],
    }), true);
    tabla('cCrit', ['Criterio', 'Filas'], ent.map(e => [e[0], fmt(e[1])]));
  }
  const ul = $('#avisosLista'); ul.textContent = '';
  const items = [];
  if (D.aviso) items.push(`${nombreMes(S.mes)}: ${D.aviso}`);
  items.push('Cada mes se procesó con una versión distinta del código: las comparaciones entre meses mezclan cambios reales y de método.');
  items.push('Agosto y octubre no tienen exclusiones R0-R6; noviembre cuenta solo las ofertas que no están excluidas.');
  items.push('Solo agregados: recuentos de 1 a 9 se publican como «<10»; medianas de salario solo con 30 ofertas o más; rankings con 50 ofertas o más y el texto normalizado.');
  items.push('No se publica ninguna oferta, URL, identificador, descripción ni título literal. Los datos se generan en local y solo se suben estos JSON.');
  items.push('El área de trabajo es una clasificación aproximada por palabras clave del título y la categoría del portal (no es la CNO).');
  items.push('«Ya vistas»: misma oferta reconocida en un mes anterior por identificador o URL. Es una cota baja.');
  items.forEach(t => ul.appendChild(el('li', {}, t)));
  const pie = $('#pie'); pie.textContent = '';
  pie.append(el('div', {}, `Datos de ${nombreMes(S.mes)}: procesados el ${D.fecha_proceso ? D.fecha_proceso.slice(0, 16) : '—'}; agregados generados el ${D.generado}. ` +
    'Fuente: ofertas de empleo publicadas en portales de internet, recogidas por web scraping. Estadística experimental, en pruebas.'));
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------
function segPulsado(sel, v) { $$(sel + ' button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
function pintarTodo() {
  leerColores();
  const aviso = $('#aviso'); aviso.textContent = '';
  if (D.aviso) {
    aviso.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
    aviso.appendChild(el('div', {}, `${nombreMes(S.mes)}. ${D.aviso}`));
  }
  const tareas = [pintarKpis, pintarMapa, pintarEvolucion, pintarEmbudo, pintarPortales, pintarAgregadores, pintarCondiciones,
    pintarSalarios, pintarPide, pintarVida, pintarCalidad, pintarMetodo];
  tareas.forEach(f => { try { f(); } catch (e) { console.error(f.name, e); } });
}
function actualizar() { sincronizarFiltros(); pintarTodo(); }
async function cambiarMes(m) {
  S.mes = m; D = await cargarMes(m);
  pintarMeses(); pintarFiltros(); pintarTodo();
}
function enlazarControles() {
  $('#fCcaa').addEventListener('change', e => { S.ccaa = e.target.value; actualizar(); });
  $('#fArea').addEventListener('change', e => { S.area = e.target.value; actualizar(); });
  $('#fPortal').addEventListener('change', e => { S.portal = e.target.value; actualizar(); });
  $$('#fTipo button').forEach(b => b.addEventListener('click', () => { S.tipo = b.dataset.v; actualizar(); }));
  const seg = (sel, clave, f) => $$(sel + ' button').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return; UI[clave] = b.dataset.v; segPulsado(sel, b.dataset.v); f(); }));
  seg('#mapaNivel', 'mapaNivel', pintarMapa); seg('#mapaMetrica', 'mapaMetrica', pintarMapa);
  seg('#evoInd', 'evoInd', pintarEvolucion); seg('#portalesVista', 'portalesVista', pintarPortales);
  seg('#solapModo', 'solapModo', pintarSolape); seg('#areaMetrica', 'areaMetrica', pintarAreas);
  $('#btnTema').addEventListener('click', () => {
    const nuevo = modo() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem('panel-tema', nuevo); } catch (e) { }
    $('#txtTema').textContent = nuevo === 'dark' ? 'Oscuro' : 'Claro';
    pintarTodo();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) pintarTodo(); });
  let t;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { Object.values(CH).forEach(c => c.resize()); pintarTodo(); }, 200); });
  // aparición al hacer scroll
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } }), { threshold: 0.08 });
  $$('.revela').forEach(x => io.observe(x));
  // sección activa en la navegación
  const links = $$('#nav a');
  const io2 = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('activo', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  $$('section.sec').forEach(s => io2.observe(s));
  links.forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault(); document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
  }));
}
async function iniciar() {
  try {
    $('#txtTema').textContent = modo() === 'dark' ? 'Oscuro' : 'Claro';
    [MESES, EVOL] = await Promise.all([json('datos/meses.json'), json('datos/evolucion.json')]);
    leerHash();
    if (!MESES.find(m => m.mes === S.mes)) S.mes = MESES[MESES.length - 1].mes;
    enlazarControles();
    await cargarAtlas().catch(e => console.warn('Mapa no disponible:', e));
    await cambiarMes(S.mes);
  } catch (e) {
    console.error(e);
    $('main').prepend(el('div', { class: 'aviso' }, 'No se han podido cargar los datos del panel: ' + e.message));
  } finally {
    $('#cargando').classList.add('fuera');
  }
}
iniciar();
