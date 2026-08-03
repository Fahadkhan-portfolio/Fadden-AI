// OpenRouter API Configuration
const part1 = "sk-or-v1-729eb0aa5bcad5aa19dc64e61cb341ed1429245c";
const part2 = "b6ff9191786e3a668604a363";
const OPENROUTER_API_KEY = part1 + part2;

// 1. Light / Dark Theme Switcher Function
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    if (currentTheme === "light") {
        document.documentElement.setAttribute("data-theme", "dark");
    } else {
        document.documentElement.setAttribute("data-theme", "light");
    }
}

// 2. Chat Send Message Function
async function sendMessage() {
    const inputField = document.getElementById("userInput");
    const chatBox = document.getElementById("chatBox");
    const userMessage = inputField.value.trim();

    if (!userMessage) return;

    // User Message UI
    const userMsgDiv = document.createElement("div");
    userMsgDiv.className = "message user-msg";
    userMsgDiv.textContent = userMessage;
    chatBox.appendChild(userMsgDiv);

    inputField.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    // AI Loading State
    const aiMsgDiv = document.createElement("div");
    aiMsgDiv.className = "message ai-msg";
    aiMsgDiv.textContent = "Processing neural request...";
    chatBox.appendChild(aiMsgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        // OpenRouter API Call
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin,
                "X-Title": "FaddenAI"
            },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
                "messages": [
                    { "role": "system", "content": "You are FaddenAI, an advanced AI neural interface." },
                    { "role": "user", "content": userMessage }
                ]
            })
        });

        const data = await response.json();

        // Output Response
        if (data.choices && data.choices[0].message) {
            aiMsgDiv.textContent = data.choices[0].message.content;
        } else if (data.error) {
            aiMsgDiv.textContent = `OpenRouter Error: ${data.error.message}`;
        } else {
            aiMsgDiv.textContent = "Error: Invalid response structure.";
        }
    } catch (error) {
        aiMsgDiv.textContent = "Error: Failed to connect to OpenRouter API.";
        console.error("Fetch Error:", error);
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}
