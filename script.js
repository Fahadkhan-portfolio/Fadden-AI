import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. Firebase Config (Console se le kar yahan paste karein)
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 2. Google Gemini API Key
const GEMINI_API_KEY = window.ENV_GEMINI_KEY || "YOUR_GEMINI_API_KEY";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- Modal Handling ---
const loginModal = document.getElementById('loginModal');
const openLoginBtn = document.getElementById('openLoginBtn');
const closeLoginBtn = document.getElementById('closeLoginBtn');

if(openLoginBtn) openLoginBtn.onclick = () => loginModal.style.display = 'flex';
if(closeLoginBtn) closeLoginBtn.onclick = () => loginModal.style.display = 'none';

// --- Auth State Check ---
onAuthStateChanged(auth, (user) => {
  const userNameElem = document.getElementById('userName');
  const logoutBtn = document.getElementById('logoutBtn');
  
  if (user) {
    if(userNameElem) userNameElem.innerText = user.displayName || user.phoneNumber || "User";
    if(logoutBtn) logoutBtn.style.display = "block";
    if(loginModal) loginModal.style.display = 'none';
  } else {
    if(userNameElem) userNameElem.innerText = "Guest User";
    if(logoutBtn) logoutBtn.style.display = "none";
  }
});

// Google Login
const googleBtn = document.getElementById('googleLoginBtn');
if(googleBtn) {
  googleBtn.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider).catch(err => alert(err.message));
  });
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn) {
  logoutBtn.addEventListener('click', () => signOut(auth));
}

// --- AI Chat Logic ---
const sendBtn = document.getElementById('sendBtn');
const userInput = document.getElementById('userInput');
const chatBox = document.getElementById('chatBox');

if(sendBtn) {
  sendBtn.addEventListener('click', sendMessage);
  userInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });
}

async function sendMessage() {
  const text = userInput.value.trim();
  if(!text) return;

  // Render User Message
  appendMessage(text, 'user-message');
  userInput.value = '';

  // Render Loading Indicator
  const loadingElem = appendMessage("Fadden AI thinking...", 'ai-message');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: text }] }]
      })
    });

    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;
    loadingElem.innerText = reply;
  } catch (error) {
    loadingElem.innerText = "Error: Please check your Gemini API key in script.js!";
  }
}

function appendMessage(text, className) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${className}`;
  msgDiv.innerText = text;
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgDiv;
}
