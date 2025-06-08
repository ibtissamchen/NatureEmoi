// security.js - Middlewares de sécurité CORRIGÉS
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const xss = require('xss');

// Configuration du rate limiting
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs, // Fenêtre de temps
    max, // Nombre maximum de requêtes
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Personnaliser la clé pour identifier les clients
    keyGenerator: (req) => {
      return req.ip + ':' + (req.headers['user-agent'] || 'unknown');
    }
  });
};

// Rate limiters spécifiques
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requêtes par IP
  'Trop de requêtes, veuillez réessayer plus tard'
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 tentatives de connexion par IP
  'Trop de tentatives de connexion, veuillez réessayer plus tard'
);

const contactLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 heure
  5, // 5 soumissions de formulaire par IP par heure (augmenté pour les tests)
  'Trop de soumissions de formulaire, veuillez réessayer plus tard'
);

// Middleware de nettoyage XSS CORRIGÉ
const sanitizeInput = (req, res, next) => {
  console.log('🧹 Nettoyage XSS des données entrantes...');
  
  try {
    // Fonction récursive pour nettoyer les objets - AVEC PROTECTION CONTRE LES BOUCLES
    const sanitizeObject = (obj, depth = 0) => {
      // Protection contre la récursion infinie
      if (depth > 10) {
        console.log('⚠️ Profondeur de récursion max atteinte, arrêt du nettoyage');
        return obj;
      }
      
      if (typeof obj === 'string') {
        // Nettoyer les scripts malveillants
        return xss(obj, {
          whiteList: {}, // Aucun tag HTML autorisé
          stripIgnoreTag: true,
          stripIgnoreTagBody: ['script']
        });
      } else if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, depth + 1));
      } else if (obj && typeof obj === 'object' && obj.constructor === Object) {
        const sanitized = {};
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            sanitized[key] = sanitizeObject(obj[key], depth + 1);
          }
        }
        return sanitized;
      }
      return obj;
    };

    // Nettoyer les données du body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Nettoyer les paramètres de query
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Nettoyer les paramètres d'URL
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    console.log('✅ Nettoyage XSS terminé');
    next();
    
  } catch (error) {
    console.error('❌ Erreur dans le nettoyage XSS:', error);
    // En cas d'erreur, passer quand même à la suite pour ne pas bloquer
    next();
  }
};

// Middleware de validation des données
const validateContactData = (req, res, next) => {
  console.log('✅ Validation des données de contact...');
  
  const { nom, email, adresse, telephone } = req.body;
  const errors = [];

  // Validation du nom
  if (!nom || typeof nom !== 'string') {
    errors.push('Le nom est requis et doit être une chaîne de caractères');
  } else if (!validator.isLength(nom.trim(), { min: 2, max: 100 })) {
    errors.push('Le nom doit contenir entre 2 et 100 caractères');
  } else if (!/^[a-zA-ZÀ-ÿ\s\-'\.]+$/.test(nom.trim())) {
    errors.push('Le nom contient des caractères non autorisés');
  }

  // Validation de l'email
  if (!email || typeof email !== 'string') {
    errors.push('L\'email est requis');
  } else if (!validator.isEmail(email)) {
    errors.push('Format d\'email invalide');
  } else if (!validator.isLength(email, { min: 5, max: 255 })) {
    errors.push('L\'email doit contenir entre 5 et 255 caractères');
  }

  // Validation de l'adresse
  if (!adresse || typeof adresse !== 'string') {
    errors.push('L\'adresse est requise');
  } else if (!validator.isLength(adresse.trim(), { min: 5, max: 500 })) {
    errors.push('L\'adresse doit contenir entre 5 et 500 caractères');
  }

  // Validation du téléphone
  if (!telephone || typeof telephone !== 'string') {
    errors.push('Le téléphone est requis');
  } else if (!/^[0-9\+\-\s\(\)]+$/.test(telephone)) {
    errors.push('Format de téléphone invalide');
  } else if (!validator.isLength(telephone.trim(), { min: 8, max: 20 })) {
    errors.push('Le téléphone doit contenir entre 8 et 20 caractères');
  }

  if (errors.length > 0) {
    console.log('❌ Erreurs de validation:', errors);
    return res.status(400).json({
      success: false,
      message: 'Données invalides',
      errors: errors
    });
  }

  console.log('✅ Validation réussie');
  next();
};

// Middleware de logging de sécurité SIMPLIFIÉ
const securityLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`🔐 [${timestamp}] ${req.method} ${req.url} - IP: ${ip}`);
  
  // Détecter les tentatives d'attaque courantes (SIMPLIFIÉ)
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /onload=/i,
    /union.*select/i,
    /drop.*table/i
  ];

  const requestData = JSON.stringify(req.body || {});
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));
  
  if (isSuspicious) {
    console.log(`🚨 ALERTE SÉCURITÉ: Tentative d'attaque détectée - IP: ${ip}`);
  }

  next();
};

// Middleware de validation des IDs numériques
const validateNumericId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!validator.isInt(id, { min: 1 })) {
      return res.status(400).json({
        success: false,
        message: `ID invalide: ${paramName} doit être un nombre entier positif`
      });
    }
    
    next();
  };
};

// Configuration Helmet pour la sécurité des headers
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Middleware pour nettoyer et valider les requêtes de recherche
const sanitizeSearchQuery = (req, res, next) => {
  if (req.query.search) {
    // Nettoyer la requête de recherche
    req.query.search = validator.escape(req.query.search);
    
    // Limiter la longueur
    if (req.query.search.length > 100) {
      req.query.search = req.query.search.substring(0, 100);
    }
  }
  
  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  contactLimiter,
  sanitizeInput,
  validateContactData,
  securityLogger,
  validateNumericId,
  helmetConfig,
  sanitizeSearchQuery
};