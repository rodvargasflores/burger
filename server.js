const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const CATALOG_FILE = path.join(__dirname, "data", "menu.json");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

let writeQueue = Promise.resolve();

function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== undefined) {
      return fallback;
    }
    throw err;
  }
}

async function writeOrders(orders) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${ORDERS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(orders, null, 2), "utf8");
  await fs.copyFile(tmp, ORDERS_FILE);
  await fs.unlink(tmp).catch(() => {});
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateOrder(body, menu) {
  const customerName = asText(body?.customerName);
  const burgerId = asText(body?.burgerId);
  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients : null;

  if (customerName.length < 2 || customerName.length > 60) {
    return { error: "El nombre debe tener entre 2 y 60 caracteres." };
  }

  const burger = menu.burgers.find((item) => item.id === burgerId);
  if (!burger) {
    return { error: "Selecciona una hamburguesa de la carta." };
  }

  if (!ingredients) {
    return { error: "Selecciona los ingredientes." };
  }

  const allowed = new Set(menu.ingredients.map((item) => item.id));
  const unique = [...new Set(ingredients.map((id) => asText(id)).filter(Boolean))];

  if (unique.length === 0) {
    return { error: "La hamburguesa debe tener al menos un ingrediente." };
  }

  if (unique.some((id) => !allowed.has(id))) {
    return { error: "Hay un ingrediente que no está en la carta." };
  }

  const ingredientNames = unique.map(
    (id) => menu.ingredients.find((item) => item.id === id).name
  );

  return {
    order: {
      id: crypto.randomUUID(),
      customerName,
      burgerId: burger.id,
      burgerName: burger.name,
      price: burger.price,
      ingredients: unique,
      ingredientNames,
      createdAt: new Date().toISOString(),
    },
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/menu", async (_req, res) => {
  try {
    const menu = await readJson(CATALOG_FILE);
    res.json(menu);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo leer la carta." });
  }
});

app.get("/api/orders", async (_req, res) => {
  try {
    const orders = await readJson(ORDERS_FILE, []);
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudieron leer los pedidos." });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const menu = await readJson(CATALOG_FILE);
    const result = validateOrder(req.body, menu);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const saved = await enqueueWrite(async () => {
      const orders = await readJson(ORDERS_FILE, []);
      orders.push(result.order);
      await writeOrders(orders);
      return result.order;
    });

    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo guardar el pedido." });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Burger Box lista en http://${HOST}:${PORT}`);
});
