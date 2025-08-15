import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'train_demand.py');
    const { stdout, stderr } = await execAsync(
      `cd ${process.cwd()}/scripts && source mlvenv/bin/activate && python train_demand.py`,
      {
        env: {
          ...process.env,
          SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE_KEY,
          HORIZON_WEEKS: '12'
        }
      }
    );
    
    if (stderr) {
      console.error('ML training stderr:', stderr);
    }
    
    try {
      const result = JSON.parse(stdout);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(200).json({ message: stdout, stderr });
    }
    
  } catch (error: any) {
    console.error('ML refresh error:', error);
    return res.status(500).json({ 
      error: 'Failed to refresh ML predictions', 
      details: error.message 
    });
  }
}
