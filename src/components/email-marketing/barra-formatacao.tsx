import {
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AlignCenter,
  Bold,
  Braces,
  Heading,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  Loader2,
  Minus,
  MousePointerClick,
  Palette,
  Underline,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/*
 * Barra de formatação do corpo do e-mail (formato "texto"). Ela só escreve a
 * marcação que o render entende (render.ts), em cima do texto selecionado:
 * quem preferir digitar continua podendo, e a IA escreve no mesmo formato.
 */

const CORES_TEXTO = [
  { nome: "Azul-marinho Grou", cor: "#0b1f3a" },
  { nome: "Azul", cor: "#1e4f9c" },
  { nome: "Verde", cor: "#15803d" },
  { nome: "Laranja", cor: "#c2410c" },
  { nome: "Vermelho", cor: "#b91c1c" },
  { nome: "Roxo", cor: "#7c3aed" },
  { nome: "Cinza", cor: "#6b7280" },
];
const CORES_FUNDO = [
  { nome: "Amarelo", cor: "#fef08a" },
  { nome: "Verde", cor: "#bbf7d0" },
  { nome: "Azul", cor: "#bfdbfe" },
  { nome: "Rosa", cor: "#fecdd3" },
];
const VARIAVEIS = [
  { rotulo: "Primeiro nome", valor: "{{primeiro_nome|tudo bem}}" },
  { rotulo: "Nome completo", valor: "{{nome}}" },
  { rotulo: "Empresa", valor: "{{empresa}}" },
  { rotulo: "E-mail", valor: "{{email}}" },
];

type Editor = {
  ref: RefObject<HTMLTextAreaElement | null>;
  valor: string;
  onChange: (v: string) => void;
};

/** Aplica uma troca no texto e devolve a seleção para onde faz sentido. */
function aplicar(
  e: Editor,
  troca: (txt: string, ini: number, fim: number) => { txt: string; sel: [number, number] },
) {
  const el = e.ref.current;
  const ini = el?.selectionStart ?? e.valor.length;
  const fim = el?.selectionEnd ?? e.valor.length;
  const r = troca(e.valor, ini, fim);
  e.onChange(r.txt);
  requestAnimationFrame(() => {
    const t = e.ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(r.sel[0], r.sel[1]);
  });
}

/** Envolve a seleção (ou um texto de exemplo selecionado) com a marcação. */
function envolver(e: Editor, antes: string, depois: string, exemplo: string) {
  aplicar(e, (txt, ini, fim) => {
    const sel = txt.slice(ini, fim) || exemplo;
    return {
      txt: txt.slice(0, ini) + antes + sel + depois + txt.slice(fim),
      sel: [ini + antes.length, ini + antes.length + sel.length],
    };
  });
}

/** Prefixa as linhas selecionadas (título, lista, centralizar). */
function prefixar(e: Editor, prefixo: string) {
  aplicar(e, (txt, ini, fim) => {
    const a = txt.lastIndexOf("\n", ini - 1) + 1;
    const bRaw = txt.indexOf("\n", fim);
    const b = bRaw === -1 ? txt.length : bRaw;
    const linhas = txt
      .slice(a, b)
      .split("\n")
      .map((l) =>
        l.startsWith(prefixo)
          ? l.slice(prefixo.length)
          : prefixo + l.replace(/^(#{1,3} |- |-> )/, ""),
      );
    const novo = linhas.join("\n");
    return { txt: txt.slice(0, a) + novo + txt.slice(b), sel: [a, a + novo.length] };
  });
}

/** Insere um bloco em linha própria (imagem, botão, divisória), com linha em branco em volta. */
function inserirBloco(e: Editor, bloco: string) {
  aplicar(e, (txt, _ini, fim) => {
    const antes = txt.slice(0, fim);
    const depois = txt.slice(fim);
    const pre = !antes ? "" : antes.endsWith("\n\n") ? "" : antes.endsWith("\n") ? "\n" : "\n\n";
    const pos = !depois
      ? "\n"
      : depois.startsWith("\n\n")
        ? ""
        : depois.startsWith("\n")
          ? "\n"
          : "\n\n";
    const novo = antes + pre + bloco + pos + depois;
    const p = antes.length + pre.length + bloco.length;
    return { txt: novo, sel: [p, p] };
  });
}

function inserir(e: Editor, trecho: string) {
  aplicar(e, (txt, ini, fim) => ({
    txt: txt.slice(0, ini) + trecho + txt.slice(fim),
    sel: [ini + trecho.length, ini + trecho.length],
  }));
}

const urlOk = (u: string) => /^https?:\/\/\S+\.\S+/.test(u.trim());

function Botao({
  titulo,
  onClick,
  children,
}: {
  titulo: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Paleta({
  cores,
  onEscolher,
}: {
  cores: { nome: string; cor: string }[];
  onEscolher: (cor: string) => void;
}) {
  const [livre, setLivre] = useState("#0b1f3a");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {cores.map((c) => (
          <button
            key={c.cor}
            type="button"
            title={c.nome}
            aria-label={c.nome}
            onClick={() => onEscolher(c.cor)}
            className="h-7 w-7 rounded-full border border-border shadow-sm transition-transform hover:scale-110"
            style={{ background: c.cor }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <input
          type="color"
          aria-label="Outra cor"
          value={livre}
          onChange={(ev) => setLivre(ev.target.value)}
          className="h-7 w-9 cursor-pointer rounded border bg-transparent"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[12px]"
          onClick={() => onEscolher(livre)}
        >
          Usar esta cor
        </Button>
      </div>
    </div>
  );
}

export function BarraFormatacao({
  editor,
  subirImagem,
  subindo,
}: {
  editor: Editor;
  subirImagem: (f: File) => Promise<string>;
  subindo: boolean;
}) {
  const [corAberta, setCorAberta] = useState(false);
  const [fundoAberto, setFundoAberto] = useState(false);
  const [linkAberto, setLinkAberto] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [botaoAberto, setBotaoAberto] = useState(false);
  const [botaoTexto, setBotaoTexto] = useState("Quero saber mais");
  const [botaoUrl, setBotaoUrl] = useState("");
  const [imgAberta, setImgAberta] = useState(false);
  const [img, setImg] = useState({ url: "", alt: "", largura: 100, link: "" });
  const [varAberta, setVarAberta] = useState(false);

  const confirmarLink = () => {
    if (!urlOk(linkUrl)) return toast.error("Link inválido (comece com https://)");
    envolver(editor, "[", `](${linkUrl.trim()})`, "texto do link");
    setLinkUrl("");
    setLinkAberto(false);
  };

  const inserirImagem = () => {
    if (!/^https:\/\/\S+/.test(img.url.trim()))
      return toast.error("Suba a imagem ou cole um endereço https");
    if (img.link.trim() && !urlOk(img.link)) return toast.error("Link da imagem inválido");
    inserirBloco(editor, marcacaoImagem(img.url.trim(), img.alt, img.largura, img.link.trim()));
    setImg({ url: "", alt: "", largura: 100, link: "" });
    setImgAberta(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 bg-muted/40 px-1 py-1">
      <Botao titulo="Título" onClick={() => prefixar(editor, "# ")}>
        <Heading className="h-4 w-4" />
      </Botao>
      <Botao titulo="Negrito (Ctrl+B)" onClick={() => envolver(editor, "**", "**", "texto")}>
        <Bold className="h-4 w-4" />
      </Botao>
      <Botao titulo="Itálico (Ctrl+I)" onClick={() => envolver(editor, "*", "*", "texto")}>
        <Italic className="h-4 w-4" />
      </Botao>
      <Botao titulo="Sublinhado (Ctrl+U)" onClick={() => envolver(editor, "__", "__", "texto")}>
        <Underline className="h-4 w-4" />
      </Botao>

      <Popover open={corAberta} onOpenChange={setCorAberta}>
        <PopoverTrigger asChild>
          <span>
            <Botao titulo="Cor do texto">
              <Palette className="h-4 w-4" />
            </Botao>
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" onOpenAutoFocus={(ev) => ev.preventDefault()}>
          <p className="mb-2 text-[12px] font-medium">Cor do texto selecionado</p>
          <Paleta
            cores={CORES_TEXTO}
            onEscolher={(c) => {
              envolver(editor, `{cor:${c}}`, "{/cor}", "texto");
              setCorAberta(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <Popover open={fundoAberto} onOpenChange={setFundoAberto}>
        <PopoverTrigger asChild>
          <span>
            <Botao titulo="Marca-texto">
              <Highlighter className="h-4 w-4" />
            </Botao>
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" onOpenAutoFocus={(ev) => ev.preventDefault()}>
          <p className="mb-2 text-[12px] font-medium">Destacar o texto selecionado</p>
          <Paleta
            cores={CORES_FUNDO}
            onEscolher={(c) => {
              envolver(editor, `{fundo:${c}}`, "{/fundo}", "texto");
              setFundoAberto(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <span className="mx-1 h-5 w-px bg-border" />

      <Popover open={linkAberto} onOpenChange={setLinkAberto}>
        <PopoverTrigger asChild>
          <span>
            <Botao titulo="Link (Ctrl+K)">
              <Link2 className="h-4 w-4" />
            </Botao>
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2 p-3">
          <p className="text-[12px] font-medium">Link no texto selecionado</p>
          <Input
            autoFocus
            value={linkUrl}
            onChange={(ev) => setLinkUrl(ev.target.value)}
            placeholder="https://…"
            className="h-8 text-[12px]"
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                confirmarLink();
              }
            }}
          />
          <Button size="sm" className="h-7 w-full text-[12px]" onClick={confirmarLink}>
            Inserir link
          </Button>
        </PopoverContent>
      </Popover>

      <Popover open={botaoAberto} onOpenChange={setBotaoAberto}>
        <PopoverTrigger asChild>
          <span>
            <Botao titulo="Botão de chamada">
              <MousePointerClick className="h-4 w-4" />
            </Botao>
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2 p-3">
          <p className="text-[12px] font-medium">Botão</p>
          <Input
            value={botaoTexto}
            onChange={(ev) => setBotaoTexto(ev.target.value)}
            placeholder="Texto do botão"
            className="h-8 text-[12px]"
          />
          <Input
            value={botaoUrl}
            onChange={(ev) => setBotaoUrl(ev.target.value)}
            placeholder="https://…"
            className="h-8 text-[12px]"
          />
          <Button
            size="sm"
            className="h-7 w-full text-[12px]"
            onClick={() => {
              if (!botaoTexto.trim()) return toast.error("Escreva o texto do botão");
              if (!urlOk(botaoUrl)) return toast.error("Link inválido (comece com https://)");
              inserirBloco(
                editor,
                `[[${botaoTexto.trim().replace(/[|\]]/g, "")}|${botaoUrl.trim()}]]`,
              );
              setBotaoAberto(false);
            }}
          >
            Inserir botão
          </Button>
        </PopoverContent>
      </Popover>

      <Popover open={imgAberta} onOpenChange={setImgAberta}>
        <PopoverTrigger asChild>
          <span>
            <Botao titulo="Imagem no meio do texto">
              <ImageIcon className="h-4 w-4" />
            </Botao>
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-2 p-3">
          <p className="text-[12px] font-medium">Imagem</p>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-3 text-[12px] hover:bg-muted">
            {subindo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            {img.url ? "Trocar arquivo" : "Subir do computador (até 2 MB)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              disabled={subindo}
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = "";
                if (!f) return;
                try {
                  const url = await subirImagem(f);
                  setImg((i) => ({ ...i, url, alt: i.alt || nomeDoArquivo(f.name) }));
                } catch (er) {
                  toast.error(er instanceof Error ? er.message : "Erro ao subir");
                }
              }}
            />
          </label>
          {img.url && (
            <img src={img.url} alt="" className="max-h-28 w-full rounded border object-contain" />
          )}
          <Input
            value={img.url}
            onChange={(ev) => setImg((i) => ({ ...i, url: ev.target.value }))}
            placeholder="ou cole o endereço https da imagem"
            className="h-8 text-[12px]"
          />
          <Input
            value={img.alt}
            onChange={(ev) => setImg((i) => ({ ...i, alt: ev.target.value }))}
            placeholder="Descrição (aparece se a imagem não carregar)"
            className="h-8 text-[12px]"
          />
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            Largura
            {[100, 75, 50, 30].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setImg((i) => ({ ...i, largura: p }))}
                className={`rounded-full border px-2 py-0.5 ${img.largura === p ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              >
                {p}%
              </button>
            ))}
          </div>
          <Input
            value={img.link}
            onChange={(ev) => setImg((i) => ({ ...i, link: ev.target.value }))}
            placeholder="Link ao clicar na imagem (opcional)"
            className="h-8 text-[12px]"
          />
          <Button
            size="sm"
            className="h-7 w-full text-[12px]"
            disabled={subindo}
            onClick={inserirImagem}
          >
            Inserir imagem
          </Button>
        </PopoverContent>
      </Popover>

      <span className="mx-1 h-5 w-px bg-border" />

      <Botao titulo="Lista" onClick={() => prefixar(editor, "- ")}>
        <List className="h-4 w-4" />
      </Botao>
      <Botao titulo="Centralizar parágrafo" onClick={() => prefixar(editor, "-> ")}>
        <AlignCenter className="h-4 w-4" />
      </Botao>
      <Botao titulo="Divisória" onClick={() => inserirBloco(editor, "---")}>
        <Minus className="h-4 w-4" />
      </Botao>

      <Popover open={varAberta} onOpenChange={setVarAberta}>
        <PopoverTrigger asChild>
          <span>
            <Botao titulo="Inserir dado do contato">
              <Braces className="h-4 w-4" />
              <span className="ml-1 text-[12px]">Nome, empresa…</span>
            </Botao>
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" onOpenAutoFocus={(ev) => ev.preventDefault()}>
          {VARIAVEIS.map((v) => (
            <button
              key={v.valor}
              type="button"
              onClick={() => {
                inserir(editor, v.valor);
                setVarAberta(false);
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] hover:bg-muted"
            >
              {v.rotulo}
              <code className="text-[10px] text-muted-foreground">
                {v.valor.replace(/\|.*\}\}/, "}}")}
              </code>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

const nomeDoArquivo = (n: string) =>
  n
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();

function marcacaoImagem(url: string, alt: string, largura = 100, link = "") {
  const desc = alt.replace(/[\]|]/g, "").trim();
  return `![${desc}${largura < 100 ? `|${largura}%` : ""}](${url})${link ? `(${link})` : ""}`;
}

/**
 * Atalhos e imagens no próprio campo: Ctrl+B/I/U/K, e colar ou arrastar uma
 * imagem sobe o arquivo e insere no ponto do cursor.
 */
export function useAtalhosDoCorpo(editor: Editor, subirImagem: (f: File) => Promise<string>) {
  const subirEInserir = async (f: File) => {
    const id = toast.loading("Subindo imagem…");
    try {
      const url = await subirImagem(f);
      inserirBloco(editor, marcacaoImagem(url, nomeDoArquivo(f.name)));
      toast.success("Imagem inserida", { id });
    } catch (er) {
      toast.error(er instanceof Error ? er.message : "Erro ao subir", { id });
    }
  };
  const imagemDe = (dt: DataTransfer | null | undefined) => {
    const arquivos: File[] = [...Array.from(dt?.files ?? [])];
    for (const item of Array.from(dt?.items ?? [])) {
      const f = item.kind === "file" ? item.getAsFile() : null;
      if (f) arquivos.push(f);
    }
    return arquivos.find((f) => f.type.startsWith("image/")) ?? null;
  };
  return {
    onKeyDown: (ev: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
      if (k === "b") envolver(editor, "**", "**", "texto");
      else if (k === "i") envolver(editor, "*", "*", "texto");
      else if (k === "u") envolver(editor, "__", "__", "texto");
      else if (k === "k") {
        const url = window.prompt("Link (https://…)");
        if (!url) return ev.preventDefault();
        if (!urlOk(url)) {
          toast.error("Link inválido");
          return ev.preventDefault();
        }
        envolver(editor, "[", `](${url.trim()})`, "texto do link");
      } else return;
      ev.preventDefault();
    },
    onPaste: (ev: ClipboardEvent<HTMLTextAreaElement>) => {
      const f = imagemDe(ev.clipboardData);
      if (!f) return;
      ev.preventDefault();
      void subirEInserir(f);
    },
    onDrop: (ev: DragEvent<HTMLTextAreaElement>) => {
      const f = imagemDe(ev.dataTransfer);
      if (!f) return;
      ev.preventDefault();
      void subirEInserir(f);
    },
  };
}
