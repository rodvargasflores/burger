const state = {
  menu: { burgers: [], ingredients: [] },
  orders: [],
  selectedBurger: null,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  carta: document.querySelector("#view-carta"),
  pedidos: document.querySelector("#view-pedidos"),
  menuGrid: document.querySelector("#menu-grid"),
  ordersList: document.querySelector("#orders-list"),
  ordersCount: document.querySelector("#orders-count"),
  dialog: document.querySelector("#customizer"),
  sheetBurger: document.querySelector("#sheet-burger"),
  sheetName: document.querySelector("#sheet-name"),
  sheetDesc: document.querySelector("#sheet-desc"),
  sheetPrice: document.querySelector("#sheet-price"),
  ingredientList: document.querySelector("#ingredient-list"),
  customerName: document.querySelector("#customer-name"),
  formError: document.querySelector("#form-error"),
  submit: document.querySelector("#submit-order"),
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

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Ocurrió un error.");
  }
  return data;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2800);
}

function switchView(name) {
  els.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === name);
  });
  els.carta.classList.toggle("is-visible", name === "carta");
  els.pedidos.classList.toggle("is-visible", name === "pedidos");
  if (name === "pedidos") {
    loadOrders();
  }
}

function burgerCard(burger) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.innerHTML = `
    <div class="card-visual">
      <div class="burger-illu" data-style="${burger.style}"></div>
    </div>
    <h3>${burger.name}</h3>
    <p>${burger.description}</p>
    <span class="price">${money(burger.price)}</span>
  `;
  button.addEventListener("click", () => openCustomizer(burger));
  return button;
}

function renderMenu() {
  els.menuGrid.replaceChildren(...state.menu.burgers.map(burgerCard));
}

function openCustomizer(burger) {
  state.selectedBurger = burger;
  els.sheetBurger.dataset.style = burger.style;
  els.sheetName.textContent = burger.name;
  els.sheetDesc.textContent = burger.description;
  els.sheetPrice.textContent = money(burger.price);
  els.customerName.value = "";
  els.formError.hidden = true;

  const defaults = new Set(burger.defaultIngredients);
  els.ingredientList.replaceChildren(
    ...state.menu.ingredients.map((ingredient) => {
      const label = document.createElement("label");
      label.className = "chip";
      label.innerHTML = `
        <input type="checkbox" value="${ingredient.id}" ${
          defaults.has(ingredient.id) ? "checked" : ""
        } />
        ${ingredient.name}
      `;
      return label;
    })
  );

  els.dialog.showModal();
  els.customerName.focus();
}

function selectedIngredients() {
  return [...els.ingredientList.querySelectorAll("input:checked")].map(
    (input) => input.value
  );
}

function renderOrders() {
  els.ordersCount.textContent = String(state.orders.length);
  els.ordersCount.hidden = state.orders.length === 0;

  if (state.orders.length === 0) {
    els.ordersList.innerHTML =
      '<div class="empty card">Aún no hay pedidos. Genera el primero desde la carta.</div>';
    return;
  }

  els.ordersList.replaceChildren(
    ...state.orders.map((order) => {
      const article = document.createElement("article");
      article.className = "ticket";
      article.innerHTML = `
        <header>
          <h3>${order.customerName}</h3>
          <span class="ticket-time">${formatWhen(order.createdAt)}</span>
        </header>
        <p><strong>${order.burgerName}</strong> · ${money(order.price)}</p>
        <div class="ingredients">
          ${(order.ingredientNames || [])
            .map((name) => `<span>${name}</span>`)
            .join("")}
        </div>
      `;
      return article;
    })
  );
}

async function loadOrders() {
  state.orders = await api("/api/orders");
  renderOrders();
}

async function submitOrder() {
  els.formError.hidden = true;
  const customerName = els.customerName.value.trim();
  const ingredients = selectedIngredients();

  if (!state.selectedBurger) {
    els.formError.textContent = "Selecciona una hamburguesa.";
    els.formError.hidden = false;
    return;
  }
  if (customerName.length < 2) {
    els.formError.textContent = "Escribe el nombre de quien pide.";
    els.formError.hidden = false;
    return;
  }
  if (ingredients.length === 0) {
    els.formError.textContent = "Deja al menos un ingrediente.";
    els.formError.hidden = false;
    return;
  }

  els.submit.disabled = true;
  try {
    await api("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName,
        burgerId: state.selectedBurger.id,
        ingredients,
      }),
    });
    els.dialog.close();
    await loadOrders();
    showToast(`Orden lista para ${customerName}`);
    switchView("pedidos");
  } catch (err) {
    els.formError.textContent = err.message;
    els.formError.hidden = false;
  } finally {
    els.submit.disabled = false;
  }
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});
els.submit.addEventListener("click", submitOrder);
els.customerName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitOrder();
  }
});

async function init() {
  try {
    state.menu = await api("/api/menu");
    renderMenu();
    await loadOrders();
  } catch (err) {
    els.menuGrid.innerHTML = `<div class="empty card">${err.message}</div>`;
  }
}

init();
