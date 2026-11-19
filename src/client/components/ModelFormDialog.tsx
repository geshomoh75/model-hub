import { useState, type ReactNode } from "react";
import { FormDialog } from "@/client/components/FormDialog";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { PROVIDERS } from "@/lib/providers";
import { saveModel } from "@/serverFunctions/catalog";

export interface ModelFields {
  id: string;
  name: string;
  provider: string;
  upstreamModel: string;
  inputModalities: string;
  outputModalities: string;
  contextLength: number;
  inputPrice: number;
  outputPrice: number;
  description: string;
}

const PROVIDER_ITEMS = PROVIDERS.map((p) => ({ value: p.id, label: p.label }));

/** Adds a catalogue entry, or edits `model` when given. Admins only. */
export function ModelFormDialog({
  model,
  onClose,
  onSaved,
}: {
  model?: ModelFields;
  onClose: () => void;
  onSaved: (id: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    id: model?.id ?? "",
    name: model?.name ?? "",
    provider: model?.provider ?? "",
    upstreamModel: model?.upstreamModel ?? "",
    inputModalities: model?.inputModalities ?? "text",
    outputModalities: model?.outputModalities ?? "text",
    contextLength: model ? String(model.contextLength) : "",
    inputPrice: model ? String(model.inputPrice) : "",
    outputPrice: model ? String(model.outputPrice) : "",
    description: model?.description ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.provider) return setError("Pick a provider.");
    const numbers = [form.contextLength, form.inputPrice, form.outputPrice].map((v) => Number(v));
    if (numbers.some((n) => v(n))) return setError("Context length and prices must be numbers.");
    setPending(true);
    try {
      const result = await saveModel({
        data: {
          ...(model ? { originalId: model.id } : {}),
          id: form.id,
          name: form.name,
          provider: form.provider as (typeof PROVIDERS)[number]["id"],
          upstreamModel: form.upstreamModel,
          inputModalities: form.inputModalities,
          outputModalities: form.outputModalities,
          contextLength: numbers[0]!,
          inputPrice: numbers[1]!,
          outputPrice: numbers[2]!,
          description: form.description,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onSaved(result.model.id);
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormDialog
      title={model ? "Edit model" : "Add model"}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} pending={pending}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Row label="Model ID" id="model-id-input">
          <Input id="model-id-input" value={form.id} placeholder="vendor/name" onChange={(e) => set("id")(e.target.value)} />
        </Row>
        <Row label="Name" id="model-name">
          <Input id="model-name" value={form.name} onChange={(e) => set("name")(e.target.value)} />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Provider" id="model-provider">
            <SimpleSelect
              id="model-provider"
              data-testid="model-provider"
              className="w-full"
              value={form.provider || null}
              items={PROVIDER_ITEMS}
              placeholder="Choose"
              onChange={set("provider")}
            />
          </Row>
          <Row label="Upstream model" id="model-upstream">
            <Input id="model-upstream" value={form.upstreamModel} onChange={(e) => set("upstreamModel")(e.target.value)} />
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Input modalities" id="model-in">
            <Input id="model-in" value={form.inputModalities} onChange={(e) => set("inputModalities")(e.target.value)} />
          </Row>
          <Row label="Output modalities" id="model-out">
            <Input id="model-out" value={form.outputModalities} onChange={(e) => set("outputModalities")(e.target.value)} />
          </Row>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Row label="Context length" id="model-context">
            <Input id="model-context" inputMode="numeric" value={form.contextLength} placeholder="tokens" onChange={(e) => set("contextLength")(e.target.value)} />
          </Row>
          <Row label="Input price" id="model-input-price">
            <Input id="model-input-price" inputMode="decimal" value={form.inputPrice} placeholder="$ / M tokens" onChange={(e) => set("inputPrice")(e.target.value)} />
          </Row>
          <Row label="Output price" id="model-output-price">
            <Input id="model-output-price" inputMode="decimal" value={form.outputPrice} placeholder="$ / M tokens" onChange={(e) => set("outputPrice")(e.target.value)} />
          </Row>
        </div>
        <Row label="Description" id="model-description">
          <Textarea id="model-description" rows={3} value={form.description} onChange={(e) => set("description")(e.target.value)} />
        </Row>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <button type="submit" hidden />
      </form>
    </FormDialog>
  );
}

function v(n: number) {
  return !Number.isFinite(n) || n < 0;
}

function Row({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** A server function's error as a sentence: a validation issue's message when there is one. */
export function readError(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  try {
    const issues = JSON.parse(text) as { message?: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // Not a list of issues.
  }
  return text || "That didn't work.";
}
