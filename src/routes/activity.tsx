import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useCallback } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { TablePagination } from "@/client/components/table/TablePagination";
import { Badge } from "@/client/components/ui/badge";
import { buttonVariants } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/client/components/ui/chart";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { activityFilters, type ActivityFilters } from "@/lib/activityFilters";
import { formatCost, formatCount } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import { getActivity } from "@/serverFunctions/activity";

export const Route = createFileRoute("/activity")({
  validateSearch: (search: Record<string, unknown>): ActivityFilters => {
    const clean = Object.fromEntries(Object.entries(search).filter(([, v]) => v !== "" && v != null));
    const parsed = activityFilters.safeParse(clean);
    return parsed.success ? parsed.data : {};
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getActivity({ data: deps }),
  head: () => ({ meta: [{ title: "Activity · Model Hub" }] }),
  component: ActivityPage,
});

const chartConfig = { requests: { label: "Requests" } } satisfies ChartConfig;

function ActivityPage() {
  const { admin, summary, list, members } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setFilter = useCallback(
    (key: keyof ActivityFilters, value: string | number | undefined) =>
      navigate({ search: (prev) => ({ ...prev, [key]: value === "all" || value === "" ? undefined : value, page: key === "page" ? (value as number) : undefined }) }),
    [navigate],
  );

  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key !== "page" && value !== undefined) exportParams.set(key, String(value));
  }
  const exportHref = `/api/activity.csv${exportParams.size ? `?${exportParams}` : ""}`;
  const all = (label: string) => ({ value: "all", label });

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Activity"
        description={admin ? "Everyone's usage" : "Your usage"}
        actions={
          <a href={exportHref} download className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden />
            Export CSV
          </a>
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" className="w-40" value={summary.range.from} onChange={(e) => setFilter("from", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" className="w-40" value={summary.range.to} onChange={(e) => setFilter("to", e.target.value)} />
        </div>
        <SimpleSelect
          aria-label="Model"
          data-testid="model-filter"
          value={search.model ?? "all"}
          items={[all("All models"), ...summary.modelIds.map((id) => ({ value: id, label: id }))]}
          onChange={(v) => setFilter("model", v)}
        />
        <SimpleSelect
          aria-label="Provider"
          data-testid="provider-filter"
          value={search.provider ?? "all"}
          items={[all("All providers"), ...summary.providers.map((p) => ({ value: p, label: providerLabel(p) }))]}
          onChange={(v) => setFilter("provider", v)}
        />
        <SimpleSelect
          aria-label="Status"
          data-testid="status-filter"
          value={search.status ?? "all"}
          items={[all("All statuses"), { value: "success", label: "Success" }, { value: "error", label: "Error" }]}
          onChange={(v) => setFilter("status", v)}
        />
        {admin && members ? (
          <SimpleSelect
            aria-label="Member"
            data-testid="member-filter"
            value={search.member ?? "all"}
            items={[all("All members"), ...members.map((m) => ({ value: m.id, label: m.email }))]}
            onChange={(v) => setFilter("member", v)}
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Spend" testId="stat-spend" value={formatCost(summary.totals.spend)} />
        <Stat label="Requests" testId="stat-requests" value={formatCount(summary.totals.requests)} />
        <Stat label="Tokens" testId="stat-tokens" value={formatCount(summary.totals.tokens)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests per day</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-48">
            <BarChart data={summary.series} margin={{ left: 0, right: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(day: string) => day.slice(5)} minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="requests" fill="var(--color-requests)" radius={3} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {summary.byModel.length ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">By model</h2>
          <TableCard data-testid="model-breakdown">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byModel.map((row) => (
                  <TableRow key={`${row.modelId} ${row.provider}`}>
                    <TableCell className="font-mono text-xs">{row.modelId}</TableCell>
                    <TableCell>{providerLabel(row.provider)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(row.requests)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(row.tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCost(row.spend)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Generations</h2>
        {list.total === 0 ? (
          <EmptyState
            kind={Object.keys(search).length ? "filtered" : "no-data"}
            title="No generations in this range"
            description="Calls to the API and chat replies appear here."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  {admin ? <TableHead>Member</TableHead> : null}
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <TableRow key={row.id} data-testid="generation-row">
                    <TableCell className="whitespace-nowrap tabular-nums">{row.createdAt.slice(0, 19).replace("T", " ")}</TableCell>
                    {admin ? <TableCell className="max-w-40 truncate">{row.userEmail}</TableCell> : null}
                    <TableCell className="font-mono text-xs">{row.modelId}</TableCell>
                    <TableCell>{providerLabel(row.provider)}</TableCell>
                    <TableCell>{row.source}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(row.promptTokens + row.completionTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCost(row.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(row.latencyMs)} ms</TableCell>
                    <TableCell>
                      {row.status === "success" ? (
                        <Badge variant="success">Success</Badge>
                      ) : (
                        <Badge variant="destructive" title={row.error ?? undefined}>Error</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={list.page}
              pageSize={list.pageSize}
              totalCount={list.total}
              onPageChange={(page) => setFilter("page", page === 1 ? undefined : page)}
            />
          </TableCard>
        )}
      </section>
    </AppShell>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div data-testid={testId} className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
