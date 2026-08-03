// Pollinations AI - Completely Free & No API Key Needed
async function sendMessage() {
    const inputField = document.getElementById("userInput");
    const chatBox = document.getElementById("chatBox");
    const userMessage = inputField.value.trim();

    if (!userMessage) return;

    // 1. User Message UI
    const userMsgDiv = document.createElement("div");
    userMsgDiv.className = "message user-msg";
    userMsgDiv.textContent = userMessage;
    chatBox.appendChild(userMsgDiv);

    inputField.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    // 2. AI Loading State
    const aiMsgDiv = document.createElement("div");
    aiMsgDiv.className = "message ai-msg";
    aiMsgDiv.textContent = "Processing neural request...";
    chatBox.appendChild(aiMsgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        // 3. Free AI Fetch Call
        const response = await fetch("https://text.pollinations.ai/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "You are FaddenAI, an advanced neural AI interface." },
                    { role: "user", content: userMessage }
                ],
                model: "openai"
            })
        });

        const aiText = await response.text();

        // 4. Output Response
        if (aiText) {
            aiMsgDiv.textContent = aiText;
        } else {
            aiMsgDiv.textContent = "Error: Unable to get response.";
        }
    } catch (error) {
        aiMsgDiv.textContent = "Error: Connection failed. Please try again.";
        console.error("Fetch Error:", error);
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}
