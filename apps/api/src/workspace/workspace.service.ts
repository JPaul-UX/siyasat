import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Workspaces are anonymous: creating one hands back a random token, and whoever holds the token owns the
 * workspace's saved checks. Only the token's hash is stored.
 */
@Injectable()
export class WorkspaceService {
  /** Token hash → workspace id, so most requests skip the database. */
  private readonly known = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async create(): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ws = await this.prisma.workspace.create({ data: { tokenHash: hash(token) }, select: { id: true } });
    this.known.set(hash(token), ws.id);
    return token;
  }

  /** The workspace a token belongs to, or null. */
  async resolve(token: string): Promise<string | null> {
    const tokenHash = hash(token);
    const cached = this.known.get(tokenHash);
    if (cached) return cached;
    const ws = await this.prisma.workspace.findUnique({ where: { tokenHash }, select: { id: true } });
    if (!ws) return null;
    if (this.known.size > 50_000) this.known.clear();
    this.known.set(tokenHash, ws.id);
    // Recorded once per server start, which is enough to tell abandoned workspaces from live ones.
    void this.prisma.workspace.update({ where: { id: ws.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    return ws.id;
  }
}
