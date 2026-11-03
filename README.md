# Peso de Botas — versão Web 0.1.6

Versão baseada na 0.1.3, com remoção completa da integração experimental com OneDrive. O aplicativo mantém o armazenamento local no navegador e a transferência de bases por arquivos JSON.

## Como publicar/testar

O projeto é composto por HTML, CSS e JavaScript puro. Pode ser publicado no GitHub Pages. Para testar localmente, basta abrir `index.html` no navegador; para testar o comportamento de PWA/service worker, use um servidor HTTP local.

## Armazenamento e transferência

- Cada base permanece salva localmente no navegador em que foi criada ou importada.
- **Exportar JSON** gera um arquivo completo com nome da base, data/hora da exportação e todos os dados: histórico, reduzidos, matrizes, coleções e tabelas de peso.
- **Importar JSON** cria uma nova base separada e preserva a base que já estava em uso.
- **Backup/Restaurar** permite salvar e restaurar a base atualmente selecionada.
- Para transferir dados entre responsáveis, exporte a base JSON, coloque o arquivo na pasta compartilhada do OneDrive e peça ao próximo responsável que faça a importação no aplicativo.
- O OneDrive é usado apenas como local externo para guardar/compartilhar o arquivo. O aplicativo não faz login nem acessa a nuvem diretamente.
- Se mais de uma pessoa editar cópias diferentes, será necessário combinar os dados com cuidado; importar uma base cria outra base, não mescla registros automaticamente.

## Funcionalidades mantidas

- 54 reduzidos únicos e 36 registros históricos de monocolor.
- Matrizes históricas importadas e cadastro manual de matrizes.
- Coleção identificada pelos dois primeiros dígitos do modelo.
- Pesagens monocolor e bicolor, histórico e relatórios.
- Bases locais separadas e transferência por JSON.
- Manifesto e service worker para instalação/cache PWA.

## Observação sobre dados existentes

A atualização não apaga as bases já armazenadas no navegador. A versão remove apenas as configurações/tokens locais que pertenciam à tentativa anterior de integração com OneDrive; os dados de pesagem e os cadastros são preservados.
