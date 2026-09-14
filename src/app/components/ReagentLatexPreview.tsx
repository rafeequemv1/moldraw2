/**
 * Small KaTeX + mhchem preview for reaction-arrow labels (LaTeX mode).
 * KaTeX is loaded on first use so the editor shell stays out of that chunk.
 */
import { useEffect, useRef } from 'react';

type Props = {
  label: string;
  raw: string;
};

export function ReagentLatexPreview({ label, raw }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    const t = raw.trim();
    if (!t) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ default: katex }] = await Promise.all([
          import('katex'),
          import('katex/dist/katex.min.css'),
          import('katex/contrib/mhchem'),
        ]);
        if (cancelled || !ref.current) return;
        const tex = /\\|\\ce|\\frac|\\mathrm|\\begin/.test(t) ? t : `\\ce{${t}}`;
        katex.render(tex, ref.current, { throwOnError: false, trust: true, displayMode: false });
      } catch {
        if (!cancelled && ref.current) ref.current.textContent = raw;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [raw]);

  return (
    <div className="reagent-latex-preview">
      <span className="reagent-latex-preview__tag">{label}</span>
      <div ref={ref} className="reagent-latex-preview__body" />
    </div>
  );
}
