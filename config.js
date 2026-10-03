// ✏️ CONFIGURACIÓN — lo único que tienes que editar
export const CONFIG = {
  // 1) Pega aquí el firebaseConfig de tu proyecto (sin él, la app va en "modo prueba" solo en este móvil)
  firebase: {
    apiKey: "AIzaSyD9xnkWytevSmIzWwRZgfHpyqo6f6zdLKI",
    authDomain: "nosotros-e0fef.firebaseapp.com",
    projectId: "nosotros-e0fef",
    storageBucket: "nosotros-e0fef.firebasestorage.app",
    messagingSenderId: "457348336507",
    appId: "1:457348336507:web:6d0c710df7bc937ee10bde"
  },
  /* Ejemplo:
  firebase: {
    apiKey: "AIza...",
    authDomain: "nosotros-xxxx.firebaseapp.com",
    projectId: "nosotros-xxxx",
    storageBucket: "nosotros-xxxx.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
  },
  */

  // Nombre de la base de datos de Firestore (el ID que pusiste al crearla)
  database: "(default)",

  // 2) La pareja original (Christian y Celia): con estos dos emails se entra directamente
  //    en vuestro espacio de siempre. Cualquier otra persona crea el suyo (o se une con un código)
  //    al registrarse, y cada pareja solo puede ver lo suyo (lo controlan las reglas de Firestore).
  couple: "4AZIZhNNdznlToMOnho9sGQq",
  emails: { a: "criswolquer@gmail.com", b: "celiarl2405@gmail.com" },

  // 3) Nombres, fecha y carta de la pareja original (las demás parejas los eligen en la app;
  //    luego se pueden cambiar en ⚙️ Ajustes → Vosotros)
  names: { a: "Christian", b: "Celia" },

  // 4) Fecha en que empezasteis (AAAA-MM-DD)
  start: "2025-09-27",

  // 5) La carta que verá tu pareja la primera vez que abra la app
  letter: "Hace un año que empezó lo nuestro.\n\nLa distancia es larga, pero cada día contigo la hace más corta. Te he hecho esta app para que, estés donde estés, me tengas un poquito más cerca.\n\nFeliz aniversario.",
  sign: "Te quiero, Christian ❤️",

  // 7) Avisos con la app cerrada: dirección de tu servidor de Cloudflare (la pondremos cuando lo crees)
  pushUrl: "https://nosotros-avisos.criswolquer.workers.dev",
  vapidPublic: "BIESSgB6LD0_mid1CaXoeV_nqPN8YupKs8SQrxjXeRN7Nd7nFk4E6G8ND1FyagXnj0CrQlLkwze__d3MTW0rWtI",
  pushSecret: "abTidlXm25yVH4DpA52syGZj9WyiqpB_",   // ya no protege nada (el servidor 3.1 comprueba vuestra cuenta); se queda por compatibilidad

  // 6) Nombre inicial de vuestra mascota (luego se puede cambiar desde la app)
  petName: "Pollito"
};
