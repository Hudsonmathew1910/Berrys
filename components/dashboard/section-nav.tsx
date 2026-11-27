/**
 * "On this page" links under a long dashboard page's heading: one per section,
 * jumping to its id (sections stop below the sticky Save-all bar, see .dash-panel[id]).
 */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  if (items.length < 2) return null;
  return (
    <nav className="section-nav" aria-label="On this page">
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
