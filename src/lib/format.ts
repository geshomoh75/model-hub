// Pure helpers shared by the server and the pages.

/** Cost in US dollars of a call, from per-million-token prices. */
export function costOf(
  prices: { inputPrice: number; outputPrice: number },
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    (promptTokens * prices.inputPrice + completionTokens * prices.outputPrice) /
    1_000_000
  );
}

/** The models to try, in order: `model` first, then `models`, without repeats. */
export function candidateIds(model?: string, models?: readonly string[]): string[] {
  const ids: string[] = [];
  for (const id of [model, ...(models ?? [])]) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function dollars(value: number, max: number): string {
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: max });
}

/** A per-million price: $0.15, $10.00. */
export function formatPrice(value: number): string {
  return dollars(value, 4);
}

/** A spend: $0.00, $0.000079, $1.25. */
export function formatCost(value: number): string {
  if (value === 0) return "$0.00";
  if (Math.abs(value) < 0.01) return "$" + value.toFixed(6);
  return dollars(value, 4);
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** "text,image" and "text" as "Text, Image → Text". */
export function formatModalities(input: string, output: string): string {
  const words = (list: string) =>
    list
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(", ");
  return words(input) + " → " + words(output);
}

/** One CSV field, quoted when it needs to be; text that a spreadsheet would run as a formula is prefixed with '. */
export function csvField(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const text = typeof value === "string" && /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
