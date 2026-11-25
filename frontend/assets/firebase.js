import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);

isSupported()
  .then((supported) => {
    if (supported) {
      getAnalytics(app);
    } else {
      console.info("Firebase Analytics is not supported in this browser.");
    }
  })
  .catch((error) => {
    console.error("Firebase Analytics could not be initialized.", error);
  });
