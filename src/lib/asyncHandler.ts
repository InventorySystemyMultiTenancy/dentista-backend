import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 não encaminha rejeições de handlers async para o error handler —
// sem isso, qualquer erro (ex.: banco fora do ar) derruba o processo inteiro
// via unhandledRejection em vez de responder 500 para aquela requisição.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
