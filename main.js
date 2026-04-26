"use strict";

const API_BASE   = "https://xn--yagi-2ra.com";
const AI_BASE    = "https://xn--yagi-2ra.com/ai";
const BUSCAR_KEY = "yagui-public-d6c8b050-e51c-4781-b3cc-3cad2b1cd3ae";

const inputEl    = document.getElementById("input-busqueda");
const btnBuscar  = document.getElementById("btn-buscar");
const btnMic     = document.getElementById("btn-mic");
const cajaEl     = document.getElementById("caja-respuesta");
const estadoEl   = document.getElementById("estado-busqueda");
const dotEl      = document.getElementById("dot-red");
const textoRedEl = document.getElementById("texto-red");

// ── Estado de la red ──────────────────────────────────────────────────────────

async function actualizarEstadoRed() {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `${API_BASE}/buscar?q=_ping&key=${BUSCAR_KEY}`,
      { signal: ctrl.signal }
    );
    const d = await r.json();
    const n = d.nodos_consultados ?? 0;
    if (n > 0) {
      dotEl.style.backgroundColor = "#4ade80";
      textoRedEl.textContent = `🟢 ${n} nodo${n !== 1 ? "s" : ""} activo${n !== 1 ? "s" : ""}`;
    } else {
      dotEl.style.backgroundColor = "rgba(255,255,255,0.25)";
      textoRedEl.textContent = "sin nodos activos";
    }
    textoRedEl.style.opacity = "0.6";
  } catch {
    dotEl.style.backgroundColor = "rgba(255,255,255,0.15)";
    textoRedEl.textContent = "sin conexión";
    textoRedEl.style.opacity = "0.35";
  }
}

actualizarEstadoRed();
setInterval(actualizarEstadoRed, 30_000);

// ── Búsqueda ──────────────────────────────────────────────────────────────────

inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter") lanzarBusqueda();
});
btnBuscar.addEventListener("click", lanzarBusqueda);

function lanzarBusqueda() {
  const q = inputEl.value.trim();
  if (q) buscar(q);
}

async function buscar(q) {
  btnBuscar.disabled = true;
  estadoEl.textContent = "";
  setCaja([
    `> Buscando "${q}"…`,
    `> Consultando red Yagüi...`,
  ]);

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10_000);

    const r = await fetch(
      `${API_BASE}/buscar?q=${encodeURIComponent(q)}&key=${BUSCAR_KEY}`,
      { signal: ctrl.signal }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const n = data.nodos_consultados ?? 0;
    estadoEl.textContent = n > 0
      ? `${n} nodo${n !== 1 ? "s" : ""} consultado${n !== 1 ? "s" : ""}`
      : "0 nodos activos";

    renderResultados(data, q);
  } catch (e) {
    if (e.name === "AbortError") {
      setCaja(["> Tiempo de espera agotado.", "> Comprueba tu conexión."]);
    } else {
      setCaja([`> Error: ${e.message}`]);
    }
  } finally {
    btnBuscar.disabled = false;
  }
}

function renderResultados(data, q) {
  const n = data.nodos_consultados ?? 0;
  const resultados = data.resultados ?? [];
  const lines = [];

  lines.push(`> Búsqueda: "${q}"`);
  lines.push(`> ${n} nodo${n !== 1 ? "s" : ""} respondido${n !== 1 ? "s" : ""}`);
  lines.push("");

  if (!resultados.length) {
    lines.push("> Sin coincidencias en la red ahora mismo.");
    lines.push("");
    lines.push("> Prueba con otro término o vuelve más tarde.");
  } else {
    for (const { nodo, tienda, productos } of resultados) {
      lines.push(`> [${tienda || "Tienda"}] — ${nodo || ""}`);
      for (const p of (productos || [])) {
        const precio = p.precio != null
          ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(p.precio)
          : "–";
        const stock = p.stock ?? "–";
        lines.push(`>   ${p.nombre || "–"} · ${precio} · ${stock} uds`);
      }
      lines.push("");
    }
  }

  setCaja(lines);
}

// Renderiza un array de líneas en la caja olive con colores de terminal
function setCaja(lines) {
  cajaEl.innerHTML = lines.map(line => {
    if (line === "") {
      return `<p style="height:0.6em;"></p>`;
    }
    if (line.startsWith("> ")) {
      return `<p><span style="color:#aaaa00;">&gt;</span> ${esc(line.slice(2))}</p>`;
    }
    return `<p style="opacity:0.7;">${esc(line)}</p>`;
  }).join("");

  // Scroll al fondo
  cajaEl.scrollTop = cajaEl.scrollHeight;
}

// Escape HTML básico
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Micrófono (MediaRecorder → Whisper AI) ────────────────────────────────────

let mediaRecorder = null;
let audioChunks   = [];
let grabando      = false;
const micIcon     = btnMic.querySelector(".material-symbols-rounded");

btnMic.addEventListener("click", async () => {
  if (grabando) {
    mediaRecorder?.stop();
  } else {
    await iniciarGrabacion();
  }
});

async function iniciarGrabacion() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      grabando = false;
      micIcon.classList.remove("grabando");
      micIcon.textContent = "mic";
      btnMic.style.color = "";
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const b64  = await blobABase64(blob);

      estadoEl.textContent = "Transcribiendo audio…";
      setCaja(["> Transcribiendo audio…"]);
      btnBuscar.disabled = true;

      try {
        // 1 — Transcribir con Whisper
        const tRes  = await fetch(`${AI_BASE}/transcribir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_base64: b64 }),
        });
        const tData = await tRes.json();
        const texto = (tData.texto || "").trim();

        if (!texto) {
          estadoEl.textContent = "No se detectó voz.";
          setCaja(["> No se detectó voz.", "> Intenta de nuevo."]);
          return;
        }

        inputEl.value = texto;
        estadoEl.textContent = "Procesando consulta…";
        setCaja([`> Transcripción: "${texto}"`, "> Procesando consulta…"]);

        // 2 — Limpiar query con LLM
        const pRes  = await fetch(`${AI_BASE}/procesar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto }),
        });
        const pData = await pRes.json();
        const query = (pData.query || texto).trim();

        inputEl.value = query;
        estadoEl.textContent = "";
        await buscar(query);
      } catch (e) {
        estadoEl.textContent = "Error en IA: " + e.message;
        setCaja([`> Error: ${e.message}`]);
      } finally {
        btnBuscar.disabled = false;
      }
    };

    mediaRecorder.start();
    grabando = true;
    micIcon.classList.add("grabando");
    micIcon.textContent = "mic";
    btnMic.style.color = "#C21807";
    estadoEl.textContent = "🔴 Grabando… pulsa de nuevo para parar";
    setCaja(["> 🔴 Grabando…", "> Pulsa el micrófono para parar."]);
  } catch (e) {
    estadoEl.textContent = "Sin acceso al micrófono: " + e.message;
    setCaja(["> Sin acceso al micrófono.", `> ${e.message}`]);
  }
}

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
