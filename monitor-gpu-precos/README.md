# 🛰️ GPU RADAR — Monitor de Preços de Placas de Vídeo (Brasil)

> **Radar inteligente de preços e ofertas de hardware**, com foco na **NVIDIA GeForce RTX 5070** e nas lojas **KaBuM!** e **Pichau**. Pronto para execução local e publicação pública no **Vercel**.

![Identidade Visual Gamer](https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1200&q=80)

---

## ⚡ Destaques do Projeto

- 🎯 **Foco na RTX 5070**: Monitoramento com preço-alvo ajustável (padrão: **R$ 4.500,00**) e termômetro visual de oportunidade de compra.
- 🏪 **Lojas Integradas**: Coleta de preços da **KaBuM!** e **Pichau**, com suporte para adicionar **Terabyte** ou outras lojas.
- 📈 **Histórico & Gráficos**: Gráfico interativo de oscilação de preço nos últimos 30 dias com linha de meta pontilhada, menor preço histórico e preço médio.
- 📊 **Sparklines nos Cards**: Mini curva de tendência em SVG sutil diretamente no card de cada placa.
- 🔍 **Filtros e Busca Instantânea**: Filtre por modelos (RTX 5070, Abaixo da Meta 🔥, Em Estoque), por loja (KaBuM! / Pichau) e por ordem de menor preço ou maior desconto.
- ➕ **Cadastro com Teste ao Vivo**: Formulário integrado para cadastrar novas URLs com botão de pré-visualização de scraping em tempo real.
- 🔊 **Feedback Gamer & Sonoro**: Alertas visuais (toasts) e chime sonoro sintetizado em Web Audio API sem arquivos pesados.
- 🚀 **100% Compatível com Vercel**: Estruturado com Serverless Functions (`api/index.js`), fallback de persistência em memória e configuração `vercel.json` pronta.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, CSS3 Moderno (Variáveis de Design, Grid, Glassmorphism, Paleta Gamer Dark com Verde-Limão e Ciano), JavaScript Vanilla Modular.
- **Backend**: Node.js, Express, Cheerio (leitura de JSON-LD e metadados estruturados de e-commerce).
- **Deploy**: Vercel Serverless Functions (`@vercel/node`) ou Node.js standalone (VPS / Docker / Local).

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js 18+** instalado ([Download Node.js](https://nodejs.org/))

### Passo a passo
1. Abra o terminal na pasta do projeto:
   ```bash
   cd monitor-gpu-precos
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicie o servidor:
   ```bash
   npm start
   ```

4. Abra no seu navegador:
   ```text
   http://localhost:3000
   ```

---

## ☁️ Como Publicar no Vercel

O projeto já inclui o arquivo `vercel.json` e a função serverless `api/index.js` configurados:

### Opção 1: Via Vercel CLI (Recomendado)
```bash
npm install -g vercel
vercel
```
Siga as instruções padrão no terminal (basta pressionar Enter nas opções padrão).

### Opção 2: Via GitHub / Dashboard Vercel
1. Suba o código para um repositório no seu GitHub.
2. Acesse [vercel.com](https://vercel.com) e clique em **Add New Project**.
3. Importe o repositório.
4. Mantenha as configurações padrão (Framework: *Other*, Root Directory: `./`).
5. Clique em **Deploy**.

---

## 📡 Endpoints da API REST

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/products` | Retorna lista de placas, preço atual, meta e estatísticas do dashboard. |
| `POST` | `/api/refresh` | Executa a varredura remota de preços nas lojas e grava novo ponto de histórico. |
| `GET` | `/api/history/:id` | Retorna o histórico de preços e dados detalhados da GPU informada. |
| `POST` | `/api/products` | Cadastra uma nova GPU no radar com URL, nome e loja. |
| `PUT` | `/api/products/:id` | Atualiza o preço-alvo ou dados da GPU. |
| `DELETE` | `/api/products/:id` | Remove uma GPU do radar. |
| `POST` | `/api/test-url` | Testa em tempo real a captura de preço de uma URL antes de salvá-la. |
| `GET` | `/api/config` | Retorna configurações globais (preço-alvo da RTX 5070). |

---

## 📂 Estrutura de Arquivos

```text
monitor-gpu-precos/
├── api/
│   └── index.js            # Handler serverless para Vercel
├── data/
│   ├── products.json       # Catálogo de placas com dados e URLs
│   ├── history.json        # Registro cronológico dos preços (30 dias)
│   └── config.json         # Configurações globais e última sincronização
├── public/
│   ├── css/
│   │   └── style.css       # Design System Gamer (Ciano, Verde-Limão e Dark)
│   ├── js/
│   │   └── app.js          # Lógica frontend, gráficos Canvas e filtros
│   └── index.html          # Interface principal do GPU RADAR
├── server.js               # Servidor Express e motor de web scraping
├── vercel.json             # Regras de roteamento para a nuvem Vercel
├── package.json            # Scripts e dependências
└── README.md               # Documentação completa
```

---

## ⚖️ Aviso Legal & Transparência
O **GPU RADAR** é uma ferramenta independente de consulta para a comunidade de hardware. Os preços referem-se à modalidade à vista (PIX/Boleto) e dependem da entrega pública de dados pelas lojas. Não há afiliação comercial obrigatória. Sempre confirme frete, disponibilidade e condições no site oficial da loja antes de finalizar sua compra.
