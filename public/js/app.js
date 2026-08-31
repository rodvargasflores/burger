const isKitchenStation = /^\/cocina\/?$/i.test(window.location.pathname);

const POLL_MS = 4000;

const state = {
  menu: { burgers: [], ingredients: [], iceCream: null },
  party: { honoree: "Cristóbal" },
  orders: [],
  orderKind: null,
  selectedBurger: null,
  filter: "cocina",
  seenIds: new Set(),
  pollTimer: null,
  audioReady: false,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  carta: document.querySelector("#view-carta"),
  pedidos: document.querySelector("#view-pedidos"),
  menuBoard: document.querySelector("#menu-board"),
  ordersList: document.querySelector("#orders-list"),
  ordersCount: document.querySelector("#orders-count"),
  kitchenNote: document.querySelector("#kitchen-note"),
  soundHint: document.querySelector("#sound-hint"),
  kitchenHeroKicker: document.querySelector("#kitchen-hero-kicker"),
  brandKicker: document.querySelector("#brand-kicker"),
  brandTitle: document.querySelector("#brand-title"),
  heroKicker: document.querySelector("#hero-kicker"),
  heroTitle: document.querySelector("#hero-title"),
  confetti: document.querySelector("#confetti"),
  filters: document.querySelectorAll(".filter"),
  dialog: document.querySelector("#customizer"),
  sheetIllu: document.querySelector("#sheet-illu"),
  sheetName: document.querySelector("#sheet-name"),
  sheetDesc: document.querySelector("#sheet-desc"),
  sheetPrice: document.querySelector("#sheet-price"),
  fieldsetIngredients: document.querySelector("#fieldset-ingredients"),
  fieldsetServing: document.querySelector("#fieldset-serving"),
  fieldsetFlavors: document.querySelector("#fieldset-flavors"),
  ingredientList: document.querySelector("#ingredient-list"),
  servingList: document.querySelector("#serving-list"),
  flavorList: document.querySelector("#flavor-list"),
  customerName: document.querySelector("#customer-name"),
  formError: document.querySelector("#form-error"),
  submit: document.querySelector("#submit-order"),
  close: document.querySelector("#close-sheet"),
  form: document.querySelector("#order-form"),
  toast: document.querySelector("#toast"),
};

function money(value) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatWhen(iso) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applyParty() {
  const honoree = state.party.honoree || "el cumpleañero";
  document.title = `Cumple de ${honoree}`;
  els.brandKicker.textContent = "Hoy cumple";
  els.brandTitle.textContent = honoree;
  els.heroKicker.textContent = `Fiesta de ${honoree}`;
  els.heroTitle.textContent =
    "Elige hamburguesa o helado.";
}

function burstConfetti() {
  const colors = ["#ffc72c", "#c8161d", "#ffffff", "#ff7eb6", "#78c042"];
  els.confetti.replaceChildren();
  els.confetti.hidden = false;
  for (let i = 0; i < 42; i += 1) {
    const piece = document.createElement("span");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.18}s`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    els.confetti.appendChild(piece);
  }
  window.clearTimeout(burstConfetti.timer);
  burstConfetti.timer = window.setTimeout(() => {
    els.confetti.hidden = true;
    els.confetti.replaceChildren();
  }, 1600);
}

function currentView() {
  return els.pedidos.classList.contains("is-visible") ? "pedidos" : "carta";
}

function kitchenStatus(order) {
  return order && order.status === "lista" ? "lista" : "cocina";
}

function kitchenNumber(order, index) {
  const number = Number(order && order.number);
  if (Number.isInteger(number) && number > 0) {
    return number;
  }
  return index + 1;
}

function orderKind(order) {
  return order && order.kind === "iceCream" ? "iceCream" : "burger";
}

function orderTitle(order) {
  if (orderKind(order) === "iceCream") {
    return order.productName || order.burgerName || "Helado";
  }
  return order.burgerName || order.productName || "Hamburguesa";
}

function orderChips(order) {
  if (orderKind(order) === "iceCream") {
    const chips = [];
    if (order.servingName) {
      chips.push({ name: order.servingName, serving: true });
    }
    for (const name of order.flavorNames || []) {
      chips.push({ name, serving: false });
    }
    return chips;
  }
  return (order.ingredientNames || []).map((name) => ({ name, serving: false }));
}

function kitchenNoteText() {
  const cooking = state.orders.filter((order) => kitchenStatus(order) === "cocina");
  if (cooking.length === 0) {
    return "La cocina está libre.";
  }
  const burgers = cooking.filter((order) => orderKind(order) === "burger").length;
  const ices = cooking.filter((order) => orderKind(order) === "iceCream").length;
  const parts = [];
  if (burgers === 1) {
    parts.push("1 hamburguesa");
  } else if (burgers > 1) {
    parts.push(`${burgers} hamburguesas`);
  }
  if (ices === 1) {
    parts.push("1 helado");
  } else if (ices > 1) {
    parts.push(`${ices} helados`);
  }
  return `${parts.join(" y ")} en cocina.`;
}

function iceCreamMenu() {
  const iceCream = state.menu && state.menu.iceCream;
  if (!iceCream || !Array.isArray(iceCream.servings) || iceCream.servings.length === 0) {
    return null;
  }
  return {
    ...iceCream,
    name: iceCream.name || "Helado",
    flavors: Array.isArray(iceCream.flavors) ? iceCream.flavors : [],
  };
}

async function api(path, options) {
  const response = await fetch(path, options);
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la acción.");
  }
  return data;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

let audioCtx = null;

function getAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function setSoundHint() {
  if (!els.soundHint) {
    return;
  }
  els.soundHint.hidden = !isKitchenStation || state.audioReady;
}

function unlockAudio() {
  if (!isKitchenStation) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const markReady = () => {
    state.audioReady = ctx.state === "running";
    setSoundHint();
  };
  if (ctx.state === "suspended") {
    ctx.resume().then(markReady).catch(() => {});
  }
  markReady();
}

function armAudioOnGesture() {
  if (!isKitchenStation) {
    return;
  }
  const arm = () => {
    unlockAudio();
    if (state.audioReady) {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    }
  };
  window.addEventListener("pointerdown", arm);
  window.addEventListener("keydown", arm);
}

function playDing() {
  if (!isKitchenStation) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.35);
}

function shouldPoll() {
  return isKitchenStation || currentView() === "pedidos";
}

function switchView(name) {
  els.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === name);
  });
  els.carta.classList.toggle("is-visible", name === "carta");
  els.pedidos.classList.toggle("is-visible", name === "pedidos");
  if (shouldPoll()) {
    loadOrders({ ding: false });
    startPolling();
  } else {
    stopPolling();
  }
}

function burgerCard(burger) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.innerHTML = `
    <div class="card-visual">
      <div class="burger-illu" data-style="${escapeHtml(burger.style)}"></div>
    </div>
    <h3>${escapeHtml(burger.name)}</h3>
    <p>${escapeHtml(burger.description)}</p>
    <span class="price">${money(burger.price)}</span>
  `;
  button.addEventListener("click", () => openBurgerCustomizer(burger));
  return button;
}

function iceCreamCard(iceCream) {
  const from = Math.min(...iceCream.servings.map((item) => Number(item.price) || 0));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card is-helado";
  button.innerHTML = `
    <div class="card-visual is-helado">
      <div class="ice-illu" aria-hidden="true"></div>
    </div>
    <h3>${escapeHtml(iceCream.name)}</h3>
    <p>${escapeHtml(iceCream.description || "Elige cono, vaso o ambos.")}</p>
    <span class="price">Desde ${money(from)}</span>
  `;
  button.addEventListener("click", () => openIceCreamCustomizer(iceCream));
  return button;
}

function menuSection(title, hint, cards) {
  const section = document.createElement("section");
  section.className = "menu-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);
  if (hint) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = hint;
    section.appendChild(note);
  }
  const grid = document.createElement("div");
  grid.className = "menu-grid";
  grid.append(...cards);
  section.appendChild(grid);
  return section;
}

function renderMenu() {
  const iceCream = iceCreamMenu();
  const nodes = [
    menuSection(
      "Hamburguesas",
      "",
      (state.menu.burgers || []).map(burgerCard)
    ),
  ];
  if (iceCream) {
    nodes.push(
      menuSection(
        "Helados",
        "",
        [iceCreamCard(iceCream)]
      )
    );
  }
  els.menuBoard.replaceChildren(...nodes);
}

function setSheetVisual(kind, style) {
  els.sheetIllu.className = kind === "iceCream" ? "ice-illu" : "burger-illu";
  if (kind === "iceCream") {
    els.sheetIllu.removeAttribute("data-style");
  } else {
    els.sheetIllu.dataset.style = style || "clasica";
  }
}

function openBurgerCustomizer(burger) {
  state.orderKind = "burger";
  state.selectedBurger = burger;
  setSheetVisual("burger", burger.style);
  els.sheetName.textContent = burger.name;
  els.sheetDesc.textContent = burger.description;
  els.sheetPrice.textContent = money(burger.price);
  els.customerName.value = "";
  els.formError.hidden = true;
  els.fieldsetIngredients.hidden = false;
  els.fieldsetServing.hidden = true;
  els.fieldsetFlavors.hidden = true;

  const defaults = new Set(burger.defaultIngredients);
  els.ingredientList.replaceChildren(
    ...state.menu.ingredients.map((ingredient) => {
      const label = document.createElement("label");
      label.className = "chip";
      label.innerHTML = `
        <input type="checkbox" value="${escapeHtml(ingredient.id)}" ${
          defaults.has(ingredient.id) ? "checked" : ""
        } />
        ${escapeHtml(ingredient.name)}
      `;
      return label;
    })
  );

  els.dialog.showModal();
}

function openIceCreamCustomizer(iceCream) {
  state.orderKind = "iceCream";
  state.selectedBurger = null;
  setSheetVisual("iceCream");
  els.sheetName.textContent = iceCream.name;
  els.sheetDesc.textContent =
    iceCream.description || "Elige cono, vaso o ambos.";
  els.sheetPrice.textContent = "Elige presentación";
  els.customerName.value = "";
  els.formError.hidden = true;
  els.fieldsetIngredients.hidden = true;
  els.fieldsetServing.hidden = false;
  els.fieldsetFlavors.hidden = iceCream.flavors.length === 0;

  els.servingList.replaceChildren(
    ...iceCream.servings.map((serving) => {
      const label = document.createElement("label");
      label.className = "chip";
      label.innerHTML = `
        <input type="radio" name="ice-serving" value="${escapeHtml(serving.id)}" />
        ${escapeHtml(serving.name)} · ${money(serving.price)}
      `;
      return label;
    })
  );

  els.flavorList.replaceChildren(
    ...iceCream.flavors.map((flavor) => {
      const label = document.createElement("label");
      label.className = "chip";
      label.innerHTML = `
        <input type="checkbox" value="${escapeHtml(flavor.id)}" />
        ${escapeHtml(flavor.name)}
      `;
      return label;
    })
  );

  els.dialog.showModal();
}

function selectedIngredients() {
  return [...els.ingredientList.querySelectorAll("input:checked")].map(
    (input) => input.value
  );
}

function selectedServing() {
  const input = els.servingList.querySelector("input:checked");
  return input ? input.value : "";
}

function selectedFlavors() {
  return [...els.flavorList.querySelectorAll("input:checked")].map(
    (input) => input.value
  );
}

function visibleOrders() {
  if (state.filter === "todas") {
    return state.orders;
  }
  return state.orders.filter((order) => kitchenStatus(order) === state.filter);
}

function renderOrders() {
  const cooking = state.orders.filter((order) => kitchenStatus(order) === "cocina").length;
  els.ordersCount.textContent = String(cooking);
  els.ordersCount.hidden = cooking === 0;
  els.kitchenNote.textContent = kitchenNoteText();

  const orders = visibleOrders();
  if (state.orders.length === 0) {
    els.ordersList.innerHTML =
      '<div class="empty card">Aún no hay pedidos. Cuando alguien pida desde la carta, aparece aquí.</div>';
    return;
  }
  if (orders.length === 0) {
    els.ordersList.innerHTML =
      '<div class="empty card">No hay pedidos en este filtro.</div>';
    return;
  }

  els.ordersList.replaceChildren(
    ...orders.map((order, index) => {
      const article = document.createElement("article");
      const status = kitchenStatus(order);
      const kind = orderKind(order);
      article.className = `ticket is-${status}${kind === "iceCream" ? " is-helado" : ""}`;
      article.dataset.id = order.id;
      const number = String(kitchenNumber(order, index)).padStart(2, "0");
      const action = isKitchenStation
        ? `<div class="ticket-actions">${
            status === "cocina"
              ? `<button class="mark-ready" type="button" data-id="${escapeHtml(
                  order.id
                )}" data-status="lista">Marcar lista</button>`
              : `<button class="mark-kitchen" type="button" data-id="${escapeHtml(
                  order.id
                )}" data-status="cocina">Devolver a cocina</button>`
          }</div>`
        : "";
      const chips = orderChips(order)
        .map(
          (chip) =>
            `<span${chip.serving ? ' class="is-serving"' : ""}>${escapeHtml(
              chip.name
            )}</span>`
        )
        .join("");
      article.innerHTML = `
        <header>
          <div>
            <div class="ticket-number">#${escapeHtml(number)}</div>
            <h3>${escapeHtml(order.customerName)}</h3>
            <span class="kind-pill is-${kind === "iceCream" ? "helado" : "burger"}">${
              kind === "iceCream" ? "Helado" : "Hamburguesa"
            }</span>
            <span class="status-pill is-${status}">${
              status === "cocina" ? "En cocina" : "Lista"
            }</span>
          </div>
          <span class="ticket-time">${formatWhen(order.createdAt)}</span>
        </header>
        <p><strong>${escapeHtml(orderTitle(order))}</strong> · ${money(order.price)}</p>
        <div class="ingredients">
          ${chips}
        </div>
        ${action}
      `;
      return article;
    })
  );
}

async function loadOrders({ ding = false } = {}) {
  const orders = await api("/api/orders");
  const previousIds = state.seenIds;
  const incoming = orders.filter((order) => !previousIds.has(order.id));
  const newInKitchen = incoming.filter((order) => kitchenStatus(order) === "cocina");

  state.orders = orders;
  state.seenIds = new Set(orders.map((order) => order.id));
  renderOrders();

  if (ding && isKitchenStation && previousIds.size > 0 && newInKitchen.length > 0) {
    playDing();
    const first = newInKitchen[0];
    showToast(`Pedido #${kitchenNumber(first, 0)} · ${first.customerName}`);
  }
}

async function setStatus(id, status) {
  await api("/api/orders/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  await loadOrders({ ding: false });
}

function startPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(() => {
    loadOrders({ ding: isKitchenStation }).catch(() => {});
  }, POLL_MS);
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function submitBurgerOrder(customerName) {
  const ingredients = selectedIngredients();
  if (!state.selectedBurger) {
    els.formError.textContent = "Selecciona una hamburguesa.";
    els.formError.hidden = false;
    return null;
  }
  if (ingredients.length === 0) {
    els.formError.textContent = "Deja al menos un ingrediente.";
    els.formError.hidden = false;
    return null;
  }
  return api("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "burger",
      customerName,
      burgerId: state.selectedBurger.id,
      ingredients,
    }),
  });
}

async function submitIceCreamOrder(customerName) {
  const iceCream = iceCreamMenu();
  const servingId = selectedServing();
  const flavors = selectedFlavors();
  if (!iceCream) {
    els.formError.textContent = "El helado aún no está en la carta.";
    els.formError.hidden = false;
    return null;
  }
  if (!servingId) {
    els.formError.textContent = "Elige cono, vaso o ambos.";
    els.formError.hidden = false;
    return null;
  }
  if (iceCream.flavors.length > 0 && flavors.length === 0) {
    els.formError.textContent = "Elige al menos un sabor.";
    els.formError.hidden = false;
    return null;
  }
  return api("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "iceCream",
      customerName,
      servingId,
      flavors,
    }),
  });
}

async function submitOrder() {
  els.formError.hidden = true;
  const customerName = els.customerName.value.trim();

  if (customerName.length < 2) {
    els.formError.textContent = "Escribe el nombre de quien pide.";
    els.formError.hidden = false;
    return;
  }

  els.submit.disabled = true;
  try {
    const order =
      state.orderKind === "iceCream"
        ? await submitIceCreamOrder(customerName)
        : await submitBurgerOrder(customerName);
    if (!order) {
      return;
    }
    els.dialog.close();
    await loadOrders({ ding: false });
    const number = kitchenNumber(order, state.orders.length - 1);
    burstConfetti();
    const item =
      state.orderKind === "iceCream" ? "el helado" : "el pedido";
    showToast(`Pedido #${number} para ${customerName}. Ya está ${item} en cocina.`);
  } catch (err) {
    els.formError.textContent = err.message;
    els.formError.hidden = false;
  } finally {
    els.submit.disabled = false;
  }
}

function closeCustomizer() {
  els.formError.hidden = true;
  els.dialog.close();
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});
els.filters.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    els.filters.forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    renderOrders();
  });
});
els.submit.addEventListener("click", submitOrder);
els.close.addEventListener("click", closeCustomizer);
els.form.addEventListener("submit", (event) => {
  event.preventDefault();
});
els.dialog.addEventListener("click", (event) => {
  if (event.target === els.dialog) {
    closeCustomizer();
  }
});
els.customerName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitOrder();
  }
});
els.servingList.addEventListener("change", () => {
  const iceCream = iceCreamMenu();
  if (!iceCream) {
    return;
  }
  const serving = iceCream.servings.find((item) => item.id === selectedServing());
  if (serving) {
    els.sheetPrice.textContent = money(serving.price);
  }
});
els.ordersList.addEventListener("click", async (event) => {
  if (!isKitchenStation) {
    return;
  }
  const button = event.target.closest("button[data-id][data-status]");
  if (!button) {
    return;
  }
  button.disabled = true;
  try {
    await setStatus(button.dataset.id, button.dataset.status);
  } catch (err) {
    showToast(err.message);
  } finally {
    button.disabled = false;
  }
});

async function init() {
  try {
    state.menu = await api("/api/menu");
    try {
      state.party = await api("/api/party");
    } catch {
      state.party = { honoree: "Cristóbal" };
    }
    applyParty();
    renderMenu();
    await loadOrders({ ding: false });
    if (isKitchenStation) {
      document.body.classList.add("is-kitchen-station");
      if (els.kitchenHeroKicker) {
        els.kitchenHeroKicker.textContent = "Estación de cocina";
      }
      setSoundHint();
      armAudioOnGesture();
      switchView("pedidos");
    }
  } catch (err) {
    els.menuBoard.innerHTML = `<div class="empty card">${escapeHtml(err.message)}</div>`;
  }
}

init();
