/* Integração OneDrive via Microsoft identity platform + Microsoft Graph.
   SPA sem segredo de cliente. O token fica somente na sessão do navegador. */
(() => {
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
  const CLIENT_KEY = 'peso-botas-ms-client-id-v1';
  const TOKEN_PREFIX = 'peso-botas-od-';
  const FILE_NAME = 'peso-de-botas-base.json';
  let baseId = null;
  let ready = false;
  let busy = false;
  let conflict = false;
  let timer = null;
  let lastSignature = '';
  let folder = null;
  let file = null;
  let lastError = '';
  let callbacks = { getDatabase: () => null, setDatabase: () => {}, getBaseName: () => 'Base de dados' };

  const configKey = id => `peso-botas-onedrive-config-${id}`;
  const tokenKey = key => `${TOKEN_PREFIX}${key}`;
  const readConfig = () => { try { return JSON.parse(localStorage.getItem(configKey(baseId)) || '{}'); } catch { return {}; } };
  const writeConfig = patch => { const c = { ...readConfig(), ...patch }; localStorage.setItem(configKey(baseId), JSON.stringify(c)); return c; };
  const clientId = () => localStorage.getItem(CLIENT_KEY) || '';
  const redirectUri = () => `${location.origin}${location.pathname}`;
  const emit = () => window.dispatchEvent(new CustomEvent('peso-botas-cloud-status', { detail: getStatus() }));
  const notify = (message, error=false) => { if (typeof window.PesoBotasNotify === 'function') window.PesoBotasNotify(message, error); };
  const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const randomString = (length=64) => { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return b64url(bytes); };
  const sha256 = async value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const decodeJwt = token => { try { return JSON.parse(decodeURIComponent(escape(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))))); } catch { return {}; } };
  const accountEmail = () => sessionStorage.getItem(tokenKey('email')) || '';
  const accessToken = () => sessionStorage.getItem(tokenKey('access')) || '';
  const expiry = () => Number(sessionStorage.getItem(tokenKey('expires')) || 0);
  const hasSession = () => !!accessToken() && expiry() > Date.now() + 60000;

  function configure(callbacksIn) { callbacks = { ...callbacks, ...(callbacksIn || {}) }; }
  function useBase(id) {
    baseId = id;
    ready = false; conflict = false; busy = false; folder = null; file = null; lastSignature = ''; lastError = '';
    if (timer) clearTimeout(timer);
    emit();
  }
  function getStatus() {
    const c = readConfig();
    return {
      configured: !!(clientId() && c.folderUrl), signedIn: hasSession(), connected: !!(ready && folder),
      busy, conflict, email: accountEmail(), folderName: folder?.name || c.folderName || '',
      lastSynced: c.lastSynced || '', error: lastError, clientId: clientId(), folderUrl: c.folderUrl || '',
      redirectUri: redirectUri()
    };
  }
  function resetConnectionState() { ready = false; conflict = false; folder = null; file = null; lastSignature = ''; if (timer) clearTimeout(timer); emit(); }
  function saveClientId(value) { const next = String(value || '').trim(); const previous = clientId(); localStorage.setItem(CLIENT_KEY, next); if (previous && previous !== next) { ['access','refresh','expires','email'].forEach(k => sessionStorage.removeItem(tokenKey(k))); resetConnectionState(); } emit(); }
  function saveFolderUrl(value) { const next = String(value || '').trim(); const previous = readConfig().folderUrl || ''; if (previous !== next) { writeConfig({ folderUrl: next, driveId: '', folderId: '', folderName: '', fileId: '', eTag: '', lastSynced: '' }); resetConnectionState(); } else emit(); }

  async function beginLogin() {
    if (!clientId()) throw new Error('Informe primeiro a ID do aplicativo Microsoft (Client ID).');
    if (location.protocol === 'file:') throw new Error('O login Microsoft não funciona abrindo o arquivo diretamente. Abra o aplicativo por http://localhost ou por um endereço HTTPS.');
    if (!/^https?:$/.test(location.protocol)) throw new Error('O aplicativo precisa estar em localhost ou HTTPS para conectar ao OneDrive.');
    const verifier = randomString(64), state = randomString(32), nonce = randomString(24);
    sessionStorage.setItem(tokenKey('verifier'), verifier);
    sessionStorage.setItem(tokenKey('state'), state);
    sessionStorage.setItem(tokenKey('nonce'), nonce);
    sessionStorage.setItem(tokenKey('pending'), '1');
    sessionStorage.setItem(tokenKey('base'), baseId || '');
    const challenge = b64url(await sha256(verifier));
    const params = new URLSearchParams({ client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query',
      scope: 'openid profile offline_access User.Read Files.ReadWrite', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
    location.assign(`${AUTH}/authorize?${params.toString()}`);
  }
  async function handleCallback() {
    const query = new URLSearchParams(location.search);
    if (query.has('error')) {
      const message = query.get('error_description') || query.get('error');
      history.replaceState({}, document.title, location.pathname);
      sessionStorage.removeItem(tokenKey('pending'));
      throw new Error(message);
    }
    const code = query.get('code');
    if (!code) return false;
    const state = query.get('state');
    if (!state || state !== sessionStorage.getItem(tokenKey('state'))) throw new Error('Não foi possível validar o retorno do login Microsoft. Tente conectar novamente.');
    const verifier = sessionStorage.getItem(tokenKey('verifier'));
    const body = new URLSearchParams({ client_id: clientId(), grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier, scope: 'openid profile offline_access User.Read Files.ReadWrite' });
    const response = await fetch(`${AUTH}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const data = await response.json();
    history.replaceState({}, document.title, location.pathname);
    if (!response.ok) throw new Error(data.error_description || data.error || 'Falha ao concluir o login Microsoft.');
    const claims = decodeJwt(data.id_token || '');
    if (claims.nonce && claims.nonce !== sessionStorage.getItem(tokenKey('nonce'))) throw new Error('A validação de segurança do login Microsoft falhou. Tente novamente.');
    storeTokens(data);
    return true;
  }
  function storeTokens(data) {
    if (data.access_token) sessionStorage.setItem(tokenKey('access'), data.access_token);
    if (data.refresh_token) sessionStorage.setItem(tokenKey('refresh'), data.refresh_token);
    if (data.expires_in) sessionStorage.setItem(tokenKey('expires'), String(Date.now() + Number(data.expires_in) * 1000));
    const claims = decodeJwt(data.id_token || '');
    sessionStorage.setItem(tokenKey('email'), claims.preferred_username || claims.email || claims.upn || 'Conta Microsoft');
  }
  async function getToken(interactive=false) {
    if (hasSession()) return accessToken();
    const refresh = sessionStorage.getItem(tokenKey('refresh'));
    if (refresh) {
      const body = new URLSearchParams({ client_id: clientId(), grant_type: 'refresh_token', refresh_token: refresh, scope: 'openid profile offline_access User.Read Files.ReadWrite' });
      const response = await fetch(`${AUTH}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const data = await response.json();
      if (response.ok) { storeTokens(data); return accessToken(); }
      sessionStorage.removeItem(tokenKey('refresh'));
    }
    if (interactive) { await beginLogin(); return ''; }
    throw new Error('Sua sessão Microsoft expirou. Clique em “Conectar e sincronizar” para entrar novamente.');
  }
  async function graph(path, options={}) {
    const token = options.token || await getToken(false);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const { raw, token: _token, ...fetchOptions } = options;
    const response = await fetch(`${GRAPH}${path}`, { ...fetchOptions, headers });
    if (raw) { if (!response.ok) { const error = new Error(`Microsoft Graph retornou ${response.status}.`); error.status = response.status; throw error; } return response; }
    if (!response.ok) {
      let detail = ''; try { const body = await response.json(); detail = body.error?.message || ''; } catch {}
      const error = new Error(detail || `Microsoft Graph retornou ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response;
  }
  function shareIdFromUrl(url) {
    const bytes = new TextEncoder().encode(url);
    let binary = ''; bytes.forEach(b => binary += String.fromCharCode(b));
    return `u!${btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;
  }
  async function resolveFolder(url) {
    const shareId = shareIdFromUrl(url);
    const result = await graph(`/shares/${shareId}/driveItem?$select=id,name,folder,parentReference,remoteItem`, { headers: { Prefer: 'redeemSharingLink' } });
    const item = result.remoteItem || result;
    const driveId = item.parentReference?.driveId || result.parentReference?.driveId;
    if (!driveId || !item.id || !item.folder) throw new Error('O link informado não parece apontar para uma pasta do OneDrive. Compartilhe uma pasta, não um arquivo.');
    folder = { driveId, id: item.id, name: item.name || 'Pasta compartilhada' };
    writeConfig({ driveId, folderId: item.id, folderName: folder.name });
    return folder;
  }
  async function findCloudFile() {
    const path = `/drives/${encodeURIComponent(folder.driveId)}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(FILE_NAME)}`;
    try { return await graph(path); }
    catch (error) { if (error.status === 404) return null; throw error; }
  }
  async function readCloudFile(meta) {
    const response = await graph(`/drives/${encodeURIComponent(folder.driveId)}/items/${encodeURIComponent(meta.id)}/content`, { raw: true });
    const payload = await response.json();
    if (payload?.format !== 'peso-botas-base' || !payload.database) throw new Error('O arquivo da nuvem não contém uma base válida do Peso de Botas.');
    return payload;
  }
  async function uploadCloudFile(content, existingMeta=null) {
    const drive = encodeURIComponent(folder.driveId);
    const endpoint = existingMeta
      ? `/drives/${drive}/items/${encodeURIComponent(existingMeta.id)}/createUploadSession`
      : `/drives/${drive}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(FILE_NAME)}:/createUploadSession`;
    const headers = { 'Content-Type': 'application/json' };
    if (existingMeta?.eTag) headers['If-Match'] = existingMeta.eTag;
    const session = await graph(endpoint, { method: 'POST', headers, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': existingMeta ? 'replace' : 'fail' } }) });
    const blob = new Blob([content], { type: 'application/json' });
    const put = await fetch(session.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes 0-${blob.size - 1}/${blob.size}` }, body: blob });
    if (!put.ok) {
      let detail = ''; try { const body = await put.json(); detail = body.error?.message || ''; } catch {}
      const error = new Error(detail || `Falha ao enviar arquivo para o OneDrive (${put.status}).`); error.status = put.status; throw error;
    }
    return put.json();
  }
  const currentPayload = () => ({ format: 'peso-botas-base', formatVersion: 1, baseName: callbacks.getBaseName(), exportedAt: new Date().toISOString(), database: callbacks.getDatabase() });
  const signature = () => JSON.stringify(callbacks.getDatabase());
  function saveLocalSnapshot(name) {
    const data = callbacks.getDatabase();
    if (!data) return;
    const payload = { format: 'peso-botas-base', formatVersion: 1, baseName: name, exportedAt: new Date().toISOString(), database: data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-local-antes-da-nuvem-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  async function connectAndLoad() {
    const config = readConfig();
    if (!clientId()) throw new Error('Informe a ID do aplicativo Microsoft (Client ID).');
    if (!config.folderUrl) throw new Error('Cole o link da pasta compartilhada do OneDrive.');
    if (!hasSession() && !sessionStorage.getItem(tokenKey('refresh'))) { await beginLogin(); return; }
    busy = true; conflict = false; lastError = ''; emit();
    try {
      await getToken(false);
      await resolveFolder(config.folderUrl);
      const meta = await findCloudFile();
      if (meta) {
        const payload = await readCloudFile(meta);
        if (callbacks.getDatabase()) saveLocalSnapshot(callbacks.getBaseName());
        callbacks.setDatabase(payload.database);
        file = meta;
        lastSignature = signature();
        writeConfig({ lastSynced: new Date().toISOString(), fileId: meta.id, eTag: meta.eTag });
        ready = true;
        notify('Base carregada do OneDrive. A cópia local anterior foi preservada como segurança.');
      } else {
        const payload = currentPayload();
        const uploaded = await uploadCloudFile(JSON.stringify(payload), null);
        file = uploaded;
        lastSignature = signature();
        writeConfig({ lastSynced: new Date().toISOString(), fileId: uploaded.id, eTag: uploaded.eTag });
        ready = true;
        notify('Pasta conectada. A base atual foi enviada ao OneDrive pela primeira vez.');
      }
    } catch (error) {
      lastError = error.message;
      if (error.status === 412 || error.status === 409) { conflict = true; ready = false; lastError = 'Outra pessoa alterou a base ao mesmo tempo. Seus dados locais foram preservados; carregue a versão da nuvem antes de continuar.'; }
      throw new Error(lastError);
    } finally { busy = false; emit(); }
  }
  async function syncNow() {
    if (!ready || !folder || !file) throw new Error('Conecte a pasta do OneDrive primeiro.');
    if (busy) return;
    const sig = signature();
    if (sig === lastSignature) { notify('A base já está sincronizada.'); return; }
    busy = true; lastError = ''; emit();
    try {
      const payload = currentPayload();
      const uploaded = await uploadCloudFile(JSON.stringify(payload), file);
      file = uploaded; lastSignature = sig;
      writeConfig({ lastSynced: new Date().toISOString(), fileId: uploaded.id, eTag: uploaded.eTag });
      notify('Sincronização concluída.');
    } catch (error) {
      lastError = error.message;
      if (error.status === 412 || error.status === 409) { conflict = true; ready = false; lastError = 'Conflito: outra pessoa salvou alterações antes desta sincronização. Os dados locais não foram descartados. Use “Carregar versão da nuvem” para atualizar.'; }
      throw new Error(lastError);
    } finally { busy = false; emit(); }
  }
  async function reloadCloud() {
    if (!folder) {
      const config = readConfig();
      if (!config.folderUrl) throw new Error('Informe o link da pasta compartilhada.');
      await resolveFolder(config.folderUrl);
    }
    busy = true; emit();
    try {
      const meta = await findCloudFile();
      if (!meta) throw new Error('Ainda não existe arquivo de base nessa pasta. Conecte e envie a base atual primeiro.');
      const payload = await readCloudFile(meta);
      if (callbacks.getDatabase()) saveLocalSnapshot(`${callbacks.getBaseName()} - antes de recarregar`);
      callbacks.setDatabase(payload.database);
      file = meta; lastSignature = signature(); ready = true; conflict = false;
      writeConfig({ lastSynced: new Date().toISOString(), fileId: meta.id, eTag: meta.eTag });
      notify('Versão da nuvem carregada. A cópia local anterior foi preservada no navegador.');
    } finally { busy = false; emit(); }
  }
  function queueSync() {
    if (!ready || conflict || busy) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(error => { lastError = error.message; emit(); notify(error.message, true); }), 1800);
  }
  async function resumeConnection() {
    const config = readConfig();
    if (!config.folderUrl || !clientId() || (!sessionStorage.getItem(tokenKey('refresh')) && !hasSession())) return;
    try {
      await getToken(false);
      await resolveFolder(config.folderUrl);
      const meta = await findCloudFile();
      if (!meta) return;
      file = meta;
      const knownTag = config.eTag || '';
      if (knownTag && meta.eTag === knownTag) { ready = true; conflict = false; lastSignature = signature(); lastError = ''; }
      else { ready = false; conflict = true; lastError = 'A base na nuvem mudou desde a última conexão. Carregue a versão da nuvem para evitar sobrescrever alterações.'; }
    } catch (error) { lastError = error.message; ready = false; }
    emit();
  }
  async function finishPending() {
    if (sessionStorage.getItem(tokenKey('pending')) !== '1') return;
    const pendingBase = sessionStorage.getItem(tokenKey('base'));
    sessionStorage.removeItem(tokenKey('pending'));
    if (pendingBase && pendingBase !== baseId) useBase(pendingBase);
    try { await connectAndLoad(); }
    catch (error) { lastError = error.message; notify(error.message, true); emit(); }
  }
  window.addEventListener('online', () => { if (ready && !conflict) queueSync(); });
  function disconnect() {
    ['access','refresh','expires','email','verifier','state','nonce','pending','base'].forEach(k => sessionStorage.removeItem(tokenKey(k)));
    ready = false; folder = null; file = null; conflict = false; lastSignature = ''; emit();
  }

  window.OneDriveSync = { configure, useBase, getStatus, saveClientId, saveFolderUrl, beginLogin, handleCallback, finishPending, resumeConnection, connectAndLoad, syncNow, reloadCloud, queueSync, disconnect, redirectUri };
})();
