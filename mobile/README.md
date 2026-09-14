# Compass no iPhone (TestFlight)

Casca nativa em Capacitor. O app **não** carrega arquivos embutidos: ele abre
`https://compass.groupp.com` dentro de uma WebView nativa.

Isso não é atalho, é imposição do desenho: o Compass é TanStack Start com SSR
no Cloudflare, e as server functions rodam no servidor — não existe pacote
estático para empacotar dentro do app.

A consequência é boa: **publicar pelo Lovable atualiza o app**, sem build novo
e sem revisão da Apple. Só mudança nesta casca (ícone, tela de abertura,
plugin nativo, permissão) exige subir binário novo.

## O que você precisa antes

1. **Xcode** — App Store, ~17 GB. Hoje a máquina só tem as Command Line Tools.
   Depois de instalar, abra uma vez e aceite a licença.
2. **Conta Apple Developer** — US$ 99/ano, em developer.apple.com/programs.
   Precisa ser a conta da Grou, não uma pessoal, ou o app fica preso a um CPF.

CocoaPods **não** é necessário: o Capacitor 8 usa Swift Package Manager.

## Primeira publicação

```bash
cd mobile
bun install
bunx cap open ios      # abre o projeto no Xcode
```

No Xcode, no alvo **App** → aba **Signing & Capabilities**:

- marque *Automatically manage signing*;
- em **Team**, escolha a conta da Grou;
- confira o **Bundle Identifier**: `com.groupp.compass`.

Depois, em App Store Connect (appstoreconnect.apple.com):

1. **Meus Apps → +** → novo app iOS, com o mesmo bundle ID.
2. No Xcode: **Product → Destination → Any iOS Device**, depois
   **Product → Archive**.
3. No Organizer que abrir: **Distribute App → TestFlight & App Store**.
4. Em **TestFlight → Testes internos**, crie um grupo e adicione as pessoas
   pelo Apple ID delas.

**Testes internos não passam por App Review.** As pessoas recebem um convite,
instalam o app TestFlight e baixam o Compass por lá. Aparece como ícone normal
na tela do iPhone.

## O que lembrar depois

- **Cada build expira em 90 dias.** Antes disso, repita Archive → Distribute e
  o grupo recebe a nova versão. É o preço de não passar por revisão.
- **Até 100 pessoas** como testadoras internas (precisam ser usuárias do App
  Store Connect da Grou).
- Subir para a **App Store pública** exigiria revisão, e um app que só abre um
  site costuma esbarrar na Diretriz 4.2. Para passar seria preciso push nativo
  e login por Face ID.

## Pendência conhecida: o ícone

`assets/icon.png` foi ampliado de `public/icon-512.png` (512 px) para os 1024 px
que a Apple exige. Serve para TestFlight, mas fica levemente macio. Para a
App Store, peça o ícone original em 1024×1024 a quem tem os arquivos de marca e
substitua:

```bash
cd mobile
# troque assets/icon.png e assets/icon-only.png pelo original 1024×1024
bunx capacitor-assets generate --ios --assetPath assets
bunx cap sync ios
```

## Se a URL mudar

`capacitor.config.ts` → `server.url` e `server.allowNavigation`. Depois
`bunx cap sync ios` e um binário novo.
