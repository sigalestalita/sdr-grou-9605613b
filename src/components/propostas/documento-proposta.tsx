import grouLogo from "@/assets/grou-logo.png";
import { blocos, dataBr, moedaBr, trechos, type ConteudoProposta } from "@/lib/propostas/render";

/*
 * A proposta como o cliente vê: mesma estrutura do PDF do RD (faixa colorida,
 * logo e dados da Grou, título, condições, tabela de itens, total, seções,
 * rodapé). É o mesmo componente na prévia, na página pública e na impressão
 * (Salvar como PDF do navegador), sempre em fundo branco.
 */
export function DocumentoProposta({
  c,
  numero,
  versao,
}: {
  c: ConteudoProposta;
  numero?: number;
  versao?: number;
}) {
  return (
    <article className="proposta-doc mx-auto w-full max-w-[820px] bg-white px-6 py-8 text-[13px] leading-relaxed text-[#333] sm:px-12 sm:py-10">
      <div className="h-1 w-full rounded-full" style={{ background: c.cor }} />
      <header className="mt-8 flex flex-wrap items-start justify-between gap-4">
        <img src={grouLogo} alt="Grou" className="h-11 w-auto" />
        <div className="text-right text-[11px] leading-snug text-[#666]">
          <p className="font-semibold uppercase tracking-wide text-[#444]">
            Grou Inovação para Gestão de Pessoas Ltda
          </p>
          <p>06.934.208/0001-64</p>
          <p>(51) 3062-3373</p>
        </div>
      </header>

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[26px] font-bold tracking-tight text-[#1a1a1a]">{c.titulo}</h1>
        {numero != null && (
          <p className="text-[11px] text-[#888]">
            Nº {numero}
            {versao && versao > 1 ? ` · versão ${versao}` : ""} · {dataBr(c.emitidaEm)}
          </p>
        )}
      </div>

      <Texto texto={c.introducao} className="mt-4" />
      <Texto texto={c.condicoes} className="mt-2" />

      <table className="mt-6 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[#ddd] text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#555]">
            <th className="py-2 pr-2">Produto ou serviço</th>
            <th className="px-2 py-2 text-center">Qtd.</th>
            <th className="px-2 py-2 text-right">Desconto</th>
            <th className="px-2 py-2 text-right">Preço</th>
            <th className="py-2 pl-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {c.itens.map((i, idx) => (
            <tr key={idx} className="border-b border-[#eee] align-top">
              <td className="py-3 pr-2 font-semibold text-[#222]">{i.nome}</td>
              <td className="px-2 py-3 text-center tabular-nums">
                {i.quantidade.toLocaleString("pt-BR")}
              </td>
              <td className="px-2 py-3 text-right tabular-nums">{i.desconto_rotulo}</td>
              <td className="px-2 py-3 text-right tabular-nums">{moedaBr(i.valor_unitario)}</td>
              <td className="py-3 pl-2 text-right">
                <span className="font-semibold tabular-nums text-[#222]">
                  {moedaBr(i.subtotal)}
                </span>
                <span className="block text-[11px] text-[#888]">{i.recorrencia}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 rounded-lg bg-[#f2f3f5] px-5 py-4">
        {c.totais.desconto > 0 && (
          <Linha rotulo="Descontos" valor={`− ${moedaBr(c.totais.desconto)}`} />
        )}
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold text-[#1a1a1a]">Valor total do pedido</span>
          <span className="text-[15px] font-bold tabular-nums text-[#1a1a1a]">
            {moedaBr(c.totais.total)}
          </span>
        </div>
        {c.totais.impostos > 0 && (
          <>
            <Linha rotulo="Impostos retidos na fonte" valor={`− ${moedaBr(c.totais.impostos)}`} />
            <Linha rotulo="Valor líquido" valor={moedaBr(c.totais.final)} />
          </>
        )}
      </div>

      {c.secoes.map((s, i) => (
        <section key={i} className="mt-8 break-inside-avoid-page">
          <h2 className="text-[15px] font-bold text-[#1a1a1a]">{s.titulo}</h2>
          <Texto texto={s.corpo} className="mt-3" />
        </section>
      ))}

      {c.observacoes && (
        <section className="mt-8">
          <h2 className="text-[15px] font-bold text-[#1a1a1a]">Observações</h2>
          <Texto texto={c.observacoes} className="mt-2" />
        </section>
      )}

      {c.rodape && <Texto texto={c.rodape} className="mt-10 text-[12px]" />}

      <div className="mt-10 h-1 w-full rounded-full opacity-40" style={{ background: c.cor }} />
    </article>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between text-[12px] text-[#555]">
      <span>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

/** Markdown simples (parágrafos, listas, **negrito**, links). */
export function Texto({ texto, className = "" }: { texto: string; className?: string }) {
  if (!texto?.trim()) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      {blocos(texto).map((b, i) =>
        b.t === "h" ? (
          <p key={i} className="pt-1 font-bold text-[#1a1a1a]">
            <Inline linha={b.texto} />
          </p>
        ) : b.t === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-6">
            {b.itens.map((it, j) => (
              <li key={j} className="whitespace-pre-line">
                <Inline linha={it} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.linhas.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline linha={l} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

function Inline({ linha }: { linha: string }) {
  return (
    <>
      {trechos(linha).map((t, i) =>
        t.t === "b" ? (
          <strong key={i} className="font-semibold text-[#222]">
            {t.v}
          </strong>
        ) : t.t === "link" ? (
          <a
            key={i}
            href={t.v}
            target="_blank"
            rel="noreferrer"
            className="text-[#1d4ed8] underline"
          >
            {t.v}
          </a>
        ) : (
          <span key={i}>{t.v}</span>
        ),
      )}
    </>
  );
}
