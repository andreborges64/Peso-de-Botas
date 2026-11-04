Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
# Peso de Botas — Android nativo (Kotlin)

Projeto Android nativo em Kotlin + Jetpack Compose, convertido a partir da versão Web 0.1.6.

## Funcionalidades incluídas

- Visão geral com indicadores e pesagens recentes.
- Nova pesagem monocolor e bicolor, com cálculo automático de acessórios, peso bruto, desconto, peso líquido, canos e referência do peso do sistema.
- Histórico com busca, filtro por tipo, exclusão de registros do aplicativo e exportação CSV.
- Matrizaria: cadastro individual por coleção/numeração, consulta da quantidade importada da aba COLEÇÃO, histórico de uso e exclusão do cadastro sem apagar pesagens.
- Cadastros de reduzidos e consulta das tabelas de acessórios.
- Relatórios com filtros, agrupamento por matriz, média líquida, peso do sistema, diferença e exportação CSV.
- Múltiplas bases locais, criação, troca, exportação, importação e restauração.
- Dados iniciais originais incluídos em `app/src/main/assets/data-inicial.json`.

## Compatibilidade JSON Web ↔ Android

A exportação usa o mesmo envelope da Web 0.1.6:

- `format`: `peso-botas-base`
- `formatVersion`: `1`
- `baseName`
- `exportedAt`
- `database`: objeto completo da base

O Android importa tanto esse envelope quanto um objeto de banco sem envelope. A versão Web 0.1.6 também reconhece o envelope exportado pelo Android. Assim, é possível exportar na Web e importar no Android, ou exportar no Android e importar na Web.

A importação de base cria uma nova base separada e mantém a base anterior. A opção Restaurar do topo substitui a base atualmente ativa, como a restauração de backup da versão Web.

## Gerar APK pelo GitHub

O workflow `.github/workflows/build-apk.yml` já está configurado.

1. Envie o conteúdo desta pasta para a raiz de um repositório GitHub (branch `main` ou `master`).
2. Abra a aba **Actions** do repositório.
3. Selecione **Build Android APK** e clique em **Run workflow**. Também haverá compilação automática em novos commits que alterem o app ou os arquivos Gradle.
4. Quando a execução terminar com sucesso, abra a execução e baixe o artefato **peso-de-botas-debug-apk**.
5. Dentro do ZIP do artefato estará `app-debug.apk`, pronto para instalação de teste em Android.

O APK gerado é de depuração (debug), adequado para testes e instalação interna. Para distribuição pública/Play Store será necessário configurar uma chave de assinatura de release.

## Ambiente de compilação

- JDK 17
- Gradle 8.11.1 (instalado automaticamente pelo workflow)
- Android Gradle Plugin 8.9.2
- Kotlin 2.1.20
- Android compileSdk 35 / minSdk 26

## Armazenamento

Os bancos ficam armazenados localmente no aplicativo Android, separados por base. A transferência entre dispositivos é feita por JSON, que pode ser guardado em uma pasta compartilhada do OneDrive manualmente. Não há autenticação Microsoft nem sincronização automática.
