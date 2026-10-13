// Atelier RPG Rogue : lit et écrit dans le dépôt privé des graphismes par l'API GitHub.
// La page est publique, les données non : sans clé, rien n'est lisible.
const REPO = 'Arkogelul/RPG_Rogue_Art';
const ETATS = ['Manquant', 'Provisoire', 'En cours', 'Terminé'];
const PRIOS = ['', 'haute', 'normale', 'basse'];
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
  if (r.status === 401) { logout('La clé GitHub n\'est plus valide : reconnecte-toi.'); throw new Error('clé refusée'); }
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
const who = () => store.get('atelier_qui') || 'graphiste';

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
  $('#login-msg').textContent = 'Vérification…';
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error();
    store.set('atelier_token', token);
    $('#login-msg').textContent = '';
    $('#qui').value = who();
$('#qui').addEventListener('change', (e) => store.set('atelier_qui', e.target.value));
route();
  } catch {
    token = null;
    $('#login-msg').textContent = 'Clé refusée : vérifie qu\'elle donne accès au dépôt RPG_Rogue_Art.';
    $('#login-msg').className = 'msg err';
  }
});
function logout(msg) { token = null; store.set('atelier_token', null); route(); if (msg) $('#login-msg').textContent = msg; }
$('#logout').addEventListener('click', () => logout());

// ------------------------------------------------------------------ graphismes
let data = null, etats = {}, etatsSha = null, atlasUrl = null, changed = {}, shown = 120, openComments = null;

async function loadGraphismes() {
  if (data) return renderListe();
  $('#g-msg').textContent = 'Chargement…';
  try {
    const [el, at, et] = await Promise.all([raw('_site/elements.json'), raw('_site/vignettes.png'), meta('_site/etats.json')]);
    data = await el.json();
    atlasUrl = URL.createObjectURL(await at.blob());
    etatsSha = et ? et.sha : null;
    etats = et ? JSON.parse(decodeURIComponent(escape(atob(et.content.replace(/\n/g, ''))))) : {};
    const dossiers = [...new Set(data.elements.map((e) => e.dossier))];
    $('#f-dossier').innerHTML = '<option value="">Tous les dossiers</option>' + dossiers.map((d) => `<option>${d}</option>`).join('');
    $('#f-etat').innerHTML = '<option value="">Tous les états</option>' + ETATS.map((d) => `<option>${d}</option>`).join('');
    $('#g-msg').textContent = '';
    renderListe();
  } catch (e) { $('#g-msg').textContent = 'Impossible de charger : ' + e.message; $('#g-msg').className = 'msg err'; }
}

const state = (e) => ({ etat: e.etat, priorite: '', commentaires: [], ...(etats[e.id] || {}), ...(changed[e.id] || {}) });

function filtered() {
  const d = $('#f-dossier').value, s = $('#f-etat').value, t = $('#f-texte').value.trim().toLowerCase();
  return data.elements.filter((e) => (!d || e.dossier === d) && (!s || state(e).etat === s)
    && (!t || (e.element + ' ' + e.fichier).toLowerCase().includes(t)));
}

function renderListe() {
  const list = filtered();
  const counts = {};
  for (const e of list) counts[state(e).etat] = (counts[state(e).etat] || 0) + 1;
  $('#compte').textContent = `${list.length} éléments · ` + ETATS.filter((x) => counts[x]).map((x) => `${counts[x]} ${x.toLowerCase()}`).join(' · ');
  const [aw, ah] = data.atlas;
  const html = list.slice(0, shown).map((e) => {
    const st = state(e);
    const v = e.v;
    const scale = v ? Math.max(1, Math.floor(48 / Math.max(v[2], v[3]))) : 1;
    const thumb = v ? `style="background-image:url(${atlasUrl});background-size:${aw * scale}px ${ah * scale}px;background-position:-${v[0] * scale}px -${v[1] * scale}px;width:${v[2] * scale}px;height:${v[3] * scale}px"` : '';
    const n = st.commentaires.length;
    const comments = openComments === e.id ? `<div class="comments">${st.commentaires.map((c) => `<p><b>${c.qui}</b> <span class="muted">${c.date}</span> — ${escapeHtml(c.texte)}</p>`).join('')}
      <form data-id="${e.id}"><input placeholder="Commentaire…" aria-label="Commentaire"><button>Ajouter</button></form></div>` : '';
    return `<div class="row${changed[e.id] ? ' changed' : ''}" data-id="${e.id}">
      <div class="thumb" ${thumb}></div>
      <div class="name"><b>${e.element}</b><small>${e.fichier} · ${e.tags.length} tag(s) · ${e.images} image(s)</small></div>
      <select class="etat e-${st.etat}" aria-label="État">${ETATS.map((x) => `<option${x === st.etat ? ' selected' : ''}>${x}</option>`).join('')}</select>
      <select class="prio" aria-label="Priorité">${PRIOS.map((x) => `<option value="${x}"${x === st.priorite ? ' selected' : ''}>${x || 'priorité'}</option>`).join('')}</select>
      <button class="com${n ? ' has' : ''}" title="Commentaires">${n || '+'}</button>${comments}</div>`;
  }).join('');
  $('#liste').innerHTML = html + (list.length > shown ? `<button class="more">Afficher plus (${list.length - shown})</button>` : '');
  const nc = Object.keys(changed).length;
  $('#save').hidden = !nc;
  $('#save').textContent = `Enregistrer (${nc})`;
}
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function change(id, patch) {
  const e = data.elements.find((x) => x.id === id);
  changed[id] = { ...state(e), ...patch };
  renderListe();
}
$('#liste').addEventListener('change', (ev) => {
  const row = ev.target.closest('.row');
  if (!row) return;
  if (ev.target.classList.contains('etat')) change(row.dataset.id, { etat: ev.target.value });
  if (ev.target.classList.contains('prio')) change(row.dataset.id, { priorite: ev.target.value });
});
$('#liste').addEventListener('click', (ev) => {
  if (ev.target.classList.contains('more')) { shown += 200; renderListe(); }
  if (ev.target.classList.contains('com')) { const id = ev.target.closest('.row').dataset.id; openComments = openComments === id ? null : id; renderListe(); }
});
$('#liste').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const id = ev.target.dataset.id, input = ev.target.querySelector('input');
  if (!input.value.trim()) return;
  const e = data.elements.find((x) => x.id === id);
  const st = state(e);
  change(id, { commentaires: [...st.commentaires, { qui: who(), date: new Date().toISOString().slice(0, 10), texte: input.value.trim() }] });
});
['#f-dossier', '#f-etat', '#f-texte'].forEach((s) => $(s).addEventListener('input', () => { shown = 120; renderListe(); }));

$('#save').addEventListener('click', async () => {
  $('#save').disabled = true;
  $('#g-msg').textContent = 'Enregistrement…';
  try {
    // relire juste avant d'écrire : on ne remplace que les éléments modifiés ici (pas ceux de l'autre)
    const cur = await meta('_site/etats.json');
    const remote = cur ? JSON.parse(decodeURIComponent(escape(atob(cur.content.replace(/\n/g, ''))))) : {};
    for (const [id, st] of Object.entries(changed)) remote[id] = st;
    const n = Object.keys(changed).length;
    const res = await put('_site/etats.json', utf8b64(JSON.stringify(remote, null, 1)), `États : ${n} élément(s) modifié(s) (${who()})`, cur && cur.sha);
    etats = remote; etatsSha = res.content.sha; changed = {};
    $('#g-msg').textContent = 'Enregistré.';
    renderListe();
  } catch (e) { $('#g-msg').textContent = 'Échec : ' + e.message; $('#g-msg').className = 'msg err'; }
  $('#save').disabled = false;
});
window.addEventListener('beforeunload', (e) => { if (Object.keys(changed).length) { e.preventDefault(); e.returnValue = ''; } });

// ------------------------------------------------------------------ références
let refs = null, cat = '', urls = {};

async function loadReferences(force) {
  if (refs && !force) return renderRefs();
  $('#r-msg').textContent = 'Chargement…';
  try {
    const tree = await (await gh(`/repos/${REPO}/git/trees/main?recursive=1`)).json();
    refs = tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith('references/') && /\.(png|jpe?g|webp|gif)$/i.test(t.path))
      .map((t) => ({ path: t.path, sha: t.sha, cat: t.path.split('/')[1], name: t.path.split('/').pop() }));
    $('#r-msg').textContent = refs.length ? '' : 'Aucune image pour l\'instant.';
    renderRefs();
  } catch (e) { $('#r-msg').textContent = 'Impossible de charger : ' + e.message; $('#r-msg').className = 'msg err'; }
}

function renderRefs() {
  const cats = [...new Set(refs.map((r) => r.cat))].sort();
  $('#cat-list').innerHTML = cats.map((c) => `<option value="${c}">`).join('');
  $('#cats').innerHTML = ['', ...cats].map((c) => `<button class="chip${c === cat ? ' on' : ''}" data-cat="${c}">${c || 'Toutes'} <span class="muted">${refs.filter((r) => !c || r.cat === c).length}</span></button>`).join('');
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
    $('#r-msg').textContent = `Envoi ${i + 1}/${imgs.length} : ${f.name}…`;
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(f); });
    const name = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    try { await put(`references/${c}/${name}`, b64, `Référence ajoutée : ${c}/${name} (${who()})`); }
    catch (e) { $('#r-msg').textContent = `Échec pour ${f.name} : ${e.message}`; $('#r-msg').className = 'msg err'; return; }
  }
  $('#r-msg').textContent = `${imgs.length} image(s) ajoutée(s) dans « ${c} ».`;
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
  $('#lb-del').textContent = 'Supprimer';
  $('#lightbox').hidden = false;
});
$('#lb-close').addEventListener('click', () => { $('#lightbox').hidden = true; });
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#lightbox').hidden = true; });
$('#lb-del').addEventListener('click', async () => {
  if ($('#lb-del').textContent === 'Supprimer') { $('#lb-del').textContent = 'Confirmer la suppression'; return; }
  const r = refs.find((x) => x.path === lbPath);
  try {
    await gh(`/repos/${REPO}/contents/${enc(lbPath)}`, { method: 'DELETE', body: { message: `Référence supprimée : ${lbPath.replace('references/', '')} (${who()})`, sha: r.sha, branch: 'main' } });
    $('#lightbox').hidden = true;
    loadReferences(true);
  } catch (e) { $('#lb-name').textContent = 'Échec : ' + e.message; }
});

$('#qui').value = who();
$('#qui').addEventListener('change', (e) => store.set('atelier_qui', e.target.value));
route();
