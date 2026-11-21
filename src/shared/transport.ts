/**
 * Transport boundary between the client and the authoritative server.
 * LocalTransport runs the server in-process (no multiplayer yet); swapping in a
 * WorkerTransport or WebSocketTransport later requires no game-logic changes.
 */
import type { ClientCommand, ServerMessage } from './protocol';

export type MessageHandler = (message: ServerMessage) => void;

export interface Transport {
  send(command: ClientCommand): void;
  onMessage(handler: MessageHandler): () => void;
  dispose(): void;
}

interface ServerEndpoint {
  receive(command: ClientCommand): void;
  onMessage(handler: MessageHandler): () => void;
}

/**
 * In-process transport. Both directions are queued and flushed on a microtask
 * so handlers never re-enter the caller synchronously.
 */
export class LocalTransport implements Transport {
  private readonly clientQueue: ClientCommand[] = [];
  private readonly serverQueue: ServerMessage[] = [];
  private readonly handlers = new Set<MessageHandler>();
  private readonly serverHandlers = new Set<() => void>();
  private server: ServerEndpoint | null = null;
  private flushScheduled = false;
  private disposed = false;

  attachServer(server: ServerEndpoint): void {
    this.server = server;
    const off = server.onMessage((message) => {
      this.serverQueue.push(message);
      this.scheduleFlush();
    });
    // Keep a handle for dispose via a wrapper set.
    this.serverHandlers.add(() => off());
    this.scheduleFlush();
  }

  send(command: ClientCommand): void {
    if (this.disposed) return;
    this.clientQueue.push(command);
    this.scheduleFlush();
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clientQueue.length = 0;
    this.serverQueue.length = 0;
    this.handlers.clear();
    for (const off of this.serverHandlers) off();
    this.serverHandlers.clear();
    this.server = null;
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      if (this.disposed) return;

      const commands = this.clientQueue.splice(0);
      if (this.server) {
        for (const command of commands) this.server.receive(command);
      }

      const messages = this.serverQueue.splice(0);
      for (const message of messages) {
        for (const handler of this.handlers) handler(message);
      }

      if (this.clientQueue.length || this.serverQueue.length) this.scheduleFlush();
    });
  }
}
