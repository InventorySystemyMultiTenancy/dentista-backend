// Prisma retorna campos Decimal como objetos com toJSON() -> string.
// Convertemos para number puro para o frontend consumir sem parse extra.
export function decimalToNumber<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[],
): T {
  const copy: any = { ...obj };
  for (const field of fields) {
    if (copy[field] !== null && copy[field] !== undefined) {
      copy[field] = Number(copy[field]);
    }
  }
  return copy;
}
