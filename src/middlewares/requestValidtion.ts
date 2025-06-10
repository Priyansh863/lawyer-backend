import { Request, Response, NextFunction } from "express";

const HttpRequestValidation =
  (func: (req: Request) => void) =>
    async (req: Request, res: Response, next: NextFunction): Promise<any> => {
      try {
        await func(req.body);
      } catch (error) {
        console.error("Http Request Validation", error);
        res.status(400).send(error);
        next(error);
      }
    };

export default HttpRequestValidation;
