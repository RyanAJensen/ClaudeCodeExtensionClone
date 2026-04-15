import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Tool calls embedded in this message (for display only) */
  toolCalls?: ToolCallRecord[];
}

export interface ToolCallRecord {
  id: string;
  type: 'read_file' | 'edit_file' | 'list_files' | 'search_workspace' | 'run_terminal';
  input: Record<string, unknown>;
  output?: string;
  error?: string;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  model: string;
}

/**
 * Manages saving, loading, and listing conversation sessions on disk.
 * Sessions are stored as JSON files in ~/.claude-code-replica/sessions/
 */
export class SessionManager {
  private readonly sessionsDir: string;

  constructor() {
    this.sessionsDir = path.join(os.homedir(), '.claude-code-replica', 'sessions');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /** Create a new empty session */
  createSession(model: string): Session {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = {
      id,
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
    };
    this.saveSession(session);
    return session;
  }

  /** Persist a session to disk */
  saveSession(session: Session): void {
    session.updatedAt = Date.now();
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /** Load a session by ID. Returns null if not found. */
  loadSession(id: string): Session | null {
    const filePath = path.join(this.sessionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  /** List all sessions sorted by most recently updated */
  listSessions(): Session[] {
    this.ensureDir();
    const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
    const sessions: Session[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8');
        sessions.push(JSON.parse(raw) as Session);
      } catch {
        // Skip malformed files
      }
    }
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Delete a session */
  deleteSession(id: string): void {
    const filePath = path.join(this.sessionsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** Rename a session */
  renameSession(id: string, newTitle: string): void {
    const session = this.loadSession(id);
    if (session) {
      session.title = newTitle;
      this.saveSession(session);
    }
  }

  /**
   * Auto-generate a title from the first user message (truncated).
   */
  static generateTitle(firstUserMessage: string): string {
    const cleaned = firstUserMessage.replace(/<file[^>]*>[\s\S]*?<\/file>/g, '').trim();
    const first = cleaned.split('\n')[0].trim();
    if (first.length <= 60) return first;
    return first.slice(0, 57) + '...';
  }

  /**
   * Group sessions by relative date bucket for the UI.
   */
  static groupByDate(sessions: Session[]): { label: string; sessions: Session[] }[] {
    const now = Date.now();
    const DAY = 86400000;

    const today: Session[] = [];
    const yesterday: Session[] = [];
    const last7: Session[] = [];
    const older: Session[] = [];

    for (const s of sessions) {
      const age = now - s.updatedAt;
      if (age < DAY) {
        today.push(s);
      } else if (age < 2 * DAY) {
        yesterday.push(s);
      } else if (age < 7 * DAY) {
        last7.push(s);
      } else {
        older.push(s);
      }
    }

    const groups = [];
    if (today.length) groups.push({ label: 'Today', sessions: today });
    if (yesterday.length) groups.push({ label: 'Yesterday', sessions: yesterday });
    if (last7.length) groups.push({ label: 'Last 7 days', sessions: last7 });
    if (older.length) groups.push({ label: 'Older', sessions: older });
    return groups;
  }
}
