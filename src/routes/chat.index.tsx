import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { readError } from "@/client/components/ModelFormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { createConversation, getConversations } from "@/serverFunctions/chat";

export const Route = createFileRoute("/chat/")({
  loader: () => getConversations(),
  head: () => ({ meta: [{ title: "Chat · Model Hub" }] }),
  component: ChatList,
});

export function NewConversationButton() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  return (
    <Button
      pending={pending}
      onClick={async () => {
        setPending(true);
        try {
          const { id } = await createConversation();
          await navigate({ to: "/chat/$conversationId", params: { conversationId: id } });
        } catch (cause) {
          toast.error(readError(cause));
        } finally {
          setPending(false);
        }
      }}
    >
      <MessageSquarePlus aria-hidden />
      New conversation
    </Button>
  );
}

function ChatList() {
  const conversations = Route.useLoaderData();
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Chat" actions={<NewConversationButton />} />
      {conversations.length === 0 ? (
        <EmptyState title="No conversations yet" description="Start one to try any model in the catalogue." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {conversations.map((c) => (
            <li key={c.id} data-testid="conversation-row" className="flex items-center justify-between gap-3 px-4 py-3">
              <Link
                to="/chat/$conversationId"
                params={{ conversationId: c.id }}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {c.title}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                <span className="font-mono">{c.modelId}</span> · {c.updatedAt.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
