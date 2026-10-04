const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

test('app starts without a configured MONGODB_URI', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3100',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out waiting for startup output. Output: ${output}`));
    }, 10000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Express application serving')) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        resolve();
      }
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM' && output.includes('Express application serving')) {
        clearTimeout(timer);
        resolve();
      }

      if (code !== null && code !== 0 && !output.includes('Express application serving')) {
        clearTimeout(timer);
        reject(new Error(`Process exited with code ${code}. Output: ${output}`));
      }
    });
  });

  assert.match(output, /Express application serving/i);
});

test('GET /login serves the login page', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3101',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const response = await fetch('http://localhost:3101/login');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Login & Registration/);
  } finally {
    child.kill('SIGTERM');
  }
});

test('POST /submit-form escapes HTML in user input', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3102',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const params = new URLSearchParams();
    params.append('userName', '<script>alert("xss")</script>');
    params.append('userMessage', '<img src=x onerror=alert(1)>');

    const response = await fetch('http://localhost:3102/submit-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const body = await response.text();
    const messagesResponse = await fetch('http://localhost:3102/messages');
    const messages = await messagesResponse.json();

    assert.equal(response.status, 200);
    assert.match(body, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/i);
    assert.doesNotMatch(body, /<script>alert\("xss"\)<\/script>/i);
    assert.ok(messages.some((entry) => entry.name.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')));
    assert.ok(messages.some((entry) => entry.message.includes('&lt;img src=x onerror=alert(1)&gt;')));
    assert.ok(!messages.some((entry) => entry.name.includes('<script>')));
    assert.ok(!messages.some((entry) => entry.message.includes('<img')));
  } finally {
    child.kill('SIGTERM');
  }
});

test('GET /messages returns saved messages in reverse chronological order', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3103',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const first = new URLSearchParams({ userName: 'Alpha', userMessage: 'First message' });
    const second = new URLSearchParams({ userName: 'Bravo', userMessage: 'Second message' });

    await fetch('http://localhost:3103/submit-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: first.toString(),
    });

    await fetch('http://localhost:3103/submit-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: second.toString(),
    });

    const response = await fetch('http://localhost:3103/messages');
    const messages = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(messages));
    assert.ok(messages.length >= 2);
    assert.equal(messages[0].name, 'Bravo');
    assert.equal(messages[0].message, 'Second message');
    assert.equal(messages[1].name, 'Alpha');
    assert.equal(messages[1].message, 'First message');
  } finally {
    child.kill('SIGTERM');
  }
});

test('POST /submit-form rejects invalid submissions', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3104',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const params = new URLSearchParams();
    params.append('userName', 'Only a name');

    const response = await fetch('http://localhost:3104/submit-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /Please enter both your name and a message/i);
  } finally {
    child.kill('SIGTERM');
  }
});

test('GET /missing returns a 404 response', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3105',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const response = await fetch('http://localhost:3105/not-found');
    const body = await response.text();

    assert.equal(response.status, 404);
    assert.match(body, /404 - Document Not Found/i);
  } finally {
    child.kill('SIGTERM');
  }
});

test('POST /register and /login create a real authenticated session', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3106',
      SESSION_SECRET: 'test-session-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const username = `auth_user_3106_${Date.now()}`;
    const password = 'SecurePass123!';

    const registerResponse = await fetch('http://localhost:3106/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, email: `${username}@example.com`, password }).toString(),
      redirect: 'manual',
    });

    assert.equal(registerResponse.status, 302);
    assert.match(registerResponse.headers.get('location') || '', /\//i);

    const loginResponse = await fetch('http://localhost:3106/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }).toString(),
      redirect: 'manual',
    });

    assert.equal(loginResponse.status, 302);
    assert.match(loginResponse.headers.get('location') || '', /\//i);

    const rawSessionCookie = loginResponse.headers.get('set-cookie');
    const sessionCookie = rawSessionCookie ? rawSessionCookie.split(';')[0] : '';

    assert.ok(sessionCookie && sessionCookie.includes('connect.sid='));

    const profileResponse = await fetch('http://localhost:3106/', {
      headers: {
        Cookie: sessionCookie,
      },
    });

    const profileText = await profileResponse.text();
    assert.match(profileText, new RegExp(username, 'i'));
  } finally {
    child.kill('SIGTERM');
  }
});

test('protected account pages redirect unauthenticated users and dashboard loads for logged in users', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3107',
      SESSION_SECRET: 'test-session-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const unauthenticatedResponse = await fetch('http://localhost:3107/dashboard', { redirect: 'manual' });
    assert.equal(unauthenticatedResponse.status, 302);
    assert.match(unauthenticatedResponse.headers.get('location') || '', /\/login/i);

    const username = `protected_user_${Date.now()}`;
    const password = 'StrongPass123!';

    const registerResponse = await fetch('http://localhost:3107/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, email: `${username}@example.com`, password }).toString(),
      redirect: 'manual',
    });

    const sessionCookie = registerResponse.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(sessionCookie.includes('connect.sid='));

    const dashboardResponse = await fetch('http://localhost:3107/dashboard', {
      headers: { Cookie: sessionCookie },
    });

    const dashboardText = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200);
    assert.match(dashboardText, new RegExp(username, 'i'));
  } finally {
    child.kill('SIGTERM');
  }
});

test('POST /reset-password updates the stored password for an authenticated user', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3108',
      SESSION_SECRET: 'test-session-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const username = `reset_user_${Date.now()}`;
    const password = 'InitialPass123!';
    const newPassword = 'NewSecurePass456!';

    const registerResponse = await fetch('http://localhost:3108/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, email: `${username}@example.com`, password }).toString(),
      redirect: 'manual',
    });

    const sessionCookie = registerResponse.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(sessionCookie.includes('connect.sid='));

    const resetResponse = await fetch('http://localhost:3108/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: sessionCookie,
      },
      body: new URLSearchParams({ currentPassword: password, newPassword }).toString(),
      redirect: 'manual',
    });

    assert.equal(resetResponse.status, 302);
    assert.match(resetResponse.headers.get('location') || '', /\/dashboard/i);

    const logoutResponse = await fetch('http://localhost:3108/logout', {
      headers: { Cookie: sessionCookie },
      redirect: 'manual',
    });

    assert.equal(logoutResponse.status, 302);

    const loginResponse = await fetch('http://localhost:3108/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password: newPassword }).toString(),
      redirect: 'manual',
    });

    assert.equal(loginResponse.status, 302);
  } finally {
    child.kill('SIGTERM');
  }
});

test('GET /register serves a dedicated registration page with styling and POST /register validates email', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3109',
      SESSION_SECRET: 'test-session-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const registerPage = await fetch('http://localhost:3109/register');
    const registerHtml = await registerPage.text();

    assert.equal(registerPage.status, 200);
    assert.match(registerHtml, /Create Your Account/i);
    assert.match(registerHtml, /register-shell|register-card/i);

    const invalidEmailResponse = await fetch('http://localhost:3109/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: 'validuser',
        email: 'not-an-email',
        password: 'StrongPass123!',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(invalidEmailResponse.status, 400);
  } finally {
    child.kill('SIGTERM');
  }
});

test('GET /verify-email validates an email token and /settings updates profile details', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      MONGODB_URI: '',
      PORT: '3110',
      SESSION_SECRET: 'test-session-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output: ${output}`)), 10000);

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Express application serving')) {
          clearTimeout(timer);
          resolve();
        }
      });

      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('exit', (code) => {
        if (!output.includes('Express application serving')) {
          clearTimeout(timer);
          reject(new Error(`Process exited with code ${code}. Output: ${output}`));
        }
      });
    });

    const username = `settings_user_${Date.now()}`;
    const email = `user${Date.now()}@example.com`;
    const password = 'StrongPass123!';

    const registerResponse = await fetch('http://localhost:3110/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, email, password }).toString(),
      redirect: 'manual',
    });

    const sessionCookie = registerResponse.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(sessionCookie.includes('connect.sid='));

    const users = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'users.json'), 'utf8'));
    const savedUser = users.find((entry) => entry.username === username);
    assert.ok(savedUser && savedUser.emailVerificationToken);

    const verifyResponse = await fetch(`http://localhost:3110/verify-email?token=${savedUser.emailVerificationToken}`, { redirect: 'manual' });
    assert.equal(verifyResponse.status, 302);

    const profileResponse = await fetch('http://localhost:3110/settings', {
      headers: { Cookie: sessionCookie },
    });
    let profileHtml = await profileResponse.text();
    assert.equal(profileResponse.status, 200);
    assert.match(profileHtml, /Update Profile/i);

    const updatedName = 'Updated Profile Name';
    const updatedEmail = `updated${Date.now()}@example.com`;

    const settingsResponse = await fetch('http://localhost:3110/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: sessionCookie,
      },
      body: new URLSearchParams({
        fullName: updatedName,
        email: updatedEmail,
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(settingsResponse.status, 302);

    const refreshedProfileResponse = await fetch('http://localhost:3110/profile', {
      headers: { Cookie: sessionCookie },
    });
    const refreshedHtml = await refreshedProfileResponse.text();
    assert.match(refreshedHtml, new RegExp(updatedName, 'i'));
    assert.match(refreshedHtml, new RegExp(updatedEmail, 'i'));
  } finally {
    child.kill('SIGTERM');
  }
});
