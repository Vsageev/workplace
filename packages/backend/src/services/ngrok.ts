import { spawn, type ChildProcess } from 'node:child_process';
import { env } from '../config/env.js';

const NGROK_API = 'http://127.0.0.1:4040/api';

interface NgrokTunnel {
  public_url: string;
  proto: string;
  config: { addr: string };
}

let ngrokProcess: ChildProcess | null = null;
let currentTunnelUrl: string | null = null;

/**
 * Start an ngrok tunnel pointing to the backend port.
 * If a tunnel is already running, returns the existing URL.
 */
export async function startNgrokTunnel(): Promise<string> {
  // Check if we already have a running tunnel
  const existing = await getExistingTunnel();
  if (existing) {
    currentTunnelUrl = existing;
    return existing;
  }

  // Spawn ngrok
  const port = env.PORT;
  ngrokProcess = spawn('ngrok', ['http', String(port), '--log=stderr'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false,
  });

  ngrokProcess.on('error', (err) => {
    console.error('[ngrok] Failed to start:', err.message);
    ngrokProcess = null;
    currentTunnelUrl = null;
  });

  ngrokProcess.on('exit', (code) => {
    console.log(`[ngrok] Process exited with code ${code}`);
    ngrokProcess = null;
    currentTunnelUrl = null;
  });

  // Wait for ngrok to be ready (poll the local API)
  const url = await waitForTunnel(8000);
  currentTunnelUrl = url;
  console.log(`[ngrok] Tunnel started: ${url}`);
  return url;
}

/**
 * Stop the ngrok tunnel if we started it.
 */
export async function stopNgrokTunnel(): Promise<void> {
  if (ngrokProcess) {
    ngrokProcess.kill('SIGTERM');
    ngrokProcess = null;
    currentTunnelUrl = null;
    console.log('[ngrok] Tunnel stopped');
  }
}

/**
 * Get the current tunnel URL (if any).
 */
export function getNgrokTunnelUrl(): string | null {
  return currentTunnelUrl;
}

/**
 * Check if ngrok is already running by querying its local API.
 */
async function getExistingTunnel(): Promise<string | null> {
  try {
    const res = await fetch(`${NGROK_API}/tunnels`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { tunnels: NgrokTunnel[] };
    const httpsTunnel = data.tunnels.find(t => t.proto === 'https');
    return httpsTunnel?.public_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Poll ngrok's local API until the tunnel is up.
 */
async function waitForTunnel(timeoutMs: number): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await getExistingTunnel();
    if (url) return url;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('ngrok tunnel did not start within timeout');
}
