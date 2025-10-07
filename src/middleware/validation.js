const Joi = require('joi');

const registrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  username: Joi.string().min(3).max(50).required(),
  dateOfBirth: Joi.date().max('now').required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const betCreationSchema = Joi.object({
  name: Joi.string().min(3).max(255).required(),
  description: Joi.string().max(1000).optional(),
  betType: Joi.string().valid('stroke', 'skins', 'match_play', 'custom').required(),
  stakeAmount: Joi.number().integer().min(1).required(),
  stakeCurrency: Joi.string().valid('points', 'cash').default('points'),
  maxPlayers: Joi.number().integer().min(2).max(20).default(4),
  location: Joi.string().max(255).optional(),
  courseName: Joi.string().max(255).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  scheduledStartTime: Joi.date().optional(),
  isPublic: Joi.boolean().default(false),
  allowOutsideBackers: Joi.boolean().default(false),
  settings: Joi.object().optional()
});

const scoreSubmissionSchema = Joi.object({
  holeNumber: Joi.number().integer().min(1).max(18).required(),
  score: Joi.number().integer().min(1).max(15).required(),
  par: Joi.number().integer().min(3).max(5).required()
});

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }
    
    req.body = value;
    next();
  };
};

exports.validateRegistration = validate(registrationSchema);
exports.validateLogin = validate(loginSchema);
exports.validateBetCreation = validate(betCreationSchema);
exports.validateScoreSubmission = validate(scoreSubmissionSchema);