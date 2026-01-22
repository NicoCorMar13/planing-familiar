const CACHE_NAME = "planing-familiar-v4";

// Servicio Worker para gestionar las notificaciones push, se dispara al escuchar un push
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};//Obtiene los datos del push
  const title = data.title || "Notificacion";//Título de la notificación
  const options = {//Opciones de la notificación
    body: data.body || "",//Cuerpo de la notificación
    icon: "/planing-familiar/icono-192.png",//Icono de la notificación
    data: { url: data.url || "./" }//Datos adicionales, como la URL a abrir al hacer clic
  };

  event.waitUntil(self.registration.showNotification(title, options));//Muestra la notificación, "waitUntil" asegura que el SW no se cierre antes de mostrarla
});

// Maneja el clic en la notificación
self.addEventListener("notificationclick", (event) => {
  event.notification.close();//Cierra la notificación al hacer clic
  const url = event.notification.data?.url || "./";//Obtiene la URL a abrir desde los datos de la notificación, si no la obtiene, usa la raíz(./)

  // Abre la URL en una nueva ventana o enfoca una existente, usando "waitUntil" para mantener el SW activo hasta completar la acción
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });//Obtiene todas las ventanas abiertas bajo el control del SW
    // Si ya hay una pestaña abierta, la enfocamos y navegamos
    for (const c of allClients) {
      if ("focus" in c) {
        await c.focus();
        c.navigate(url);
        return;
      }
    }
    // Si no, abrimos nueva
    await clients.openWindow(url);
  })());
});
