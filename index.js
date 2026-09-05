require('dotenv').config();

// Works around a Node.js OpenSSL 3.x TLS 1.3 session-resumption bug that
// breaks handshakes against MongoDB Atlas's multi-host TLS setup.
require('tls').DEFAULT_MAX_VERSION = 'TLSv1.2';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DATA_FILE = path.join(__dirname, 'messages.json');
const USE_MONGO = Boolean(MONGODB_URI && !MONGODB_URI.includes('REPLACE_WITH_'));

function readMessagesFile() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error.code === 'ENOENT') {
            fs.writeFileSync(DATA_FILE, '[]', 'utf8');
            return [];
        }
        throw error;
    }
}

function writeMessagesFile(messages) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf8');
}

let client;
if (USE_MONGO) {
    client = new MongoClient(MONGODB_URI, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
    });
}

async function getMessagesCollection() {
    if (!USE_MONGO) {
        return null;
    }

    await client.connect();
    return client.db('my-first-app').collection('messages');
}

// Middleware configuration
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

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

app.get('/messages', async (req, res) => {
    try {
        if (!USE_MONGO) {
            return res.json(readMessagesFile().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
        }

        const collection = await getMessagesCollection();
        const messages = await collection.find({}).sort({ timestamp: -1 }).toArray();
        return res.json(messages);
    } catch (error) {
        console.error('Unable to fetch messages:', error);
        return res.status(500).json({ error: 'Could not fetch messages from the database.' });
    }
});

app.post('/submit-form', async (req, res) => {
    const name = req.body.userName;
    const message = req.body.userMessage;

    if (!name || !message) {
        return res.status(400).send('<h2>Please enter both your name and a message.</h2>');
    }

    const newMessage = {
        name: name.trim(),
        message: message.trim(),
        timestamp: new Date().toISOString()
    };

    try {
        if (!USE_MONGO) {
            const messages = readMessagesFile();
            messages.push(newMessage);
            writeMessagesFile(messages);
            console.log(`Saved message locally for ${newMessage.name}`);

            return res.send(`
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                    <h2>Thank you, ${newMessage.name}!</h2>
                    <p>Your message has been saved locally.</p>
                    <br>
                    <a href="/contact" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go Back</a>
                </div>
            `);
        }

        const collection = await getMessagesCollection();
        await collection.insertOne(newMessage);
        console.log(`Saved message to MongoDB for ${newMessage.name}`);

        return res.send(`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                <h2>Thank you, ${newMessage.name}!</h2>
                <p>Your message has been saved to the database.</p>
                <br>
                <a href="/contact" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go Back</a>
            </div>
        `);
    } catch (error) {
        console.error('Failed to save message:', error);
        return res.status(500).send('<h2>There was an error saving your message. Please try again later.</h2>');
    }
});

// 404 Catch-all handler
app.use((req, res) => {
    res.status(404).send('<h1>404 - Document Not Found</h1>');
});

async function startServer() {
    try {
        if (USE_MONGO) {
            await client.connect();
            console.log('Connected to MongoDB');
        } else {
            console.log('MONGODB_URI not configured. Using local messages.json storage.');
        }

        app.listen(PORT, () => {
            console.log(`Express application serving discrete files at http://localhost:${PORT}/`);
        });
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        console.log('Remember to set MONGODB_URI or run a local MongoDB instance.');
        process.exit(1);
    }
}

startServer();

