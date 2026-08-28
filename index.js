const express = require('express');
const path = require('path');
const fs = require('fs'); // Added: File System module
const app = express();
// Uses the host's dynamic port, or falls back to 3000 for local development
const PORT = process.env.PORT || 3000;
const ADMIN_USER = "admin";
const ADMIN_PASS = "supersecret123";

// Protect the admin dashboard with HTTP Basic Authentication
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
        return res.status(401).send('Authentication required.');
    }

    try {
        const encodedCredentials = authHeader.slice('Basic '.length);
        const credentials = Buffer.from(encodedCredentials, 'base64').toString();
        const separatorIndex = credentials.indexOf(':');
        const user = separatorIndex >= 0 ? credentials.slice(0, separatorIndex) : '';
        const pass = separatorIndex >= 0 ? credentials.slice(separatorIndex + 1) : '';

        if (user === ADMIN_USER && pass === ADMIN_PASS) {
            return next();
        }
    } catch (error) {
        console.error("Error decoding admin credentials:", error);
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
    return res.status(401).send('Invalid credentials.');
}

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

// Route to view all submitted messages in a clean layout
app.get('/admin/messages', requireAdminAuth, (req, res) => {
    let messagesList = [];
    if (fs.existsSync(MESSAGES_FILE)) {
        try {
            const fileData = fs.readFileSync(MESSAGES_FILE, 'utf8');
            messagesList = JSON.parse(fileData);
        } catch (error) {
            console.error("Error reading dashboard records:", error);
        }
    }

    let tableRows = '';
    if (messagesList.length === 0) {
        tableRows = `<tr><td colspan="4" style="text-align: center; color: #777; padding: 20px;">No messages received yet.</td></tr>`;
    } else {
        messagesList.forEach(item => {
            const formattedDate = new Date(item.timestamp).toLocaleString();
            tableRows += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: 600;">${item.name}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; color: #555;">${item.message}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; color: #999; font-size: 14px;">${formattedDate}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
                        <form action="/admin/messages/delete" method="POST" style="margin:0; padding:0; display:inline;">
                            <input type="hidden" name="timestamp" value="${item.timestamp}">
                            <button type="submit" style="background: #dc3545; color: white; border: none; padding: 6px 12px; font-size: 13px; border-radius: 4px; cursor: pointer;">Delete</button>
                        </form>
                    </td>
                </tr>
            `;
        });
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Dashboard</title>
            <link rel="stylesheet" href="/style.css">
        </head>
        <body>
            <div class="container" style="max-width: 900px;">
                <nav>
                    <a href="/">Home</a>
                    <a href="/about">About</a>
                    <a href="/contact">Contact</a>
                    <a href="/admin/messages" style="color: #007bff;">Admin</a>
                </nav>
                
                <h1 style="margin-bottom: 25px;">Form Submissions Log</h1>
                
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: sans-serif;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 12px;">User Identity</th>
                            <th style="padding: 12px;">Message Details</th>
                            <th style="padding: 12px;">Received At</th>
                            <th style="padding: 12px; text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `);
});

// Handles deleting a specific log entry
app.post('/admin/messages/delete', requireAdminAuth, (req, res) => {
    const targetTimestamp = req.body.timestamp;

    if (fs.existsSync(MESSAGES_FILE)) {
        try {
            const fileData = fs.readFileSync(MESSAGES_FILE, 'utf8');
            const messagesList = JSON.parse(fileData);
            const updatedList = messagesList.filter(item => item.timestamp !== targetTimestamp);

            fs.writeFileSync(MESSAGES_FILE, JSON.stringify(updatedList, null, 2), 'utf8');
            console.log(`Deleted message recorded at timestamp: ${targetTimestamp}`);
        } catch (error) {
            console.error("Error processing file deletion logic:", error);
        }
    }

    res.redirect('/admin/messages');
});

// 404 Catch-all handler
app.use((req, res) => {
    res.status(404).send('<h1>404 - Document Not Found</h1>');
});

app.listen(PORT, () => {
    console.log(`Express application serving discrete files at http://localhost:${PORT}/`);
});

