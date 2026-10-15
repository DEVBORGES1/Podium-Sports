/** Barra superior: trechos entre **asteriscos** ficam em destaque dourado (renderizado sem HTML). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>;
}

/** Cidade à esquerda, mensagens no centro e telefone à direita (no celular, só as mensagens correndo). */
export function TopBar({ messages, city, phone }: { messages: string[]; city: string | null; phone: string | null }) {
  if (messages.length === 0 && !city && !phone) return null;
  return (
    <div className="topbar">
      <div className="wrap">
        {city && <span className="topbar-city">{city}</span>}
        <span className="topbar-msgs">
          {messages.map((m, i) => (
            <span key={i}>
              <Rich text={m} />
            </span>
          ))}
        </span>
        {phone && <span className="topbar-phone">{phone}</span>}
      </div>
    </div>
  );
}
