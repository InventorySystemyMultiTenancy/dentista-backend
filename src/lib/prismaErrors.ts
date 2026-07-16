import { Prisma } from '@prisma/client';

// P2025 = "Record to update/delete does not exist" — o único caso em que um
// catch genérico deve virar 404 em vez de propagar como erro 500.
export function isNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}
