const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    return res.status(422).json({
      success: false,
      error: firstError.msg,
      code: 'VALIDATION_001',
      details: errors.array(),
    });
  }

  next();
};

module.exports = validate;