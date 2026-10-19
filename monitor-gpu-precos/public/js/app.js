/**
 * GPU RADAR — Frontend Application Logic
 */

// Estado global da aplicação
const state = {
  products: [],
  history: {},
  stats: {},
  targetPrice: 4500,
  filter: 'all',
  storeFilter: 'all',
  searchQuery: '',
  sortBy: 'price_asc',
  soundEnabled: true,
  notificationsEnabled: false,
  isRefreshing: false
};

// Formatação monetária BRL
function formatBrl(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return "Preço sob consulta";
  }
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

// Formatação de data
function formatDate(isoString) {
  if (!isoString) return "Não consultado";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return isoString;
  }
}

// Emissão de som sintético futurista (Web Audio API)
function playRadarChime() {
  if (!state.soundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    // Silencia caso bloqueado pelo navegador
  }
}

// Notificações Toast
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ";
  toast.innerHTML = `<span style="font-size:16px;">${icon}</span> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Geração de Sparkline SVG sutil para os cards
function generateSparklineSvg(historyPoints, currentPrice) {
  if (!historyPoints || historyPoints.length < 2) {
    return `<svg class="sparkline-svg" viewBox="0 0 200 40"><line x1="10" y1="20" x2="190" y2="20" stroke="#27374d" stroke-dasharray="3,3" stroke-width="1.5"/></svg>`;
  }

  const prices = historyPoints.map(h => h.price).filter(Boolean);
  if (prices.length < 2) return "";

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 200;
  const height = 34;
  const padding = 4;

  const points = prices.map((p, index) => {
    const x = padding + (index / (prices.length - 1)) * (width - padding * 2);
    const y = height - padding - ((p - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isDropping = prices[prices.length - 1] <= prices[0];
  const strokeColor = isDropping ? "#00f5a0" : "#00d2ff";

  return `
    <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}">
      <polyline
        fill="none"
        stroke="${strokeColor}"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points.join(' ')}"
      />
      <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="3" fill="${strokeColor}" />
    </svg>
  `;
}

// Carregar dados da API
async function loadData() {
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("Falha ao comunicar com o servidor");
    const data = await res.json();

    state.products = data.products || [];
    state.targetPrice = data.targetPrice || 4500;
    state.stats = data.stats || {};

    // Carrega históricos prévios salvos
    for (const p of state.products) {
      if (!state.history[p.id]) {
        fetchHistorySilently(p.id);
      }
    }

    renderDashboard();
    renderProducts();
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    showToast("Erro ao conectar com a API de monitoramento.", "error");
  }
}

async function fetchHistorySilently(productId) {
  try {
    const res = await fetch(`/api/history/${productId}`);
    if (res.ok) {
      const data = await res.json();
      state.history[productId] = data.history || [];
      renderProducts(); // re-renderiza com sparklines
    }
  } catch (e) {}
}

// Renderização do Dashboard e Métricas
function renderDashboard() {
  const targetEl = document.getElementById("target-price-display");
  if (targetEl) targetEl.textContent = formatBrl(state.targetPrice);

  const bestRtxEl = document.getElementById("hero-best-price");
  const bestRtxSubtitle = document.getElementById("hero-best-model");
  const compBadge = document.getElementById("hero-target-comparison");

  // Filtra modelos RTX 5070 ativos
  const rtx5070s = state.products.filter(p => /5070/i.test(p.model + " " + p.name) && p.active && p.currentPrice);

  if (rtx5070s.length > 0) {
    const best = rtx5070s.reduce((min, p) => p.currentPrice < min.currentPrice ? p : min, rtx5070s[0]);
    if (bestRtxEl) bestRtxEl.textContent = formatBrl(best.currentPrice);
    if (bestRtxSubtitle) bestRtxSubtitle.textContent = `${best.name} (${best.store})`;

    const diff = state.targetPrice - best.currentPrice;
    if (compBadge) {
      if (diff >= 0) {
        compBadge.className = "target-comparison-badge";
        compBadge.innerHTML = `🔥 R$ ${Math.round(diff).toLocaleString("pt-BR")} ABAIXO DA META`;
      } else {
        compBadge.className = "target-comparison-badge";
        compBadge.style.color = "var(--accent-amber)";
        compBadge.style.borderColor = "rgba(251, 191, 36, 0.4)";
        compBadge.style.backgroundColor = "rgba(251, 191, 36, 0.1)";
        compBadge.innerHTML = `R$ ${Math.round(Math.abs(diff)).toLocaleString("pt-BR")} acima da meta`;
      }
    }

    // Termômetro visual
    const fillBar = document.getElementById("thermo-fill");
    if (fillBar) {
      // 100% se estiver exatamente ou abaixo da meta
      const ratio = Math.min(100, Math.max(10, Math.round((state.targetPrice / best.currentPrice) * 100)));
      fillBar.style.width = `${ratio}%`;
    }
  } else {
    if (bestRtxEl) bestRtxEl.textContent = "Aguardando consulta";
    if (bestRtxSubtitle) bestRtxSubtitle.textContent = "Cadastre URLs para monitorar preços em tempo real";
  }

  // Estatísticas Rápidas
  const totalCountEl = document.getElementById("stat-total-gpus");
  if (totalCountEl) totalCountEl.textContent = state.products.filter(p => p.active).length;

  const dealsCountEl = document.getElementById("stat-deals-count");
  const deals = state.products.filter(p => p.currentPrice && p.currentPrice <= state.targetPrice);
  if (dealsCountEl) dealsCountEl.textContent = deals.length;

  const avgPriceEl = document.getElementById("stat-avg-price");
  if (avgPriceEl && state.stats.avgRtx5070Price) {
    avgPriceEl.textContent = formatBrl(state.stats.avgRtx5070Price);
  }

  const kabumCountEl = document.getElementById("stat-kabum-count");
  if (kabumCountEl) kabumCountEl.textContent = state.products.filter(p => p.store === "KaBuM!").length;

  const pichauCountEl = document.getElementById("stat-pichau-count");
  if (pichauCountEl) pichauCountEl.textContent = state.products.filter(p => p.store === "Pichau").length;
}

// Filtragem e Ordenação
function getFilteredProducts() {
  return state.products.filter(p => {
    // Filtro por termo de busca
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const match = (p.name || "").toLowerCase().includes(q) ||
                    (p.brand || "").toLowerCase().includes(q) ||
                    (p.model || "").toLowerCase().includes(q) ||
                    (p.store || "").toLowerCase().includes(q);
      if (!match) return false;
    }

    // Filtro de Loja
    if (state.storeFilter !== "all" && p.store !== state.storeFilter) {
      return false;
    }

    // Filtros Rápidos
    if (state.filter === "5070") {
      return /5070/i.test(p.model + " " + p.name);
    }
    if (state.filter === "deals") {
      return p.currentPrice && p.currentPrice <= state.targetPrice;
    }
    if (state.filter === "stock") {
      return p.inStock !== false;
    }

    return true;
  }).sort((a, b) => {
    if (state.sortBy === "price_asc") {
      return (a.currentPrice || 999999) - (b.currentPrice || 999999);
    }
    if (state.sortBy === "price_desc") {
      return (b.currentPrice || 0) - (a.currentPrice || 0);
    }
    if (state.sortBy === "discount") {
      const discA = a.originalPrice && a.currentPrice ? (a.originalPrice - a.currentPrice) : 0;
      const discB = b.originalPrice && b.currentPrice ? (b.originalPrice - b.currentPrice) : 0;
      return discB - discA;
    }
    if (state.sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });
}

// Renderizar Lista de Cards
function renderProducts() {
  const container = document.getElementById("products-grid");
  const countBadge = document.getElementById("products-count-badge");
  if (!container) return;

  const items = getFilteredProducts();
  if (countBadge) countBadge.textContent = `${items.length} placas exibidas`;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>Nenhuma placa de vídeo encontrada</h3>
        <p>Tente ajustar os filtros, a busca ou cadastre uma nova URL para monitorar.</p>
        <button class="btn btn-primary" onclick="openAddModal()">+ Adicionar Nova GPU</button>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(p => {
    const isDeal = p.currentPrice && p.currentPrice <= state.targetPrice;
    const storeClass = p.store === "KaBuM!" ? "kabum" : p.store === "Pichau" ? "pichau" : "";
    const is5070 = /5070/i.test(p.model + " " + p.name);

    const historyPoints = state.history[p.id] || [];
    const sparkline = generateSparklineSvg(historyPoints, p.currentPrice);

    let priceTag = "";
    if (p.currentPrice) {
      const diff = state.targetPrice - p.currentPrice;
      if (diff > 0) {
        priceTag = `<span style="color:var(--accent-green);font-size:11px;font-weight:700;">- R$ ${Math.round(diff)} vs Meta</span>`;
      }
    }

    const stockBadge = p.inStock !== false
      ? `<span class="badge-tag lime" style="font-size:10px;">Em Estoque</span>`
      : `<span class="badge-tag amber" style="font-size:10px;">Esgotado</span>`;

    return `
      <div class="product-card ${isDeal ? 'deal-highlight' : ''}">
        <div class="card-top">
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="card-store-badge ${storeClass}">${escapeHtml(p.store)}</span>
            ${is5070 ? `<span class="badge-tag cyan" style="font-size:10px;">RTX 5070</span>` : ''}
          </div>
          ${stockBadge}
        </div>

        <h3 class="card-title" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h3>

        <div class="card-price-block">
          <div class="card-price-label">
            <span>Preço à vista (PIX)</span>
            ${priceTag}
          </div>
          <div class="card-price-value ${isDeal ? 'below' : ''}">
            ${p.currentPrice ? formatBrl(p.currentPrice) : '<span style="font-size:18px;color:var(--text-muted)">Preço não localizado</span>'}
          </div>
          <div class="card-price-sub">
            ${p.originalPrice ? `<span style="text-decoration:line-through;color:var(--text-muted)">${formatBrl(p.originalPrice)}</span>` : 'Preço competitivo'}
          </div>
        </div>

        <div class="sparkline-container" title="Histórico recente de preços">
          ${sparkline}
        </div>

        <div class="card-meta-row">
          <span>Última checagem:</span>
          <span>${formatDate(p.lastChecked)}</span>
        </div>

        <div class="card-actions">
          <a href="${escapeHtml(p.url || '#')}" target="_blank" rel="noopener noreferrer" class="btn-store-link" ${!p.url ? 'style="pointer-events:none;opacity:0.5"' : ''}>
            Ver na Loja ↗
          </a>
          <button class="btn btn-secondary btn-icon-only" title="Ver Histórico Completo e Gráfico" onclick="openHistoryModal('${p.id}')">
            📊 Gráfico
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// ATUALIZAÇÃO GERAL (REFRESH)
async function refreshAll() {
  if (state.isRefreshing) return;
  state.isRefreshing = true;

  const btn = document.getElementById("btn-refresh-all");
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite;">↻</span> Varrendo lojas…`;
  }

  showToast("Iniciando varredura de preços na KaBuM! e Pichau…", "info");

  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    const data = await res.json();

    if (data.status === "success") {
      playRadarChime();
      showToast("Preços atualizados com sucesso!", "success");
      await loadData();
    } else {
      showToast("Atualização concluída com avisos.", "info");
      await loadData();
    }
  } catch (err) {
    showToast("Falha na consulta remota das lojas.", "error");
  } finally {
    state.isRefreshing = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// MODAL DE HISTÓRICO COM GRÁFICO CANVAS
async function openHistoryModal(productId) {
  const modal = document.getElementById("history-modal");
  const modalTitle = document.getElementById("history-modal-title");
  const modalCanvas = document.getElementById("history-chart-canvas");
  if (!modal || !modalCanvas) return;

  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  modalTitle.textContent = product.name;
  modal.classList.add("active");

  try {
    const res = await fetch(`/api/history/${productId}`);
    const data = await res.json();
    const history = data.history || [];
    renderHistoryChart(modalCanvas, history, product);
  } catch (e) {
    console.error(e);
  }
}

function renderHistoryChart(canvas, historyPoints, product) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.parentElement.clientWidth - 20;
  const height = canvas.height = 220;

  ctx.clearRect(0, 0, width, height);

  if (!historyPoints || historyPoints.length < 2) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Histórico sendo construído a cada atualização.", width / 2, height / 2);
    return;
  }

  const prices = historyPoints.map(h => h.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const target = product.targetPrice || state.targetPrice;

  const chartMin = Math.min(minPrice, target) * 0.96;
  const chartMax = Math.max(maxPrice, target) * 1.04;
  const chartRange = chartMax - chartMin || 1;

  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 30;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Linhas de Grade e Valores
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#64748b";
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const yVal = chartMin + (chartRange / gridSteps) * i;
    const yPos = height - paddingBottom - (i / gridSteps) * plotHeight;

    ctx.beginPath();
    ctx.moveTo(paddingLeft, yPos);
    ctx.lineTo(width - paddingRight, yPos);
    ctx.stroke();

    ctx.fillText(`R$ ${Math.round(yVal)}`, paddingLeft - 8, yPos + 4);
  }

  // Linha Meta de Preço (Tracejada)
  if (target >= chartMin && target <= chartMax) {
    const targetY = height - paddingBottom - ((target - chartMin) / chartRange) * plotHeight;
    ctx.strokeStyle = "#00f5a0";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, targetY);
    ctx.lineTo(width - paddingRight, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#00f5a0";
    ctx.textAlign = "left";
    ctx.fillText(`Meta: R$ ${target}`, paddingLeft + 10, targetY - 6);
  }

  // Linha do Preço Real
  const points = historyPoints.map((pt, i) => {
    const x = paddingLeft + (i / (historyPoints.length - 1)) * plotWidth;
    const y = height - paddingBottom - ((pt.price - chartMin) / chartRange) * plotHeight;
    return { x, y, pt };
  });

  // Gradiente da Área
  const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
  gradient.addColorStop(0, "rgba(0, 210, 255, 0.25)");
  gradient.addColorStop(1, "rgba(0, 210, 255, 0.0)");

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - paddingBottom);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - paddingBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Traço Principal
  ctx.strokeStyle = "#00d2ff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Pontos
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#0c1017";
    ctx.fill();
    ctx.strokeStyle = "#00d2ff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Atualiza cartões de métricas no modal
  const minCard = document.getElementById("modal-stat-min");
  const maxCard = document.getElementById("modal-stat-max");
  const avgCard = document.getElementById("modal-stat-avg");

  if (minCard) minCard.textContent = formatBrl(minPrice);
  if (maxCard) maxCard.textContent = formatBrl(maxPrice);
  if (avgCard) {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    avgCard.textContent = formatBrl(avg);
  }
}

// MODAL DE CADASTRO
function openAddModal() {
  const modal = document.getElementById("add-modal");
  if (modal) modal.classList.add("active");
}

function closeModals() {
  document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
}

// Testar URL ao vivo antes de salvar
async function testScrapeUrl() {
  const urlInput = document.getElementById("new-gpu-url");
  const testBtn = document.getElementById("btn-test-url");
  const feedback = document.getElementById("url-test-feedback");

  const url = urlInput ? urlInput.value.trim() : "";
  if (!url) {
    showToast("Cole a URL do produto na loja primeiro.", "error");
    return;
  }

  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = "Testando link…";
  }
  if (feedback) feedback.innerHTML = `<span style="color:var(--text-secondary)">Acessando a página e verificando preço…</span>`;

  try {
    const res = await fetch("/api/test-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (data.currentPrice) {
      if (feedback) {
        feedback.innerHTML = `<span style="color:var(--accent-green)">✓ Preço detectado com sucesso: <strong>${formatBrl(data.currentPrice)}</strong>!</span>`;
      }
      showToast(`Preço detectado: ${formatBrl(data.currentPrice)}!`, "success");
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color:var(--accent-amber)">ℹ ${data.message || 'Página acessada. Preço será monitorado na varredura completa.'}</span>`;
      }
    }
  } catch (e) {
    if (feedback) {
      feedback.innerHTML = `<span style="color:var(--accent-rose)">Falha ao testar. Verifique se a URL está correta.</span>`;
    }
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = "Testar Link Agora";
    }
  }
}

// Salvar Novo Produto
async function handleAddProduct(e) {
  e.preventDefault();
  const name = document.getElementById("new-gpu-name").value;
  const store = document.getElementById("new-gpu-store").value;
  const model = document.getElementById("new-gpu-model").value;
  const brand = document.getElementById("new-gpu-brand").value;
  const url = document.getElementById("new-gpu-url").value;
  const targetPrice = document.getElementById("new-gpu-target").value;

  try {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, store, model, brand, url, targetPrice })
    });

    if (!res.ok) throw new Error("Erro ao salvar produto");

    showToast("Placa de vídeo adicionada ao GPU Radar!", "success");
    closeModals();
    e.target.reset();
    await loadData();
    refreshAll();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Inicialização dos Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  loadData();

  // Botão de Refresh Principal
  const refreshBtn = document.getElementById("btn-refresh-all");
  if (refreshBtn) refreshBtn.addEventListener("click", refreshAll);

  // Busca em tempo real
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.trim();
      renderProducts();
    });
  }

  // Filtros rápidos
  document.querySelectorAll(".pill-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pill-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.dataset.filter;
      renderProducts();
    });
  });

  // Filtros de Loja
  document.querySelectorAll(".store-filter-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".store-filter-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.storeFilter = btn.dataset.store;
      renderProducts();
    });
  });

  // Ordenação
  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      renderProducts();
    });
  }

  // Formulário de Cadastro
  const addForm = document.getElementById("add-gpu-form");
  if (addForm) addForm.addEventListener("submit", handleAddProduct);

  const testUrlBtn = document.getElementById("btn-test-url");
  if (testUrlBtn) testUrlBtn.addEventListener("click", testScrapeUrl);

  // Fechamento de Modais
  document.querySelectorAll(".btn-close-modal").forEach(btn => {
    btn.addEventListener("click", closeModals);
  });
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModals();
    });
  });
});
