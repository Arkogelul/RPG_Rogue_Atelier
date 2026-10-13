// Atelier RPG Rogue : lit et écrit dans le dépôt privé des graphismes par l'API GitHub.
// La page est publique, les données non : sans clé, rien n'est lisible.
const REPO = 'Arkogelul/RPG_Rogue_Art';
const ETATS = ['Missing', 'Placeholder', 'In progress', 'Done'];
const PRIOS = ['', 'high', 'normal', 'low'];
const ETAT_EN = Object.fromEntries(ETATS.map((x) => [x, x]));
const PRIO_EN = { '': 'no priority', high: 'high', normal: 'normal', low: 'low' };
const QUI_EN = { artist: 'artist', coder: 'coder', graphiste: 'artist', programmeur: 'coder' };
const whoEn = () => QUI_EN[who()] || who();
const etatOpts = (cur) => ETATS.map((x) => `<option value="${x}"${x === cur ? ' selected' : ''}>${ETAT_EN[x]}</option>`).join('');
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let token = store.get('atelier_token');

// ------------------------------------------------------------------ API GitHub
async function gh(path, { method = 'GET', body, accept } = {}) {
  const r = await fetch('https://api.github.com' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, Accept: accept || 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { logout('The GitHub key is no longer valid: sign in again.'); throw new Error('key refused'); }
  if (!r.ok && !(method === 'GET' && r.status === 404)) throw new Error(`GitHub ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return r;
}
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
async function raw(path) { return (await gh(`/repos/${REPO}/contents/${enc(path)}`, { accept: 'application/vnd.github.raw' })); }
async function meta(path) { const r = await gh(`/repos/${REPO}/contents/${enc(path)}`); return r.status === 404 ? null : r.json(); }
async function put(path, base64, message, sha) {
  return (await gh(`/repos/${REPO}/contents/${enc(path)}`, { method: 'PUT', body: { message, content: base64, sha, branch: 'main' } })).json();
}
const utf8b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const who = () => QUI_EN[store.get('atelier_qui')] || 'artist';

// ------------------------------------------------------------------ navigation
const SECTIONS = ['graphismes', 'references', 'apercu'];
function route() {
  const h = (location.hash || '#graphismes').slice(1);
  const needLogin = !token && h !== 'apercu';
  $('#login').hidden = !needLogin;
  for (const s of SECTIONS) $('#' + s).hidden = needLogin || s !== h;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.hash === '#' + h));
  $('#logout').hidden = !token;
  if (!needLogin && h === 'graphismes') loadGraphismes();
  if (!needLogin && h === 'references') loadReferences();
}
window.addEventListener('hashchange', route);

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = $('#token').value.trim();
  $('#login-msg').textContent = 'Checking…';
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error();
    store.set('atelier_token', token);
    $('#login-msg').textContent = '';
    route();
  } catch {
    token = null;
    $('#login-msg').textContent = 'Key refused: check that it gives access to the RPG_Rogue_Art repository.';
    $('#login-msg').className = 'msg err';
  }
});
function logout(msg) { token = null; store.set('atelier_token', null); route(); if (msg) $('#login-msg').textContent = msg; }
$('#logout').addEventListener('click', () => logout());

// ------------------------------------------------------------------ graphismes
let data = null, etats = {}, atlasUrl = null, changed = {}, shown = 150, openComments = null;
let selected = new Set(), lastClicked = null, currentList = [];
const PRIO_RANK = { haute: 0, normale: 1, basse: 2, '': 3 };
const ETAT_RANK = Object.fromEntries(ETATS.map((x, i) => [x, i]));
const biomeName = (b) => b;

async function loadGraphismes() {
  if (data) return renderListe();
  $('#g-msg').textContent = 'Loading…';
  try {
    const [el, at, et] = await Promise.all([raw('_site/elements.json'), raw('_site/thumbnails.png'), meta('_site/states.json')]);
    data = await el.json();
    atlasUrl = URL.createObjectURL(await at.blob());
    etats = et ? JSON.parse(decodeURIComponent(escape(atob(et.content.replace(/\n/g, ''))))) : {};
    const types = data.types.filter((t) => data.elements.some((e) => e.type === t));
    const biomes = [...new Set(data.elements.filter((e) => e.biome).sort((x, y) => x.rb - y.rb).map((e) => e.biome))];
    $('#f-type').innerHTML = '<option value="">All types</option>' + types.map((d) => `<option>${d}</option>`).join('');
    $('#f-biome').innerHTML = '<option value="">All biomes</option>' + biomes.map((d) => `<option value="${d}">${biomeName(d)}</option>`).join('');
    $('#f-etat').innerHTML = '<option value="">All states</option>' + etatOpts();
    $('#sel-etat').innerHTML = '<option value="">set state…</option>' + etatOpts();
    $('#sel-prio').innerHTML = '<option value="-">set priority…</option>' + PRIOS.map((d) => `<option value="${d}">${PRIO_EN[d]}</option>`).join('');
    $('#tri').value = store.get('atelier_tri') || 'type';
    $('#g-msg').textContent = '';
    renderListe();
  } catch (e) { $('#g-msg').textContent = 'Could not load: ' + e.message; $('#g-msg').className = 'msg err'; }
}

const state = (e) => ({ state: e.state, priority: '', comments: [], ...(etats[e.id] || {}), ...(changed[e.id] || {}) });
const byType = (a, b) => a.rt - b.rt || a.rb - b.rb || a.file.localeCompare(b.file) || a.n - b.n;
const SORTS = {
  type: byType,
  biome: (a, b) => a.rb - b.rb || byType(a, b),
  date: (a, b) => (state(b).date || b.date || '').localeCompare(state(a).date || a.date || '') || byType(a, b),
  etat: (a, b) => ETAT_RANK[state(a).state] - ETAT_RANK[state(b).state] || byType(a, b),
  prio: (a, b) => PRIO_RANK[state(a).priority || ''] - PRIO_RANK[state(b).priority || ''] || byType(a, b),
  nom: (a, b) => a.element.localeCompare(b.element) || byType(a, b),
};

// recherche : sans accents ni majuscules, tous les mots doivent se trouver (nom, fichier, type, monde/combat,
// biome en français et en anglais, tags, noms des images du jeu : « bridge », « slime »…)
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const haystack = (e) => e._h || (e._h = norm([e.element, e.file, e.type, e.ctx, e.biome, biomeName(e.biome), e.tags.join(' '), e.words || ''].join(' ')));
function filtered() {
  const ty = $('#f-type').value, bi = $('#f-biome').value, s = $('#f-etat').value;
  const words = norm($('#f-texte').value).split(/\s+/).filter(Boolean);
  return data.elements.filter((e) => (!ty || e.type === ty) && (!bi || e.biome === bi) && (!s || state(e).state === s)
    && words.every((w) => haystack(e).includes(w) || norm(ETAT_EN[state(e).state]).includes(w)))
    .sort(SORTS[$('#tri').value] || byType);
}

function thumbStyle(v) {
  if (!v) return '';
  const [aw, ah] = data.atlas;
  const k = Math.max(1, Math.floor(48 / Math.max(v[2], v[3])));
  return `style="background-image:url(${atlasUrl});background-size:${aw * k}px ${ah * k}px;background-position:-${v[0] * k}px -${v[1] * k}px;width:${v[2] * k}px;height:${v[3] * k}px"`;
}

function renderListe() {
  const list = filtered();
  currentList = list;
  const counts = {};
  for (const e of list) counts[state(e).state] = (counts[state(e).state] || 0) + 1;
  $('#compte').textContent = `${list.length} items · ` + ETATS.filter((x) => counts[x]).map((x) => `${counts[x]} ${ETAT_EN[x].toLowerCase()}`).join(' · ');
  const html = list.slice(0, shown).map((e) => {
    const st = state(e);
    const n = st.comments.length;
    const badges = (e.ctx && e.ctx !== 'interface' ? `<span class="badge">${e.ctx}</span>` : '') + (e.biome ? `<span class="badge">${biomeName(e.biome)}</span>` : '');
    const comments = openComments === e.id ? `<div class="comments">${st.comments.map((c) => `<p><b>${QUI_EN[c.who] || c.who}</b> <span class="muted">${c.date}</span> — ${escapeHtml(c.text)}</p>`).join('')}
      <form data-id="${e.id}"><input placeholder="Comment…" aria-label="Comment"><button>Add</button></form></div>` : '';
    return `<div class="row ctx-${e.ctx || 'aucun'}${changed[e.id] ? ' changed' : ''}${selected.has(e.id) ? ' sel' : ''}" data-id="${e.id}">
      <div class="thumb" ${thumbStyle(e.v)}></div>
      <div class="name"><b>${e.element}${badges}</b><small>${e.type} · ${e.file} · ${e.tags.length ? e.tags.length + ' animation' + (e.tags.length > 1 ? 's' : '') : 'still image'} · ${e.date || ''}</small></div>
      <select class="etat e-${st.state.replace(' ', '')}" aria-label="State">${etatOpts(st.state)}</select>
      <select class="prio" aria-label="Priority">${PRIOS.map((x) => `<option value="${x}"${x === (st.priority || '') ? ' selected' : ''}>${x ? PRIO_EN[x] : 'priority'}</option>`).join('')}</select>
      <button class="com${n ? ' has' : ''}" title="Comments">${n || '+'}</button>${comments}</div>`;
  }).join('');
  $('#liste').innerHTML = html + (list.length > shown ? `<button class="more">Show more (${list.length - shown})</button>` : '');
  const nc = Object.keys(changed).length;
  $('#save').hidden = !nc;
  $('#save').textContent = `Save (${nc})`;
  showSelection();
}
// la sélection ne redessine pas la liste (sinon le double-clic se perd) ; sa barre flotte en bas, sans rien décaler
function showSelection() {
  document.querySelectorAll('#liste .row').forEach((r) => r.classList.toggle('sel', selected.has(r.dataset.id)));
  $('#selbar').hidden = selected.size === 0;
  $('#selcount').textContent = `${selected.size} selected`;
}
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function change(id, patch, render = true) {
  const e = data.elements.find((x) => x.id === id);
  changed[id] = { ...state(e), ...patch, date: new Date().toISOString().slice(0, 10) };
  if (render) renderListe();
}
$('#liste').addEventListener('change', (ev) => {
  const row = ev.target.closest('.row');
  if (!row) return;
  if (ev.target.classList.contains('etat')) change(row.dataset.id, { state: ev.target.value });
  if (ev.target.classList.contains('prio')) change(row.dataset.id, { priority: ev.target.value });
});
// sélection : clic = celui-ci, Ctrl = ajouter / retirer, Maj = plage
$('#liste').addEventListener('click', (ev) => {
  if (ev.target.classList.contains('more')) { shown += 300; renderListe(); return; }
  const row = ev.target.closest('.row');
  if (!row) return;
  if (ev.target.classList.contains('com')) { openComments = openComments === row.dataset.id ? null : row.dataset.id; renderListe(); return; }
  if (ev.target.closest('select, input, button, form')) return;
  const id = row.dataset.id;
  if (ev.shiftKey && lastClicked) {
    const ids = currentList.map((e) => e.id);
    const [i, j] = [ids.indexOf(lastClicked), ids.indexOf(id)].sort((x, y) => x - y);
    if (!ev.ctrlKey && !ev.metaKey) selected.clear();
    ids.slice(i, j + 1).forEach((x) => selected.add(x));
  } else if (ev.ctrlKey || ev.metaKey) {
    selected.has(id) ? selected.delete(id) : selected.add(id);
    lastClicked = id;
  } else {
    selected = new Set([id]);
    lastClicked = id;
  }
  showSelection();
});
$('#liste').addEventListener('dblclick', (ev) => {
  const row = ev.target.closest('.row');
  if (row && !ev.target.closest('select, input, button, form')) openViewer(data.elements.find((x) => x.id === row.dataset.id));
});
$('#sel-etat').addEventListener('change', (e) => { if (!e.target.value) return; selected.forEach((id) => change(id, { state: e.target.value }, false)); e.target.value = ''; renderListe(); });
$('#sel-prio').addEventListener('change', (e) => { if (e.target.value === '-') return; selected.forEach((id) => change(id, { priority: e.target.value }, false)); e.target.value = '-'; renderListe(); });
$('#sel-none').addEventListener('click', () => { selected.clear(); showSelection(); });
$('#liste').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const id = ev.target.dataset.id, input = ev.target.querySelector('input');
  if (!input.value.trim()) return;
  const st = state(data.elements.find((x) => x.id === id));
  change(id, { comments: [...st.comments, { who: whoEn(), date: new Date().toISOString().slice(0, 10), text: input.value.trim() }] });
});
['#f-type', '#f-biome', '#f-etat', '#f-texte'].forEach((s) => $(s).addEventListener('input', () => { shown = 150; renderListe(); }));
$('#tri').addEventListener('change', () => { store.set('atelier_tri', $('#tri').value); renderListe(); });

$('#save').addEventListener('click', async () => {
  $('#save').disabled = true;
  $('#g-msg').textContent = 'Saving…';
  try {
    // relire juste avant d'écrire : on ne remplace que les éléments modifiés ici (pas ceux de l'autre)
    const cur = await meta('_site/states.json');
    const remote = cur ? JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\n/g, ''))))) : {};
    for (const [id, st] of Object.entries(changed)) remote[id] = st;
    const n = Object.keys(changed).length;
    await put('_site/states.json', utf8b64(JSON.stringify(remote, null, 1)), `States: ${n} item(s) changed (${whoEn()})`, cur && cur.sha);
    etats = remote; changed = {};
    $('#g-msg').textContent = 'Saved.';
    renderListe();
  } catch (e) { $('#g-msg').textContent = 'Failed: ' + e.message; $('#g-msg').className = 'msg err'; }
  $('#save').disabled = false;
});
window.addEventListener('beforeunload', (e) => { if (Object.keys(changed).length) { e.preventDefault(); e.returnValue = ''; } });

// ------------------------------------------------------------------ grande image (double-clic)
const viewer = { el: null, img: null, meta: null, tag: null, playing: true, t: 0, last: 0, raf: 0 };
async function openViewer(e) {
  viewer.el = e; viewer.meta = null;
  $('#v-name').textContent = e.element;
  $('#v-info').textContent = `${e.type} · ${e.file}`;
  $('#v-open').href = `rpgrogue://open?f=${encodeURIComponent(e.file)}&e=${encodeURIComponent(e.element)}`;
  $('#v-tags').innerHTML = '';
  $('#viewer').hidden = false;
  const c = $('#v-canvas'); c.width = c.height = 0;
  if (!e.anim) { $('#v-tags').textContent = 'No image for this item.'; return; }
  try {
    const [m, p] = await Promise.all([raw(`_site/anim/${e.n}.json`), raw(`_site/anim/${e.n}.png`)]);
    viewer.meta = await m.json();
    viewer.img = await createImageBitmap(await p.blob());
  } catch (err) { $('#v-tags').textContent = 'Could not load: ' + err.message; return; }
  const tags = Object.keys(viewer.meta.tags);
  viewer.tag = tags[0];
  $('#v-tags').innerHTML = tags.map((t) => `<button class="chip${t === viewer.tag ? ' on' : ''}" data-tag="${t}">${t} <span class="muted">${viewer.meta.tags[t].length}</span></button>`).join('');
  updateOpenLink();
  viewer.t = 0; viewer.playing = true; $('#v-play').textContent = 'Pause';
  cancelAnimationFrame(viewer.raf);
  viewer.last = performance.now();
  drawViewer(viewer.last);      // première image tout de suite, puis l'animation
}
function updateOpenLink() {
  const e = viewer.el;
  $('#v-open').href = `rpgrogue://open?f=${encodeURIComponent(e.file)}&e=${encodeURIComponent(e.element)}&t=${encodeURIComponent(viewer.tag || '')}`;
}
function drawViewer(now) {
  if ($('#viewer').hidden || !viewer.meta) return;
  if (viewer.playing) viewer.t += now - viewer.last;
  viewer.last = now;
  const { w, h } = viewer.meta, frames = viewer.meta.tags[viewer.tag];
  const total = frames.reduce((s, f) => s + Math.max(10, f[1]), 0);
  let t = viewer.t % total, fr = frames[0];
  for (const f of frames) { if (t < Math.max(10, f[1])) { fr = f; break; } t -= Math.max(10, f[1]); }
  const box = $('.v-stage');
  const z = +$('#v-zoom').value || Math.max(1, Math.min(8, Math.floor(Math.min((box.clientWidth - 20) / w, 420 / h))));
  const c = $('#v-canvas');
  if (c.width !== w * z || c.height !== h * z) { c.width = w * z; c.height = h * z; }
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(viewer.img, fr[0], 0, w, h, 0, 0, w * z, h * z);
  viewer.raf = requestAnimationFrame(drawViewer);
}
$('#v-tags').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-tag]'); if (!b) return;
  viewer.tag = b.dataset.tag; viewer.t = 0; updateOpenLink();
  document.querySelectorAll('#v-tags .chip').forEach((x) => x.classList.toggle('on', x === b));
});
$('#v-play').addEventListener('click', () => { viewer.playing = !viewer.playing; $('#v-play').textContent = viewer.playing ? 'Pause' : 'Play'; });
$('#v-close').addEventListener('click', () => { $('#viewer').hidden = true; });
$('#viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') $('#viewer').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#viewer').hidden = true; });

// ------------------------------------------------------------------ références
let refs = null, cat = '', urls = {};

async function loadReferences(force) {
  if (refs && !force) return renderRefs();
  $('#r-msg').textContent = 'Loading…';
  try {
    const tree = await (await gh(`/repos/${REPO}/git/trees/main?recursive=1`)).json();
    refs = tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith('references/') && /\.(png|jpe?g|webp|gif)$/i.test(t.path))
      .map((t) => ({ path: t.path, sha: t.sha, cat: t.path.split('/')[1], name: t.path.split('/').pop() }));
    $('#r-msg').textContent = refs.length ? '' : 'No images yet.';
    renderRefs();
  } catch (e) { $('#r-msg').textContent = 'Could not load: ' + e.message; $('#r-msg').className = 'msg err'; }
}

function renderRefs() {
  const cats = [...new Set(refs.map((r) => r.cat))].sort();
  $('#cat-list').innerHTML = cats.map((c) => `<option value="${c}">`).join('');
  $('#cats').innerHTML = ['', ...cats].map((c) => `<button class="chip${c === cat ? ' on' : ''}" data-cat="${c}">${c || 'All'} <span class="muted">${refs.filter((r) => !c || r.cat === c).length}</span></button>`).join('');
  const list = refs.filter((r) => !cat || r.cat === cat);
  $('#galerie').innerHTML = list.map((r) => `<figure data-path="${r.path}"><img alt="${r.name}" data-path="${r.path}"><figcaption>${r.cat} · ${r.name}</figcaption></figure>`).join('');
  $('#galerie').querySelectorAll('img').forEach(async (img) => { img.src = await imageUrl(img.dataset.path); });
}
async function imageUrl(path) {
  if (!urls[path]) urls[path] = raw(path).then((r) => r.blob()).then((b) => URL.createObjectURL(b));
  return urls[path];
}
$('#cats').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { cat = b.dataset.cat; renderRefs(); } });

async function upload(files) {
  const c = ($('#cat-new').value.trim() || cat || 'divers').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  for (const [i, f] of imgs.entries()) {
    $('#r-msg').textContent = `Uploading ${i + 1}/${imgs.length}: ${f.name}…`;
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(f); });
    const name = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    try { await put(`references/${c}/${name}`, b64, `Reference added: ${c}/${name} (${whoEn()})`); }
    catch (e) { $('#r-msg').textContent = `Failed for ${f.name}: ${e.message}`; $('#r-msg').className = 'msg err'; return; }
  }
  $('#r-msg').textContent = `${imgs.length} image(s) added to "${c}".`;
  cat = c;
  loadReferences(true);
}
$('#files').addEventListener('change', (e) => upload(e.target.files));
const drop = $('#drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => upload(e.dataTransfer.files));

// grande image + suppression (deux clics)
let lbPath = null;
$('#galerie').addEventListener('click', async (e) => {
  const f = e.target.closest('figure'); if (!f) return;
  lbPath = f.dataset.path;
  $('#lb-img').src = await imageUrl(lbPath);
  $('#lb-name').textContent = lbPath.replace('references/', '');
  $('#lb-del').textContent = 'Delete';
  $('#lightbox').hidden = false;
});
$('#lb-close').addEventListener('click', () => { $('#lightbox').hidden = true; });
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#lightbox').hidden = true; });
$('#lb-del').addEventListener('click', async () => {
  if ($('#lb-del').textContent === 'Delete') { $('#lb-del').textContent = 'Confirm delete'; return; }
  const r = refs.find((x) => x.path === lbPath);
  try {
    await gh(`/repos/${REPO}/contents/${enc(lbPath)}`, { method: 'DELETE', body: { message: `Reference deleted: ${lbPath.replace('references/', '')} (${whoEn()})`, sha: r.sha, branch: 'main' } });
    $('#lightbox').hidden = true;
    loadReferences(true);
  } catch (e) { $('#lb-name').textContent = 'Failed: ' + e.message; }
});

$('#qui').value = who();
$('#qui').addEventListener('change', (e) => store.set('atelier_qui', e.target.value));
route();
