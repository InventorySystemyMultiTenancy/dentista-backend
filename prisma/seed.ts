import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@clinica.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'troque-esta-senha';
  const name = process.env.ADMIN_NAME ?? 'Administrador';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Usuário admin "${email}" já existe, nada a fazer.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      staff: {
        create: {
          name,
          permissions: {
            patients: { view: true, edit: true },
            agenda: { view: true, edit: true },
            exams: { view: true, edit: true },
            financial: { view: true, edit: true },
            inventory: { view: true, edit: true },
            employees: { view: true, edit: true },
          },
        },
      },
    },
  });

  console.log(`Admin criado: ${email} (senha definida via ADMIN_PASSWORD)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
