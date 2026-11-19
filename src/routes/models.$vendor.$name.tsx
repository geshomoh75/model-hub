import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { CopyButton } from "@/client/components/CopyButton";
import { ModelFormDialog, readError } from "@/client/components/ModelFormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { formatCount, formatModalities, formatPrice } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import { getCatalogModel, setModelEnabled } from "@/serverFunctions/catalog";
import { toast } from "sonner";

export const Route = createFileRoute("/models/$vendor/$name")({
  loader: ({ params }) => getCatalogModel({ data: { id: `${params.vendor}/${params.name}` } }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.model?.name ?? "Model"} · Model Hub` }] }),
  component: ModelPage,
});

const back = (
  <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
    <ChevronLeft className="size-4" aria-hidden />
    Models
  </Link>
);

function ModelPage() {
  const { admin, model } = Route.useLoaderData();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);

  if (!model) {
    return (
      <AppShell nav={<AppNav />}>
        <PageHeader title="Model not found" backLink={back} />
      </AppShell>
    );
  }

  async function toggle() {
    if (!model) return;
    setToggling(true);
    try {
      await setModelEnabled({ data: { id: model.id, enabled: !model.enabled } });
      await router.invalidate();
    } catch (cause) {
      toast.error(readError(cause));
    } finally {
      setToggling(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        backLink={back}
        title={model.name}
        description={
          <span className="inline-flex items-center gap-1">
            <code data-testid="model-id" className="font-mono">{model.id}</code>
            <CopyButton value={model.id} label="Copy model ID" successMessage="Model ID copied" />
            {!model.enabled ? <Badge variant="secondary">Disabled</Badge> : null}
          </span>
        }
        actions={
          admin ? (
            <>
              <Button variant="outline" data-testid="toggle-enabled" pending={toggling} onClick={toggle}>
                {model.enabled ? "Disable" : "Enable"}
              </Button>
              <Button onClick={() => setEditing(true)}>Edit</Button>
            </>
          ) : null
        }
      />
      {model.description ? <p className="text-sm">{model.description}</p> : null}
      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Fact label="Provider">{providerLabel(model.provider)}</Fact>
            <Fact label="Modalities">{formatModalities(model.inputModalities, model.outputModalities)}</Fact>
            <Fact label="Context length">{formatCount(model.contextLength)} tokens</Fact>
            <Fact label="Input price" testId="input-price">{formatPrice(model.inputPrice)} / M tokens</Fact>
            <Fact label="Output price" testId="output-price">{formatPrice(model.outputPrice)} / M tokens</Fact>
            {admin ? <Fact label="Upstream model"><code className="font-mono">{model.upstreamModel}</code></Fact> : null}
          </dl>
        </CardContent>
      </Card>
      {editing ? (
        <ModelFormDialog
          model={model}
          onClose={() => setEditing(false)}
          onSaved={async (id) => {
            setEditing(false);
            const [vendor, name] = id.split("/") as [string, string];
            if (id !== model.id) await navigate({ to: "/models/$vendor/$name", params: { vendor, name } });
            else await router.invalidate();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function Fact({ label, testId, children }: { label: string; testId?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}
