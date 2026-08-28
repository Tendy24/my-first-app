const express = require('express');
const path = require('path');
const fs = require('fs'); // Added: File System module
const app = express();
// Uses the host's dynamic port, or falls back to 3000 for local development
const PORT = process.env.PORT || 3000;

// Middleware configuration
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Path where data will be stored
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// --- Routes ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Updated: Form submission handler saving to JSON file
app.post('/submit-form', (req, res) => {
    const name = req.body.userName;
    const message = req.body.userMessage;

    const newMessage = {
        name: name,
        message: message,
        timestamp: new Date().toISOString()
    };

    // 1. Read existing messages from the file if it exists
    let messagesList = [];
    if (fs.existsSync(MESSAGES_FILE)) {
        try {
            const fileData = fs.readFileSync(MESSAGES_FILE, 'utf8');
            messagesList = JSON.parse(fileData);
        } catch (error) {
            console.error("Error parsing JSON file, resetting array:", error);
        }
    }

    // 2. Add the new message item to our array list
    messagesList.push(newMessage);

    // 3. Save the updated array back to the JSON file
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesList, null, 2), 'utf8');

    console.log(`Saved message to messages.json from ${newMessage.name}`);

    // Send response back to browser
    res.send(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
            <h2>Thank you, ${newMessage.name}!</h2>
            <p>Your message has been permanently saved to the server.</p>
            <br>
            <a href="/contact" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go Back</a>
        </div>
    `);
});

// 404 Catch-all handler
app.use((req, res) => {
    res.status(404).send('<h1>404 - Document Not Found</h1>');
});

app.listen(PORT, () => {
    console.log(`Express application serving discrete files at http://localhost:${PORT}/`);
});

