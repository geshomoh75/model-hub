import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { CopyButton } from "@/client/components/CopyButton";
import { PageHeader } from "@/client/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { getCatalog } from "@/serverFunctions/catalog";
import { getAppOrigin } from "@/serverFunctions/gateway";

export const Route = createFileRoute("/api-access")({
  loader: async () => {
    const [{ origin }, { models }] = await Promise.all([getAppOrigin(), getCatalog()]);
    const enabled = models.filter((m) => m.enabled).map((m) => m.id);
    return { origin, example: enabled[0] ?? "vendor/model", fallback: enabled[1] ?? enabled[0] ?? "vendor/model" };
  },
  head: () => ({ meta: [{ title: "API · Model Hub" }] }),
  component: ApiPage,
});

function ApiPage() {
  const { origin, example, fallback } = Route.useLoaderData();
  const endpoint = `${origin}/api/v1/chat/completions`;
  const request = `curl ${endpoint} \\
  -H "Authorization: Bearer $EVERYAPP_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${example}",
    "models": ["${fallback}"],
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`;
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="API"
        description="OpenAI-compatible chat completions. Authenticate with a personal access token from your Gateway."
      />
      <Card>
        <CardHeader>
          <CardTitle>Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <code data-testid="endpoint-url" className="min-w-0 truncate font-mono text-sm">{endpoint}</code>
          <CopyButton value={endpoint} label="Copy endpoint" successMessage="Endpoint copied" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Example request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre data-testid="example-request" className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{request}</pre>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li><code className="font-mono">models</code> lists fallbacks, tried in order when a model fails.</li>
            <li><code className="font-mono">stream: true</code> returns server-sent events.</li>
            <li><code className="font-mono">GET {origin}/api/v1/models</code> lists the enabled models.</li>
          </ul>
        </CardContent>
      </Card>
    </AppShell>
  );
}
