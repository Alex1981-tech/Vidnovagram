/** Render contact name: full name in violet for employees. */
export function ContactName({ name, isEmployee }: { name: string; isEmployee?: boolean }) {
  if (!isEmployee || !name.trim()) return <>{name}</>
  return <span className="employee-name">{name}</span>
}
