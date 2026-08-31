const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const CATALOG_FILE = path.join(__dirname, "data", "menu.json");
const PARTY_FILE = path.join(__dirname, "data", "party.json");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const DEFAULT_HONOREE = "Cristóbal";

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

const STATUSES = new Set(["cocina", "lista"]);

function normalizeOrders(orders) {
  let maxNumber = orders.reduce((max, order) => {
    const number = Number(order.number) || 0;
    return number > max ? number : max;
  }, 0);

  return orders.map((order) => {
    const next = { ...order };
    if (!Number.isInteger(next.number) || next.number < 1) {
      maxNumber += 1;
      next.number = maxNumber;
    }
    if (!STATUSES.has(next.status)) {
      next.status = "cocina";
    }
    if (next.kind !== "iceCream") {
      next.kind = "burger";
    }
    return next;
  });
}

function sortKitchen(orders) {
  return [...orders].sort((a, b) => {
    const inKitchen = (status) => (status === "cocina" ? 0 : 1);
    const byStatus = inKitchen(a.status) - inKitchen(b.status);
    if (byStatus !== 0) {
      return byStatus;
    }
    const timeA = new Date(a.createdAt);
    const timeB = new Date(b.createdAt);
    return a.status === "cocina" ? timeA - timeB : timeB - timeA;
  });
}

function nextNumber(orders) {
  return (
    orders.reduce((max, order) => {
      const number = Number(order.number) || 0;
      return number > max ? number : max;
    }, 0) + 1
  );
}

function orderKindFromBody(body) {
  return asText(body?.kind) === "iceCream" ? "iceCream" : "burger";
}

function validateName(customerName) {
  if (customerName.length < 2 || customerName.length > 60) {
    return "El nombre debe tener entre 2 y 60 caracteres.";
  }
  return "";
}

function validateBurgerOrder(body, menu) {
  const customerName = asText(body?.customerName);
  const nameError = validateName(customerName);
  if (nameError) {
    return { error: nameError };
  }

  const burgerId = asText(body?.burgerId);
  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients : null;
  const burger = (menu.burgers || []).find((item) => item.id === burgerId);
  if (!burger) {
    return { error: "Selecciona una hamburguesa de la carta." };
  }

  if (!ingredients) {
    return { error: "Selecciona los ingredientes." };
  }

  const allowed = new Set((menu.ingredients || []).map((item) => item.id));
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
      kind: "burger",
      customerName,
      burgerId: burger.id,
      burgerName: burger.name,
      productName: burger.name,
      price: burger.price,
      ingredients: unique,
      ingredientNames,
      createdAt: new Date().toISOString(),
      status: "cocina",
      forBirthday: Boolean(body?.forBirthday),
    },
  };
}

function validateIceCreamOrder(body, menu) {
  const customerName = asText(body?.customerName);
  const nameError = validateName(customerName);
  if (nameError) {
    return { error: nameError };
  }

  const iceCream = menu.iceCream;
  if (!iceCream || !Array.isArray(iceCream.servings) || iceCream.servings.length === 0) {
    return { error: "El helado aún no está en la carta." };
  }

  const servingId = asText(body?.servingId);
  const serving = iceCream.servings.find((item) => item.id === servingId);
  if (!serving) {
    return { error: "Elige cono, vaso o ambos." };
  }

  const catalogFlavors = Array.isArray(iceCream.flavors) ? iceCream.flavors : [];
  const flavorIds = Array.isArray(body?.flavors) ? body.flavors : [];
  const allowed = new Set(catalogFlavors.map((item) => item.id));
  const unique = [...new Set(flavorIds.map((id) => asText(id)).filter(Boolean))];

  if (catalogFlavors.length > 0 && unique.length === 0) {
    return { error: "Elige al menos un sabor." };
  }

  if (unique.some((id) => !allowed.has(id))) {
    return { error: "Hay un sabor que no está en la carta." };
  }

  const flavorNames = unique.map(
    (id) => catalogFlavors.find((item) => item.id === id).name
  );

  const productName = asText(iceCream.name) || "Helado";

  return {
    order: {
      id: crypto.randomUUID(),
      kind: "iceCream",
      customerName,
      productName,
      burgerName: productName,
      servingId: serving.id,
      servingName: serving.name,
      price: Number(serving.price) || 0,
      flavors: unique,
      flavorNames,
      createdAt: new Date().toISOString(),
      status: "cocina",
      forBirthday: Boolean(body?.forBirthday),
    },
  };
}

function validateOrder(body, menu) {
  if (orderKindFromBody(body) === "iceCream") {
    return validateIceCreamOrder(body, menu);
  }
  return validateBurgerOrder(body, menu);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/party", async (_req, res) => {
  try {
    const party = await readJson(PARTY_FILE, { honoree: DEFAULT_HONOREE });
    res.json({
      honoree: asText(party.honoree) || DEFAULT_HONOREE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo leer la fiesta." });
  }
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

async function loadOrdersFromDisk() {
  const raw = await readJson(ORDERS_FILE, []);
  const orders = normalizeOrders(raw);
  const needsSave = raw.some(
    (order, index) =>
      order.number !== orders[index].number ||
      order.status !== orders[index].status ||
      order.kind !== orders[index].kind
  );
  if (needsSave) {
    await writeOrders(orders);
  }
  return orders;
}

async function updateOrderStatus(id, status) {
  if (!STATUSES.has(status)) {
    return { error: "Estado no válido.", code: 400 };
  }
  if (!id) {
    return { error: "Falta el pedido.", code: 400 };
  }

  const saved = await enqueueWrite(async () => {
    const orders = await loadOrdersFromDisk();
    const index = orders.findIndex((order) => order.id === id);
    if (index === -1) {
      return null;
    }
    orders[index] = {
      ...orders[index],
      status,
      updatedAt: new Date().toISOString(),
    };
    await writeOrders(orders);
    return orders[index];
  });

  if (!saved) {
    return { error: "Pedido no encontrado.", code: 404 };
  }
  return { order: saved };
}

app.get("/api/orders", async (_req, res) => {
  try {
    const orders = await enqueueWrite(loadOrdersFromDisk);
    res.json(sortKitchen(orders));
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
      const orders = await loadOrdersFromDisk();
      const order = {
        ...result.order,
        number: nextNumber(orders),
        status: "cocina",
      };
      orders.push(order);
      await writeOrders(orders);
      return order;
    });

    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo guardar el pedido." });
  }
});

app.post("/api/orders/status", async (req, res) => {
  try {
    const result = await updateOrderStatus(
      asText(req.body?.id),
      asText(req.body?.status)
    );
    if (result.error) {
      return res.status(result.code).json({ error: result.error });
    }
    res.json(result.order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar el pedido." });
  }
});

app.patch("/api/orders/:id", async (req, res) => {
  try {
    const result = await updateOrderStatus(
      asText(req.params.id),
      asText(req.body?.status)
    );
    if (result.error) {
      return res.status(result.code).json({ error: result.error });
    }
    res.json(result.order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar el pedido." });
  }
});

const indexFile = path.join(__dirname, "public", "index.html");

app.get(["/cocina", "/cocina/"], (_req, res) => {
  res.sendFile(indexFile);
});

app.listen(PORT, HOST, () => {
  console.log(`Burger Box lista en http://${HOST}:${PORT}`);
  console.log(`Cocina en http://${HOST}:${PORT}/cocina`);
});
