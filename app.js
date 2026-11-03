const STORE_KEY = 'peso-botas-db-v1';
const BASES_KEY = 'peso-botas-bases-v1';
const ACTIVE_BASE_KEY = 'peso-botas-active-base-v1';
let db = null;
let bases = [];
let activeBaseId = null;
let currentPage = 'dashboard';
let weighingType = 'MONOCOLOR';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const fmt = (n, digits=3) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
const fmtPct = n => `${(Number(n||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = v => { if (typeof v === 'number') return v; const n=Number(String(v??'').replace(',','.')); return Number.isFinite(n)?n:0; };
const codeKey = v => String(v ?? '').trim();
function baseStorageKey(id){ return `peso-botas-db-${id}`; }
function save(){
  if(!db) return;
  localStorage.setItem(baseStorageKey(activeBaseId), JSON.stringify(db));
  // Mantém a chave antiga como cópia de compatibilidade para versões anteriores.
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
  const meta=bases.find(x=>x.id===activeBaseId);
  if(meta) meta.updatedAt=new Date().toISOString();
  localStorage.setItem(BASES_KEY, JSON.stringify(bases));
  localStorage.setItem(ACTIVE_BASE_KEY, activeBaseId||'');
}
function makeBaseId(){ return `base-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function unwrapDatabase(payload){
  const incoming=payload?.database && payload?.format==='peso-botas-base' ? payload.database : payload;
  if(!incoming || !Array.isArray(incoming.reduced) || !Array.isArray(incoming.history)) throw new Error('Arquivo incompatível');
  return JSON.parse(JSON.stringify(incoming));
}
function baseExportPayload(){ return {format:'peso-botas-base',formatVersion:1,baseName:bases.find(x=>x.id===activeBaseId)?.name||'Base de dados',exportedAt:new Date().toISOString(),database:db}; }
function addBase(name,database,makeActive=true){
  const id=makeBaseId();
  const clean=JSON.parse(JSON.stringify(database));
  bases.push({id,name:(name||'Nova base').trim()||'Nova base',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),storage:'local'});
  localStorage.setItem(baseStorageKey(id),JSON.stringify(clean));
  if(makeActive){ activeBaseId=id; db=clean; normalizeDatabase(); save(); }
  else localStorage.setItem(BASES_KEY,JSON.stringify(bases));
  return id;
}
function activateBase(id){
  if(id===activeBaseId) return;
  const target=bases.find(x=>x.id===id); if(!target) throw new Error('Base não encontrada');
  save();
  const raw=localStorage.getItem(baseStorageKey(id)); if(!raw) throw new Error('Os dados desta base não foram encontrados neste navegador');
  db=JSON.parse(raw); activeBaseId=id; localStorage.setItem(ACTIVE_BASE_KEY,id); normalizeDatabase(); save();
}
function collectionOf(model){return String(model||'').trim().slice(0,2);}
function normalizeReduced(){
  const byCode=new Map();
  for(const raw of (db.reduced||[])){
    const code=codeKey(raw.code); if(!code) continue;
    const item={...raw,code,modelPrefix:String(raw.modelPrefix||collectionOf(raw.model))};
    if(!byCode.has(code)){byCode.set(code,item);continue;}
    const old=byCode.get(code);
    const colors=[...new Set([...(old.colors||[old.color]),...(item.colors||[item.color])].map(x=>String(x||'').trim()).filter(Boolean))];
    old.colors=colors;
    old.color=colors.length>1?colors.join(' / '):(colors[0]||old.color||item.color||'');
    old.hasBico=!!(old.hasBico||item.hasBico);old.hasPalmilha=!!(old.hasPalmilha||item.hasPalmilha);old.hasMeia=!!(old.hasMeia||item.hasMeia);
    old.sockBySize={...(old.sockBySize||{}),...(item.sockBySize||{})};
    old.model=old.model||item.model;old.modelPrefix=old.modelPrefix||item.modelPrefix;
    if(old.source!=='app'&&item.source==='app')old.source='app';
  }
  db.reduced=[...byCode.values()];
}
function importHistoricalMatrices(){
  const known=new Set((db.matrices||[]).map(m=>`${m.model}|${m.size}|${String(m.code).toLowerCase()}`));
  for(const h of (db.history||[])){
    const collection=String(h.modelPrefix||collectionOf(h.model));
    const size=String(h.size??'').trim(),code=String(h.matrix??'').trim();
    if(!collection||!size||!code)continue;
    const key=`${collection}|${size}|${code.toLowerCase()}`;
    if(known.has(key))continue;
    db.matrices.push({id:`history-matrix-${collection}-${size}-${code}`.replace(/[^a-zA-Z0-9_-]/g,'_'),model:collection,collection,size,code,createdAt:h.createdAt||null,source:'historico'});
    known.add(key);
  }
  db.matrices=(db.matrices||[]).filter((m,i,arr)=>arr.findIndex(x=>String(x.model)===String(m.model)&&String(x.size)===String(m.size)&&String(x.code).toLowerCase()===String(m.code).toLowerCase())===i);
}
function normalizeDatabase(){
  db.matrices ||= []; db.history ||= []; db.reduced ||= []; db.collection ||= []; db.systemWeights ||= {}; db.accessoryTables ||= {};
  normalizeReduced();importHistoricalMatrices();
}
async function init(){
  // Remove configurações e tokens remanescentes da tentativa antiga de integração com OneDrive.
  for(const key of Object.keys(localStorage)){if(key==='peso-botas-ms-client-id-v1'||key.startsWith('peso-botas-onedrive-config-'))localStorage.removeItem(key);}
  for(const key of Object.keys(sessionStorage)){if(key.startsWith('peso-botas-od-'))sessionStorage.removeItem(key);}
  try{ bases=JSON.parse(localStorage.getItem(BASES_KEY)||'[]'); }catch(e){ bases=[]; }
  activeBaseId=localStorage.getItem(ACTIVE_BASE_KEY)||null;
  if(bases.length){
    if(!bases.some(x=>x.id===activeBaseId)) activeBaseId=bases[0].id;
    const saved=localStorage.getItem(baseStorageKey(activeBaseId));
    if(saved){ try{db=JSON.parse(saved);}catch(e){db=null;} }
  }
  // Migração automática de quem já utilizava as versões 0.1.0–0.1.2.
  if(!db){
    const legacy=localStorage.getItem(STORE_KEY);
    if(legacy){ try{db=JSON.parse(legacy);}catch(e){db=null;} }
  }
  if(!db){
    if(window.PESO_BOTAS_INITIAL_DATA){db=JSON.parse(JSON.stringify(window.PESO_BOTAS_INITIAL_DATA));}
    else{const r=await fetch('./data-inicial.json');db=await r.json();}
    db.createdAt=new Date().toISOString();
  }
  if(!activeBaseId || !bases.some(x=>x.id===activeBaseId)){
    activeBaseId=makeBaseId();
    bases=[{id:activeBaseId,name:'Base principal',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),storage:'local'}];
  }
  normalizeDatabase();
  save();
  bindNavigation(); bindGlobalActions(); renderAll();
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
function notify(msg,error=false){const el=$('#notice');el.textContent=msg;el.hidden=false;el.classList.toggle('error',error);window.clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.hidden=true,4500);}
window.PesoBotasNotify=notify;
function bindNavigation(){ $$('#main-nav [data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page))); }
function go(page){ currentPage=page; $$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`)); $$('#main-nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page)); const titles={dashboard:'Visão geral',weighing:'Nova pesagem',history:'Histórico',matrices:'Matrizaria',registrations:'Cadastros',reports:'Relatórios',bases:'Bases de dados'}; $('#page-title').textContent=titles[page]||'Peso de Botas'; renderPage(page); }
function bindGlobalActions(){
  $('#export-backup').addEventListener('click',()=>downloadFile(`backup-peso-botas-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(baseExportPayload(),null,2),'application/json'));
  $('#import-backup').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const incoming=unwrapDatabase(JSON.parse(await f.text()));if(!confirm('Restaurar este backup na base atualmente selecionada? Os dados atuais dessa base serão substituídos.'))return;db=incoming;normalizeDatabase();save();renderAll();notify('Backup restaurado na base atual.');}catch(err){notify('Não foi possível restaurar: arquivo inválido.',true);}e.target.value='';});
}
function downloadFile(name,content,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
function renderAll(){renderPage('dashboard');}
function renderPage(page){({dashboard:renderDashboard,weighing:renderWeighing,history:renderHistory,matrices:renderMatrices,registrations:renderRegistrations,reports:renderReports,bases:renderBases}[page]||renderDashboard)();}
function stats(){const active=db.history.filter(x=>!x.deleted);return {records:active.length,reduced:new Set(db.reduced.map(x=>x.code)).size,models:new Set(db.reduced.map(x=>x.model)).size,matrices:db.matrices.length,uniqueWeighed:new Set(active.map(x=>`${x.model}|${x.size}|${x.matrix}`)).size};}
function renderDashboard(){const s=stats();const recent=[...db.history].filter(x=>!x.deleted).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,7);$('#page-dashboard').innerHTML=`
  <div class="grid stats">
    <div class="card"><div class="stat-label">Pesagens registradas</div><div class="stat-value">${s.records}</div><div class="stat-foot">Inclui histórico importado</div></div>
    <div class="card"><div class="stat-label">Modelos cadastrados</div><div class="stat-value">${s.models}</div><div class="stat-foot">A partir da base da planilha</div></div>
    <div class="card"><div class="stat-label">Reduzidos cadastrados</div><div class="stat-value">${s.reduced}</div><div class="stat-foot">Configuração de acessórios carregada</div></div>
    <div class="card"><div class="stat-label">Matrizes identificadas</div><div class="stat-value">${s.uniqueWeighed}</div><div class="stat-foot">Matrizes distintas já pesadas</div></div>
  </div>
  <div class="grid dashboard-grid">
    <div class="card"><div class="section-head"><div><h2>Pesagens recentes</h2><p>Últimos registros adicionados</p></div><button class="button" data-go="history">Ver histórico</button></div>
      ${recent.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Reduzido</th><th>Tam.</th><th>Matriz</th><th>Peso líquido</th></tr></thead><tbody>${recent.map(x=>`<tr><td><span class="tag ${x.type==='BICOLOR'?'blue':''}">${x.type==='BICOLOR'?'Bicolor':'Monocolor'}</span></td><td>${esc(x.reduced)}</td><td>${esc(x.size)}</td><td>${esc(x.matrix)}</td><td class="number"><strong>${fmt(x.net)} kg</strong></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhuma pesagem registrada ainda.</div>'}
    </div>
    <div class="card"><div class="section-head"><div><h2>Atalhos</h2><p>Operações principais</p></div></div><div class="mini-list"><div class="mini-row"><span>Registrar nova pesagem</span><button class="button button-primary" data-go="weighing">Iniciar</button></div><div class="mini-row"><span>Cadastrar matriz</span><button class="button" data-go="matrices">Abrir</button></div><div class="mini-row"><span>Consultar consumo médio</span><button class="button" data-go="reports">Relatórios</button></div></div><div class="muted-box">A base inicial foi carregada da planilha. Os registros antigos de monocolor foram preservados como histórico importado. As bases podem ser exportadas e transferidas em arquivo JSON.</div></div>
  </div>`;
  $$('[data-go]',$('#page-dashboard')).forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
}
function renderBases(){
  const active=bases.find(x=>x.id===activeBaseId);
  const options=bases.map(b=>`<option value="${esc(b.id)}" ${b.id===activeBaseId?'selected':''}>${esc(b.name)}${b.id===activeBaseId?' (em uso)':''}</option>`).join('');
  const sorted=[...bases].sort((a,b)=>a.id===activeBaseId?-1:b.id===activeBaseId?1:String(a.name).localeCompare(String(b.name)));
  $('#page-bases').innerHTML=`
    <div class="card">
      <div class="section-head"><div><h2>Base atualmente em uso</h2><p>Os registros desta base ficam separados das demais bases salvas neste navegador.</p></div><span class="tag green">Ativa</span></div>
      <div class="base-current"><div><strong>${esc(active?.name||'Base principal')}</strong><small>${db.history.filter(x=>!x.deleted).length} pesagens · ${db.reduced.length} reduzidos · ${db.matrices.length} matrizes</small></div><span class="tag">Armazenamento local</span></div>
    </div>
    <div class="grid split" style="margin-top:16px">
      <div class="card"><h2>Trocar de base</h2><p class="subtle">Selecione outra base já importada ou criada neste navegador.</p><div class="field" style="margin-top:14px"><label for="base-select">Base disponível</label><select id="base-select">${options}</select></div><div class="form-actions"><button class="button button-primary" id="base-switch" ${bases.length<2?'disabled':''}>Usar esta base</button></div>
      <div class="muted-box">Trocar de base não mistura nem apaga os dados. Cada base mantém seu próprio histórico, reduzidos, matrizes e configurações.</div></div>
      <div class="card"><h2>Transferir para outro responsável</h2><p class="subtle">Exporte a base completa e envie o arquivo para a pessoa que assumirá o aplicativo.</p><div class="mini-list" style="margin-top:12px"><div class="mini-row"><span>Exportar base completa</span><button class="button" id="base-export">Exportar JSON</button></div><div class="mini-row"><span>Importar como nova base</span><label class="button file-button">Importar JSON<input type="file" id="base-import" accept="application/json" hidden /></label></div></div><div class="muted-box">A importação cria uma base separada e não substitui a base atual. O arquivo inclui histórico, reduzidos, matrizes, coleções e tabelas de peso.</div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="section-head"><div><h2>Bases neste dispositivo</h2><p>${bases.length} base(s) cadastrada(s)</p></div><button class="button" id="base-new">Criar base nova</button></div><div class="table-wrap"><table><thead><tr><th>Nome</th><th>Pesagens</th><th>Última alteração</th><th>Armazenamento</th><th>Status</th></tr></thead><tbody>${sorted.map(b=>{let data={history:[],reduced:[],matrices:[]};try{data=JSON.parse(localStorage.getItem(baseStorageKey(b.id))||'{}');}catch(e){}return `<tr><td><strong>${esc(b.name)}</strong></td><td>${(data.history||[]).filter(x=>!x.deleted).length}</td><td>${b.updatedAt?new Date(b.updatedAt).toLocaleString('pt-BR'):'—'}</td><td>Este navegador</td><td>${b.id===activeBaseId?'<span class="tag green">Em uso</span>':'<span class="tag">Disponível</span>'}</td></tr>`;}).join('')}</tbody></table></div></div>`;
  $('#base-switch').addEventListener('click',()=>{const id=$('#base-select').value;if(id===activeBaseId){notify('Esta base já está em uso.');return;}if(!confirm('Trocar para a base selecionada? A base atual será salva automaticamente.'))return;try{activateBase(id);renderAll();go('bases');notify('Base alterada com sucesso.');}catch(e){notify(e.message||'Não foi possível trocar de base.',true);}});
  $('#base-export').addEventListener('click',()=>downloadFile(`base-peso-botas-${(active?.name||'dados').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(baseExportPayload(),null,2),'application/json'));
  $('#base-import').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const payload=JSON.parse(await f.text());const incoming=unwrapDatabase(payload);const suggested=payload.baseName||f.name.replace(/\.json$/i,'');const name=prompt('Nome para esta nova base:',suggested||'Base importada');if(name===null)return;save();addBase(name,incoming,true);renderAll();go('bases');notify('Base importada e ativada. A base anterior foi preservada.');}catch(err){notify('Não foi possível importar: arquivo inválido ou incompatível.',true);}e.target.value='';});
  $('#base-new').addEventListener('click',()=>{const name=prompt('Nome da nova base:','Nova base');if(name===null||!name.trim())return;if(!confirm('Criar uma base nova com os cadastros e tabelas padrão, mas sem histórico de pesagens?'))return;let fresh=window.PESO_BOTAS_INITIAL_DATA?JSON.parse(JSON.stringify(window.PESO_BOTAS_INITIAL_DATA)):JSON.parse(JSON.stringify(db));fresh.history=[];fresh.matrices=[];fresh.createdAt=new Date().toISOString();save();addBase(name,fresh,true);normalizeDatabase();save();renderAll();go('bases');notify('Nova base criada.');});
}

function reducedByCode(code){return db.reduced.find(x=>x.code===codeKey(code));}
function accessoryInfo(red,size){const t=db.accessoryTables||{};const num=(t.numbering||{})[String(size)]||{};const sock=(red.sockBySize||{})[String(size)]||'N';const bico=red.hasBico?number((t.bico||{})[String(num.bico_num)]):0;const palmilha=red.hasPalmilha?number((t.palmilha||{})[String(num.palmilha_num)]):0;const meia=red.hasMeia?number((t.meia||{})[sock]):0;return {bico: bico||0,palmilha:palmilha||0,meia:meia||0,bicoNum:red.hasBico?num.bico_num:'N',palmilhaNum:red.hasPalmilha?num.palmilha_num:'N',meiaType:red.hasMeia?sock:'N'};}
function systemWeight(code,size){const arr=db.systemWeights?.[codeKey(code)]||[];const first=arr[0];return first?.weights?.[String(size)]??null;}
function matricesFor(model,size){return db.matrices.filter(x=>String(x.model)===String(model)&&String(x.size)===String(size));}
function renderWeighing(){
 const reds=db.reduced.filter((r,i,a)=>a.findIndex(x=>codeKey(x.code)===codeKey(r.code))===i).slice().sort((a,b)=>a.code.localeCompare(b.code));
 $('#page-weighing').innerHTML=`<div class="form-layout"><div class="card form-card"><h2>Dados da pesagem</h2><p class="subtle">Selecione o reduzido e a numeração. Os acessórios serão calculados automaticamente.</p>
 <div class="type-switch"><button data-type="MONOCOLOR" class="${weighingType==='MONOCOLOR'?'active':''}">MONOCOLOR</button><button data-type="BICOLOR" class="${weighingType==='BICOLOR'?'active':''}">BICOLOR</button></div>
 <form id="weigh-form"><div class="field-grid">
 <div class="field"><label for="w-reduced">Reduzido</label><select id="w-reduced" required><option value="">Selecione...</option>${reds.map(r=>`<option value="${esc(r.code)}">${esc(r.code)} · ${esc(r.model)}</option>`).join('')}</select></div>
 <div class="field"><label for="w-size">Numeração</label><select id="w-size" required disabled><option value="">Selecione o reduzido</option></select></div>
 <div class="field"><label for="w-matrix">Número da matriz</label><input id="w-matrix" required placeholder="Informe a matriz" /></div>
 <div class="field"><label for="w-color">Cor</label><input id="w-color" readonly placeholder="Automático pelo reduzido" /></div>
 <div class="field full"><label>Acessórios identificados</label><div class="pill-list" id="w-accessory-tags"><span class="pill">Selecione um reduzido</span></div></div>
 <div class="divider-title">${weighingType==='MONOCOLOR'?'Peso da bota':'Pesagem bicolor · primeiro as solas, depois as botas completas'}</div>
 ${weighingType==='MONOCOLOR'?`<div class="field"><label for="w-right">Pé direito (kg)</label><input id="w-right" type="number" min="0" step="0.001" required placeholder="0,000" /></div><div class="field"><label for="w-left">Pé esquerdo (kg)</label><input id="w-left" type="number" min="0" step="0.001" required placeholder="0,000" /></div>`:`<div class="field"><label for="w-sole-right">Sola direita (kg)</label><input id="w-sole-right" type="number" min="0" step="0.001" required placeholder="0,000" /></div><div class="field"><label for="w-sole-left">Sola esquerda (kg)</label><input id="w-sole-left" type="number" min="0" step="0.001" required placeholder="0,000" /></div><div class="field"><label for="w-boot-right">Bota completa direita (kg)</label><input id="w-boot-right" type="number" min="0" step="0.001" required placeholder="0,000" /></div><div class="field"><label for="w-boot-left">Bota completa esquerda (kg)</label><input id="w-boot-left" type="number" min="0" step="0.001" required placeholder="0,000" /></div><div class="field full"><label>Canos calculados automaticamente</label><div class="pill-list" id="w-cane-preview"><span class="pill">Aguardando os pesos</span></div></div>`}
 <div class="field full"><label for="w-notes">Observações (opcional)</label><input id="w-notes" placeholder="Ex.: lote, turno ou observação da pesagem" /></div>
 </div><div class="form-actions"><button class="button button-primary" type="submit">Salvar pesagem</button></div></form></div>
 <aside class="card result-card"><h2>Resultado calculado</h2><p class="subtle">Valores atualizados durante o preenchimento</p><div class="result-main"><span>Peso líquido do par</span><strong id="preview-net">— kg</strong></div><div id="preview-lines"><div class="result-line"><span>Peso bruto do par</span><strong>—</strong></div><div class="result-line"><span>Desconto de acessórios</span><strong>—</strong></div><div class="result-line"><span>Peso do sistema</span><strong>—</strong></div></div><div class="muted-box" id="preview-help">Preencha os dados para visualizar o cálculo. Todos os pesos são tratados em quilogramas.</div></aside></div>`;
 $$('.type-switch button').forEach(b=>b.addEventListener('click',()=>{weighingType=b.dataset.type;renderWeighing();}));
 $('#w-reduced').addEventListener('change',updateWeighingMeta);$('#w-size').addEventListener('change',updatePreview);
 $$('input[type="number"]',$('#weigh-form')).forEach(i=>i.addEventListener('input',updatePreview));
 $('#weigh-form').addEventListener('submit',saveWeighing);
}
function updateWeighingMeta(){const red=reducedByCode($('#w-reduced').value);const sizeSel=$('#w-size');if(!red){sizeSel.disabled=true;sizeSel.innerHTML='<option value="">Selecione o reduzido</option>';$('#w-color').value='';$('#w-accessory-tags').innerHTML='<span class="pill">Selecione um reduzido</span>';updatePreview();return;}
 const sizes=new Set(Object.keys(red.sockBySize||{}));db.collection.filter(x=>String(x.model)===String(red.model)).forEach(x=>sizes.add(String(x.size)));Object.keys(db.systemWeights?.[red.code]?.[0]?.weights||{}).forEach(s=>sizes.add(s));const ordered=[...sizes].sort((a,b)=>Number(a)-Number(b));sizeSel.disabled=false;sizeSel.innerHTML='<option value="">Selecione...</option>'+ordered.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');$('#w-color').value=red.color||'';$('#w-accessory-tags').innerHTML=[['Bico',red.hasBico],['Palmilha',red.hasPalmilha],['Meia',red.hasMeia]].map(([n,on])=>`<span class="pill">${on?'✓':'—'} ${n}</span>`).join('');updatePreview();}
function calculateCurrent(){const red=reducedByCode($('#w-reduced')?.value);const size=$('#w-size')?.value;if(!red||!size)return null;const acc=accessoryInfo(red,size);let gross=0,solePair=null,caneR=null,caneL=null,right=0,left=0;
 if(weighingType==='MONOCOLOR'){right=number($('#w-right')?.value);left=number($('#w-left')?.value);gross=right+left;}
 else {const sr=number($('#w-sole-right')?.value),sl=number($('#w-sole-left')?.value);const br=number($('#w-boot-right')?.value),bl=number($('#w-boot-left')?.value);solePair=sr+sl;caneR=br-sr;caneL=bl-sl;right=br;left=bl;gross=br+bl;}
 const deduction=acc.bico+acc.palmilha+acc.meia;const net=gross-deduction;return {red,size,acc,gross,deduction,net,right,left,solePair,caneR,caneL,system:systemWeight(red.code,size)};}
function updatePreview(){const x=calculateCurrent();if(!x){$('#preview-net').textContent='— kg';$('#preview-lines').innerHTML='<div class="result-line"><span>Peso bruto do par</span><strong>—</strong></div><div class="result-line"><span>Desconto de acessórios</span><strong>—</strong></div><div class="result-line"><span>Peso do sistema</span><strong>—</strong></div>';return;}
 $('#preview-net').textContent=`${fmt(x.net)} kg`;const sys=x.system==null?'Não localizado':`${fmt(x.system)} kg`;const detail=weighingType==='BICOLOR'?`<div class="result-line"><span>Par de solas</span><strong>${fmt(x.solePair)} kg</strong></div><div class="result-line"><span>Par de canos</span><strong>${fmt(x.caneR+x.caneL)} kg</strong></div>`:'';
 $('#preview-lines').innerHTML=`<div class="result-line"><span>Peso bruto do par</span><strong>${fmt(x.gross)} kg</strong></div>${detail}<div class="result-line"><span>Desconto bico</span><strong>− ${fmt(x.acc.bico)} kg</strong></div><div class="result-line"><span>Desconto palmilha</span><strong>− ${fmt(x.acc.palmilha)} kg</strong></div><div class="result-line"><span>Desconto meia</span><strong>− ${fmt(x.acc.meia)} kg</strong></div><div class="result-line"><span>Peso do sistema*</span><strong>${sys}</strong></div>`;
 $('#preview-help').textContent=x.net<0?'Atenção: o peso líquido ficou negativo. Confira os valores.':'* Comparação de referência importada da primeira linha encontrada para o reduzido na aba PESO SISTEMA.';
 if(weighingType==='BICOLOR')$('#w-cane-preview').innerHTML=`<span class="pill">Cano direito: ${fmt(x.caneR)} kg</span><span class="pill">Cano esquerdo: ${fmt(x.caneL)} kg</span>`;
}
function saveWeighing(e){e.preventDefault();const x=calculateCurrent();if(!x){notify('Selecione o reduzido e a numeração.',true);return;}const matrix=$('#w-matrix').value.trim();if(!matrix){notify('Informe o número da matriz.',true);return;}if(x.gross<=0){notify('Informe os pesos da pesagem.',true);return;}if(x.net<0){notify('O peso líquido não pode ser negativo. Confira os pesos e acessórios.',true);return;}if(weighingType==='BICOLOR'&&(x.caneR<0||x.caneL<0)){notify('O peso da bota completa deve ser maior ou igual ao peso da sola em cada lado.',true);return;}
 const record={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),type:weighingType,createdAt:new Date().toISOString(),date:new Date().toISOString().slice(0,10),reduced:x.red.code,model:x.red.model,modelPrefix:String(x.red.model).slice(0,2),color:x.red.color,size:x.size,matrix,right:x.right,left:x.left,gross:x.gross,soleRight:weighingType==='BICOLOR'?number($('#w-sole-right').value):null,soleLeft:weighingType==='BICOLOR'?number($('#w-sole-left').value):null,caneRight:x.caneR,caneLeft:x.caneL,solePair:x.solePair,accessories:{bico:x.acc.bicoNum,palmilha:x.acc.palmilhaNum,meia:x.acc.meiaType},accessoryWeights:{bico:x.acc.bico,palmilha:x.acc.palmilha,meia:x.acc.meia},deduction:x.deduction,net:x.net,systemWeight:x.system,notes:$('#w-notes').value.trim(),source:'app'};
 db.history.push(record);save();notify('Pesagem salva com sucesso.');go('history');}
function renderHistory(){const rows=[...db.history].filter(x=>!x.deleted).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));$('#page-history').innerHTML=`<div class="toolbar"><input id="history-search" placeholder="Buscar reduzido, modelo ou matriz..." /><select id="history-type"><option value="">Todos os tipos</option><option value="MONOCOLOR">Monocolor</option><option value="BICOLOR">Bicolor</option></select><button class="button" id="history-csv">Exportar CSV</button></div><div class="card"><div class="section-head"><div><h2>Registros de pesagem</h2><p>${rows.length} registros disponíveis</p></div></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Reduzido</th><th>Modelo</th><th>Tam.</th><th>Matriz</th><th>Peso bruto</th><th>Desconto</th><th>Peso líquido</th><th></th></tr></thead><tbody id="history-rows">${historyRows(rows)}</tbody></table></div></div>`;
 const filter=()=>{const q=$('#history-search').value.toLowerCase(),t=$('#history-type').value;const filtered=rows.filter(x=>(!t||x.type===t)&&[x.reduced,x.model,x.matrix,x.color].join(' ').toLowerCase().includes(q));$('#history-rows').innerHTML=historyRows(filtered);bindDeleteHistory();};$('#history-search').addEventListener('input',filter);$('#history-type').addEventListener('change',filter);$('#history-csv').addEventListener('click',()=>exportCsv(rows,'historico-pesagens.csv'));bindDeleteHistory();}
function historyRows(rows){if(!rows.length)return '<tr><td colspan="10" class="empty">Nenhum registro encontrado.</td></tr>';return rows.map(x=>`<tr><td>${x.date?new Date(`${x.date}T12:00:00`).toLocaleDateString('pt-BR'):'Importado'}</td><td><span class="tag ${x.type==='BICOLOR'?'blue':''}">${x.type==='BICOLOR'?'Bicolor':'Monocolor'}</span></td><td>${esc(x.reduced)}</td><td>${esc(x.model)}</td><td>${esc(x.size)}</td><td>${esc(x.matrix)}</td><td class="number">${fmt(x.gross)}</td><td class="number">${fmt(x.deduction??Object.values(x.accessoryWeights||{}).reduce((a,b)=>a+number(b),0))}</td><td class="number"><strong>${fmt(x.net)} kg</strong></td><td>${x.source==='planilha'?'<span class="tag">Planilha</span>':`<button class="button button-danger" data-delete="${esc(x.id)}">Excluir</button>`}</td></tr>`).join('');}
function bindDeleteHistory(){$$('[data-delete]',$('#page-history')).forEach(b=>b.addEventListener('click',()=>{if(!confirm('Excluir esta pesagem?'))return;db.history=db.history.filter(x=>x.id!==b.dataset.delete);save();renderHistory();notify('Registro excluído.');}));}
function renderMatrices(){const models=[...new Set([...db.reduced.map(x=>String(x.modelPrefix||collectionOf(x.model))),...db.matrices.map(x=>String(x.model))])].sort();const byModelSize={};db.matrices.forEach(m=>{const k=`${m.model}|${m.size}`;(byModelSize[k]||= []).push(m);});const inventory=db.collection;
 $('#page-matrices').innerHTML=`<div class="grid split"><div class="card"><h2>Cadastrar matriz</h2><p class="subtle">Vincule o número da matriz à coleção (identificada pelos dois primeiros números do modelo) e ao tamanho.</p><form id="matrix-form" class="inline-form"><select id="matrix-model" required><option value="">Coleção</option>${models.map(m=>`<option>${esc(m)}</option>`).join('')}</select><select id="matrix-size" required><option value="">Tamanho</option></select><input id="matrix-code" required placeholder="Nº da matriz" /><button class="button button-primary">Adicionar</button></form><div class="muted-box">A planilha COLEÇÃO informa a quantidade de matrizes por modelo e tamanho, mas não traz os números individuais. Por isso, a lista de números precisa ser cadastrada aqui. A quantidade importada continua visível separadamente.</div></div><div class="card"><h2>Resumo da coleção importada</h2><p class="subtle">Quantidades da aba COLEÇÃO</p><div class="mini-list">${inventory.map(x=>`<div class="mini-row"><span>Modelo ${esc(x.model)} · Tam. ${esc(x.size)} <small>(${esc(x.line)})</small></span><strong>${x.quantity} un.</strong></div>`).join('')}</div></div></div>
 <div class="card" style="margin-top:16px"><div class="section-head"><div><h2>Matrizes cadastradas</h2><p>${db.matrices.length} números cadastrados individualmente</p></div><input id="matrix-search" placeholder="Filtrar modelo, tamanho ou matriz" /></div><div class="table-wrap"><table><thead><tr><th>Coleção</th><th>Tamanho</th><th>Nº da matriz</th><th>Pesagens</th><th>Última pesagem</th><th>Origem</th><th></th></tr></thead><tbody id="matrix-rows">${matrixRows(db.matrices)}</tbody></table></div></div>`;
 $('#matrix-model').addEventListener('change',e=>{const model=e.target.value;const sizes=new Set(db.collection.filter(x=>String(x.model)===model).map(x=>String(x.size)));db.reduced.filter(x=>String(x.modelPrefix||String(x.model).slice(0,2))===model).forEach(x=>Object.keys(x.sockBySize||{}).forEach(s=>sizes.add(s)));$('#matrix-size').innerHTML='<option value="">Tamanho</option>'+[...sizes].sort((a,b)=>Number(a)-Number(b)).map(s=>`<option>${esc(s)}</option>`).join('');});
 $('#matrix-form').addEventListener('submit',e=>{e.preventDefault();const model=$('#matrix-model').value,size=$('#matrix-size').value,code=$('#matrix-code').value.trim();if(db.matrices.some(x=>String(x.model)===model&&String(x.size)===size&&x.code.toLowerCase()===code.toLowerCase())){notify('Esta matriz já está cadastrada para o modelo e tamanho.',true);return;}db.matrices.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),model,collection:model,size,code,createdAt:new Date().toISOString(),source:'app'});save();renderMatrices();notify('Matriz cadastrada.');});
 $('#matrix-search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();$('#matrix-rows').innerHTML=matrixRows(db.matrices.filter(m=>[m.model,m.size,m.code].join(' ').toLowerCase().includes(q)));bindMatrixDelete();});bindMatrixDelete();}
function matrixRows(mats){if(!mats.length)return '<tr><td colspan="7" class="empty">Nenhuma matriz individual cadastrada.</td></tr>';return mats.map(m=>{const uses=db.history.filter(h=>!h.deleted&&String(h.modelPrefix||String(h.model).slice(0,2))===String(m.model)&&String(h.size)===String(m.size)&&String(h.matrix)===String(m.code));const last=uses.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0];return `<tr><td>${esc(m.collection||m.model)}</td><td>${esc(m.size)}</td><td><strong>${esc(m.code)}</strong></td><td>${uses.length}</td><td>${last?.date?new Date(`${last.date}T12:00:00`).toLocaleDateString('pt-BR'):'—'}</td><td><span class="tag">${m.source==='historico'?'Histórico':'App'}</span></td><td><button class="button button-danger" data-matrix-delete="${esc(m.id)}">Excluir</button></td></tr>`;}).join('');}
function bindMatrixDelete(){$$('[data-matrix-delete]',$('#page-matrices')).forEach(b=>b.addEventListener('click',()=>{if(!confirm('Excluir esta matriz do cadastro? Os registros de pesagem não serão apagados.'))return;db.matrices=db.matrices.filter(m=>m.id!==b.dataset.matrixDelete);save();renderMatrices();notify('Matriz removida do cadastro.');}));}
function renderRegistrations(){const red=db.reduced.slice().sort((a,b)=>a.code.localeCompare(b.code));$('#page-registrations').innerHTML=`<div class="grid split"><div class="card"><h2>Cadastrar reduzido</h2><p class="subtle">Defina o modelo, cor e acessórios utilizados.</p><form id="reduced-form" class="field-grid"><div class="field"><label>Código do reduzido</label><input id="r-code" required /></div><div class="field"><label>Modelo</label><input id="r-model" required placeholder="Ex.: 85BPL600" /></div><div class="field"><label>Cor</label><input id="r-color" placeholder="Ex.: PR" /></div><div class="field"><label>Tipo de pesagem</label><select id="r-type"><option value="MONOCOLOR">Monocolor</option><option value="BICOLOR">Bicolor</option></select></div><div class="field full"><label>Acessórios</label><div class="pill-list"><label class="pill"><input type="checkbox" id="r-bico" /> Bico</label><label class="pill"><input type="checkbox" id="r-palmilha" /> Palmilha</label><label class="pill"><input type="checkbox" id="r-meia" /> Meia</label></div></div><div class="field full"><button class="button button-primary">Salvar reduzido</button></div></form></div><div class="card"><h2>Base de acessórios</h2><p class="subtle">Pesos importados da aba PESO ACESSÓRIOS.</p><div class="mini-list">${Object.entries(db.accessoryTables.bico||{}).map(([n,w])=>`<div class="mini-row"><span>Bico nº ${esc(n)}</span><strong>${fmt(w)} kg</strong></div>`).join('')}${Object.entries(db.accessoryTables.palmilha||{}).map(([n,w])=>`<div class="mini-row"><span>Palmilha nº ${esc(n)}</span><strong>${fmt(w)} kg</strong></div>`).join('')}${Object.entries(db.accessoryTables.meia||{}).map(([n,w])=>`<div class="mini-row"><span>Meia ${esc(n)}</span><strong>${fmt(w)} kg</strong></div>`).join('')}</div><div class="muted-box">Nesta primeira versão, os pesos padrão são consultados da planilha. A edição das tabelas de pesos será incluída após validarmos as regras de cálculo.</div></div></div>
 <div class="card" style="margin-top:16px"><div class="section-head"><div><h2>Reduzidos cadastrados</h2><p>${red.length} configurações</p></div><input id="reduced-search" placeholder="Buscar código, modelo ou cor" /></div><div class="table-wrap"><table><thead><tr><th>Reduzido</th><th>Modelo</th><th>Cor</th><th>Bico</th><th>Palmilha</th><th>Meia</th><th>Origem</th></tr></thead><tbody id="reduced-rows">${reducedRows(red)}</tbody></table></div></div>`;
 $('#reduced-form').addEventListener('submit',e=>{e.preventDefault();const code=$('#r-code').value.trim();if(reducedByCode(code)){notify('Este reduzido já está cadastrado.',true);return;}db.reduced.push({code,model:$('#r-model').value.trim(),color:$('#r-color').value.trim(),type:$('#r-type').value,hasBico:$('#r-bico').checked,hasPalmilha:$('#r-palmilha').checked,hasMeia:$('#r-meia').checked,sockBySize:{},modelPrefix:$('#r-model').value.trim().slice(0,2),source:'app'});save();renderRegistrations();notify('Reduzido cadastrado.');});
 $('#reduced-search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();$('#reduced-rows').innerHTML=reducedRows(db.reduced.filter(r=>[r.code,r.model,r.color].join(' ').toLowerCase().includes(q)));});}
function reducedRows(list){return list.map(r=>`<tr><td><strong>${esc(r.code)}</strong></td><td>${esc(r.model)}</td><td>${esc(r.color)}</td><td>${r.hasBico?'Sim':'Não'}</td><td>${r.hasPalmilha?'Sim':'Não'}</td><td>${r.hasMeia?'Sim':'Não'}</td><td><span class="tag">${r.source==='planilha'?'Planilha':'App'}</span></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhum reduzido encontrado.</td></tr>';}
function renderReports(){const types=['MONOCOLOR','BICOLOR'];const rows=db.history.filter(x=>!x.deleted);const codes=[...new Set(rows.map(x=>x.reduced))].sort();$('#page-reports').innerHTML=`<div class="toolbar"><select id="report-type"><option value="">Todos os tipos</option><option value="MONOCOLOR">Monocolor</option><option value="BICOLOR">Bicolor</option></select><select id="report-reduced"><option value="">Todos os reduzidos</option>${codes.map(c=>`<option>${esc(c)}</option>`).join('')}</select><input id="report-size" placeholder="Numeração" /><button class="button" id="report-csv">Exportar CSV</button></div><div class="grid stats" id="report-stats"></div><div class="card"><div class="section-head"><div><h2>Consumo médio por matriz</h2><p>O agrupamento mantém cada matriz separada.</p></div></div><div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Reduzido</th><th>Modelo</th><th>Tam.</th><th>Matriz</th><th>Pesagens</th><th>Média líquida</th><th>Peso sistema</th><th>Diferença</th></tr></thead><tbody id="report-rows"></tbody></table></div></div><div class="muted-box">Observação sobre a base original: a aba PESO SISTEMA pode conter mais de uma linha de material para o mesmo reduzido. A fórmula da planilha retorna a primeira correspondência. A versão Web reproduz essa referência para manter comparabilidade, mas a regra de composição do peso de sistema deve ser validada antes da versão definitiva.</div>`;
 const apply=()=>{const t=$('#report-type').value,c=$('#report-reduced').value,s=$('#report-size').value.trim();const filtered=rows.filter(x=>(!t||x.type===t)&&(!c||x.reduced===c)&&(!s||String(x.size)===s));const groups={};filtered.forEach(x=>{const k=[x.type,x.reduced,x.model,x.size,x.matrix].join('|');(groups[k]||=[]).push(x);});const arr=Object.values(groups).map(g=>{const avg=g.reduce((a,x)=>a+number(x.net),0)/g.length;const sys=g.find(x=>x.systemWeight!=null)?.systemWeight??null;return {type:g[0].type,reduced:g[0].reduced,model:g[0].model,size:g[0].size,matrix:g[0].matrix,count:g.length,avg,sys,diff:sys==null?null:avg-number(sys)};}).sort((a,b)=>String(a.reduced).localeCompare(String(b.reduced))||Number(a.size)-Number(b.size)||String(a.matrix).localeCompare(String(b.matrix)));
 const avg=filtered.length?filtered.reduce((a,x)=>a+number(x.net),0)/filtered.length:0;$('#report-stats').innerHTML=`<div class="card"><div class="stat-label">Pesagens no filtro</div><div class="stat-value">${filtered.length}</div></div><div class="card"><div class="stat-label">Média líquida geral</div><div class="stat-value">${filtered.length?fmt(avg):'—'}</div><div class="stat-foot">kg por par</div></div><div class="card"><div class="stat-label">Matrizes distintas</div><div class="stat-value">${new Set(filtered.map(x=>`${x.model}|${x.size}|${x.matrix}`)).size}</div></div><div class="card"><div class="stat-label">Grupos analisados</div><div class="stat-value">${arr.length}</div></div>`;
 $('#report-rows').innerHTML=arr.map(x=>`<tr><td>${x.type==='BICOLOR'?'Bicolor':'Monocolor'}</td><td>${esc(x.reduced)}</td><td>${esc(x.model)}</td><td>${esc(x.size)}</td><td><strong>${esc(x.matrix)}</strong></td><td>${x.count}</td><td class="number"><strong>${fmt(x.avg)}</strong></td><td class="number">${x.sys==null?'—':fmt(x.sys)}</td><td class="number ${x.diff==null?'':x.diff>0?'negative':'positive'}">${x.diff==null?'—':`${x.diff>0?'+':''}${fmt(x.diff)}`}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">Não há pesagens para os filtros selecionados.</td></tr>';
 $('#report-csv').onclick=()=>exportCsv(arr,'relatorio-consumo-por-matriz.csv');};['report-type','report-reduced','report-size'].forEach(id=>$('#'+id).addEventListener('input',apply));apply();}
function exportCsv(rows,name){if(!rows.length){notify('Não há dados para exportar.',true);return;}const cols=['date','type','reduced','model','color','size','matrix','right','left','gross','deduction','net','systemWeight','notes'];const csv=[cols.join(';'),...rows.map(r=>cols.map(k=>{let v=r[k]??'';if(typeof v==='number')v=String(v).replace('.',',');return `"${String(v).replace(/"/g,'""')}"`;}).join(';'))].join('\r\n');downloadFile(name,'\ufeff'+csv,'text/csv;charset=utf-8');}
init().catch(err=>{console.error(err);document.body.innerHTML='<p style="padding:30px;font-family:sans-serif">Não foi possível carregar a base inicial. Confira se os arquivos do projeto estão na mesma pasta e abra por um servidor local.</p>';});
