import type { VercelRequest, VercelResponse } from '@vercel/node';
import { spawn } from 'child_process';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const input = (req.body && typeof req.body === 'object') ? req.body : {};
    const skus: string[] = Array.isArray(input.skus) ? input.skus.map((s: any) => String(s)) : [];
    const horizonWeeks = Number(input.horizonWeeks || 26);

    // Call local python runner; requires local environment, not suitable for Vercel cloud
    const pyPath = 'python3';
    const runner = `${process.cwd()}/scripts/probstates_runner.py`;

    const env = { ...process.env, PYTHONPATH: `${process.env.PYTHONPATH || ''}:/Users/edcher/Documents/GitHub/ProbStates` };
    const child = spawn(pyPath, [runner], { env });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });

    child.on('error', (e) => {
      return res.status(500).json({ error: 'Spawn error', details: e.message });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: 'Probstates runner failed', code, stderr });
      }
      try {
        const json = JSON.parse(stdout || '{}');
        return res.status(200).json(json);
      } catch (e: any) {
        return res.status(500).json({ error: 'Invalid JSON from runner', snippet: stdout.slice(0, 200), stderr: stderr.slice(0, 200) });
      }
    });

    const payload = JSON.stringify({ skus, horizonWeeks });
    child.stdin.write(payload);
    child.stdin.end();
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


