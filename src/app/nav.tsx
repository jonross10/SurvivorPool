export default function Nav() {
  const link = { marginRight: 12 };
  return (
    <nav style={{ fontFamily: "system-ui", padding: "12px 24px", borderBottom: "1px solid #eee", fontSize: 14 }}>
      <a href="/" style={link}>Dashboard</a>
      <a href="/matchups" style={link}>Matchups</a>
      <a href="/calendar" style={link}>Calendar</a>
      <a href="/grid" style={link}>Grid</a>
      <a href="/log" style={link}>Log</a>
    </nav>
  );
}
