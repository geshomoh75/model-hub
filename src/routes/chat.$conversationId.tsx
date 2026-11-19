import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { readError } from "@/client/components/ModelFormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";
import { formatCost, formatCount } from "@/lib/format";
import {
  deleteConversation,
  getConversation,
  renameConversation,
  sendChatMessage,
  updateConversationSettings,
} from "@/serverFunctions/chat";

export const Route = createFileRoute("/chat/$conversationId")({
  loader: ({ params }) => getConversation({ data: { id: params.conversationId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.conversation.title ?? "Chat"} · Model Hub` }] }),
  component: ConversationPage,
  notFoundComponent: () => (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Conversation not found" backLink={back} />
    </AppShell>
  ),
});

const back = (
  <Link to="/chat" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
    <ChevronLeft className="size-4" aria-hidden />
    Conversations
  </Link>
);

function ConversationPage() {
  const { conversation, models } = Route.useLoaderData();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const nameOf = (id: string) => models.find((m) => m.id === id)?.name ?? id;

  const [settings, setSettings] = useState({
    modelId: conversation.modelId,
    fallbackModelIds: conversation.fallbackModelIds,
    systemPrompt: conversation.systemPrompt,
  });
  const [saving, setSaving] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSettings({
      modelId: conversation.modelId,
      fallbackModelIds: conversation.fallbackModelIds,
      systemPrompt: conversation.systemPrompt,
    });
  }, [conversation.id]);

  async function save(next: typeof settings) {
    setSettings(next);
    setSaving((n) => n + 1);
    try {
      await updateConversationSettings({ data: { id: conversation.id, ...next } });
    } catch (cause) {
      toast.error(readError(cause));
    } finally {
      setSaving((n) => n - 1);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content) return;
    setError(null);
    setSending(content);
    setDraft("");
    try {
      const result = await sendChatMessage({ data: { id: conversation.id, content } });
      if (!result.ok) {
        setError(result.error);
        setDraft(content);
      }
      await router.invalidate();
    } catch (cause) {
      setError(readError(cause));
      setDraft(content);
    } finally {
      setSending(null);
    }
  }

  const modelItems = models.map((m) => ({ value: m.id, label: m.name }));
  const fallbackChoices = modelItems.filter(
    (m) => m.value !== settings.modelId && !settings.fallbackModelIds.includes(m.value),
  );

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        backLink={back}
        title={conversation.title}
        actions={
          <>
            <Button variant="outline" onClick={() => setRenaming(true)}>Rename</Button>
            <Button variant="outline" onClick={() => setDeleting(true)}>Delete</Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="chat-model">Model</Label>
              <SimpleSelect
                id="chat-model"
                data-testid="chat-model"
                className="w-full"
                value={settings.modelId}
                items={modelItems.some((m) => m.value === settings.modelId) ? modelItems : [{ value: settings.modelId, label: settings.modelId }, ...modelItems]}
                onChange={(modelId) =>
                  save({ ...settings, modelId, fallbackModelIds: settings.fallbackModelIds.filter((id) => id !== modelId) })
                }
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="add-fallback">Fallbacks, in order</Label>
              {settings.fallbackModelIds.length ? (
                <ol className="flex flex-wrap gap-1.5">
                  {settings.fallbackModelIds.map((id, index) => (
                    <li key={id} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-sm">
                      <span className="text-muted-foreground tabular-nums">{index + 1}.</span>
                      <span data-testid="fallback-item">{nameOf(id)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${nameOf(id)}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => save({ ...settings, fallbackModelIds: settings.fallbackModelIds.filter((f) => f !== id) })}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
              {fallbackChoices.length && settings.fallbackModelIds.length < 5 ? (
                <SimpleSelect
                  id="add-fallback"
                  data-testid="add-fallback"
                  className="w-full"
                  value={null}
                  placeholder="Add a fallback model"
                  items={fallbackChoices}
                  onChange={(id) => save({ ...settings, fallbackModelIds: [...settings.fallbackModelIds, id] })}
                />
              ) : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="system-prompt">System prompt</Label>
            <Textarea
              id="system-prompt"
              rows={2}
              value={settings.systemPrompt}
              placeholder="Optional"
              onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
              onBlur={() => {
                if (settings.systemPrompt !== conversation.systemPrompt) void save(settings);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4" aria-label="Messages">
        {conversation.messages.length === 0 && !sending ? (
          <EmptyState variant="plain" size="sm" title="No messages yet" />
        ) : null}
        {conversation.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} data-testid="message" data-role="user" className="ml-auto max-w-[85%] rounded-xl bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap">
              {m.content}
            </div>
          ) : (
            <div key={m.id} data-testid="message" data-role="assistant" className="max-w-[85%] space-y-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
              <div className="whitespace-pre-wrap">{m.content}</div>
              <div data-testid="message-meta" className="text-xs text-muted-foreground">
                <span className="font-mono">{m.modelId}</span> · {formatCount((m.promptTokens ?? 0) + (m.completionTokens ?? 0))} tokens ({formatCount(m.promptTokens ?? 0)} in, {formatCount(m.completionTokens ?? 0)} out) · {formatCost(m.cost ?? 0)}
              </div>
            </div>
          ),
        )}
        {sending ? (
          <>
            <div className="ml-auto max-w-[85%] rounded-xl bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap">{sending}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Waiting for {nameOf(settings.modelId)}
            </div>
          </>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          data-testid="chat-input"
          aria-label="Message"
          rows={3}
          placeholder="Write a message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!draft.trim() || saving > 0} pending={sending !== null}>
            Send
          </Button>
        </div>
      </form>

      {renaming ? <RenameDialog id={conversation.id} title={conversation.title} onClose={() => setRenaming(false)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this conversation?"
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await deleteConversation({ data: { id: conversation.id } });
              setDeleting(false);
              await navigate({ to: "/chat" });
            } catch (cause) {
              toast.error(readError(cause));
              setDeleting(false);
            }
          }}
        >
          Its messages are deleted too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function RenameDialog({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setPending(true);
    setError(null);
    try {
      await renameConversation({ data: { id, title: value } });
      await router.invalidate();
      onClose();
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <FormDialog
      title="Rename conversation"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} pending={pending}>Save</Button>
        </>
      }
    >
      <form
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor="conversation-title">Title</Label>
        <Input id="conversation-title" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </FormDialog>
  );
}
