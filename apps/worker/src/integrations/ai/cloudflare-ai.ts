export type CloudflareAIClient = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

export type CloudflareToolCall = {
  name: string | null;
  arguments: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function firstMessage(result: unknown): Record<string, unknown> | null {
  const root = asRecord(result);
  const choices = root && Array.isArray(root.choices) ? root.choices : [];
  const firstChoice = asRecord(choices[0]);
  return firstChoice ? asRecord(firstChoice.message) : null;
}

/** Thin provider boundary: the application supplies model/input, this adapter owns the binding call. */
export function runCloudflareAI(
  client: CloudflareAIClient,
  model: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  return client.run(model, input);
}

/** Normalizes the text field across Workers AI response envelope variants. */
export function extractCloudflareAssistantText(result: unknown): unknown {
  if (typeof result === "string") return result;
  const root = asRecord(result);
  const nestedResult = root && asRecord(root.result);
  const message = firstMessage(result);
  const nestedMessage = nestedResult ? firstMessage(nestedResult) : null;
  return root?.response ||
    nestedResult?.response ||
    message?.content ||
    root?.output_text ||
    nestedMessage?.content ||
    "";
}

/** Normalizes tool calls across the response envelopes used by Workers AI models. */
export function extractCloudflareToolCalls(result: unknown): CloudflareToolCall[] {
  const root = asRecord(result);
  const nestedResult = root && asRecord(root.result);
  const message = firstMessage(result);
  const nestedMessage = nestedResult ? firstMessage(nestedResult) : null;
  const candidates = [
    root?.tool_calls,
    nestedResult?.tool_calls,
    message?.tool_calls,
    nestedMessage?.tool_calls,
  ];
  const calls: CloudflareToolCall[] = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      const call = asRecord(item);
      if (!call) continue;
      const fn = asRecord(call.function);
      const name = typeof call.name === "string"
        ? call.name
        : typeof fn?.name === "string" ? fn.name : null;
      const args = call.arguments ?? fn?.arguments;
      calls.push({ name, arguments: args });
    }
  }
  return calls;
}
