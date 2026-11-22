import { useState } from "react";
import { dueText, ticketNo } from "./labels";
import type { RequestItem } from "./types";

// Primeras respuestas que la mesa escribe siempre igual. Plantillas fijas: nada de LLM, nada que inventar.
const TEMPLATES: Record<string, string> = {
  acceso_cuentas:
    "Hola, recibimos tu solicitud sobre el acceso a tu cuenta. Por seguridad no compartas tu contraseña por este medio. El equipo de {equipo} la revisará y te escribirá para validar tu identidad antes de restablecer o desbloquear la cuenta.",
  hardware:
    "Hola, recibimos tu reporte sobre el equipo. Si puedes, indícanos la marca o el número de inventario y si el problema empezó tras un golpe, un derrame o una actualización. El equipo de {equipo} te contactará para revisarlo o reemplazarlo.",
  software:
    "Hola, recibimos tu solicitud sobre el programa. Mientras tanto, guarda tu trabajo y prueba cerrar y volver a abrir la aplicación. Si aparece un mensaje de error, envíanos una captura. El equipo de {equipo} se encargará.",
  red_conectividad:
    "Hola, recibimos tu reporte de conexión. Cuéntanos si afecta solo a tu equipo o a más personas de tu zona y desde cuándo ocurre. El equipo de {equipo} ya está al tanto.",
  nuevo_servicio:
    "Hola, recibimos tu solicitud de un servicio nuevo. Para evaluarla necesitamos saber para qué la usarían, cuántas personas y si hay una fecha límite. El equipo de {equipo} te responderá con los siguientes pasos.",
  otro:
    "Hola, recibimos tu mensaje. Una persona de {equipo} lo leerá y te responderá. Si se trata de una falla, cuéntanos qué intentabas hacer y qué ocurrió.",
};

/** Respuesta sugerida para quien pidió ayuda, según la categoría vigente, lista para copiar. */
export default function SuggestedReply({ item }: { item: RequestItem }) {
  const [copied, setCopied] = useState(false);
  const category = item.final_category ?? item.pred_category;
  const due = dueText(item);
  const text =
    `[N.º ${ticketNo(item.id)}] ` +
    (TEMPLATES[category] ?? TEMPLATES.otro).replace("{equipo}", item.team) +
    (due && !item.overdue ? ` Plazo de atención: ${due.toLowerCase()}.` : "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // sin permiso de portapapeles: el texto sigue visible para copiarlo a mano
    }
  }

  return (
    <div className="reply">
      <div className="panel-head">
        <h4>Respuesta sugerida</h4>
        <button className="secondary" onClick={copy}>
          {copied ? "Copiada" : "Copiar"}
        </button>
      </div>
      <p className="reply-text">{text}</p>
      <p className="muted small" aria-live="polite">
        Plantilla fija para «{category.replace("_", " ")}»; revísala antes de enviarla.
      </p>
    </div>
  );
}
