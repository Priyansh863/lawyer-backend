import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const loginValidation = [
  body('email')
    .exists()
    .withMessage('Email is required.')
    .not()
    .isEmpty()
    .withMessage('Email field cannot be empty.')
    .isEmail()
    .withMessage('Email format is not valid.'),
  body('password')
    .exists()
    .withMessage('password is required.')
    .not()
    .isEmpty()
    .withMessage('password field cannot be empty.'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors: any = validationResult(req);
    const error: any = {
      email: [],
      password: [],
    };
    if (errors.isEmpty() === false) {
      errors.array().forEach((e: any) => {
        error[e.param]?.push(e.msg);
      });

      const send_data = {
        error: 'Input validation Error',
        errorData: error,
      };
      return res.status(400).json(send_data);
    } else {
      next();
    }
  },
];

export const forgotPasswordValidation = [
  body('email')
    .exists()
    .withMessage('Email is required.')
    .not()
    .isEmpty()
    .withMessage('Email field cannot be empty.')
    .isEmail()
    .withMessage('Email format is not valid.'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors: any = validationResult(req);
    const error: any = {
      email: [],
    };
    if (errors.isEmpty() === false) {
      errors.array().forEach((e: any) => {
        error[e.param]?.push(e.msg);
      });

      const send_data = {
        error: 'Input validation Error',
        errorData: error,
      };
      return res.status(400).json(send_data);
    } else {
      next();
    }
  },
];

export const signUpValidation = [
  body('account_type')
    .exists()
    .withMessage('account_type is required.')
    .not()
    .isEmpty()
    .withMessage('account_type field cannot be empty.'),
  body('first_name')
    .exists()
    .withMessage('First name is required.')
    .not()
    .isEmpty()
    .withMessage('First name field cannot be empty.'),
  body('last_name')
    .exists()
    .withMessage('Last name is required.')
    .not()
    .isEmpty()
    .withMessage('Last name field cannot be empty.'),
  body('email')
    .exists()
    .withMessage('Email is required.')
    .not()
    .isEmpty()
    .withMessage('Email field cannot be empty.')
    .isEmail()
    .withMessage('Email format is not valid.'),
  body('password')
    .exists()
    .withMessage('password is required.')
    .not()
    .isEmpty()
    .withMessage('password field cannot be empty.')
    .matches(
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,16}$/,
      'i'
    )
    .withMessage(
      'Password should be combination of one uppercase, one lower case, one special char, one digit and min 8 char long.'
    ),
  (req: Request, res: Response, next: NextFunction) => {
    const errors: any = validationResult(req);
    const error: any = {
      account_type: [],
      first_name: [],
      last_name: [],
      email: [],
      password: [],
    };
    if (errors.isEmpty() === false) {
      errors.array().forEach((e: any) => {
        error[e.param]?.push(e.msg);
      });

      const send_data = {
        error: 'Input validation Error',
        errorData: error,
      };
      return res.status(400).json(send_data);
    } else {
      next();
    }
  },
];

export const resetPasswordValidation = [
  body('email')
    .exists()
    .withMessage('Email is required.')
    .not()
    .isEmpty()
    .withMessage('Email field cannot be empty.')
    .isEmail()
    .withMessage('Email format is not valid.'),
  body('password')
    .exists()
    .withMessage('password is required.')
    .not()
    .isEmpty()
    .withMessage('password field cannot be empty.')
    .matches(
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,16}$/,
      'i'
    )
    .withMessage(
      'Password should be combination of one uppercase , one lower case, one special char, one digit and min 8 char long.'
    ),
  body('confirm_password')
    .exists()
    .withMessage('Confirm Password is required.')
    .not()
    .isEmpty()
    .withMessage('Confirm Password field cannot be empty.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password does not match.');
      }
      return true;
    }),
  (req: Request, res: Response, next: NextFunction) => {
    const errors: any = validationResult(req);
    const error: any = {
      email: [],
      password: [],
      confirmPassword: [],
    };
    if (errors.isEmpty() === false) {
      errors.array().forEach((e: any) => {
        error[e.param]?.push(e.msg);
      });

      const send_data = {
        error: 'Input validation Error',
        errorData: error,
      };
      return res.status(400).json(send_data);
    } else {
      next();
    }
  },
];
export const changeProfilePasswordValidation = [
  body('email')
    .exists()
    .withMessage('Email is required.')
    .not()
    .isEmpty()
    .withMessage('Email field cannot be empty.')
    .isEmail()
    .withMessage('Email format is not valid.'),
  body('old_password')
    .exists()
    .withMessage('Old Password is required.')
    .not()
    .isEmpty()
    .withMessage('Old Password field cannot be empty.')
    .matches(
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,16}$/,
      'i'
    )
    .withMessage(
      'Old Password should be combination of one uppercase , one lower case, one special char, one digit and min 8 char long.'
    ),
  body('password')
    .exists()
    .withMessage('password is required.')
    .not()
    .isEmpty()
    .withMessage('password field cannot be empty.')
    .matches(
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,16}$/,
      'i'
    )
    .withMessage(
      'Password should be combination of one uppercase , one lower case, one special char, one digit and min 8 char long.'
    ),
  body('confirm_password')
    .exists()
    .withMessage('Confirm Password is required.')
    .not()
    .isEmpty()
    .withMessage('Confirm Password field cannot be empty.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password does not match.');
      }
      return true;
    }),
  (req: Request, res: Response, next: NextFunction) => {
    const errors: any = validationResult(req);
    const error: any = {
      email: [],
      old_password: [],
      password: [],
      confirmPassword: [],
    };
    if (errors.isEmpty() === false) {
      errors.array().forEach((e: any) => {
        error[e.param]?.push(e.msg);
      });

      const send_data = {
        error: 'Input validation Error',
        errorData: error,
      };
      return res.status(400).json(send_data);
    } else {
      next();
    }
  },
];

export const changePasswordValidation = [
  body('oldPassword')
    .exists()
    .withMessage('Old Password is required.')
    .not()
    .isEmpty()
    .withMessage('Old Password field cannot be empty.'),
  body('password')
    .exists()
    .withMessage('New Password is required.')
    .not()
    .isEmpty()
    .withMessage('New Password field cannot be empty.')
    .matches(
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,16}$/,
      'i'
    )
    .withMessage(
      'Password should be combination of one uppercase , one lower case, one special char, one digit and min 8 char long.'
    ),

  body('confirm_password')
    .exists()
    .withMessage('Confirm Password is required.')
    .not()
    .isEmpty()
    .withMessage('Confirm Password field cannot be empty.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password does not match.');
      }
      return true;
    }),
  (req: Request, res: Response, next: NextFunction) => {
    const errors: any = validationResult(req);
    const error: any = {
      oldPassword: [],
      password: [],
      confirm_password: [],
    };
    if (errors.isEmpty() === false) {
      errors.array().forEach((e: any) => {
        error[e.param]?.push(e.msg);
      });

      const send_data = {
        error: 'Input validation Error',
        errorData: error,
      };
      return res.status(400).json(send_data);
    } else {
      next();
    }
  },
];

export const todoValidation = [
  body('title')
    .exists()
    .withMessage('title field is required.')
    .not()
    .isEmpty()
    .withMessage('title field field cannot be empty.'),

  body('description')
    .exists()
    .withMessage('description is required.')
    .not()
    .isEmpty()
    .withMessage('description field cannot be empty.'),
  body('date')
    .exists()
    .withMessage('date is required.')
    .not()
    .isEmpty()
    .withMessage('date field cannot be empty.'),
  body('time')
    .exists()
    .withMessage('time is required.')
    .not()
    .isEmpty()
    .withMessage('time field cannot be empty.'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors: any = validationResult(req);
    const error: any = {
      title: [],
      description: [],
      date: [],
      time: [],
    };
    if (errors.isEmpty() === false) {
      errors.array().forEach((e: any) => {
        error[e.param]?.push(e.msg);
      });

      const send_data = {
        error: 'Input validation Error',
        errorData: error,
      };
      return res.status(400).json(send_data);
    } else {
      next();
    }
  },
];
