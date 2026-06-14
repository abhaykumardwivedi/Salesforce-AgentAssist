export function StatCard({ label, value, icon: Icon, accent = 'blue' }) {
  return (
    <div className="stat-card">
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
      </div>
      <div className={`stat-icon accent-${accent}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}
