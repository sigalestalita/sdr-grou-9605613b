import { createFileRoute } from "@tanstack/react-router";
import manualHtml from "@/content/manual-compass.html?raw";

/*
 * Manual do Compass (módulos CS e SDR), aberto para qualquer pessoa em
 * compass.grougp.com/manual, sem login: é o link do e-mail de boas-vindas.
 * A página é o HTML pronto de src/content/manual-compass.html (telas com
 * dados de exemplo, nada do banco).
 */
export const Route = createFileRoute("/manual")({
  server: {
    handlers: {
      GET: () =>
        new Response(manualHtml, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
