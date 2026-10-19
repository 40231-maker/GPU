const express = require("express");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_TARGET_PRICE = 4500;

// Diretórios e arquivos de dados
const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Garante que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`Erro ao ler ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
    return true;
  } catch (err) {
    // Em ambientes serverless (Vercel), o filesystem pode ser somente leitura
    console.warn(`Aviso de escrita em ${file}:`, err.message);
    return false;
  }
}

// Inicialização segura de dados em memória
let inMemoryProducts = readJson(PRODUCTS_FILE, []);
let inMemoryHistory = readJson(HISTORY_FILE, {});
let inMemoryConfig = readJson(CONFIG_FILE, { targetPrice: DEFAULT_TARGET_PRICE, lastSync: new Date().toISOString() });

function getProducts() {
  const fromFile = readJson(PRODUCTS_FILE, null);
  if (fromFile && Array.isArray(fromFile)) {
    inMemoryProducts = fromFile;
  }
  return inMemoryProducts;
}

function saveProducts(products) {
  inMemoryProducts = products;
  writeJson(PRODUCTS_FILE, products);
}

function getHistory() {
  const fromFile = readJson(HISTORY_FILE, null);
  if (fromFile && typeof fromFile === "object") {
    inMemoryHistory = fromFile;
  }
  return inMemoryHistory;
}

function saveHistory(history) {
  inMemoryHistory = history;
  writeJson(HISTORY_FILE, history);
}

// Parser de preços em formato BRL ou US
function parsePrice(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value > 0 ? value : null;
  let s = String(value).trim().replace(/\s/g, "").replace(/[^\d.,]/g, "");
  if (!s) return null;

  // Formato brasileiro: 4.299,90 ou 4299,90
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Varre JSON-LD em busca de ofertas e preços
function findPricesInJsonLd(value, found) {
  if (!value) return;
  if (Array.isArray(value)) return value.forEach(v => findPricesInJsonLd(v, found));
  if (typeof value !== "object") return;

  const offers = value.offers;
  if (offers) {
    const list = Array.isArray(offers) ? offers : [offers];
    for (const offer of list) {
      const p = parsePrice(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price);
      if (p) found.push({ price: p, availability: offer.availability });
    }
  }
  if (value.price) {
    const p = parsePrice(value.price);
    if (p) found.push({ price: p, availability: value.availability });
  }
  for (const [key, val] of Object.entries(value)) {
    if (key !== "offers" && typeof val === "object") findPricesInJsonLd(val, found);
  }
}

// Scraper inteligente para KaBuM!, Pichau e genérico
async function scrapePrice(product) {
  if (!product.url || !/^https?:\/\//i.test(product.url)) {
    return {
      ...product,
      status: "missing_url",
      message: "Adicione a URL direta do produto na loja."
    };
  }

  try {
    const response = await fetch(product.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache"
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      return {
        ...product,
        status: "blocked",
        message: `A loja respondeu com status HTTP ${response.status}.`
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const candidates = [];
    let isOutOfStock = false;

    // Checagem de disponibilidade no HTML
    const lowerHtml = html.toLowerCase();
    if (
      lowerHtml.includes("indisponível") ||
      lowerHtml.includes("produto esgotado") ||
      lowerHtml.includes("avise-me quando chegar") ||
      lowerHtml.includes("schema.org/outofstock")
    ) {
      isOutOfStock = true;
    }

    // 1. JSON-LD estruturado
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).contents().text());
        findPricesInJsonLd(json, candidates);
      } catch (e) {}
    });

    // 2. Metatags padrões de e-commerce
    const metaSelectors = [
      'meta[property="product:price:amount"]',
      'meta[property="og:price:amount"]',
      'meta[itemprop="price"]',
      '[itemprop="price"]',
      'meta[name="twitter:data1"]'
    ];
    for (const selector of metaSelectors) {
      $(selector).each((_, el) => {
        const val = $(el).attr("content") || $(el).attr("value") || $(el).text();
        const p = parsePrice(val);
        if (p) candidates.push({ price: p });
      });
    }

    // 3. Seletores específicos de lojas brasileiras
    // KaBuM!
    $('.finalPrice, h4.finalPrice, [data-price], .preco_desconto, .precoNormal').each((_, el) => {
      const val = $(el).attr("data-price") || $(el).text();
      const p = parsePrice(val);
      if (p) candidates.push({ price: p });
    });

    // Pichau
    $('[class*="price"], [class*="preco"], [class*="total-price"]').each((_, el) => {
      const text = $(el).text();
      if (/R\$\s*[\d.,]+/i.test(text)) {
        const p = parsePrice(text);
        if (p) candidates.push({ price: p });
      }
    });

    // Filtra preços coerentes de GPU no Brasil (R$ 500 a R$ 35.000)
    const validPrices = candidates
      .map(c => c.price)
      .filter(p => p >= 500 && p <= 35000);

    const uniquePrices = [...new Set(validPrices)];

    if (!uniquePrices.length) {
      return {
        ...product,
        status: isOutOfStock ? "out_of_stock" : "not_found",
        inStock: !isOutOfStock,
        message: isOutOfStock
          ? "Produto esgotado na loja no momento."
          : "Preço não localizado nos metadados da página."
      };
    }

    const price = Math.min(...uniquePrices);
    const target = product.targetPrice || DEFAULT_TARGET_PRICE;
    const nowIso = new Date().toISOString();

    const lowest = product.lowestPrice ? Math.min(product.lowestPrice, price) : price;
    const highest = product.highestPrice ? Math.max(product.highestPrice, price) : price;

    return {
      ...product,
      currentPrice: price,
      lowestPrice: lowest,
      highestPrice: highest,
      inStock: !isOutOfStock,
      status: "ok",
      belowTarget: price <= target,
      lastChecked: nowIso,
      message: price <= target ? `Abaixo do alvo! (R$ ${price.toLocaleString("pt-BR")})` : "Monitorando normalmente."
    };
  } catch (err) {
    return {
      ...product,
      status: "error",
      message: `Falha na requisição: ${err.message}`
    };
  }
}

// Atualização de todos os produtos
let isRefreshing = false;
async function refreshAllProducts() {
  if (isRefreshing) return { status: "already_running" };
  isRefreshing = true;

  try {
    const products = getProducts();
    const history = getHistory();
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    const updatedList = [];

    for (const prod of products) {
      if (!prod.active) {
        updatedList.push(prod);
        continue;
      }
      const updated = await scrapePrice(prod);
      updatedList.push(updated);

      // Atualiza histórico se preço for válido
      if (updated.currentPrice) {
        if (!history[prod.id]) history[prod.id] = [];
        const existingEntryToday = history[prod.id].find(h => h.date === dateStr);
        if (existingEntryToday) {
          existingEntryToday.price = updated.currentPrice;
          existingEntryToday.inStock = updated.inStock !== false;
        } else {
          history[prod.id].push({
            date: dateStr,
            price: updated.currentPrice,
            inStock: updated.inStock !== false,
            store: prod.store
          });
        }
      }
    }

    saveProducts(updatedList);
    saveHistory(history);

    inMemoryConfig.lastSync = now.toISOString();
    writeJson(CONFIG_FILE, inMemoryConfig);

    return {
      status: "success",
      updatedAt: inMemoryConfig.lastSync,
      products: updatedList
    };
  } finally {
    isRefreshing = false;
  }
}

// ROTAS DA API

// Listagem de produtos e status
app.get("/api/products", (req, res) => {
  const products = getProducts();
  const targetPrice = inMemoryConfig.targetPrice || DEFAULT_TARGET_PRICE;

  // Cálculos rápidos para o dashboard
  const activeProds = products.filter(p => p.active !== false);
  const rtx5070Prods = activeProds.filter(p => /5070/i.test(p.model + " " + p.name));
  const rtx5070Prices = rtx5070Prods.map(p => p.currentPrice).filter(Boolean);

  const bestRtx5070Price = rtx5070Prices.length ? Math.min(...rtx5070Prices) : null;
  const avgRtx5070Price = rtx5070Prices.length
    ? Math.round(rtx5070Prices.reduce((a, b) => a + b, 0) / rtx5070Prices.length)
    : null;

  const dealsUnderTarget = activeProds.filter(p => p.currentPrice && p.currentPrice <= targetPrice).length;

  res.json({
    updatedAt: inMemoryConfig.lastSync,
    targetPrice,
    stats: {
      totalMonitored: activeProds.length,
      dealsUnderTarget,
      bestRtx5070Price,
      avgRtx5070Price,
      rtx5070Count: rtx5070Prods.length
    },
    products
  });
});

// Atualiza preços de todos os produtos
app.post("/api/refresh", async (req, res) => {
  const result = await refreshAllProducts();
  res.json(result);
});

// Retorna histórico de preços de um produto específico
app.get("/api/history/:id", (req, res) => {
  const history = getHistory();
  const id = req.params.id;
  const productHistory = history[id] || [];
  const products = getProducts();
  const product = products.find(p => p.id === id);

  res.json({
    id,
    product: product || null,
    history: productHistory
  });
});

// Adiciona um novo produto
app.post("/api/products", (req, res) => {
  const { name, brand, model, store, url, targetPrice, imageUrl, notes } = req.body;
  if (!name || !store) {
    return res.status(400).json({ error: "Nome e Loja são obrigatórios." });
  }

  const products = getProducts();
  const id = "gpu-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6);

  const newProd = {
    id,
    name: name.trim(),
    brand: (brand || "NVIDIA").trim(),
    model: (model || "RTX 5070").trim(),
    store: store.trim(),
    url: (url || "").trim(),
    imageUrl: imageUrl || "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=600&q=80",
    targetPrice: Number(targetPrice) || DEFAULT_TARGET_PRICE,
    currentPrice: null,
    lowestPrice: null,
    highestPrice: null,
    inStock: true,
    active: true,
    lastChecked: null,
    notes: notes || "Cadastrado manualmente pelo usuário."
  };

  products.unshift(newProd);
  saveProducts(products);

  res.status(201).json(newProd);
});

// Atualiza dados de um produto existente (ex: preço alvo, URL, status ativo)
app.put("/api/products/:id", (req, res) => {
  const products = getProducts();
  const index = products.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Produto não encontrado." });
  }

  const current = products[index];
  const { name, model, brand, store, url, targetPrice, active, notes } = req.body;

  products[index] = {
    ...current,
    name: name !== undefined ? name.trim() : current.name,
    model: model !== undefined ? model.trim() : current.model,
    brand: brand !== undefined ? brand.trim() : current.brand,
    store: store !== undefined ? store.trim() : current.store,
    url: url !== undefined ? url.trim() : current.url,
    targetPrice: targetPrice !== undefined ? Number(targetPrice) : current.targetPrice,
    active: active !== undefined ? Boolean(active) : current.active,
    notes: notes !== undefined ? notes : current.notes
  };

  saveProducts(products);
  res.json(products[index]);
});

// Remove um produto do radar
app.delete("/api/products/:id", (req, res) => {
  let products = getProducts();
  const initialLen = products.length;
  products = products.filter(p => p.id !== req.params.id);

  if (products.length === initialLen) {
    return res.status(404).json({ error: "Produto não encontrado." });
  }

  saveProducts(products);
  res.json({ success: true, message: "Produto removido com sucesso." });
});

// Teste em tempo real de uma URL
app.post("/api/test-url", async (req, res) => {
  const { url } = req.body;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "URL inválida. Forneça uma URL que comece com http:// ou https://" });
  }

  const dummyProduct = {
    id: "test",
    name: "GPU Teste",
    url,
    targetPrice: DEFAULT_TARGET_PRICE
  };

  const result = await scrapePrice(dummyProduct);
  res.json(result);
});

// Configurações globais
app.get("/api/config", (req, res) => {
  res.json({
    targetPrice: inMemoryConfig.targetPrice || DEFAULT_TARGET_PRICE,
    lastSync: inMemoryConfig.lastSync
  });
});

app.post("/api/config", (req, res) => {
  const { targetPrice } = req.body;
  if (targetPrice) {
    inMemoryConfig.targetPrice = Number(targetPrice);
    writeJson(CONFIG_FILE, inMemoryConfig);
  }
  res.json(inMemoryConfig);
});

// Inicialização se executado diretamente
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 GPU RADAR rodando com sucesso!`);
    console.log(`📡 URL Local: http://localhost:${PORT}`);
    console.log(`🎯 Foco: NVIDIA GeForce RTX 5070 | KaBuM! & Pichau`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
