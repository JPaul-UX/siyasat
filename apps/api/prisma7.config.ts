import { defineConfig } from 'prisma/config';

// Local development reads DATABASE_URL from apps/api/.env. In production it is already in the environment.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
