const express = require('express');
const path = require('path');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/my-first-app';

const client = new MongoClient(MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function getMessagesCollection() {
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
        const collection = await getMessagesCollection();
        const messages = await collection.find({}).sort({ timestamp: -1 }).toArray();
        res.json(messages);
    } catch (error) {
        console.error('Unable to fetch messages:', error);
        res.status(500).json({ error: 'Could not fetch messages from the database.' });
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
        const collection = await getMessagesCollection();
        await collection.insertOne(newMessage);
        console.log(`Saved message to MongoDB for ${newMessage.name}`);

        res.send(`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
                <h2>Thank you, ${newMessage.name}!</h2>
                <p>Your message has been saved to the database.</p>
                <br>
                <a href="/contact" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go Back</a>
            </div>
        `);
    } catch (error) {
        console.error('Failed to save message to MongoDB:', error);
        res.status(500).send('<h2>There was an error saving your message. Please try again later.</h2>');
    }
});

// 404 Catch-all handler
app.use((req, res) => {
    res.status(404).send('<h1>404 - Document Not Found</h1>');
});

async function startServer() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

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

