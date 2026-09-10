import express from 'express';
import { E2B } from '@e2b/code-interpreter';

const app = express();
const port = Number(process.env.E2B_PORT || 3002);

app.use(express.json({ limit: '2mb' }));

function normalizeE2BExecution(execution) {
  const stdoutArr = Array.isArray(execution?.logs?.stdout) ? execution.logs.stdout : [];
  const stderrArr = Array.isArray(execution?.logs?.stderr) ? execution.logs.stderr : [];
  const stdout = [execution?.stdout, execution?.text, stdoutArr.join('\n')]
    .filter(v => typeof v === 'string' && v.trim())
    .join('\n')
    .trim();
  const stderr = [execution?.stderr, stderrArr.join('\n')]
    .filter(v => typeof v === 'string' && v.trim())
    .join('\n')
    .trim();

  return {
    live: true,
    sandboxId: execution?.sandboxId || 'e2b',
    stdout,
    stderr,
    error: execution?.error || '',
  };
}

app.post('/api/e2b', async (req, res) => {
  try {
    const { kind = 'code', code = '', command = '', timeout = 45, apiKey } = req.body || {};
    const finalApiKey = apiKey || process.env.E2B_API_KEY;

    if (!finalApiKey) {
      return res.status(400).json({ error: 'E2B API key is required on the server.' });
    }

    const client = new E2B({ apiKey: finalApiKey });
    const sandbox = await client.Sandbox.create();

    try {
      if (kind === 'command') {
        const execution = await sandbox.runCode(`import subprocess, textwrap, json; import shlex; r = subprocess.run(${JSON.stringify(command)}, shell=True, capture_output=True, text=True, timeout=${Number(timeout) || 45}); print(r.stdout); print(r.stderr, file=__import__('sys').stderr);`);
        const formatted = normalizeE2BExecution(execution);
        return res.json({
          ...formatted,
          sandboxId: sandbox.sandboxId || formatted.sandboxId,
        });
      }

      const execution = await sandbox.runCode(code, { timeout: Number(timeout) || 45 });
      const formatted = normalizeE2BExecution(execution);
      return res.json({
        ...formatted,
        sandboxId: sandbox.sandboxId || formatted.sandboxId,
      });
    } finally {
      try {
        await sandbox.close();
      } catch {}
    }
  } catch (error) {
    const message = error?.message || 'Unknown E2B sandbox error';
    console.error('E2B server error:', message);
    return res.status(500).json({ error: message, live: false, stdout: '', stderr: '' });
  }
});

app.post('/api/e2b/run', async (req, res) => {
  return app._router.handle(req, res);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'e2b-server' });
});

app.listen(port, () => {
  console.log(`E2B server running on http://localhost:${port}`);
});
