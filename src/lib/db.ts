// AION — Database Client
// Uses Prisma with Turso/libSQL driver adapter for edge-ready SQLite.
// Falls back to standard SQLite for local development.

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || '';

  // Detect Turso (libsql:// or https:// protocol)
  const isTurso = databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://');

  if (isTurso) {
    // Turso production setup with driver adapter
    const adapter = new PrismaLibSql({
      url: databaseUrl,
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    });

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  // Local SQLite development (file: protocol)
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
