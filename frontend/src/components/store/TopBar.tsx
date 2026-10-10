/** Barra superior: trechos entre **asteriscos** ficam em destaque dourado (renderizado sem HTML). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}
    </>
  );
}

export function TopBar({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="topbar">
      <div className="wrap">
        {messages.map((m, i) => (
          <span key={i}>
            <Rich text={m} />
          </span>
        ))}
      </div>
    </div>
  );
}
