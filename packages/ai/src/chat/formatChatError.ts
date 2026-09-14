/**
 * Map chat/provider failures to a short user message + optional technical detail.
 * Never surface raw SDK dumps as the primary UI copy.
 */

export type FormattedChatError = {
  /** One-line plain-language message for the banner. */
  message: string;
  /** Truncated technical detail (SDK text, status, etc.) for an expandable section. */
  detail?: string;
};

const DETAIL_MAX = 800;

function truncateDetail(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= DETAIL_MAX) return t;
  return `${t.slice(0, DETAIL_MAX - 1)}…`;
}

function errorHttpStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
    return (e as { status: number }).status;
  }
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/\[(\d{3})[ \]]/) ?? msg.match(/\b(401|403|404|429|500|503)\b/);
  return m ? Number(m[1]) : undefined;
}

function rawMessage(e: unknown): string {
  if (e instanceof Error) {
    const parts = [e.message];
    if (e.cause instanceof Error && e.cause.message && e.cause.message !== e.message) {
      parts.push(e.cause.message);
    }
    if (
      e.name === 'ModelBusyError' &&
      e &&
      typeof e === 'object' &&
      'busyCause' in e &&
      (e as { busyCause: unknown }).busyCause
    ) {
      const bc = rawMessage((e as { busyCause: unknown }).busyCause);
      if (bc && !parts.includes(bc)) parts.push(bc);
    }
    return parts.join(' | ');
  }
  return String(e);
}

/**
 * Convert any thrown chat error into user-facing copy.
 */
export function formatChatError(error: unknown): FormattedChatError {
  const raw = rawMessage(error);
  const primary = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  const status = errorHttpStatus(error) ?? errorHttpStatus(raw);
  const detail = truncateDetail(raw === primary ? raw : raw);

  // Prefer short messages already thrown by the provider when they are user-safe.
  const alreadyFriendly =
    primary.length < 120 &&
    !primary.includes('GoogleGenerativeAI') &&
    !primary.includes('generativelanguage.googleapis.com') &&
    !/tools\[\d+\]/.test(primary);

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('api_key_invalid') ||
    (lower.includes('permission') && lower.includes('denied'))
  ) {
    return {
      message: 'API key missing or invalid — check Settings → AI.',
      detail,
    };
  }

  if (
    status === 404 ||
    lower.includes('model not found') ||
    lower.includes('is not found') ||
    (lower.includes('not found') && lower.includes('model')) ||
    lower.includes('no longer available')
  ) {
    return {
      message: 'Gemini model unavailable — hard-refresh the page and try again.',
      detail,
    };
  }

  if (
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('spending cap')
  ) {
    return {
      message: alreadyFriendly ? primary : 'Rate limit or quota reached — wait a minute and try again.',
      detail,
    };
  }

  if (
    status === 503 ||
    status === 500 ||
    lower.includes('overloaded') ||
    lower.includes('unavailable') ||
    lower.includes('capacity') ||
    lower.includes('gemini is busy')
  ) {
    return {
      message: alreadyFriendly ? primary : 'Gemini is busy — try again in a moment.',
      detail,
    };
  }

  if (
    status === 400 &&
    (lower.includes('function_declarations') ||
      lower.includes('invalid json payload') ||
      lower.includes('unknown name') ||
      lower.includes('tools[') ||
      lower.includes('too many states') ||
      (lower.includes('enum') && lower.includes('parameters')))
  ) {
    return {
      message: 'Chat tools could not be sent to Gemini — try again.',
      detail,
    };
  }

  if (status === 400) {
    return {
      message: 'Gemini rejected the request — try again in a moment.',
      detail,
    };
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound')
  ) {
    return {
      message: 'Could not reach Gemini — check your connection.',
      detail,
    };
  }

  if (lower.includes('last message must be from the user')) {
    return { message: 'Chat session was out of sync — try sending again.', detail };
  }

  if (alreadyFriendly) {
    return { message: primary, detail: detail !== primary ? detail : undefined };
  }

  return {
    message: 'Chat request failed.',
    detail,
  };
}
