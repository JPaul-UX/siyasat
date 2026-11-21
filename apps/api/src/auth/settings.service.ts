import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const SIGNUPS_OPEN = 'signups_open';
const CACHE_MS = 15_000;

/** Settings the super admin changes while the site runs. */
@Injectable()
export class SettingsService {
  private signupsCache: { value: boolean; until: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Whether new accounts can be made. Open unless the super admin has paused sign-ups. */
  async signupsOpen(): Promise<boolean> {
    if (this.signupsCache && this.signupsCache.until > Date.now()) return this.signupsCache.value;
    const row = await this.prisma.setting.findUnique({ where: { key: SIGNUPS_OPEN } });
    const value = row?.value !== false;
    this.signupsCache = { value, until: Date.now() + CACHE_MS };
    return value;
  }

  async setSignupsOpen(open: boolean): Promise<void> {
    await this.prisma.setting.upsert({ where: { key: SIGNUPS_OPEN }, create: { key: SIGNUPS_OPEN, value: open }, update: { value: open } });
    this.signupsCache = { value: open, until: Date.now() + CACHE_MS };
  }
}
