const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// URL del backend en Vercel
const API_BASE = "https://planing-familiar-backend.vercel.app";

// VAPID PUBLIC KEY generada para este proyecto
const VAPID_PUBLIC_KEY = "BBbV8RuSxZyOGAtD53suSbyp-QoE1H6WhI6Wy7rL0RINNsbI2OYtXOHFn3YU8bIEU4lsOW1rQW1laZOx2AAvee4";

// Elementos del DOM
const famInput = document.getElementById("fam");
const btnSetFam = document.getElementById("btnSetFam");
const btnPush = document.getElementById("btnPush");
const list = document.getElementById("list");

// ID de dispositivo (para no notificarte a ti mismo)
const deviceId = localStorage.getItem("deviceId") || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
localStorage.setItem("deviceId", deviceId);

// Funciones para obtener/guardar el código de familia en localStorage
function getFam() {
  return localStorage.getItem("fam") || "";
}
function setFam(v) {
  localStorage.setItem("fam", v);
}

// ======================
// Supabase - helpers
// ======================
async function ensureFamilyExists(fam) {
  const { error } = await sb
    .from("families")
    .upsert([{ fam }], { onConflict: "fam" });

  if (error) throw error;
}

// ======================
// Lista de compra (Supabase)
// ======================

const inpProducto = document.getElementById("inpProducto");
const btnAdd = document.getElementById("btnAdd");
const btnEliminar = document.getElementById("btnEliminar");
const listaCompra = document.getElementById("listaCompra");

let compra = [];
let compraChannel = null;

// Inicializa la lista de la compra segun el codigo familiar
async function initCompra(fam) {
  await ensureFamilyExists(fam);

  compra = await loadCompraSupabase(fam);
  renderCompra();
  subscribeCompraRealtime(fam);
}

// Carga los items de la compra desde Supabase
async function loadCompraSupabase(fam) {
  const { data, error } = await sb
    .from("shopping_items")
    .select("*")
    .eq("fam", fam)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Añade un item a la compra en Supabase con el codigo familiar
async function addProductoSupabase(fam, text) {
  const { data, error } = await sb
    .from("shopping_items")
    .insert([{ fam, text }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Actualiza el estado "checked" de un item en Supabase
async function setCheckedSupabase(id, checked) {
  const { error } = await sb
    .from("shopping_items")
    .update({ checked })
    .eq("id", id);

  if (error) throw error;
}

// Elimina los items marcados como "checked" en Supabase
async function deleteCheckedSupabase(fam) {
  const { error } = await sb
    .from("shopping_items")
    .delete()
    .eq("fam", fam)
    .eq("checked", true);

  if (error) throw error;
}

// ======================
// Eventos UI Lista de compra
// ======================
// Boton con el que añadimos un producto a la lista de la compra
btnAdd?.addEventListener("click", () => addProductoUI());
inpProducto?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addProductoUI();
});

// Boton con el que eliminamos los productos marcados como comprados
btnEliminar?.addEventListener("click", async () => {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia");

  try {
    await deleteCheckedSupabase(fam);
    compra = compra.filter(i => !i.checked);
    renderCompra();
  } catch (err) {
    console.error(err);
    alert("Error eliminando en Supabase");
  }
});
// ======================

// ======================
// Funciones UI Lista de compra
// ======================
// Añade un producto a la UI y a Supabase
async function addProductoUI() {
  const fam = getFam();
  const text = (inpProducto.value || "").trim();
  if (!fam) return alert("Primero guarda el código de familia");
  if (!text) return;

  try {
    await ensureFamilyExists(fam);
    const nuevo = await addProductoSupabase(fam, text);
    compra.unshift(nuevo);
    renderCompra();

    inpProducto.value = "";
    inpProducto.focus();
  } catch (err) {
    console.error(err);
    alert("Error guardando en Supabase");
  }
}

// Cambia el estado "checked" de un item en la UI y en Supabase
function toggleChecked(id, value) {
  const i = compra.find(x => x.id === id);
  if (!i) return;
  i.checked = value;

  setCheckedSupabase(id, value).catch(err => {
    console.error(err);
    alert("Error actualizando checkbox");
  });
}

// Renderiza la lista de la compra en la UI
function renderCompra() {
  if (!listaCompra) return;// Si no existe el elemento, salimos
  listaCompra.innerHTML = "";// Limpiamos la lista antes de renderizar

  if (compra.length === 0) {// Si no hay items, mostramos mensaje
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <span></span>
      <span class="text" style="opacity:.6">No hay productos todavía.</span>
    `;
    listaCompra.appendChild(li);
    return;
  }

  for (const item of compra) {// Recorremos los items y los añadimos a la lista
    const li = document.createElement("li");
    li.className = "item";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!item.checked;
    chk.addEventListener("change", () => toggleChecked(item.id, chk.checked));

    const span = document.createElement("span");
    span.className = "text";
    span.textContent = item.text;

    li.appendChild(chk);
    li.appendChild(span);
    listaCompra.appendChild(li);
  }
}

// Suscripción en tiempo real a cambios en la lista de la compra
function subscribeCompraRealtime(fam) {
  if (compraChannel) sb.removeChannel(compraChannel);

  compraChannel = sb
    .channel("shopping_items_changes")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "shopping_items",
      filter: `fam=eq.${fam}`
    }, async () => {
      compra = await loadCompraSupabase(fam);
      renderCompra();
    })
    .subscribe();
}
// ======================

// ======================
// Planning semanal (Supabase)
// ======================
// Carga la planificación semanal desde Supabase
async function loadPlanningSupabase(fam) {
  const { data, error } = await sb
    .from("meal_planning")
    .select("day,value")
    .eq("fam", fam);

  if (error) throw error;

  // Convertimos array -> objeto { Lunes: "...", ... }
  const out = {};
  (data || []).forEach(r => { out[r.day] = r.value; });
  return out;
}

// Guarda el valor de un día en Supabase
async function saveDaySupabase(fam, dia, value) {
  await ensureFamilyExists(fam);

  const { error } = await sb
    .from("meal_planning")
    .upsert(
      [{
        fam,
        day: dia,
        value: value,
        updated_at: new Date().toISOString()
      }],
      { onConflict: "fam,day" }
    );

  if (error) throw error;
}
// ======================

// ======================
// Presupuesto mensual (Supabase)
// ======================

const inpBudget = document.getElementById("inpBudget");
const btnSaveBudget = document.getElementById("btnSaveBudget");
const inpPlace = document.getElementById("inpPlace");
const inpAmount = document.getElementById("inpAmount");
const btnAddExpense = document.getElementById("btnAddExpense");
const btnClearExpenses = document.getElementById("btnClearExpenses");
const expensesList = document.getElementById("expensesList");
const budgetMonthLabel = document.getElementById("budgetMonthLabel");
const budgetRemaining = document.getElementById("budgetRemaining");

let currentMonth = getMonthKey(); // 'YYYY-MM'
let currentBudget = 0;
let expenses = [];

// Obtiene la clave del mes actual en formato 'YYYY-MM'
function getMonthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Inicializa el presupuesto mensual segun el codigo familiar
async function initBudget(fam) {
  currentMonth = getMonthKey();
  if (budgetMonthLabel) budgetMonthLabel.textContent = currentMonth;

  await ensureFamilyExists(fam);

  await loadBudgetMonth(fam, currentMonth);
  await loadExpenses(fam, currentMonth);
  renderExpenses();
  updateRemaining();
}

// Carga el presupuesto mensual desde Supabase
async function loadBudgetMonth(fam, month) {
  const { data, error } = await sb
    .from("budget_month")
    .select("initial_budget")
    .eq("fam", fam)
    .eq("month", month)
    .maybeSingle();

  if (error) throw error;

  currentBudget = data?.initial_budget ?? 0;
  if (inpBudget) inpBudget.value = currentBudget ? String(currentBudget) : "";
}

// Guarda el presupuesto mensual en Supabase
async function saveBudgetMonth(fam, month, amount) {
  const { error } = await sb
    .from("budget_month")
    .upsert(
      [{ fam, month, initial_budget: amount, updated_at: new Date().toISOString() }],
      { onConflict: "fam,month" }
    );

  if (error) throw error;
}

// Carga los gastos del mes desde Supabase
async function loadExpenses(fam, month) {
  const { data, error } = await sb
    .from("budget_expenses")
    .select("*")
    .eq("fam", fam)
    .eq("month", month)
    .order("created_at", { ascending: false });

  if (error) throw error;
  expenses = data || [];
}

// Añade un gasto en Supabase
async function addExpense(fam, month, place, amount) {
  const { data, error } = await sb
    .from("budget_expenses")
    .insert([{ fam, month, place, amount }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Elimina todos los gastos del mes en Supabase
async function clearExpenses(fam, month) {
  const { error } = await sb
    .from("budget_expenses")
    .delete()
    .eq("fam", fam)
    .eq("month", month);

  if (error) throw error;
}

// Suma el total de gastos
function sumExpenses() {
  return expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
}

// Actualiza el presupuesto restante en la UI
function updateRemaining() {
  if (!budgetRemaining) return;
  const remaining = Number(currentBudget) - sumExpenses();
  budgetRemaining.textContent = `${remaining.toFixed(2)} €`;
}

// Renderiza la lista de gastos en la UI
function renderExpenses() {
  if (!expensesList) return;
  expensesList.innerHTML = "";

  if (expenses.length === 0) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <span></span>
      <span class="text" style="opacity:.6">No hay gastos este mes.</span>
    `;
    expensesList.appendChild(li);
    return;
  }

  // Recorremos los gastos y los añadimos a la lista
  for (const e of expenses) {
    const li = document.createElement("li");
    li.className = "expense-item";

    const date = new Date(e.created_at).toLocaleString();

    // Columna izquierda: botón borrar
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.type = "button";
    del.title = "Eliminar gasto";
    del.textContent = "🗑️";

    // Evento borrar gasto
    del.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar gasto de "${e.place}" (${Number(e.amount).toFixed(2)} €)?`)) return;

      try {
        await deleteExpenseById(e.id);
        expenses = expenses.filter(x => x.id !== e.id);
        renderExpenses();
        updateRemaining();
      } catch (err) {
        console.error(err);
        alert("Error eliminando gasto");
      }
    });

    // Columna derecha: contenido
    const content = document.createElement("div");
    content.className = "expense-content";
    content.innerHTML = `
      <div class="expense-line">
        <strong>${e.place}</strong>
        <span>${Number(e.amount).toFixed(2)} €</span>
      </div>
      <small class="expense-date">${date}</small>
    `;

    li.appendChild(del);
    li.appendChild(content);
    expensesList.appendChild(li);
  }
}

// Elimina un gasto por su ID en Supabase
async function deleteExpenseById(id) {
  const { error } = await sb
    .from("budget_expenses")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ======================
// Eventos UI Presupuesto mensual
// ======================
// Boton guardar presupuesto
btnSaveBudget?.addEventListener("click", async () => {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia");

  const val = Number(inpBudget.value || 0);// Leemos el valor del input
  if (Number.isNaN(val) || val < 0) return alert("Presupuesto inválido");// Validamos el valor

  // Guardamos el presupuesto en Supabase
  try {
    currentBudget = val;
    await saveBudgetMonth(fam, currentMonth, val);
    updateRemaining();
  } catch (err) {
    console.error(err);
    alert("Error guardando presupuesto");
  }
});

// Boton añadir gasto
btnAddExpense?.addEventListener("click", async () => {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia");

  const place = (inpPlace.value || "").trim();// Leemos y limpiamos el lugar
  const amount = Number(inpAmount.value || 0);// Leemos y convertimos la cantidad a numero

  if (!place) return alert("Escribe el lugar");// Validamos que no este en blanco el lugar
  if (Number.isNaN(amount) || amount <= 0) return alert("Cantidad inválida");// Validamos que la cantidad no sea negativa o NaN

  // Añadimos el gasto en Supabase
  try {
    const row = await addExpense(fam, currentMonth, place, amount);
    expenses.unshift(row);
    renderExpenses();
    updateRemaining();
    await fetch(`${API_BASE}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fam,
        type: "budget",
        title: "Nuevo gasto",
        body: `${place}: ${amount.toFixed(2)} €`,
        url: `/planing-familiar/?section=budget`,
        deviceId
      })
    });

    inpPlace.value = "";
    inpAmount.value = "";
    inpPlace.focus();
  } catch (err) {
    console.error(err);
    alert("Error añadiendo gasto");
  }
});

// Boton limpiar gastos
btnClearExpenses?.addEventListener("click", async () => {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia");

  if (!confirm("¿Eliminar TODOS los gastos del mes actual?")) return;

  try {
    await clearExpenses(fam, currentMonth);
    expenses = [];
    renderExpenses();
    updateRemaining();
  } catch (err) {
    console.error(err);
    alert("Error limpiando gastos");
  }
});
// ======================



// Convierte una clave VAPID en formato base64 a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);//Base64 necesita que la longitud sea multiplo de 4, asi que añadimos padding si hace falta
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");//Convertimos base64url a base64 normal
  const raw = atob(base64);//Decodificamos base64 a string binario
  const out = new Uint8Array(raw.length);//creamos un array de bytes del mismo tamaño
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);//Recorremos el string y metemos cada yte en el Uint8Array
  return out;//Devolvemos el array de bytes
}

// Registra el Service Worker
async function registerSW() {
  if (!("serviceWorker" in navigator)) throw new Error("Tu navegador no soporta Service Worker");
  return navigator.serviceWorker.register("/planing-familiar/swV4.js");
}

// Habilita las notificaciones push, se ejecuta al pulsar el boton para activar las notificaciones
async function enablePush() {
  //Leemos el codigo de familia y si esta vacio, mostramos alerta y salimos
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia.");

  const reg = await registerSW();//Registramos el service worker

  // Pedimos permiso para notificaciones, si no se concede, mostramos alerta y salimos
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return alert("Permiso de notificaciones denegado.");

  // Nos suscribimos a notificaciones push
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,//Las notificaciones siempre son visibles para el usuario
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)//Convertimos la clave VAPID a Uint8Array
  });

  // Enviamos la suscripción al backend para guardarla
  const r = await fetch(`${API_BASE}/api/subscribe`, {
    method: "POST",//Usamos POST para enviar datos
    headers: { "Content-Type": "application/json" },//Indicamos que enviamos JSON
    body: JSON.stringify({ fam, subscription: sub, deviceId })//Convertimos los datos a JSON y los enviamos(fam para agrupar por familia, subscription con los datos de la suscripción, deviceId para no notificarnos a nosotros mismos)
  });

  // Si hay error, mostramos alerta y salimos
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.error(j);
    return alert("Error al activar notificaciones (mira la consola).");
  }

  alert("Notificaciones activadas ✅");//Mostramos mensaje de exito
}

// Creamos los elementos para los dias de la semana
function renderInputs() {
  list.innerHTML = "";//Limpiamos el contenedor para evitar duplicados
  DIAS.forEach(dia => {//Recorre cada dia de la semana
    // Crea fila contenedora
    const row = document.createElement("div");
    row.className = "row";

    // Crea etiqueta
    const label = document.createElement("div");
    label.textContent = dia;

    // Crea input
    const input = document.createElement("input");
    input.id = dia;

    // Crea boton guardar
    const btn = document.createElement("button");
    btn.textContent = "Guardar";
    btn.addEventListener("click", () => saveDay(dia));

    // Añade elementos a la fila y la fila al contenedor
    row.append(label, input, btn);
    list.appendChild(row);
  });
}

// Carga la planificación desde el backend
async function loadPlanning() {
  const fam = getFam();
  if (!fam) return;

  try {
    const data = await loadPlanningSupabase(fam);

    // Rellena los inputs con los datos recibidos, sin sobreescribir si el input está enfocado
    DIAS.forEach(d => {
      const el = document.getElementById(d);
      if (el && document.activeElement !== el) el.value = data[d] || "";
    });

    // Si se abre desde notificación con ?dia=...
    const params = new URLSearchParams(location.search);
    const dia = params.get("dia");
    if (dia && DIAS.includes(dia)) {
      const el = document.getElementById(dia);
      if (el) {
        el.classList.add("highlight");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => el.classList.remove("highlight"), 2500);
      }
    }
    const section = params.get("section");
    if (section === "budget") {
      const el = document.getElementById("budgetCard");
      if (el) {
        el.classList.add("highlight");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => el.classList.remove("highlight"), 2500);
      }
    }

  } catch (err) {
    console.error(err);
    alert("Error cargando planning desde Supabase (mira la consola).");
  }
}


// Guarda el valor de un día en el backend
async function saveDay(dia) {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia.");

  const value = document.getElementById(dia).value;

  try {
    await saveDaySupabase(fam, dia, value);
    await loadPlanning(); // refresca
  } catch (err) {
    console.error(err);
    alert("Error guardando el día en Supabase (mira la consola).");
  }

  await fetch(`${API_BASE}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fam,
        type: "meal",
        title: "Comida actualizada",
        body: `Se actualizó ${dia}`,
        url: `/planing-familiar/?dia=${encodeURIComponent(dia)}`,
        deviceId
      })
    });
}


// Evento de boton que establece el código de familia
btnSetFam.addEventListener("click", async () => {
  const v = famInput.value.trim();//Lee el valor del input y elimina espacios
  if (!v) return alert("Pega un código de familia.");//Si está vacío, muestra alerta y sale
  setFam(v);//Guarda el código de familia en localStorage
  try {
    await ensureFamilyExists(v);//Asegura que la familia existe en la base de datos
    await initCompra(v);//Inicializa la lista de la compra con la familia guardada
    await loadPlanning();//Carga la planificación asociada a ese código
    await initBudget(v);//Inicializa el presupuesto mensual con la familia guardada
    alert("Código de familia guardado ✅");//Muestra mensaje de éxito
  }catch(err) {
    console.error(err);
    alert("Error inicializando datos (mira la consola).");
  }  
});

// Evento de boton que activa las notificaciones push
btnPush.addEventListener("click", enablePush);

// Inicialización automatica al cargar la página
(async function init() {//Función autoejecutable para inicializar la app
  renderInputs();//Crea los inputs para los días de la semana
  const fam = getFam();

  // Si no hay familia guardada, sugerimos una (la compartes con tu familia)
  if (!getFam()) {
    const suggested = "fam_" + (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    famInput.value = suggested;
  } else {// Si ya hay familia guardada, la cargamos y cargamos la planificación
    famInput.value = getFam();
    try {
      await ensureFamilyExists(fam);
      await loadPlanning();
      await initCompra(fam);
      initBudget(fam);
    } catch (err) {
      console.error(err);
      alert("Error cargando datos (mira la consola).");
    }
  }

  /*// “casi” tiempo real gratis: polling cada 5s
  setInterval(loadPlanning, 5000);
  Este codigo comentado recargaria la pagina cada 5 segundos, pero nos impide escribir bien, ya que nos quita el texto que estamos escribiendo si no lo guardamos rapido*/
})();
