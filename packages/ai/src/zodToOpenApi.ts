/**
 * Convert Zod schemas to Gemini-safe function-declaration parameters.
 *
 * Uses Zod 4's native `z.toJSONSchema`, then strips/rewrites keywords the
 * Gemini Developer API rejects. Avoids min/max numeric bounds — Flash models
 * return “constraint has too many states” for those.
 */
import { z, type ZodType } from 'zod';

/** Keys Gemini `function_declarations.parameters` does not accept (HTTP 400). */
const GEMINI_UNSUPPORTED_KEYS = new Set([
  'additionalProperties',
  'additionalItems',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minimum',
  'maximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'pattern',
  'format',
  'propertyNames',
  'patternProperties',
  'const',
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'definitions',
  'unevaluatedProperties',
  'unevaluatedItems',
  'minContains',
  'maxContains',
  'prefixItems',
  'contentEncoding',
  'contentMediaType',
  'examples',
  'default',
  'title',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function appendDescription(node: Record<string, unknown>, extra: string): void {
  const prev = typeof node.description === 'string' ? node.description.trim() : '';
  node.description = prev ? `${prev} ${extra}` : extra;
}

/** True when every enum entry is a string (Gemini-safe). */
function enumIsAllStrings(values: unknown[]): boolean {
  return values.length > 0 && values.every(v => typeof v === 'string');
}

/** Infer JSON Schema type from non-string enum values. */
function typeFromEnumValues(values: unknown[]): string | undefined {
  if (values.every(v => typeof v === 'boolean')) return 'boolean';
  if (values.every(v => typeof v === 'number' && Number.isInteger(v))) return 'integer';
  if (values.every(v => typeof v === 'number')) return 'number';
  return undefined;
}

/**
 * Drop non-string enums (Gemini Schema.enum is string-only). Keep type and
 * document allowed values in description — never emit minimum/maximum.
 */
function rewriteNonStringEnum(node: Record<string, unknown>): void {
  const en = node.enum;
  if (!Array.isArray(en) || en.length === 0) return;
  if (enumIsAllStrings(en)) return;

  const inferred = typeFromEnumValues(en);
  if (inferred && node.type == null) node.type = inferred;
  appendDescription(node, `Must be one of: ${en.join(', ')}.`);
  delete node.enum;
}

/**
 * Collapse anyOf/oneOf of same-type single-value numeric (or boolean) enums
 * into one simple schema node — avoids Gemini rejecting numeric enum entries.
 */
function collapseHomogeneousUnion(node: Record<string, unknown>): void {
  for (const key of ['anyOf', 'oneOf'] as const) {
    const branches = node[key];
    if (!Array.isArray(branches) || branches.length < 2) continue;

    const objs = branches.filter(isPlainObject);
    if (objs.length !== branches.length) continue;

    const values: unknown[] = [];
    let sharedType: string | undefined;
    let ok = true;
    for (const b of objs) {
      const en = b.enum;
      const t = typeof b.type === 'string' ? b.type : undefined;
      if (!Array.isArray(en) || en.length !== 1) {
        ok = false;
        break;
      }
      const v = en[0];
      if (typeof v === 'string') {
        ok = false;
        break;
      }
      if (sharedType == null) sharedType = t ?? typeFromEnumValues([v]);
      else if ((t ?? typeFromEnumValues([v])) !== sharedType) {
        ok = false;
        break;
      }
      values.push(v);
    }
    if (!ok || !sharedType) continue;

    delete node.anyOf;
    delete node.oneOf;
    node.type = sharedType;
    appendDescription(node, `Must be one of: ${values.join(', ')}.`);
  }
}

/**
 * Cap string enums — very long lists inflate Gemini's constraint state space.
 * Keep values in the description instead.
 */
function simplifyLongStringEnum(node: Record<string, unknown>): void {
  const en = node.enum;
  if (!Array.isArray(en) || en.length <= 12) return;
  if (!enumIsAllStrings(en)) return;
  appendDescription(node, `Allowed values include: ${en.slice(0, 12).join(', ')}, …`);
  delete node.enum;
  if (node.type == null) node.type = 'string';
}

function sanitizeForGemini(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForGemini);
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (GEMINI_UNSUPPORTED_KEYS.has(key)) continue;
    out[key] = sanitizeForGemini(child);
  }

  collapseHomogeneousUnion(out);
  rewriteNonStringEnum(out);
  simplifyLongStringEnum(out);

  return out;
}

/**
 * Full JSON Schema (draft 2020-12) for MCP `inputSchema` / `outputSchema`.
 * Keeps `default`, `minimum`, `enum`, … — MCP clients accept standard JSON Schema.
 * `io: 'input'` makes `.default()` fields optional and describes the *input*
 * side of `.transform()` schemas (e.g. `elementSymbol`).
 */
export function zodToJsonSchemaInput(schema: ZodType): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema as z.ZodType, {
      target: 'draft-2020-12',
      unrepresentable: 'any',
      io: 'input',
    }) as Record<string, unknown>;
    delete json.$schema;
    if (json.type == null && json.properties == null && json.anyOf == null) json.type = 'object';
    if (json.type === 'object' && json.properties == null) json.properties = {};
    return json;
  } catch {
    return { type: 'object', properties: {} };
  }
}

export function zodToOpenApiParameters(schema: ZodType): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema as z.ZodType, {
      target: 'openapi-3.0',
      unrepresentable: 'any',
      io: 'input',
    }) as Record<string, unknown>;

    const cleaned = sanitizeForGemini(json) as Record<string, unknown>;
    if (cleaned.type == null) cleaned.type = 'object';
    if (cleaned.properties == null || typeof cleaned.properties !== 'object') {
      cleaned.properties = {};
    }
    return cleaned;
  } catch {
    return { type: 'object', properties: {} };
  }
}
