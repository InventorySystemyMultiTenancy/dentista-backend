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
import appointmentRequestsRoutes from './routes/appointmentRequests';

const app = express();

// FRONTEND_URL aceita uma lista separada por vírgula (ex.: domínio customizado
// + http://localhost:3000 para testar o frontend local contra este backend).
// Origin (enviado pelo navegador) nunca tem barra no final — removemos aqui
// pra uma barra sobrando em FRONTEND_URL (erro comum de configuração) não
// quebrar a comparação exata.
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// A Vercel gera uma URL única por deploy (ex.: dentista-frontend-<hash>-<time>.vercel.app),
// então além da lista fixa acima, liberamos automaticamente qualquer preview deste projeto
// específico — assim não é preciso atualizar FRONTEND_URL a cada novo deploy.
const vercelPreviewPattern = /^https:\/\/dentista-frontend(-[a-z0-9-]+)?\.vercel\.app$/;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS bloqueado para origin "${origin}". Permitidos: ${allowedOrigins.join(', ')}`);
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
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
app.use('/api/appointment-requests', appointmentRequestsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
