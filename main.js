const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// URL del backend en Vercel
const API_BASE = "https://notificacion-tiempo-real-backend-we.vercel.app";

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
  return navigator.serviceWorker.register("/notificacion-tiempo-real/swV3.js");
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
  const fam = getFam();//Obtiene el codigo de familia
  if (!fam) return;//Si no hay codigo, sale

  const r = await fetch(`${API_BASE}/api/planning?fam=${encodeURIComponent(fam)}`);//Hace una peticion al backend para obtener la planificación
  const j = await r.json().catch(() => ({}));//Intenta parsear la respuesta como JSON
  const data = j.data || {};//Obtiene los datos de planificación o un objeto vacío si no hay datos

  // Rellena los inputs con los datos recibidos, sin sobreescribir si el input está enfocado
  DIAS.forEach(d => {
    const el = document.getElementById(d);
    if (el && document.activeElement !== el)//Evitamos sobreescribir si el input está enfocado
      el.value = data[d] || "";
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
}

// Guarda el valor de un día en el backend
async function saveDay(dia) {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia.");//Si no hay codigo de familia, muestra alerta y sale

  const value = document.getElementById(dia).value;//Obtiene el valor del input del día

  // Envía el valor al backend
  const r = await fetch(`${API_BASE}/api/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fam,//Codigo de familia para agrupar
      dia,//Día que se está guardando
      value,//Nuevo texto
      url: `/notificacion-tiempo-real/?dia=${encodeURIComponent(dia)}`,//URL para abrir desde la notificación
      deviceId//ID del dispositivo para no notificarse a sí mismo
    })
  });

  //Si falla el guardado, muestra alerta y sale
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.error(j);
    return alert("Error guardando (mira la consola).");
  }

  await loadPlanning();//Recarga la planificación para reflejar los cambios
}

// Evento de boton que establece el código de familia
btnSetFam.addEventListener("click", async () => {
  const v = famInput.value.trim();//Lee el valor del input y elimina espacios
  if (!v) return alert("Pega un código de familia.");//Si está vacío, muestra alerta y sale
  setFam(v);//Guarda el código de familia en localStorage
  await loadPlanning();//Carga la planificación asociada a ese código
  alert("Código de familia guardado ✅");//Muestra mensaje de éxito
});

// Evento de boton que activa las notificaciones push
btnPush.addEventListener("click", enablePush);

// Inicialización automatica al cargar la página
(function init() {//Función autoejecutable para inicializar la app
  renderInputs();//Crea los inputs para los días de la semana

  // Si no hay familia guardada, sugerimos una (la compartes con tu familia)
  if (!getFam()) {
    const suggested = "fam_" + (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    famInput.value = suggested;
  } else {// Si ya hay familia guardada, la cargamos y cargamos la planificación
    famInput.value = getFam();
    loadPlanning();
  }

  /*// “casi” tiempo real gratis: polling cada 5s
  setInterval(loadPlanning, 5000);
  Este codigo comentado recargaria la pagina cada 5 segundos, pero nos impide escribir bien, ya que nos quita el texto que estamos escribiendo si no lo guardamos rapido*/
})();

// ======================
// Lista de la compra (localStorage)
// ======================

const LS_KEY_COMPRA = "lista_compra_v1";

const inpProducto = document.getElementById("inpProducto");
const btnAdd = document.getElementById("btnAdd");
const btnEliminar = document.getElementById("btnEliminar");
const listaCompra = document.getElementById("listaCompra");

let compra = loadCompra();
renderCompra();

// Añadir con botón
btnAdd.addEventListener("click", () => {
  addProducto();
});

// Añadir con Enter
inpProducto.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addProducto();
});

btnEliminar.addEventListener("click", () => {
  eliminarMarcados();
});

function addProducto() {
  const text = (inpProducto.value || "").trim();
  if (!text) return;

  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    text,
    checked: false,
    createdAt: Date.now()
  };

  compra.push(item);
  saveCompra(compra);
  renderCompra();

  inpProducto.value = "";
  inpProducto.focus();

  // Más adelante: aquí dispararemos sync + notificación al resto
}

function eliminarMarcados() {
  const before = compra.length;
  compra = compra.filter(i => !i.checked);

  if (compra.length === before) return; // no había marcados

  saveCompra(compra);
  renderCompra();

  // Más adelante: aquí dispararemos sync + notificación al resto
}

function toggleChecked(id, value) {
  const i = compra.find(x => x.id === id);
  if (!i) return;
  i.checked = value;
  saveCompra(compra);
}

function renderCompra() {
  listaCompra.innerHTML = "";

  if (compra.length === 0) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <span></span>
      <span class="text" style="opacity:.6">No hay productos todavía.</span>
    `;
    listaCompra.appendChild(li);
    return;
  }

  // Orden: más nuevos arriba (puedes cambiarlo si quieres)
  const sorted = [...compra].sort((a,b) => b.createdAt - a.createdAt);

  for (const item of sorted) {
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

function loadCompra() {
  try {
    const raw = localStorage.getItem(LS_KEY_COMPRA);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCompra(arr) {
  localStorage.setItem(LS_KEY_COMPRA, JSON.stringify(arr));
}

