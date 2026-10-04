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
