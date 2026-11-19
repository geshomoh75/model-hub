import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { ModelFormDialog } from "@/client/components/ModelFormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { SortableHeader, ariaSort } from "@/client/components/table/SortableHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatCount, formatModalities, formatPrice } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import { getCatalog } from "@/serverFunctions/catalog";

export const Route = createFileRoute("/")({
  loader: () => getCatalog(),
  head: () => ({ meta: [{ title: "Models · Model Hub" }] }),
  component: ModelsPage,
});

type SortKey = "name" | "provider" | "contextLength" | "inputPrice" | "outputPrice";

function ModelsPage() {
  const { admin, models } = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [adding, setAdding] = useState(false);

  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))].sort(), [models]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    const rows = models.filter(
      (m) =>
        (provider === "all" || m.provider === provider) &&
        (!words || `${m.id} ${m.name} ${m.description}`.toLowerCase().includes(words)),
    );
    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * factor;
    });
  }, [models, provider, query, sort]);

  const column = (key: SortKey) => ({
    getCanSort: () => true,
    getIsSorted: () => (sort?.key === key ? sort.dir : false) as false | "asc" | "desc",
    getToggleSortingHandler: () => () =>
      setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" })),
  });
  const head = (key: SortKey, label: string, align?: "right") => (
    <TableHead aria-sort={ariaSort(column(key))} className={align === "right" ? "text-right" : undefined}>
      <SortableHeader column={column(key)} label={label} align={align === "right" ? "right" : "left"} />
    </TableHead>
  );

  const addButton = admin ? (
    <Button data-testid="add-model" onClick={() => setAdding(true)}>
      <Plus aria-hidden />
      Add model
    </Button>
  ) : null;

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Models" actions={models.length ? addButton : null} />
      {models.length === 0 ? (
        <EmptyState
          title="No models yet"
          description={admin ? "Add a model to start using the API and chat." : "Ask an admin to add one."}
          action={addButton}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                data-testid="model-search"
                aria-label="Search models"
                placeholder="Search models"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <SimpleSelect
              data-testid="provider-filter"
              aria-label="Provider"
              value={provider}
              items={[{ value: "all", label: "All providers" }, ...providers.map((p) => ({ value: p, label: providerLabel(p) }))]}
              onChange={setProvider}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState kind="filtered" title="No models match" />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    {head("name", "Model")}
                    {head("provider", "Provider")}
                    <TableHead className="hidden md:table-cell">Modalities</TableHead>
                    {head("contextLength", "Context", "right")}
                    {head("inputPrice", "Input price", "right")}
                    {head("outputPrice", "Output price", "right")}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((m) => {
                    const [vendor, name] = m.id.split("/") as [string, string];
                    return (
                      <TableRow key={m.id} data-testid="model-row">
                        <TableCell className="max-w-64">
                          <Link to="/models/$vendor/$name" params={{ vendor, name }} className="font-medium hover:underline">
                            {m.name}
                          </Link>
                          <div className="truncate font-mono text-xs text-muted-foreground">{m.id}</div>
                          {!m.enabled ? <Badge variant="secondary" className="mt-1">Disabled</Badge> : null}
                        </TableCell>
                        <TableCell>{providerLabel(m.provider)}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatModalities(m.inputModalities, m.outputModalities)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(m.contextLength)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPrice(m.inputPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPrice(m.outputPrice)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableCard>
          )}
          <p className="text-xs text-muted-foreground">Prices in US dollars per million tokens.</p>
        </div>
      )}
      {adding ? (
        <ModelFormDialog
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await router.invalidate();
          }}
        />
      ) : null}
    </AppShell>
  );
}
