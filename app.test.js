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
