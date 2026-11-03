# Peso de Botas — versão Web 0.1.4

Versão baseada na 0.1.3, agora com a primeira integração de sincronização com OneDrive por Microsoft Graph.

## O que foi acrescentado

- Conexão com contas Microsoft pessoais (Hotmail/Outlook.com) e corporativas.
- Autenticação OAuth 2.0 Authorization Code com PKCE; não usa nem solicita senha ou segredo de cliente dentro do aplicativo.
- Conexão por link de uma pasta do OneDrive compartilhada com permissão de edição.
- Criação/atualização do arquivo `peso-de-botas-base.json` dentro da pasta compartilhada.
- Carregamento da base que já existe na nuvem quando um novo dispositivo/funcionário conecta.
- Sincronização automática após alterações locais, com botão para sincronizar manualmente.
- Verificação por eTag para detectar alterações concorrentes e impedir sobrescrita silenciosa.
- Backup JSON local baixado antes de substituir a base local pela versão da nuvem.
- Configuração da pasta vinculada a cada base local, permitindo direcionar bases diferentes para pastas/OneDrives diferentes.
- Tokens mantidos em `sessionStorage`; Client ID e link da pasta ficam no armazenamento local do navegador.

## Importante: configuração inicial obrigatória da Microsoft

A conexão real só funcionará depois de registrar o aplicativo no Microsoft Entra e informar o Application (client) ID na tela Bases de dados. Não crie um segredo de cliente. Este é um aplicativo de navegador (SPA), que usa PKCE. A Microsoft exige que o registro seja feito em um diretório/tenant Microsoft Entra e que a conta tenha permissão para registrar aplicativos; se o Hotmail não mostrar um diretório ou bloquear o registro, pare nessa etapa e não crie configurações aleatórias. Será necessário preparar um tenant de desenvolvimento/conta Azure com as permissões adequadas antes de continuar.

### 1. Servir o aplicativo por localhost

Não abra o `index.html` diretamente com `file://`. Para testar localmente:

1. Extraia a pasta `boot-weighing-web`.
2. Abra o Prompt de Comando ou PowerShell dentro dessa pasta.
3. Execute:

```bash
python -m http.server 8000
```

4. Abra `http://localhost:8000` no navegador.

Se o comando `python` não existir, tente `py -m http.server 8000`.

### 2. Registrar o aplicativo Microsoft

1. Acesse https://entra.microsoft.com/ e entre com sua conta Microsoft.
2. Abra **Identity > Applications > App registrations > New registration**.
3. Nome: `Peso de Botas`.
4. Em **Supported account types**, escolha **Accounts in any organizational directory and personal Microsoft accounts** (contas de qualquer organização e contas pessoais Microsoft).
5. Em Redirect URI, escolha a plataforma **Single-page application (SPA)** e informe exatamente o endereço de retorno mostrado na tela Bases de dados. No teste local, normalmente será `http://localhost:8000/`.
6. Registre o aplicativo e copie o **Application (client) ID**.
7. Em **API permissions**, confirme/adicone Microsoft Graph > Delegated permissions > `Files.ReadWrite` e `User.Read`. Os escopos `openid`, `profile` e `offline_access` são solicitados pelo login.
8. Não crie Client Secret. Não compartilhe senha nem tokens.

Documentação Microsoft:
- Tipos de contas: https://learn.microsoft.com/entra/identity-platform/howto-modify-supported-accounts
- MSAL / inicialização de aplicativos de navegador: https://learn.microsoft.com/entra/msal/javascript/browser/initialization
- Acesso a itens compartilhados: https://learn.microsoft.com/graph/api/shares-get
- Permissões OneDrive: https://learn.microsoft.com/onedrive/developer/rest-api/concepts/permissions_reference

### 3. Preparar a pasta compartilhada

1. No OneDrive, crie uma pasta, por exemplo `Peso de Botas - Base`.
2. Compartilhe com cada funcionário usando **Pessoas específicas** e permissão **Pode editar**.
3. Cada funcionário precisa abrir/aceitar o compartilhamento usando a conta Microsoft que utilizará no aplicativo.
4. Copie o link de compartilhamento da pasta.
5. No aplicativo, abra **Bases de dados**, informe o Client ID e cole o link da pasta.
6. Clique em **Conectar e sincronizar** e entre com a conta Microsoft que recebeu acesso à pasta.

A primeira conexão envia a base local se ainda não houver `peso-de-botas-base.json` na pasta. Se o arquivo já existir, o aplicativo carrega a base da nuvem e baixa um backup da base local antes de substituí-la.

### 4. Uso em outro computador ou por outro funcionário

- A pessoa precisa ter acesso de edição à mesma pasta compartilhada.
- Deve abrir a mesma versão do aplicativo hospedada em HTTPS (ou usar localhost apenas no próprio computador), informar o mesmo Client ID e o mesmo link de pasta, e entrar com sua conta Microsoft autorizada.
- Se já houver base na nuvem, ela será carregada para o dispositivo.

**Atenção:** `http://localhost` funciona apenas no computador onde o servidor está rodando. Para outros dispositivos, o aplicativo precisa estar publicado em um endereço HTTPS estável (por exemplo, GitHub Pages) e esse endereço também deve ser cadastrado como Redirect URI SPA no registro Microsoft.

## Concorrência e limitações desta primeira etapa

- O arquivo JSON é a base central compartilhada.
- A sincronização automática é acionada após alterações e também pode ser feita pelo botão.
- Se outra pessoa alterar o arquivo antes do envio, a verificação eTag impede a sobrescrita silenciosa. O aplicativo mantém a cópia local e solicita que o usuário carregue a versão da nuvem.
- Ainda não há mesclagem automática de duas alterações simultâneas. Para o primeiro piloto, evite duas pessoas finalizarem pesagens exatamente ao mesmo tempo; se ocorrer conflito, carregue a versão mais recente antes de continuar.
- A conexão precisa de internet. A base local continua disponível se a nuvem estiver temporariamente indisponível.
- A pasta compartilhada precisa continuar acessível ao usuário que está conectado.
- A integração é feita diretamente pelo navegador, sem servidor próprio. Cada usuário autentica sua própria conta e o Graph aplica as permissões que o OneDrive concedeu à pasta.

## Funcionalidades anteriores mantidas

- 54 reduzidos únicos e 36 registros históricos de monocolor.
- Matrizes históricas importadas e cadastro manual de matrizes.
- Coleção identificada pelos dois primeiros dígitos do modelo.
- Pesagens monocolor e bicolor, histórico, relatórios, backup e restauração.
- Bases locais separadas e transferência por JSON.
