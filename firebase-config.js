// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCBvAgn1CxygVY3AMLLtkJm7AOB_3YLKgU",
  authDomain: "der-duemmste-fliegt-4c090.firebaseapp.com",
  // HIER DIE URL EINFÜGEN, DIE DU GERADE KOPIERT HAST:
  databaseURL: "https://der-duemmste-fliegt-4c090-default-rtdb.europe-west1.firebasedatabase.app/", 
  projectId: "der-duemmste-fliegt-4c090",
  storageBucket: "der-duemmste-fliegt-4c090.firebasestorage.app",
  messagingSenderId: "117702417720",
  appId: "1:117702417720:web:2efd89fb2bd9a2f490b5cd"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Wir exportieren die Funktionen, damit Admin und Spieler sie nutzen können
export { db, ref, set, onValue, update, push, remove };
