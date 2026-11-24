/* Panel de ofertas: visuales añadidos (24-11-2026).
   Usa las utilidades y el estado de panel.js (se carga después). Solo lee los JSON agregados. */
'use strict';

// El corte que corresponde a los filtros actuales con algún filtro cambiado ({ area: 'X', tipo: '*' }...)
function corteCon(cambios) {
  const guard = Object.assign({}, S);
  Object.assign(S, cambios);
  let r;
  try { r = claveCorte(); } finally { Object.assign(S, guard); }
  return r.c;
}
const sinDato = k => k === 'Sin dato' || k === 'Sin fecha' || k === 'Sin ubicación';
function modal(dist) {
  const ent = Object.entries(dist || {}).filter(([k]) => !sinDato(k)).map(([k, v]) => [k, num(v) || 0]);
  const tot = ent.reduce((a, [, v]) => a + v, 0);
  if (!tot) return null;
  ent.sort((a, b) => b[1] - a[1]);
  return { k: ent[0][0], pct: 100 * ent[0][1] / tot };
}

// ---------------------------------------------------------------------------
// Embudo: diagrama de flujo (Sankey) del procesamiento del mes
// ---------------------------------------------------------------------------
function pintarSankey() {
  const e = D.embudo;
  $('#dSankey').textContent = `${nombreMes(S.mes)} · el grosor es proporcional a las filas u ofertas de cada paso`;
  if (!e || !num(e.filas_unido)) { vacio('gSankey', 'Este mes no tiene log del procesamiento'); return; }
  const base0 = e.filas_dedup ?? e.filas_unido;
  const distintas = base0 - e.repetidas;
  const nodos = [{ name: 'Filas recogidas', c: C.s[0] }], enl = [];
  if (num(e.fuera_sin_contrato)) {
    const nom = e.sin_contrato_y_antiguas ? 'Sin contrato o antiguas' : 'Sin contrato laboral';
    nodos.push({ name: nom, c: C.muted }); enl.push(['Filas recogidas', nom, e.fuera_sin_contrato]);
  }
  nodos.push({ name: 'Copias repetidas', c: C.s[1] }, { name: 'Ofertas distintas', c: C.s[0] });
  enl.push(['Filas recogidas', 'Copias repetidas', e.repetidas], ['Filas recogidas', 'Ofertas distintas', distintas]);
  let resto = distintas;
  const salida = (nombre, v, color) => { if (num(v)) { nodos.push({ name: nombre, c: color }); enl.push(['Ofertas distintas', nombre, v]); resto -= v; } };
  salida('Antiguas (más de 60 días)', e.antiguas, C.s[2]);
  salida('De otras fechas (texto)', e.antiguas_texto, C.s[4]);
  const excl = num(e.cuentan) && num(e.finales) && e.cuentan !== e.finales ? e.finales - e.cuentan : null;
  salida('Excluidas R0-R6', excl, C.s[3]);
  nodos.push({ name: num(e.cuentan) ? 'Cuentan' : 'Ofertas finales', c: RAMPA_ORD[C.m][4] || C.s[0] });
  enl.push(['Ofertas distintas', nodos[nodos.length - 1].name, resto]);
  const g = graf('gSankey');
  g.setOption(base({
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => p.dataType === 'edge'
      ? `${esc(p.data.source)} → <b>${esc(p.data.target)}</b><br>${NF.format(p.value)}` : `<b>${esc(p.name)}</b><br>${NF.format(p.value)}` }),
    series: [{ type: 'sankey', left: 8, right: innerWidth < 700 ? 110 : 190, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 14, draggable: false,
      emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', opacity: .32, curveness: .5 },
      label: { color: C.ink, fontSize: 12, formatter: p => `${p.name}\n{v|${NF.format(p.value)}}`, rich: { v: { color: C.ink2, fontSize: 11 } } },
      data: nodos.map(n => ({ name: n.name, itemStyle: { color: n.c, borderWidth: 0 } })),
      links: enl.map(([s, t, v]) => ({ source: s, target: t, value: v })) }],
  }), true);
  tabla('cSankey', ['De', 'A', 'Cifra'], enl.map(([s, t, v]) => [s, t, NF.format(v)]));
}

// ---------------------------------------------------------------------------
// Condiciones: burbujas, mapa de árbol, Sankey tipo -> modalidad, oferta típica
// ---------------------------------------------------------------------------
function filasAreas(c) {
  return Object.entries(c.areas).filter(([a]) => a !== AREA_OTROS).map(([a, v]) => {
    const [n, ind, conC, tel, hib, conM, sal, nSal] = v;
    return { a, n: num(n), indef: pctDe(ind, conC), dist: (num(tel) != null && num(hib) != null) ? pctDe(tel + hib, conM) : null, sal: sal ?? null, conM: num(conM), conC: num(conC) };
  });
}
function pintarBurbujas() {
  const c = corte('area');
  $('#dBurb').textContent = `${nombreMes(S.mes)} · ${nFiltroSin('area')} · tamaño = ofertas`;
  if (!c || !c.areas) { vacio('gBurb', 'Sin datos de áreas para este filtro'); return; }
  const f = filasAreas(c).filter(x => x.sal != null && x.dist != null && x.conM >= 30);
  if (f.length < 3) { vacio('gBurb', 'Pocas áreas con salario y modalidad para este filtro'); return; }
  const maxN = Math.max(...f.map(x => x.n));
  const destacar = new Set([...f].sort((a, b) => b.sal - a.sal).slice(0, 3).map(x => x.a).concat([...f].sort((a, b) => a.sal - b.sal).slice(0, 2).map(x => x.a)));
  const g = graf('gBurb');
  g.setOption(base({
    grid: { left: 12, right: 24, top: 30, bottom: 40, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const x = f[p.dataIndex];
      return `<div style="font-weight:600">${esc(x.a)}</div>` + tipFila(C.s[0], fmtE(x.sal), 'salario mediano') + tipFila(C.s[0], fmtP(x.dist), 'teletrabajo o híbrido') + tipFila(C.s[0], fmt(x.n), 'ofertas'); } }),
    xAxis: ejeVal({ scale: true, name: 'Salario mediano', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: C.ink2 }, axisLabel: { color: C.muted, fontSize: 11, formatter: v => ejeNum(v) + ' €' } }),
    yAxis: ejeVal({ min: 0, name: '% teletrabajo o híbrido', nameTextStyle: { color: C.ink2, align: 'left' }, axisLabel: { color: C.muted, fontSize: 11, formatter: v => v + ' %' } }),
    series: [{ type: 'scatter', data: f.map(x => [x.sal, +x.dist.toFixed(1)]), symbolSize: (_, p) => 10 + 34 * Math.sqrt(f[p.dataIndex].n / maxN),
      itemStyle: { color: C.s[0], opacity: .72, borderColor: C.surface, borderWidth: 2 },
      emphasis: { itemStyle: { opacity: 1 } },
      label: { show: true, position: 'top', color: C.ink2, fontSize: 11, formatter: p => destacar.has(f[p.dataIndex].a) ? f[p.dataIndex].a.split(' ')[0] : '' } }],
  }), true);
  g.off('click'); g.on('click', p => alternar('area', f[p.dataIndex].a));
  tabla('cBurb', ['Área', 'Ofertas', 'Salario mediano', '% teletrabajo o híbrido'], f.map(x => [x.a, fmt(x.n), fmtE(x.sal), fmtP(x.dist)]));
}
function pintarArbol() {
  const c = corte('area');
  $('#dArbol').textContent = `${nombreMes(S.mes)} · ${nFiltroSin('area')} · tamaño = ofertas; color = % de indefinidos entre las que dicen el contrato`;
  if (!c || !c.areas) { vacio('gArbol', 'Sin datos de áreas para este filtro'); return; }
  const f = filasAreas(c).filter(x => x.n);
  const vals = f.map(x => x.indef).filter(v => v != null);
  const g = graf('gArbol');
  g.setOption(base({
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => `<div style="font-weight:600">${esc(p.name)}</div>` +
      tipFila(C.s[0], fmt(p.value[0]), 'ofertas') + tipFila(C.s[0], fmtP(p.value[1]), 'indefinidos') }),
    visualMap: { dimension: 1, min: Math.floor(Math.min(...vals) / 5) * 5, max: Math.ceil(Math.max(...vals) / 5) * 5, inRange: { color: RAMPA_ORD[C.m] },
      orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 160, calculable: false, textStyle: { color: C.ink2, fontSize: 11 },
      formatter: v => Math.round(v) + ' %' },
    series: [{ type: 'treemap', top: 0, left: 0, right: 0, bottom: 44, roam: false, nodeClick: false, breadcrumb: { show: false },
      itemStyle: { borderColor: C.surface, borderWidth: 2, gapWidth: 2, borderRadius: 5 },
      label: { fontSize: 11, color: '#fff', formatter: p => `${p.name}\n${p.value[1] == null ? '' : NF1.format(p.value[1]) + ' %'}` },
      data: f.map(x => ({ name: x.a, value: [x.n, x.indef == null ? null : +x.indef.toFixed(1)] })) }],
  }), true);
  g.off('click'); g.on('click', p => p.name && alternar('area', p.name));
  tabla('cArbol', ['Área', 'Ofertas', '% indefinidos'], f.map(x => [x.a, fmt(x.n), fmtP(x.indef)]));
}
function pintarSankeyMod() {
  const dir = corteCon({ tipo: 'directo' }), agr = corteCon({ tipo: 'agregador' });
  $('#dSankeyMod').textContent = `${nombreMes(S.mes)} · ${nFiltroSin('tipo')} · ofertas según el tipo y la modalidad que declaran`;
  const k1 = claveCorte().k;
  if (!D.solapamiento || !dir || !agr || !dir.modalidad || !agr.modalidad || S.portal !== '*' || (S.area !== '*' && S.ccaa !== '*')) {
    vacio('gSankeyMod', S.portal !== '*' || (S.area !== '*' && S.ccaa !== '*') ? 'No se puede separar por tipo de oferta con estos filtros' : 'Este mes no separa por tipo de oferta');
    return;
  }
  const mods = ['Presencial', 'Híbrido', 'Teletrabajo', 'Sin dato'];
  const colMod = { 'Presencial': C.s[0], 'Híbrido': C.s[2], 'Teletrabajo': C.s[4], 'Sin dato': C.muted };
  const enl = [];
  [['Con portal directo', dir], ['Solo agregadores', agr]].forEach(([n, c]) => mods.forEach(m => { const v = num(c.modalidad[m]); if (v) enl.push([n, m, v]); }));
  const g = graf('gSankeyMod');
  g.setOption(base({
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => p.dataType === 'edge'
      ? `${esc(p.data.source)} → <b>${esc(p.data.target)}</b><br>${NF.format(p.value)} ofertas` : `<b>${esc(p.name)}</b><br>${NF.format(p.value)} ofertas` }),
    series: [{ type: 'sankey', left: 8, right: 100, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 12, draggable: false, emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', opacity: .32, curveness: .5 }, label: { color: C.ink, fontSize: 12 },
      data: [{ name: 'Con portal directo', itemStyle: { color: C.s[0] } }, { name: 'Solo agregadores', itemStyle: { color: C.s[1] } },
        ...mods.map(m => ({ name: m, itemStyle: { color: colMod[m] } }))],
      links: enl.map(([s, t, v]) => ({ source: s, target: t, value: v })) }],
  }), true);
  tabla('cSankeyMod', ['Tipo de oferta', 'Modalidad', 'Ofertas'], enl.map(([s, t, v]) => [s, t, NF.format(v)]));
}
function pintarTipica() {
  const c = corte(), cA = corte('area'), cC = corte('ccaa');
  const caja = $('#tipica'); caja.textContent = '';
  $('#dTipica').textContent = `${nombreMes(S.mes)} · ${nFiltro()} · el valor más frecuente de cada variable`;
  if (!c || !c.contrato) { caja.appendChild(el('div', { class: 'vacio' }, 'Menos de 10 ofertas con este filtro')); return; }
  const rasgos = [];
  const add = (lbl, m, extra = '') => { if (m) rasgos.push([lbl, m.k, m.pct, extra]); };
  if (S.area === '*' && cA && cA.areas) add('Área', modal(Object.fromEntries(Object.entries(cA.areas).filter(([a]) => a !== AREA_OTROS).map(([a, v]) => [a, v[0]]))));
  add('Contrato', modal(c.contrato)); add('Jornada', modal(c.jornada)); add('Modalidad', modal(c.modalidad));
  add('Experiencia', modal(c.experiencia)); add('Estudios', modal(c.estudios));
  if (S.ccaa === '*' && cC && cC.ccaa) add('Comunidad', modal(Object.fromEntries(Object.entries(cC.ccaa).map(([k, v]) => [k, v[0]]))));
  const fila = el('div', { class: 'persona' });
  const av = el('div', { class: 'avatar', 'aria-hidden': 'true' });
  av.innerHTML = '<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>';
  const r = el('div', { class: 'rasgos' });
  rasgos.forEach(([l, k, p]) => { const s = el('span'); s.append(document.createTextNode(l + ' '), el('b', {}, k), document.createTextNode(` (${NF.format(Math.round(p))} %)`)); r.appendChild(s); });
  if (c.sal && c.sal.med != null) { const s = el('span'); s.append(document.createTextNode('Salario mediano '), el('b', {}, fmtE(c.sal.med))); r.appendChild(s); }
  if (S.ccaa === '*' && S.area === '*' && S.portal === '*' && S.tipo === '*' && D.kpis.antig_mediana_dias != null) {
    const s = el('span'); s.append(document.createTextNode('Publicada hace '), el('b', {}, NF.format(D.kpis.antig_mediana_dias) + ' días'), document.createTextNode(' (mediana)')); r.appendChild(s);
  }
  fila.append(av, r); caja.appendChild(fila);
  descargas('cTipica', ['Variable', 'Valor más frecuente', '%'], rasgos.map(([l, k, p]) => [l, k, NF1.format(p)]));
}

// ---------------------------------------------------------------------------
// Salarios: rango por área (P25 - mediana - P75)
// ---------------------------------------------------------------------------
function pintarRango() {
  $('#dRango').textContent = `${nombreMes(S.mes)} · ${nFiltroSin('area')} · la barra va del percentil 25 al 75; el punto es la mediana`;
  if (S.portal !== '*') { vacio('gRango', 'Con el filtro de portal no hay salarios por área'); return; }
  const areas = Object.keys(D.cortes).filter(k => /^a=.*\|t=\*$/.test(k)).map(k => k.slice(2, -4)).filter(a => a !== AREA_OTROS);
  const f = areas.map(a => { const c = corteCon({ area: a }); return c && c.sal && c.sal.med != null ? { a, ...c.sal } : null; })
    .filter(Boolean).sort((x, y) => y.med - x.med);
  if (!f.length) { vacio('gRango', 'Pocas ofertas con salario para este filtro'); return; }
  const g = graf('gRango');
  g.setOption(base({
    grid: { left: 16, right: 70, top: 10, bottom: 24, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const x = f[p.dataIndex];
      return `<div style="font-weight:600">${esc(x.a)}</div>` + tipFila(C.s[0], fmtE(x.med), 'mediana') + tipFila(C.s[0], `${fmtE(x.p25)} – ${fmtE(x.p75)}`, 'mitad central') + tipFila(C.s[0], fmt(x.n), 'ofertas con salario'); } }),
    xAxis: ejeVal({ scale: true, axisLabel: { color: C.muted, fontSize: 11, formatter: v => ejeNum(v) + ' €' } }),
    yAxis: ejeCat({ inverse: true, data: f.map(x => x.a), axisLine: { show: false } }),
    series: [
      { type: 'custom', encode: { x: [0, 1], y: 2 }, data: f.map((x, i) => [x.p25, x.p75, i]),
        renderItem: (params, api) => { const a = api.coord([api.value(0), api.value(2)]), b = api.coord([api.value(1), api.value(2)]);
          return { type: 'rect', shape: { x: a[0], y: a[1] - 5, width: Math.max(2, b[0] - a[0]), height: 10, r: 5 }, style: { fill: RAMPA_SEQ[C.m][C.m === 'dark' ? 3 : 2] } }; } },
      { type: 'scatter', data: f.map((x, i) => [x.med, i]), symbolSize: 12, z: 3, itemStyle: { color: C.s[0], borderColor: C.surface, borderWidth: 2 },
        label: { show: true, position: 'right', distance: 6, color: C.ink2, fontSize: 11, formatter: p => fmtE(p.value[0]) } }],
  }), true);
  g.off('click'); g.on('click', p => alternar('area', f[p.dataIndex].a));
  tabla('cRango', ['Área', 'P25', 'Mediana', 'P75', 'Ofertas con salario'], f.map(x => [x.a, fmtE(x.p25), fmtE(x.med), fmtE(x.p75), fmt(x.n)]));
}

// ---------------------------------------------------------------------------
// Lo que se pide: puestos que suben y bajan, y su posición mes a mes
// ---------------------------------------------------------------------------
function pintarMovimientos() {
  const ant = mesAnterior();
  if (!ant) { $('#dMov').textContent = 'Solo se compara entre meses procesados con el mismo código.'; vacio('gMov', 'No hay un mes anterior comparable'); return; }
  const tot = 100 * (num(D.kpis.ofertas) - num(ant.D.kpis.ofertas)) / num(ant.D.kpis.ofertas);
  $('#dMov').textContent = `${nombreMes(S.mes)} frente a ${nombreMes(ant.mes)} · puestos con 300 ofertas o más en los dos meses · el total cambia un ${NF1.format(tot)} %`;
  const todos = (D.titulos || []).filter(x => num(x.n) >= 300 && num(x.ant) >= 300).map(x => ({ t: x.t, n: x.n, ant: x.ant, v: 100 * (x.n - x.ant) / x.ant }))
    .sort((a, b) => a.v - b.v);
  // los 7 que más bajan y los 7 que más suben
  const f = todos.length > 14 ? [...todos.slice(0, 7), ...todos.slice(-7)] : todos;
  if (!f.length) { vacio('gMov', 'No hay puestos con 300 ofertas o más en los dos meses'); return; }
  const g = graf('gMov');
  g.setOption(base({
    grid: { left: 16, right: 56, top: 24, bottom: 8, containLabel: true },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => { const x = f[p.dataIndex];
      return `<div style="font-weight:600">${esc(x.t)}</div>` + tipFila(C.s[0], `${x.v > 0 ? '+' : ''}${NF1.format(x.v)} %`, `${fmt(x.ant)} → ${fmt(x.n)} ofertas`); } }),
    xAxis: ejeVal({ axisLabel: { color: C.muted, fontSize: 11, formatter: v => v + ' %' } }),
    yAxis: ejeCat({ data: f.map(x => x.t), axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12, width: innerWidth < 700 ? 110 : 190, overflow: 'truncate' } }),
    series: [{ type: 'bar', barMaxWidth: 14, data: f.map(x => ({ value: +x.v.toFixed(1),
      itemStyle: { color: x.v >= tot ? C.s[0] : C.s[3], borderRadius: x.v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
      label: { show: true, position: 'right', color: C.ink2, fontSize: 11, formatter: p => (p.value > 0 ? '+' : '') + NF1.format(p.value) + ' %' },
      markLine: { symbol: 'none', silent: true, lineStyle: { color: C.muted, type: 'solid', width: 1 },
        label: { formatter: `total ${NF1.format(tot)} %`, color: C.muted, fontSize: 11 }, data: [{ xAxis: +tot.toFixed(1) }] } }],
  }), true);
  tabla('cMov', ['Puesto', nombreMes(ant.mes), nombreMes(S.mes), 'Cambio'], [...f].reverse().map(x => [x.t, fmt(x.ant), fmt(x.n), NF1.format(x.v) + ' %']));
}
let _posPedido = false;
function pintarPosiciones() {
  const faltan = MESES.filter(m => !CACHE[m.mes]);
  if (faltan.length) {
    vacio('gPos', 'Cargando los otros meses…');
    if (!_posPedido) { _posPedido = true; Promise.all(faltan.map(m => cargarMes(m.mes).catch(() => null))).then(() => { try { pintarPosiciones(); } catch (e) { console.error(e); } }); }
    return;
  }
  const meses = MESES.map(m => m.mes);
  const rank = m => { const r = {}; (CACHE[m].titulos || []).forEach((x, i) => { r[x.t.toLowerCase()] = i + 1; }); return r; };
  const R = Object.fromEntries(meses.map(m => [m, rank(m)]));
  const top = (D.titulos || []).slice(0, 8).map(x => x.t);
  $('#dPos').textContent = `Posición de los 8 puestos más anunciados en ${nombreMes(S.mes)}, en cada mes procesado (entre los 40 primeros). Puntos huecos: meses con código antiguo.`;
  const maxR = Math.max(10, ...top.flatMap(t => meses.map(m => R[m][t.toLowerCase()] || 0)));
  const cols = [C.s[0], C.s[1], C.s[2], C.s[3], C.s[4], C.s[5], C.ink2, C.muted];
  const g = graf('gPos');
  g.setOption(base({
    grid: { left: 40, right: innerWidth < 700 ? 130 : 220, top: 16, bottom: 30 },
    tooltip: Object.assign(base().tooltip, { trigger: 'item', formatter: p => `<b>${esc(p.seriesName)}</b><br>${p.value == null ? 'fuera de los 40 primeros' : p.value + 'º'} en ${nombreMes(meses[p.dataIndex])}` }),
    xAxis: ejeCat({ data: meses.map(mesCorto), boundaryGap: false }),
    yAxis: ejeVal({ inverse: true, min: 1, max: maxR, interval: Math.max(1, Math.round(maxR / 10)), splitLine: { show: false },
      axisLabel: { color: C.muted, fontSize: 11, formatter: v => v + 'º' } }),
    series: top.map((t, i) => ({ name: t, type: 'line', connectNulls: false, symbol: 'circle', symbolSize: 10,
      data: meses.map(m => ({ value: R[m][t.toLowerCase()] ?? null,
        itemStyle: NO_COMPARABLE.has(m) ? { color: C.surface, borderColor: cols[i], borderWidth: 2 } : { color: cols[i], borderColor: C.surface, borderWidth: 2 } })),
      lineStyle: { width: 2.5, color: cols[i] }, emphasis: { focus: 'series' },
      endLabel: { show: true, formatter: t, color: C.ink2, fontSize: 11, distance: 8 } })),
  }), true);
  tabla('cPos', ['Puesto', ...meses.map(nombreMes)], top.map(t => [t, ...meses.map(m => R[m][t.toLowerCase()] ? R[m][t.toLowerCase()] + 'º' : '—')]));
}

// ---------------------------------------------------------------------------
// Metodología: esquema del proceso con las cifras del mes
// ---------------------------------------------------------------------------
function pintarFlujo() {
  const e = D.embudo, caja = $('#flujo'); caja.textContent = '';
  $('#dFlujo').textContent = `${nombreMes(S.mes)} · cifras del procesamiento del mes`;
  const pasos = [[D.kpis.num_portales, 'Portales', 'empleo, ETT y agregadores']];
  if (e) {
    pasos.push([e.filas_unido, 'Filas recogidas', 'lo que traen los scrapers']);
    if (num(e.fuera_sin_contrato)) pasos.push([e.filas_dedup ?? e.filas_unido - e.fuera_sin_contrato, 'Con contrato laboral', 'fuera becas, autónomos…']);
    pasos.push([(e.filas_dedup ?? e.filas_unido) - e.repetidas, 'Ofertas distintas', `${fmt(e.grupos)} grupos de copias`]);
    if (num(e.antiguas)) pasos.push([e.finales, 'Recientes', 'sin las de más de 60 días']);
    if (num(e.cuentan) && e.cuentan !== e.finales) pasos.push([e.cuentan, 'Cuentan', 'sin exclusiones R0-R6']);
    else if (!num(e.antiguas)) pasos.push([e.finales, 'Ofertas finales', 'una por oferta']);
  } else pasos.push([D.kpis.ofertas, 'Ofertas finales', 'código de julio']);
  pasos.forEach(([n, t, s], i) => {
    const p = el('div', { class: 'fpaso' + (i === pasos.length - 1 ? ' final' : '') });
    p.append(el('div', { class: 'n' }, fmt(n)), el('b', {}, t), el('span', {}, s));
    caja.appendChild(p);
  });
}
