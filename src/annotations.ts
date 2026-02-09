import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const ANNOTATIONS = {
  readOnly:    { readOnlyHint: true,  destructiveHint: false, openWorldHint: false },
  readWrite:   { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true,  openWorldHint: false },
} as const satisfies Record<string, ToolAnnotations>;
