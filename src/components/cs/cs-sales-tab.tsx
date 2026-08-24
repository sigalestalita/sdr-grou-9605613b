import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCsSale, listCsSales, saveCsSale } from "@/lib/cs-sales.functions";
import { Package, Trash2, Wrench, Plus, Pencil } from "lucide-react";

type Kind = "produto" | "servico";
type Status = "fechado" | "em_negociacao" | "cancelado" | "renovacao";
type Recurrence = "unica" | "mensal" | "trimestral" | "semestral" | "anual";

const STATUS_LABEL: Record<Status, string> = {
  fechado: "Fechado",
  em_negociacao: "Em negociação",
  cancelado: "Cancelado",
  renovacao: "Renovação",
};
const STATUS_CLASS: Record<Status, string> = {
  fechado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  em_negociacao: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  cancelado: "border-destructive/40 bg-destructive/10 text-destructive",
  renovacao: "border-primary/40 bg-primary/10 text-primary",
};
const RECURRENCE_LABEL: Record<Recurrence, string> = {
  unica: "Venda única",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

/** Aceita formatos BR e US: "1.000" -> 1000, "1.000,50" -> 1000.5, "16,647" -> 16647, "1234.56" -> 1234.56 */
export const parseMoney = (raw: string): number => {
  const s = String(raw ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  let decimals = 0;
  if (sep >= 0) {
    const tail = s.slice(sep + 1);
    // separador decimal só quando sobram 1 ou 2 dígitos depois dele
    if (/^\d{1,2}$/.test(tail)) decimals = tail.length;
  }
  const digits = s.replace(/[.,]/g, "");
  const neg = digits.startsWith("-");
  const n = Number(digits.replace(/-/g, "")) / Math.pow(10, decimals);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
};

const fmtNum = (v: number) => (v ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "");


type SaleRow = {
  id: string;
  item_kind: Kind;
  item_name: string;
  category: string | null;
  quantity: number;
  unit_value: number;
  discount: number;
  total_value: number;
  status: Status;
  recurrence: Recurrence;
  sale_date: string;
  period_start: string | null;
  period_end: string | null;
  contract_ref: string | null;
  payment_method: string | null;
  notes: string | null;
  owner_user_id: string | null;
};

const emptyForm = () => ({
  id: undefined as string | undefined,
  itemKind: "produto" as Kind,
  itemName: "",
  category: "",
  quantity: "1",
  unitValue: "",
  discount: "0",
  status: "fechado" as Status,
  recurrence: "unica" as Recurrence,
  saleDate: format(new Date(), "yyyy-MM-dd"),
  periodStart: "",
  periodEnd: "",
  contractRef: "",
  paymentMethod: "",
  notes: "",
});

export function CsSalesTab({
  clientUid,
  authorName,
}: {
  clientUid: string;
  authorName: (id: string | null | undefined) => string;
}) {
  const listFn = useServerFn(listCsSales);
  const saveFn = useServerFn(saveCsSale);
  const delFn = useServerFn(deleteCsSale);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cs-sales", clientUid],
    queryFn: () => listFn({ data: { clientUid } }),
  });

  const [view, setView] = useState<"todos" | Kind>("todos");
  const [form, setForm] = useState(emptyForm);
  const [openForm, setOpenForm] = useState(false);

  const sales = (data?.sales ?? []) as unknown as SaleRow[];
  const visible = useMemo(
    () => (view === "todos" ? sales : sales.filter((s) => s.item_kind === view)),
    [sales, view],
  );

  const totals = useMemo(() => {
    const valid = sales.filter((s) => s.status !== "cancelado");
    const sum = (k?: Kind) =>
      valid.filter((s) => !k || s.item_kind === k).reduce((a, s) => a + Number(s.total_value || 0), 0);
    return {
      geral: sum(),
      produto: sum("produto"),
      servico: sum("servico"),
      countProduto: valid.filter((s) => s.item_kind === "produto").length,
      countServico: valid.filter((s) => s.item_kind === "servico").length,
    };
  }, [sales]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cs-sales", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: form.id,
          clientUid,
          itemKind: form.itemKind,
          itemName: form.itemName.trim(),
          category: form.category || null,
          quantity: Number(form.quantity || 1),
          unitValue: Number(form.unitValue || 0),
          discount: Number(form.discount || 0),
          status: form.status,
          recurrence: form.recurrence,
          saleDate: form.saleDate,
          periodStart: form.periodStart || null,
          periodEnd: form.periodEnd || null,
          contractRef: form.contractRef || null,
          paymentMethod: form.paymentMethod || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Venda registrada");
      setForm(emptyForm());
      setOpenForm(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar venda"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Venda removida");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const edit = (s: SaleRow) => {
    setForm({
      id: s.id,
      itemKind: s.item_kind,
      itemName: s.item_name,
      category: s.category ?? "",
      quantity: String(s.quantity ?? 1),
      unitValue: String(s.unit_value ?? ""),
      discount: String(s.discount ?? 0),
      status: s.status,
      recurrence: s.recurrence,
      saleDate: s.sale_date,
      periodStart: s.period_start ?? "",
      periodEnd: s.period_end ?? "",
      contractRef: s.contract_ref ?? "",
      paymentMethod: s.payment_method ?? "",
      notes: s.notes ?? "",
    });
    setOpenForm(true);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total vendido</p>
          <p className="text-lg font-semibold">{brl(totals.geral)}</p>
        </Card>
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Package className="h-3 w-3" /> Produtos ({totals.countProduto})
          </p>
          <p className="text-lg font-semibold">{brl(totals.produto)}</p>
        </Card>
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Wrench className="h-3 w-3" /> Serviços ({totals.countServico})
          </p>
          <p className="text-lg font-semibold">{brl(totals.servico)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["todos", "produto", "servico"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                view === v ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              {v === "todos" ? "Tudo" : v === "produto" ? "Produtos" : "Serviços"}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(emptyForm());
            setOpenForm((o) => !o);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova venda
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Histórico de tudo que já foi vendido para este cliente, separado entre produto e serviço.
        No futuro estes registros serão alimentados pela planilha de faturamento/receita.
      </p>

      {openForm && (
        <Card className="space-y-2 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={form.itemKind}
              onChange={(e) => setForm({ ...form, itemKind: e.target.value as Kind })}
            >
              <option value="produto">Produto</option>
              <option value="servico">Serviço</option>
            </select>
            <Input
              placeholder="Nome do produto/serviço"
              value={form.itemName}
              onChange={(e) => setForm({ ...form, itemName: e.target.value })}
            />
            <Input
              placeholder="Categoria (ex.: PDA, Consultoria)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <Input
              type="date"
              value={form.saleDate}
              onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                placeholder="Qtd"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Valor unitário"
                value={form.unitValue}
                onChange={(e) => setForm({ ...form, unitValue: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Desconto"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
              >
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <select
                className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value as Recurrence })}
              >
                {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <Input
              type="date"
              placeholder="Início da vigência"
              value={form.periodStart}
              onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
            />
            <Input
              type="date"
              placeholder="Fim da vigência"
              value={form.periodEnd}
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
            />
            <Input
              placeholder="Contrato / pedido"
              value={form.contractRef}
              onChange={(e) => setForm({ ...form, contractRef: e.target.value })}
            />
            <Input
              placeholder="Forma de pagamento"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            />
          </div>
          <Textarea
            rows={2}
            placeholder="Observações"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Total:{" "}
              {brl(
                Math.max(
                  Number(form.quantity || 1) * Number(form.unitValue || 0) -
                    Number(form.discount || 0),
                  0,
                ),
              )}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpenForm(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={form.itemName.trim().length < 2 || save.isPending}
                onClick={() => save.mutate()}
              >
                Salvar venda
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico de vendas…</p>
      ) : visible.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma venda registrada para este cliente.
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <Card key={s.id} className="space-y-1 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {s.item_kind === "produto" ? (
                      <Package className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5 text-primary" />
                    )}
                    {s.item_name}
                    {s.category && (
                      <span className="text-xs font-normal text-muted-foreground">
                        · {s.category}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(`${s.sale_date}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })} ·{" "}
                    {Number(s.quantity)} × {brl(Number(s.unit_value))}
                    {Number(s.discount) > 0 ? ` − ${brl(Number(s.discount))}` : ""} ·{" "}
                    {RECURRENCE_LABEL[s.recurrence]} · {authorName(s.owner_user_id)}
                  </p>
                  {(s.period_start || s.period_end || s.contract_ref || s.payment_method) && (
                    <p className="text-xs text-muted-foreground">
                      {s.period_start && s.period_end
                        ? `Vigência ${format(new Date(`${s.period_start}T12:00:00`), "dd/MM/yy")} – ${format(new Date(`${s.period_end}T12:00:00`), "dd/MM/yy")}`
                        : ""}
                      {s.contract_ref ? ` · Contrato ${s.contract_ref}` : ""}
                      {s.payment_method ? ` · ${s.payment_method}` : ""}
                    </p>
                  )}
                  {s.notes && <p className="mt-1 text-xs">{s.notes}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm font-semibold">{brl(Number(s.total_value))}</p>
                  <Badge className={`text-[10px] ${STATUS_CLASS[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => edit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
