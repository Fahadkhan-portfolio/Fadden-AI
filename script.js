// Gemini API Configuration
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // Yahan apni asli Gemini API key paste kar do

// Modal Logic
const modal = document.getElementById("loginModal");
const openBtn = document.getElementById("openLoginBtn");
const closeBtn = document.querySelector(".close-btn");

if (openBtn && modal) {
  openBtn.onclick = () => modal.classList.add("active");
}
if (closeBtn && modal) {
  closeBtn.onclick = () => modal.classList.remove("active");
}
window.onclick = (e) => {
  if (e.target === modal) modal.classList.remove("active");
};

// Chat Functionality
async function sendMessage() {
  const input = document.getElementById("userInput");
  const chatBox = document.getElementById("chatBox");
  if (!input || !chatBox) return;

  const text = input.value.trim();
  if (!text) return;

  // Show User Message
  const userMsg = document.createElement("div");
  userMsg.className = "message user-msg";
  userMsg.innerText = text;
  chatBox.appendChild(userMsg);
  input.value = "";

  // Show Loading
  const aiMsg = document.createElement("div");
  aiMsg.className = "message ai-msg";
  aiMsg.innerText = "Thinking...";
  chatBox.appendChild(aiMsg);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: text }] }]
      })
    });
    const data = await res.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      aiMsg.innerText = data.candidates[0].content.parts[0].text;
    } else {
      aiMsg.innerText = "Error: Invalid response from Gemini API.";
    }
  } catch (err) {
    aiMsg.innerText = "Error connecting to AI service.";
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}
