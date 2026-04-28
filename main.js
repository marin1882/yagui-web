"use strict";

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('btn-buscar').addEventListener('click', buscar);
  document.getElementById('searchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') buscar();
  });
});

const API_BASE   = "https://xn--yagi-2ra.com";
const BUSCAR_KEY = "yagui-public-d6c8b050-e51c-4781-b3cc-3cad2b1cd3ae";

document.getElementById("searchInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") buscar();
});

async function buscar() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;

  const box = document.getElementById("resultsBox");
  box.innerHTML = `
    <div class="results-header">buscando nodos activos…</div>
    <div class="no-results">consultando la red cerca de ti</div>`;

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10_000);

    const r = await fetch(
      `${API_BASE}/buscar?q=${encodeURIComponent(q)}&key=${BUSCAR_KEY}`,
      { signal: ctrl.signal }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    renderResultados(box, data, q);
  } catch (e) {
    const msg = e.name === "AbortError"
      ? "tiempo de espera agotado"
      : esc(e.message);
    box.innerHTML = `
      <div class="results-header">resultado para "${esc(q)}"</div>
      <div class="no-results">${msg}</div>`;
  }
}

function renderResultados(box, data, q) {
  const resultados = data.resultados ?? [];
  const n = data.nodos_consultados ?? 0;

  if (!resultados.length) {
    box.innerHTML = `
      <div class="results-header">resultado para "${esc(q)}" · ${n} nodo${n !== 1 ? "s" : ""}</div>
      <div class="no-results">sin coincidencias — conecta tu nodo para ver resultados reales</div>`;
    return;
  }

  const items = resultados.flatMap(({ tienda, nodo, productos }) =>
    (productos || []).map(p => {
      const precio = p.precio != null
        ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(p.precio)
        : "–";
      const stock = p.stock != null ? `${p.stock} uds` : "–";
      return `
        <div class="result-item">
          <div class="result-distance">${esc(nodo || "")}</div>
          <div class="result-info">
            <div class="result-name">${esc(p.nombre || "–")}</div>
            <div class="result-meta">${esc(tienda || "")} · ${precio}</div>
          </div>
          <div class="result-status status-yes">${esc(stock)}</div>
        </div>`;
    })
  ).join("");

  box.innerHTML = `
    <div class="results-header">resultado para "${esc(q)}" · ${n} nodo${n !== 1 ? "s" : ""}</div>
    ${items}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.buscar = buscar;
