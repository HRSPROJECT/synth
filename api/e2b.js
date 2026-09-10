import { E2B } from '@e2b/code-interpreter';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { kind = 'code', code = '', command = '', timeout = 45, apiKey } = body;
    const finalApiKey = apiKey || process.env.E2B_API_KEY;

    if (!finalApiKey) {
      return res.status(400).json({ error: 'E2B API key is required on the server.' });
    }

    const client = new E2B({ apiKey: finalApiKey });
    const sandbox = await client.Sandbox.create();

    try {
      let result;

      if (kind === 'command') {
        const shellCommand = command || 'echo "No command provided"';
        result = await sandbox.runCode(
          `import subprocess, sys; r = subprocess.run(${JSON.stringify(shellCommand)}, shell=True, capture_output=True, text=True, timeout=${Number(timeout) || 45}); print(r.stdout); print(r.stderr, file=sys.stderr)`
        );
      } else {
        result = await sandbox.runCode(String(code || '').trim(), { timeout: Number(timeout) || 45 });
      }

      const normalized = normalizeE2BExecution(result);
      return res.status(200).json({
        ...normalized,
        sandboxId: sandbox.sandboxId || normalized.sandboxId,
      });
    } finally {
      try { await sandbox.close(); } catch {}
    }
  } catch (error) {
    const message = error?.message || 'Unknown E2B sandbox error';
    console.error('E2B API route error:', message);
    return res.status(500).json({ error: message, live: false, stdout: '', stderr: '' });
  }
}
