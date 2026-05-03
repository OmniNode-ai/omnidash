/**
 * Leader -- dot leader separator (typographic separator).
 */
export function Leader() {
  return (
    <span
      style={{
        flex: 1,
        margin: '0 8px',
        borderBottom: '1px dotted var(--line)',
        transform: 'translateY(-4px)',
      }}
    />
  );
}
