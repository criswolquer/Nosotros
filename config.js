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

  // 2) Código secreto de la pareja (no lo compartas; ya está generado)
  couple: "4AZIZhNNdznlToMOnho9sGQq",

  // 2b) Vuestros emails: SOLO estas dos personas podrán entrar (con email y contraseña).
  //     Si los dejas vacíos, cualquiera con el código secreto podría entrar.
  emails: { a: "criswolquer@gmail.com", b: "celiarl2405@gmail.com" },

  // 3) Vuestros nombres: a = tú, b = tu pareja
  names: { a: "Christian", b: "Celia" },

  // 4) Fecha en que empezasteis (AAAA-MM-DD)
  start: "2025-09-27",

  // 5) La carta que verá tu pareja la primera vez que abra la app
  letter: "Hace un año que empezó lo nuestro.\n\nLa distancia es larga, pero cada día contigo la hace más corta. Te he hecho esta app para que, estés donde estés, me tengas un poquito más cerca.\n\nFeliz aniversario.",
  sign: "Te quiero, Christian ❤️",

  // 6) Nombre inicial de vuestra mascota (luego se puede cambiar desde la app)
  petName: "Pollito"
};
