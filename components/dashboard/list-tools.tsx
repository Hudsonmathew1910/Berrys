/** Search box + optional select filters as a GET form (filters live in the URL). */
export function ListTools({
  q,
  placeholder,
  selects = [],
  hidden = {},
}: {
  q?: string;
  placeholder: string;
  selects?: { name: string; label: string; value?: string; options: [string, string][] }[];
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form className="dash-tools">
      {Object.entries(hidden).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} />
      {selects.map((s) => (
        <select key={s.name} name={s.name} defaultValue={s.value ?? ""} aria-label={s.label}>
          {s.options.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      ))}
      <button className="outline" type="submit">
        Apply
      </button>
    </form>
  );
}

export const pageNum = (p?: string) => Math.max(1, Number.parseInt(p ?? "1", 10) || 1);
