/** Shown instantly while a dashboard page loads. */
export default function Loading() {
  return (
    <div className="dash-page" aria-busy="true" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      <div className="dash-stats">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton skeleton-stat" />
        ))}
      </div>
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
