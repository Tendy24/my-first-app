require('dotenv').config();

// Works around a Node.js OpenSSL 3.x TLS 1.3 session-resumption bug that
// breaks handshakes against MongoDB Atlas's multi-host TLS setup.
require('tls').DEFAULT_MAX_VERSION = 'TLSv1.2';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'my-first-app';
const DATA_FILE = path.join(__dirname, 'messages.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production';
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

function readUsersFile() {
    try {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const users = parsed.map((user) => ({
            ...user,
            email: user.email ?? null,
            fullName: user.fullName ?? '',
            emailVerified: user.emailVerified ?? false,
            emailVerificationToken: user.emailVerificationToken ?? null,
            updatedAt: user.updatedAt ?? user.createdAt ?? null,
        }));

        if (JSON.stringify(users) !== JSON.stringify(parsed)) {
            writeUsersFile(users);
        }

        return users;
    } catch (error) {
        if (error.code === 'ENOENT') {
            fs.writeFileSync(USERS_FILE, '[]', 'utf8');
            return [];
        }
        throw error;
    }
}

function writeUsersFile(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUserInput(value) {
    return escapeHtml(String(value ?? '')).trim();
}

function sanitizeMessageRecord(message) {
    if (!message || typeof message !== 'object') {
        return message;
    }

    return {
        ...message,
        name: sanitizeUserInput(message.name),
        message: sanitizeUserInput(message.message),
    };
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

function getMessagesCollection() {
    if (!USE_MONGO || !client) {
        return null;
    }

    return client.db(DATABASE_NAME).collection('messages');
}

async function closeMongoClient() {
    if (USE_MONGO && client) {
        await client.close();
    }
}

// Middleware configuration
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 60 * 60 * 1000,
    },
}));

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

function normalizeUsername(value) {
    return String(value ?? '').trim();
}

function normalizeEmail(value) {
    return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? ''));
}

function renderProtectedPage(title, bodyHtml, username) {
    const safeTitle = escapeHtml(title);
    const safeUser = escapeHtml(username || 'User');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f7f7f7; }
    .shell { max-width: 980px; margin: 40px auto; padding: 0 16px; }
    nav { display: flex; gap: 16px; align-items: center; background: #fff; padding: 14px 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px; }
    nav a { color: #0d6efd; text-decoration: none; font-weight: 600; }
    nav .user { margin-left: auto; font-weight: 700; color: #1b1b1b; }
    .card { background: #fff; padding: 24px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .button { display: inline-block; padding: 10px 16px; border-radius: 6px; background: #007bff; color: white; text-decoration: none; font-weight: 600; }
    .button.secondary { background: #6c757d; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input { width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 6px; box-sizing: border-box; margin-bottom: 12px; }
    form { max-width: 420px; }
    button { background: #28a745; color: #fff; border: 0; border-radius: 6px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="shell">
    <nav>
      <a href="/">Home</a>
      <a href="/dashboard">Dashboard</a>
      <a href="/profile">Profile</a>
      <span class="user">${safeUser}</span>
      <a href="/logout">Logout</a>
    </nav>
    <div class="card">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    return next();
}

// --- Routes ---

app.get('/', (req, res) => {
    const homePath = path.join(__dirname, 'public', 'index.html');
    const original = fs.readFileSync(homePath, 'utf8');

    if (!req.session.user) {
        return res.send(original);
    }

    const userName = escapeHtml(req.session.user.username);
    const updated = original.replace(
        '</nav>',
        `  <span style="margin-left: auto; color: #333; font-weight: 600;">Logged in as ${userName}</span>\n        <a href="/logout">Logout</a>\n      </nav>`
    );

    return res.send(updated);
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
    const username = escapeHtml(req.session.user.username);
    const body = `
      <h1>Dashboard</h1>
      <p>Welcome back, <strong>${username}</strong>.</p>
      <p>You are signed in and can manage your account.</p>
      <div class="actions">
        <a class="button" href="/profile">View Profile</a>
        <a class="button secondary" href="/reset-password">Reset Password</a>
      </div>
    `;

    return res.send(renderProtectedPage('Dashboard', body, req.session.user.username));
});

app.get('/profile', requireAuth, (req, res) => {
    const users = readUsersFile();
    const currentUser = users.find((user) => user.id === req.session.user.id) || req.session.user;
    const username = escapeHtml(currentUser.username || req.session.user.username);
    const email = escapeHtml(currentUser.email || '');
    const fullName = escapeHtml(currentUser.fullName || '');
    const isVerified = Boolean(currentUser.emailVerified);

    const body = `
      <h1>Profile</h1>
      <p><strong>Username:</strong> ${username}</p>
      <p><strong>Full name:</strong> ${fullName || 'Not set'}</p>
      <p><strong>Email:</strong> ${email || 'Not set'}</p>
      <p><strong>Account status:</strong> ${isVerified ? 'Verified' : 'Pending email validation'}</p>
      <div class="actions">
        <a class="button" href="/dashboard">Back to Dashboard</a>
        <a class="button secondary" href="/settings">Edit Settings</a>
        <a class="button secondary" href="/reset-password">Reset Password</a>
      </div>
    `;

    return res.send(renderProtectedPage('Profile', body, req.session.user.username));
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    return res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error('Unable to destroy session:', error);
        }
        return res.redirect('/login');
    });
});

app.get('/verify-email', (req, res) => {
    const token = String(req.query.token || '');

    if (!token) {
        return res.status(400).send('<h2>Missing email verification token.</h2>');
    }

    const users = readUsersFile();
    const userIndex = users.findIndex((user) => user.emailVerificationToken === token);

    if (userIndex === -1) {
        return res.status(404).send('<h2>Invalid or expired verification link.</h2>');
    }

    const user = users[userIndex];
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.updatedAt = new Date().toISOString();
    writeUsersFile(users);

    if (req.session.user && req.session.user.id === user.id) {
        req.session.user.emailVerified = true;
    }

    return res.redirect('/profile');
});

app.get('/settings', requireAuth, (req, res) => {
    const users = readUsersFile();
    const currentUser = users.find((user) => user.id === req.session.user.id) || req.session.user;
    const body = `
      <h1>Update Profile</h1>
      <form action="/settings" method="POST">
        <label for="fullName">Full name</label>
        <input id="fullName" name="fullName" type="text" value="${escapeHtml(currentUser.fullName || '')}">

        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="${escapeHtml(currentUser.email || '')}" required>

        <button type="submit">Save profile</button>
      </form>
    `;

    return res.send(renderProtectedPage('Settings', body, req.session.user.username));
});

app.post('/settings', requireAuth, async (req, res) => {
    const fullName = normalizeUsername(req.body.fullName);
    const email = normalizeEmail(req.body.email);

    if (!email || !isValidEmail(email)) {
        return res.status(400).send('<h2>Please provide a valid email address.</h2>');
    }

    const users = readUsersFile();
    const userIndex = users.findIndex((user) => user.id === req.session.user.id);

    if (userIndex === -1) {
        return res.status(404).send('<h2>User not found.</h2>');
    }

    const currentUser = users[userIndex];
    const emailChanged = currentUser.email !== email;

    currentUser.fullName = fullName;
    currentUser.email = email;
    if (emailChanged) {
        currentUser.emailVerified = false;
        currentUser.emailVerificationToken = crypto.randomBytes(32).toString('hex');
    }
    currentUser.updatedAt = new Date().toISOString();

    writeUsersFile(users);
    req.session.user.fullName = fullName;
    req.session.user.email = email;

    return res.redirect('/profile');
});

app.get('/reset-password', requireAuth, (req, res) => {
    const body = `
      <h1>Reset Password</h1>
      <form action="/reset-password" method="POST">
        <label for="currentPassword">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" required>

        <label for="newPassword">New password</label>
        <input id="newPassword" name="newPassword" type="password" required minlength="8">

        <button type="submit">Update password</button>
      </form>
    `;

    return res.send(renderProtectedPage('Reset Password', body, req.session.user.username));
});

app.post('/reset-password', requireAuth, async (req, res) => {
    const currentPassword = String(req.body.currentPassword ?? '');
    const newPassword = String(req.body.newPassword ?? '');

    if (!currentPassword || !newPassword || newPassword.length < 8) {
        return res.status(400).send('<h2>Current and new password are required and the new password must be at least 8 characters long.</h2>');
    }

    const users = readUsersFile();
    const userIndex = users.findIndex((user) => user.id === req.session.user.id);

    if (userIndex === -1) {
        return res.status(404).send('<h2>User not found.</h2>');
    }

    const currentUser = users[userIndex];
    const passwordMatches = await bcrypt.compare(currentPassword, currentUser.passwordHash);

    if (!passwordMatches) {
        return res.status(401).send('<h2>Current password is incorrect.</h2>');
    }

    currentUser.passwordHash = await bcrypt.hash(newPassword, 12);
    writeUsersFile(users);

    return res.redirect('/dashboard');
});

app.post('/register', async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password ?? '');
    const fullName = normalizeUsername(req.body.fullName);

    if (!username || username.length < 3) {
        return res.status(400).send('<h2>Username must be at least 3 characters long.</h2>');
    }

    if (!email || !isValidEmail(email)) {
        return res.status(400).send('<h2>Please provide a valid email address.</h2>');
    }

    if (!password || password.length < 8) {
        return res.status(400).send('<h2>Password must be at least 8 characters long.</h2>');
    }

    const users = readUsersFile();
    const usernameExists = users.some((user) => user.username.toLowerCase() === username.toLowerCase());
    const emailExists = users.some((user) => user.email && user.email.toLowerCase() === email.toLowerCase());

    if (usernameExists) {
        return res.status(409).send('<h2>That username is already taken.</h2>');
    }

    if (emailExists) {
        return res.status(409).send('<h2>That email address is already in use.</h2>');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const newUser = {
        id: crypto.randomUUID(),
        username,
        email,
        fullName,
        passwordHash,
        emailVerified: false,
        emailVerificationToken,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    users.push(newUser);
    writeUsersFile(users);

    req.session.user = {
        id: newUser.id,
        username: newUser.username,
        fullName: newUser.fullName,
        email: newUser.email,
        emailVerified: newUser.emailVerified,
    };

    return res.redirect('/');
});

app.post('/login', async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password ?? '');

    if (!username || !password) {
        return res.status(400).send('<h2>Please enter both username and password.</h2>');
    }

    const users = readUsersFile();
    const user = users.find((entry) => entry.username.toLowerCase() === username.toLowerCase());

    if (!user) {
        return res.status(401).send('<h2>Invalid username or password.</h2>');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
        return res.status(401).send('<h2>Invalid username or password.</h2>');
    }

    req.session.user = {
        id: user.id,
        username: user.username,
        fullName: user.fullName || '',
        email: user.email || '',
        emailVerified: Boolean(user.emailVerified),
    };

    return res.redirect('/');
});

app.get('/messages', async (req, res) => {
    try {
        if (!USE_MONGO) {
            const messages = readMessagesFile()
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .map(sanitizeMessageRecord);
            return res.json(messages);
        }

        const collection = getMessagesCollection();
        const messages = await collection.find({}).sort({ timestamp: -1 }).toArray();
        return res.json(messages.map(sanitizeMessageRecord));
    } catch (error) {
        console.error('Unable to fetch messages:', error);
        return res.status(500).json({ error: 'Could not fetch messages from the database.' });
    }
});

app.post('/submit-form', async (req, res) => {
    const name = sanitizeUserInput(req.body.userName);
    const message = sanitizeUserInput(req.body.userMessage);

    if (!name || !message) {
        return res.status(400).send('<h2>Please enter both your name and a message.</h2>');
    }

    const newMessage = {
        name,
        message,
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

        const collection = getMessagesCollection();
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

app.use(express.static(path.join(__dirname, 'public')));

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

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        await closeMongoClient();
        process.exit(0);
    });
}

startServer();

