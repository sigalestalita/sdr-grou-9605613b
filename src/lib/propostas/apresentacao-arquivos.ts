/*
 * Apresentação da proposta a partir de um PDF — roda só no navegador.
 * Cada página vira uma imagem (~1920 px de largura, webp ou jpg), enviada ao
 * bucket propostas-slides na pasta da proposta.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Apresentacao } from "@/lib/propostas/render";

const BUCKET = "propostas-slides";
const LARGURA = 1920;
export const MAX_PAGINAS = 120;
/** A apresentação comercial inteira tem mais de 120 slides. */
export const MAX_PAGINAS_ACERVO = 300;
export const MAX_PDF_ACERVO_MB = 200;
export const MAX_PDF_MB = 60;

export type Progresso = (feito: number, total: number, etapa: "lendo" | "enviando") => void;

function canvasParaBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, erro) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") return ok(webp);
        // Safari não gera webp: cai para jpg.
        canvas.toBlob(
          (jpg) => (jpg ? ok(jpg) : erro(new Error("Falha ao gerar imagem"))),
          "image/jpeg",
          0.86,
        );
      },
      "image/webp",
      0.86,
    );
  });
}

async function pdfParaImagens(
  arquivo: File,
  progresso?: Progresso,
  maxPaginas = MAX_PAGINAS,
): Promise<Blob[]> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  const doc = await tarefa.promise;
  try {
    const total = doc.numPages;
    if (total > maxPaginas) throw new Error(`O PDF tem ${total} páginas; o máximo é ${maxPaginas}`);
    const out: Blob[] = [];
    for (let n = 1; n <= total; n++) {
      progresso?.(n - 1, total, "lendo");
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: LARGURA / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("O navegador não conseguiu desenhar o PDF");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(await canvasParaBlob(canvas));
      pagina.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
    return out;
  } finally {
    await tarefa.destroy();
  }
}

/** Converte o PDF e envia as imagens. Devolve a apresentação pronta para gravar na proposta. */
export async function enviarApresentacaoPdf(
  propostaId: string,
  arquivo: File,
  progresso?: Progresso,
): Promise<Apresentacao> {
  if (arquivo.type && arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name))
    throw new Error("Escolha um arquivo PDF");
  if (arquivo.size > MAX_PDF_MB * 1024 * 1024) throw new Error(`O PDF passa de ${MAX_PDF_MB} MB`);
  const imagens = await pdfParaImagens(arquivo, progresso);
  if (imagens.length === 0) throw new Error("O PDF não tem páginas");
  const pasta = `${propostaId}/${Date.now()}`;
  const slides: string[] = [];
  for (let i = 0; i < imagens.length; i++) {
    progresso?.(i, imagens.length, "enviando");
    const img = imagens[i];
    const ext = img.type === "image/webp" ? "webp" : "jpg";
    const caminho = `${pasta}/${String(i + 1).padStart(2, "0")}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, img, { contentType: img.type, upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`Falha ao enviar o slide ${i + 1}: ${error.message}`);
    slides.push(supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl);
  }
  progresso?.(imagens.length, imagens.length, "enviando");
  const titulo =
    arquivo.name
      .replace(/\.pdf$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Apresentação";
  return { titulo, slides, fonte: arquivo.name };
}

/**
 * Importa a apresentação comercial para o acervo: cada página do PDF vira uma
 * imagem em acervo/<importação>/ (fora das pastas das propostas, para trocar a
 * apresentação de uma proposta nunca apagar o acervo). Devolve a pasta e as
 * URLs na ordem das páginas.
 */
export async function enviarAcervoPdf(
  arquivo: File,
  progresso?: Progresso,
): Promise<{ importacao: string; imagens: string[] }> {
  if (arquivo.type && arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name))
    throw new Error("Escolha um arquivo PDF");
  if (arquivo.size > MAX_PDF_ACERVO_MB * 1024 * 1024)
    throw new Error(`O PDF passa de ${MAX_PDF_ACERVO_MB} MB`);
  const blobs = await pdfParaImagens(arquivo, progresso, MAX_PAGINAS_ACERVO);
  if (blobs.length === 0) throw new Error("O PDF não tem páginas");
  const importacao = String(Date.now());
  const imagens: string[] = [];
  for (let i = 0; i < blobs.length; i++) {
    progresso?.(i, blobs.length, "enviando");
    const img = blobs[i];
    const ext = img.type === "image/webp" ? "webp" : "jpg";
    const caminho = `acervo/${importacao}/${String(i + 1).padStart(3, "0")}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, img, { contentType: img.type, upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`Falha ao enviar o slide ${i + 1}: ${error.message}`);
    imagens.push(supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl);
  }
  progresso?.(blobs.length, blobs.length, "enviando");
  return { importacao, imagens };
}

/**
 * Apaga os arquivos da apresentação desta proposta, menos a pasta `manter`
 * (a que acabou de ser enviada). Só mexe na pasta da própria proposta.
 */
export async function apagarArquivosDaProposta(propostaId: string, manter?: string) {
  const { data: pastas } = await supabase.storage.from(BUCKET).list(propostaId, { limit: 1000 });
  const caminhos: string[] = [];
  for (const p of pastas ?? []) {
    if (p.id) {
      caminhos.push(`${propostaId}/${p.name}`);
      continue;
    }
    if (manter && p.name === manter) continue;
    const { data: arquivos } = await supabase.storage
      .from(BUCKET)
      .list(`${propostaId}/${p.name}`, { limit: 1000 });
    for (const a of arquivos ?? []) caminhos.push(`${propostaId}/${p.name}/${a.name}`);
  }
  for (let i = 0; i < caminhos.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(caminhos.slice(i, i + 100));
  }
}

/** Nome da pasta (o carimbo de tempo) de uma URL de slide desta proposta. */
export function pastaDaApresentacao(propostaId: string, slides: string[]): string | undefined {
  const m = new RegExp(`/propostas-slides/${propostaId}/([^/]+)/`).exec(slides[0] ?? "");
  return m?.[1];
}
