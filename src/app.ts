import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import patientsRoutes from './routes/patients';
import staffRoutes from './routes/staff';
import appointmentsRoutes from './routes/appointments';
import examsRoutes from './routes/exams';
import financialRoutes from './routes/financial';
import inventoryRoutes from './routes/inventory';
import portalRoutes from './routes/portal';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/portal', portalRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
