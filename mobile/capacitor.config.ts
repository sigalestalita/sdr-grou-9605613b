import type { CapacitorConfig } from "@capacitor/cli";

/*
 * Casca nativa do Compass.
 *
 * O app não carrega arquivos embutidos: ele abre compass.groupp.com dentro da
 * WebView. É imposição do desenho do sistema, não preguiça — o Compass é
 * TanStack Start com SSR no Cloudflare, e as server functions rodam no
 * servidor, então não existe pacote estático para empacotar.
 *
 * A consequência é boa: publicar pelo Lovable continua atualizando o app, sem
 * novo build nem revisão da Apple. Só mudança nesta casca (ícone, plugin
 * nativo, permissão) exige subir binário novo.
 *
 * mobile/www/index.html é o que aparece quando o telefone está sem internet.
 */
const config: CapacitorConfig = {
  appId: "com.groupp.compass",
  appName: "Compass",
  webDir: "www",
  server: {
    url: "https://compass.groupp.com",
    // Só HTTPS: sem isso a App Transport Security do iOS bloqueia em silêncio.
    cleartext: false,
    allowNavigation: ["compass.groupp.com"],
  },
  ios: {
    // O Supabase guarda a sessão em localStorage; com o WKWebView padrão ela
    // sobrevive entre aberturas do app.
    limitsNavigationsToAppBoundDomains: false,
    contentInset: "always",
    backgroundColor: "#0f1724",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0f1724",
      showSpinner: false,
    },
  },
};

export default config;
