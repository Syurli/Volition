import { deserializeEnvelope, type KnownEnvelope } from '@volition/protocol';

export type ConnectionState = 'offline' | 'connecting' | 'connected' | 'error';

export interface EndpointValidation {
  readonly valid: boolean;
  readonly message: string;
}

export function validateLiveEndpoint(endpoint: string, pageProtocol: string): EndpointValidation {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { valid: false, message: 'Endpoint must be a valid ws:// or wss:// URL.' };
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    return { valid: false, message: 'Volition 0.1 Web transport accepts only ws:// or wss:// endpoints.' };
  }
  if (pageProtocol === 'https:' && url.protocol === 'ws:') {
    return {
      valid: false,
      message: 'GitHub Pages/HTTPS cannot safely use ws:// mixed content. Use wss://, or connect from local development mode.',
    };
  }
  return {
    valid: true,
    message: url.protocol === 'wss:'
      ? 'Secure WebSocket endpoint is allowed in Pages production.'
      : 'ws:// is available only because this page is not running in an HTTPS production context.',
  };
}

export class WorkbenchWebSocketConnection {
  #socket: WebSocket | null = null;

  public connect(endpoint: string, onMessage: (message: KnownEnvelope) => void, onState: (state: ConnectionState, detail: string) => void): void {
    const validation = validateLiveEndpoint(endpoint, window.location.protocol);
    if (!validation.valid) {
      onState('error', validation.message);
      return;
    }
    this.disconnect();
    onState('connecting', validation.message);
    const socket = new WebSocket(endpoint);
    this.#socket = socket;
    socket.addEventListener('open', () => onState('connected', 'Live Bridge connected.'));
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        onMessage(deserializeEnvelope(event.data));
      } catch (error) {
        onState('error', error instanceof Error ? error.message : String(error));
      }
    });
    socket.addEventListener('error', () => onState('error', 'WebSocket connection failed. Offline Demo remains available.'));
    socket.addEventListener('close', () => {
      if (this.#socket === socket) {
        this.#socket = null;
        onState('offline', 'Live Bridge disconnected. Offline Demo remains available.');
      }
    });
  }

  public disconnect(): void {
    this.#socket?.close();
    this.#socket = null;
  }
}
