// Painel da secretaria - SPA simples sobre o mesmo projeto Supabase do app.
// Acesso restrito a papeis secretaria/pastor/lider (RLS garante no banco).
const SUPABASE_URL = 'https://oyyvjwppbffhfoyznzdc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95eXZqd3BwYmZmaGZveXpuemRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTMzNzYsImV4cCI6MjEwOTg4OTM3Nn0.rFdmEulR5biLywjh0ydFVGklIlzNWyfeFop-vaZvx_I';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const fmtDT = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let state = { session: null, profile: null, view: 'dashboard', editing: null };

async function init() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  sb.auth.onAuthStateChange((_e, s) => { state.session = s; s ? loadProfile() : renderLogin(); });
  if (state.session) await loadProfile(); else renderLogin();
}

async function loadProfile() {
  const { data: { user } } = await sb.auth.getUser();
  const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (!p || !['secretaria', 'pastor', 'lider'].includes(p.role)) {
    app.innerHTML = `<div class="login-wrap"><div class="login-card"><p class="brand">Painel da Igreja</p>
      <h1>Sem acesso</h1><p class="muted">Este painel é exclusivo da secretaria, pastores e líderes. Sua conta (${esc(user.email)}) não tem permissão.</p>
      <button onclick="sb.auth.signOut()">Sair</button></div></div>`;
    return;
  }
  state.profile = p;
  renderShell();
  go('dashboard');
}

function renderLogin(msg = '') {
  app.innerHTML = `<div class="login-wrap"><div class="login-card">
    <p class="brand">Painel da Igreja</p>
    <h1>Entrar</h1><p class="muted">Código enviado por email, sem senha.</p>
    <input id="email" type="email" placeholder="seu@email.com" />
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <button id="send" onclick="sendCode()">Enviar código</button>
    <div id="codeArea" class="hidden" style="margin-top:12px">
      <input id="code" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos" />
      <button onclick="verifyCode()">Entrar</button>
    </div></div></div>`;
}

async function sendCode() {
  const email = document.getElementById('email').value.trim();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) renderLogin('Não consegui enviar o código. Confere o email?');
  else document.getElementById('codeArea').classList.remove('hidden');
}

async function verifyCode() {
  const email = document.getElementById('email').value.trim();
  const { error } = await sb.auth.verifyOtp({ email, token: document.getElementById('code').value.trim(), type: 'email' });
  if (error) renderLogin('Código inválido ou expirado.');
}

const VIEWS = [
  ['dashboard', 'Visão geral'], ['papo', 'Papo com pastor'], ['cultos', 'Cultos'], ['eventos', 'Eventos'],
  ['escalas', 'Escalas'], ['avisos', 'Avisos'], ['membros', 'Membros'], ['whatsapp', 'WhatsApp'], ['censo', 'Censo'], ['contagem', 'Contagem'],
];

function renderShell() {
  app.innerHTML = `<div class="dockzone"><div class="dock"><span class="mark">I</span>
    <nav>${VIEWS.map(([k, l]) => `<a href="#" data-v="${k}" onclick="go('${k}');return false">${l}</a>`).join('')}</nav>
    <button class="out" onclick="sb.auth.signOut()">Sair (${esc(state.profile.full_name.split(' ')[0])})</button></div></div>
    <main id="main"></main>`;
}

function go(view) {
  state.view = view;
  document.querySelectorAll('.dock nav a').forEach((a) => a.classList.toggle('active', a.dataset.v === view));
  ({ dashboard: vDashboard, papo: vPapo, cultos: vCultos, eventos: vEventos, escalas: vEscalas, avisos: vAvisos, membros: vMembros, whatsapp: vWhatsApp, censo: vCenso, contagem: vContagem })[view]();
}

async function count(table, filter) {
  let q = sb.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
}

async function vDashboard() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const [membros, censo, papoNovas, escalasPend, eventos, inscricoes] = await Promise.all([
    count('profiles'), count('census_responses'),
    count('pastor_messages', (q) => q.eq('status', 'nova')),
    count('volunteer_schedules', (q) => q.eq('status', 'pendente')),
    count('events', (q) => q.gte('starts_at', new Date().toISOString())),
    count('event_registrations'),
  ]);
  m.innerHTML = `<h1 style="margin-bottom:20px">Visão geral</h1><div class="grid">
    ${[['Membros cadastrados', membros], ['Censos respondidos', censo], ['Mensagens novas (papo)', papoNovas],
       ['Escalas pendentes', escalasPend], ['Próximos eventos', eventos], ['Inscrições em eventos', inscricoes]]
      .map(([l, n]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join('')}
  </div>`;
}

async function vPapo() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('pastor_messages').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(50);
  m.innerHTML = `<h1 style="margin-bottom:20px">Papo com pastor</h1>
    ${(data || []).map((r) => `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <strong>${esc(r.profiles?.full_name || 'Membro')}</strong>
        <span class="pill ${r.status}">${r.status.replace('_', ' ')}</span></div>
      <p class="muted" style="margin:4px 0 8px">${esc(r.kind)} · ${fmtDT(r.created_at)}</p>
      <p style="margin-bottom:10px">${esc(r.body)}</p>
      ${r.reply ? `<p style="background:var(--bg);border-radius:10px;padding:10px 12px"><strong>Resposta:</strong> ${esc(r.reply)}</p>` : ''}
      <div class="row-actions" style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${r.status === 'nova' ? `<button class="ghost" onclick="papoStatus('${r.id}','em_triagem')">Marcar em triagem</button>` : ''}
        ${r.status !== 'respondida' ? `<textarea id="rp-${r.id}" placeholder="Escrever resposta…"></textarea>
        <button onclick="papoReply('${r.id}')">Responder</button>` : ''}
      </div></div>`).join('') || '<div class="card"><p class="muted">Nenhuma mensagem por aqui ainda.</p></div>'}`;
}

async function papoStatus(id, status) {
  await sb.from('pastor_messages').update({ status }).eq('id', id);
  vPapo();
}

async function papoReply(id) {
  const reply = document.getElementById('rp-' + id).value.trim();
  if (!reply) return;
  const { data: { user } } = await sb.auth.getUser();
  await sb.from('pastor_messages').update({ status: 'respondida', reply, replied_by: user.id }).eq('id', id);
  vPapo();
}

const formCard = (title, inner, btnLabel, fn) => `<div class="card"><h2>${title}</h2>
  <div style="display:grid;gap:10px;max-width:560px">${inner}
  <button style="max-width:220px" onclick="${fn}">${btnLabel}</button></div>
  <p id="formMsg" class="err" style="margin-top:8px"></p></div>`;
const dtLocal = (id) => { const v = document.getElementById(id).value; return v ? new Date(v).toISOString() : null; };
const val = (id) => document.getElementById(id).value.trim();
const toLocalInput = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

async function vCultos() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('services').select('*').gte('starts_at', new Date(Date.now() - 864e5).toISOString()).order('starts_at');
  m.innerHTML = `<h1 style="margin-bottom:20px">Cultos</h1>
    ${formCard('Novo culto',
      '<input id="cTitle" placeholder="Nome (ex.: Culto Domingo Manhã)" /><input id="cWhen" type="datetime-local" />',
      'Criar culto', 'criaCulto()')}
    <div class="card"><table><tr><th>Culto</th><th>Quando</th><th></th></tr>
    ${(data || []).map((s) => state.editing === s.id
      ? `<tr><td><input id="ec-${s.id}" value="${esc(s.title)}" /></td>
         <td><input id="ew-${s.id}" type="datetime-local" value="${toLocalInput(s.starts_at)}" /></td>
         <td class="row-actions"><button class="ghost" onclick="salvaCulto('${s.id}')">Salvar</button>
         <button class="ghost" onclick="state.editing=null;vCultos()">Cancelar</button></td></tr>`
      : `<tr><td>${esc(s.title)}</td><td>${fmtDT(s.starts_at)}</td>
         <td class="row-actions"><button class="ghost" onclick="state.editing='${s.id}';vCultos()">Editar</button>
         <button class="ghost danger" onclick="delCulto('${s.id}','${esc(s.title)}')">Excluir</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="muted">Nenhum culto programado.</td></tr>'}
    </table></div>`;
}

async function criaCulto() {
  const title = val('cTitle'); const starts = dtLocal('cWhen');
  if (!title || !starts) { document.getElementById('formMsg').textContent = 'Preencha nome e data/hora.'; return; }
  const { error } = await sb.from('services').insert({ church_id: state.profile.church_id, title, starts_at: starts });
  if (error) { document.getElementById('formMsg').textContent = 'Não consegui criar: ' + error.message; return; }
  vCultos();
}

async function salvaCulto(id) {
  const title = val('ec-' + id); const starts = dtLocal('ew-' + id);
  if (!title || !starts) return;
  const { error } = await sb.from('services').update({ title, starts_at: starts }).eq('id', id);
  if (error) alert('Não consegui salvar: ' + error.message);
  state.editing = null;
  vCultos();
}

async function delCulto(id, title) {
  if (!confirm(`Excluir o culto "${title}"?`)) return;
  const { error } = await sb.from('services').delete().eq('id', id);
  if (error) alert('Não consegui excluir: ' + error.message);
  vCultos();
}

async function vEventos() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data: evs } = await sb.from('events').select('*').order('starts_at');
  const { data: regs } = await sb.from('event_registrations').select('event_id, profiles(full_name)');
  const byEv = {};
  (regs || []).forEach((r) => { (byEv[r.event_id] = byEv[r.event_id] || []).push(r.profiles?.full_name || 'Membro'); });
  m.innerHTML = `<h1 style="margin-bottom:20px">Eventos</h1>
    ${formCard('Novo evento',
      '<input id="eTitle" placeholder="Nome do evento" /><input id="eDesc" placeholder="Descrição (opcional)" /><input id="eWhen" type="datetime-local" />',
      'Criar evento', 'criaEvento()')}
    ${(evs || []).map((e) => state.editing === e.id
      ? `<div class="card"><div style="display:grid;gap:10px;max-width:560px">
        <input id="ee-${e.id}" value="${esc(e.title)}" />
        <input id="ed-${e.id}" value="${esc(e.description || '')}" placeholder="Descrição (opcional)" />
        <input id="ewhen-${e.id}" type="datetime-local" value="${toLocalInput(e.starts_at)}" />
        <div class="row-actions"><button class="ghost" onclick="salvaEvento('${e.id}')">Salvar</button>
        <button class="ghost" onclick="state.editing=null;vEventos()">Cancelar</button></div></div></div>`
      : `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <strong>${esc(e.title)}</strong><span class="muted">${fmtDT(e.starts_at)}</span></div>
      ${e.description ? `<p class="muted" style="margin-top:6px">${esc(e.description)}</p>` : ''}
      <p style="margin-top:10px"><strong>${(byEv[e.id] || []).length}</strong> inscritos${byEv[e.id] ? ': ' + esc(byEv[e.id].join(', ')) : ''}</p>
      <div class="row-actions" style="margin-top:10px"><button class="ghost" onclick="state.editing='${e.id}';vEventos()">Editar</button>
      <button class="ghost danger" onclick="delEvento('${e.id}','${esc(e.title)}')">Excluir</button></div>
    </div>`).join('') || '<div class="card"><p class="muted">Nenhum evento cadastrado.</p></div>'}`;
}

async function criaEvento() {
  const title = val('eTitle'); const starts = dtLocal('eWhen');
  if (!title || !starts) { document.getElementById('formMsg').textContent = 'Preencha nome e data/hora.'; return; }
  const { error } = await sb.from('events').insert({ church_id: state.profile.church_id, title, description: val('eDesc') || null, starts_at: starts });
  if (error) { document.getElementById('formMsg').textContent = 'Não consegui criar: ' + error.message; return; }
  vEventos();
}

async function salvaEvento(id) {
  const title = val('ee-' + id); const starts = dtLocal('ewhen-' + id);
  if (!title || !starts) return;
  const { error } = await sb.from('events').update({ title, description: val('ed-' + id) || null, starts_at: starts }).eq('id', id);
  if (error) alert('Não consegui salvar: ' + error.message);
  state.editing = null;
  vEventos();
}

async function delEvento(id, title) {
  if (!confirm(`Excluir o evento "${title}"? Inscrições ligadas a ele também saem.`)) return;
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) alert('Não consegui excluir: ' + error.message);
  vEventos();
}

async function vAvisos() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('announcements').select('*').order('published_at', { ascending: false }).limit(30);
  m.innerHTML = `<h1 style="margin-bottom:20px">Avisos</h1>
    ${formCard('Publicar aviso (aparece no app dos membros)',
      '<input id="aTitle" placeholder="Título" /><textarea id="aBody" placeholder="Texto do aviso"></textarea>',
      'Publicar', 'criaAviso()')}
    ${(data || []).map((a) => state.editing === a.id
      ? `<div class="card"><div style="display:grid;gap:10px;max-width:560px">
        <input id="ea-${a.id}" value="${esc(a.title)}" />
        <textarea id="eb-${a.id}">${esc(a.body || '')}</textarea>
        <div class="row-actions"><button class="ghost" onclick="salvaAviso('${a.id}')">Salvar</button>
        <button class="ghost" onclick="state.editing=null;vAvisos()">Cancelar</button></div></div></div>`
      : `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px"><strong>${esc(a.title)}</strong>
      <span class="muted">${fmtDT(a.published_at)}</span></div>
      ${a.body ? `<p class="muted" style="margin-top:6px">${esc(a.body)}</p>` : ''}
      <div class="row-actions" style="margin-top:10px"><button class="ghost" onclick="state.editing='${a.id}';vAvisos()">Editar</button>
      <button class="ghost danger" onclick="delAviso('${a.id}','${esc(a.title)}')">Excluir</button></div></div>`).join('')
      || '<div class="card"><p class="muted">Nenhum aviso publicado.</p></div>'}`;
}

async function criaAviso() {
  const title = val('aTitle');
  if (!title) { document.getElementById('formMsg').textContent = 'Preencha o título.'; return; }
  const { error } = await sb.from('announcements')
    .insert({ church_id: state.profile.church_id, title, body: val('aBody') || null, created_by: state.profile.id });
  if (error) { document.getElementById('formMsg').textContent = 'Não consegui publicar: ' + error.message; return; }
  vAvisos();
}

async function salvaAviso(id) {
  const title = val('ea-' + id);
  if (!title) return;
  const { error } = await sb.from('announcements').update({ title, body: val('eb-' + id) || null }).eq('id', id);
  if (error) alert('Não consegui salvar: ' + error.message);
  state.editing = null;
  vAvisos();
}

async function delAviso(id, title) {
  if (!confirm(`Excluir o aviso "${title}"? Ele some do app dos membros.`)) return;
  const { error } = await sb.from('announcements').delete().eq('id', id);
  if (error) alert('Não consegui excluir: ' + error.message);
  vAvisos();
}

async function vEscalas() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('volunteer_schedules')
    .select('*, profiles(full_name), volunteer_areas(name), services(title, starts_at)')
    .order('created_at', { ascending: false }).limit(100);
  const [{ data: vols }, { data: areas }, { data: cultos }] = await Promise.all([
    sb.from('profiles').select('id, full_name').in('role', ['voluntario', 'lider']).order('full_name'),
    sb.from('volunteer_areas').select('id, name').order('name'),
    sb.from('services').select('id, title, starts_at').gte('starts_at', new Date().toISOString()).order('starts_at'),
  ]);
  m.innerHTML = `<h1 style="margin-bottom:20px">Escalas de voluntários</h1>
    ${formCard('Nova escala',
      `<select id="sVol">${(vols || []).map((v) => `<option value="${v.id}">${esc(v.full_name)}</option>`).join('')}</select>
       <select id="sArea">${(areas || []).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
       <select id="sCulto">${(cultos || []).map((c) => `<option value="${c.id}">${esc(c.title)} · ${fmtDT(c.starts_at)}</option>`).join('')}</select>`,
      'Criar escala', 'criaEscala()')}
    <div class="card"><table>
    <tr><th>Voluntário</th><th>Área</th><th>Culto</th><th>Status</th><th></th></tr>
    ${(data || []).map((r) => `<tr>
      <td>${esc(r.profiles?.full_name)}</td><td>${esc(r.volunteer_areas?.name || '-')}</td>
      <td>${r.services ? esc(r.services.title) + ' · ' + fmtDT(r.services.starts_at) : '-'}</td>
      <td><span class="pill ${r.status}">${r.status}</span></td>
      <td class="row-actions"><button class="ghost danger" onclick="delEscala('${r.id}')">Excluir</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">Nenhuma escala criada.</td></tr>'}
  </table></div>`;
}

async function criaEscala() {
  const payload = { church_id: state.profile.church_id, profile_id: document.getElementById('sVol').value,
    area_id: document.getElementById('sArea').value, service_id: document.getElementById('sCulto').value || null };
  if (!payload.profile_id || !payload.area_id) { document.getElementById('formMsg').textContent = 'Escolha voluntário e área.'; return; }
  const { error } = await sb.from('volunteer_schedules').insert(payload);
  if (error) { document.getElementById('formMsg').textContent = 'Não consegui criar: ' + error.message; return; }
  vEscalas();
}

async function delEscala(id) {
  if (!confirm('Excluir esta escala?')) return;
  const { error } = await sb.from('volunteer_schedules').delete().eq('id', id);
  if (error) alert('Não consegui excluir: ' + error.message);
  vEscalas();
}

const ROLES = [['membro', 'Membro'], ['voluntario', 'Voluntário'], ['lider', 'Líder'], ['secretaria', 'Secretaria'], ['pastor', 'Pastor']];

const maskCpf = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 11 ? d.slice(0, 3) + '.***.***-' + d.slice(9) : '—'; };

async function vMembros() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('profiles').select('*').order('full_name');
  const { data: docs } = await sb.from('profile_private').select('id, cpf');
  const cpfById = {};
  (docs || []).forEach((d) => { cpfById[d.id] = d.cpf; });
  const { data: cons } = await sb.from('consents').select('profile_id, kind, version, accepted_at').order('accepted_at', { ascending: false });
  const termosById = {};
  (cons || []).forEach((c) => { if (c.kind === 'termos' && !termosById[c.profile_id]) termosById[c.profile_id] = c; });
  const podeGerenciar = ['secretaria', 'pastor'].includes(state.profile.role);
  m.innerHTML = `<h1 style="margin-bottom:20px">Membros</h1>
    <div class="card"><table>
    <tr><th>Nome</th><th>CPF</th><th>Papel</th><th>WhatsApp</th><th>Termos</th><th>Desde</th>${podeGerenciar ? '<th></th>' : ''}</tr>
    ${(data || []).map((p) => `<tr>
      <td>${esc(p.full_name)}${p.id === state.profile.id ? ' <span class="muted">(você)</span>' : ''}</td>
      <td class="muted">${podeGerenciar ? maskCpf(cpfById[p.id]) : '***'}</td>
      <td>${podeGerenciar && p.id !== state.profile.id
        ? `<select id="role-${p.id}">${ROLES.map(([k, l]) => `<option value="${k}" ${p.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`
        : esc((ROLES.find(([k]) => k === p.role) || [p.role, p.role])[1])}</td>
      <td>${p.whatsapp_phone ? esc(p.whatsapp_phone) : '<span class="muted">—</span>'}</td>
      <td>${termosById[p.id]
        ? `<span title="${esc(termosById[p.id].version)}">${new Date(termosById[p.id].accepted_at).toLocaleDateString('pt-BR')}</span>`
        : '<span class="muted">pendente</span>'}</td>
      <td class="muted">${new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
      ${podeGerenciar && p.id !== state.profile.id ? `<td class="row-actions"><button class="ghost" onclick="salvaPapel('${p.id}')">Salvar</button></td>` : (podeGerenciar ? '<td></td>' : '')}
    </tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum membro ainda.</td></tr>'}
  </table></div>
  ${podeGerenciar ? '<p class="muted" style="margin-top:12px">Membros novos entram pelo app e aparecem aqui. O papel define o que cada um vê e pode fazer.</p>' : ''}`;
}

async function salvaPapel(id) {
  const role = document.getElementById('role-' + id).value;
  const { error } = await sb.from('profiles').update({ role }).eq('id', id);
  if (error) alert('Não consegui mudar o papel: ' + error.message);
  vMembros();
}

async function vWhatsApp() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data: wa } = await sb.from('church_whatsapp').select('*').eq('church_id', state.profile.church_id).maybeSingle();
  const passos = `<div class="card"><h2>Como conectar (15 min)</h2>
    <ol style="margin:0;padding-left:20px;display:grid;gap:8px;font-size:14px;line-height:1.5">
      <li>Em <strong>developers.facebook.com</strong>, crie um app com o produto <strong>WhatsApp</strong> vinculado ao Business da igreja.</li>
      <li>Adicione o número da igreja (não pode estar ativo no WhatsApp comum/Business app ao mesmo tempo).</li>
      <li>Copie o <strong>Phone number ID</strong> (painel WhatsApp > API Setup) e gere um <strong>token permanente</strong> (System User com permissão whatsapp_business_messaging).</li>
      <li>Cole os dois aqui embaixo e salve.</li>
      <li>Configure o webhook do app na Meta apontando para <code style="font-size:12px">https://oyyvjwppbffhfoyznzdc.supabase.co/functions/v1/whatsapp-webhook</code> com o código de verificação que o suporte te passa na ativação, assinando o campo <strong>messages</strong>.</li>
    </ol></div>`;
  m.innerHTML = `<h1 style="margin-bottom:20px">WhatsApp da igreja</h1>
    ${wa ? `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <div><strong>${esc(wa.display_phone || wa.phone_number_id)}</strong>
        <p class="muted" style="margin:4px 0 0">Phone number ID: ${esc(wa.phone_number_id)}</p></div>
        <span class="pill ${wa.status === 'active' ? 'aceito' : 'pendente'}">${wa.status === 'active' ? 'conectado' : 'pausado'}</span></div>
      <div class="row-actions" style="margin-top:14px">
        <button class="ghost" onclick="waToggle('${wa.status}')">${wa.status === 'active' ? 'Pausar' : 'Reativar'}</button>
        <button class="ghost danger" onclick="waRemove()">Desconectar</button>
      </div>
      <p class="muted" style="margin-top:14px">Conectado por ${esc(wa.connected_by === state.profile.id ? 'você' : 'outro admin')} · token guardado com acesso restrito a pastor/secretaria.</p>
    </div>` : formCard('Conectar número da igreja',
      '<input id="waPhone" placeholder="Número exibido (ex.: +55 21 3333-0000)" /><input id="waPnId" placeholder="Phone number ID (da Meta)" /><input id="waToken" type="password" placeholder="Token permanente da Meta" />',
      'Salvar conexão', 'waSalvar()')}
    ${passos}`;
}

async function waSalvar() {
  const phone_number_id = val('waPnId'); const access_token = val('waToken');
  if (!phone_number_id || !access_token) { document.getElementById('formMsg').textContent = 'Preencha phone number ID e token.'; return; }
  const { error } = await sb.from('church_whatsapp').upsert({
    church_id: state.profile.church_id, phone_number_id,
    display_phone: val('waPhone') || null, access_token, connected_by: state.profile.id,
  });
  if (error) { document.getElementById('formMsg').textContent = 'Não consegui salvar: ' + error.message; return; }
  vWhatsApp();
}

async function waToggle(status) {
  await sb.from('church_whatsapp').update({ status: status === 'active' ? 'paused' : 'active', updated_at: new Date().toISOString() })
    .eq('church_id', state.profile.church_id);
  vWhatsApp();
}

async function waRemove() {
  if (!confirm('Desconectar o WhatsApp da igreja? O assistente para de responder.')) return;
  await sb.from('church_whatsapp').delete().eq('church_id', state.profile.church_id);
  vWhatsApp();
}

async function vCenso() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('census_responses').select('*, profiles(full_name)').order('submitted_at', { ascending: false }).limit(100);
  m.innerHTML = `<h1 style="margin-bottom:20px">Respostas do censo</h1>
    ${(data || []).map((r) => `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px"><strong>${esc(r.profiles?.full_name || 'Anônimo')}</strong>
      <span class="muted">${fmtDT(r.submitted_at)}</span></div>
      <pre style="margin-top:8px;font-size:13px;white-space:pre-wrap;color:var(--muted)">${esc(JSON.stringify(r.payload, null, 2))}</pre>
    </div>`).join('') || '<div class="card"><p class="muted">Nenhuma resposta ainda.</p></div>'}`;
}

async function vContagem() {
  const m = document.getElementById('main');
  m.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('count_sessions').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(50);
  m.innerHTML = `<h1 style="margin-bottom:20px">Contagem de frequência</h1><div class="card"><table>
    <tr><th>Quando</th><th>Tipo</th><th>Área</th><th>Total</th><th>Por</th></tr>
    ${(data || []).map((r) => `<tr><td>${fmtDT(r.created_at)}</td><td>${esc(r.kind)}</td>
      <td>${esc(r.area || '-')}</td><td><strong>${r.total}</strong></td>
      <td>${esc(r.profiles?.full_name || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma contagem registrada.</td></tr>'}
  </table></div>`;
}

init();
