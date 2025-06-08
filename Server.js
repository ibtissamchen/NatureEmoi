// server.js - Version complète avec recherche et panier
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize'); // AJOUTÉ: Pour les opérateurs de recherche

// Import de la configuration de base de données
const { testConnection, initDatabase, Plant, Category, User, Cart, Order, OrderItem, sequelize } = require('./database');

const app = express();
const PORT = 3000;

// MIDDLEWARES DE BASE
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Middleware de logging simple
app.use((req, res, next) => {
    console.log(`🔍 ${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

// Middleware de nettoyage XSS simplifié
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        console.log('🧹 Nettoyage XSS simplifié...');
        
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                // Nettoyer les scripts dangereux
                req.body[key] = req.body[key]
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT_BLOQUÉ]')
                    .replace(/javascript:/gi, 'js-blocked:')
                    .replace(/onload=/gi, 'blocked=')
                    .replace(/onerror=/gi, 'blocked=')
                    .replace(/onclick=/gi, 'blocked=');
            }
        }
        
        console.log('✅ Nettoyage XSS terminé');
    }
    next();
});

// Rate limiting simplifié
const rateLimit = require('express-rate-limit');
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 10, // 10 tentatives par heure
    message: { 
        success: false, 
        message: 'Trop de tentatives d\'inscription. Réessayez plus tard.' 
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 tentatives de connexion par heure
    message: { 
        success: false, 
        message: 'Trop de tentatives de connexion. Réessayez plus tard.' 
    }
});

// Servir les fichiers statiques
app.use('/Home', express.static(path.join(__dirname, 'Home')));
app.use('/Plants', express.static(path.join(__dirname, 'Plants')));
app.use(express.static(__dirname));

// ============================================
// ROUTES PUBLIQUES - ESPACE CLIENT COMME ACCUEIL
// ============================================

// Route d'accueil - REDIRIGE VERS ESPACE CLIENT
app.get('/', (req, res) => {
    console.log('🏠 Redirection vers Espace Client');
    res.sendFile(path.join(__dirname, 'Espace_Client.html'));
});

// Route alternative pour espace client
app.get('/espace-client', (req, res) => {
    res.sendFile(path.join(__dirname, 'Espace_Client.html'));
});

// ROUTES ACCESSIBLES APRÈS CONNEXION
app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'Home', 'home.html'));
});

app.get('/Home/home.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Home', 'home.html'));
});

// Routes pour les autres pages
app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'contact.html'));
});

app.get('/plant-care', (req, res) => {
    res.sendFile(path.join(__dirname, 'plant_care.html'));
});

app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, 'cart.html'));
});

// ============================================
// NOUVELLES APIs DE RECHERCHE
// ============================================

// Route de recherche principale
app.get('/api/search/plants', async (req, res) => {
    try {
        console.log('🔍 === RECHERCHE DE PLANTES ===');
        
        const { query, category, minPrice, maxPrice, difficulty, size } = req.query;
        console.log('Paramètres de recherche:', { query, category, minPrice, maxPrice, difficulty, size });
        
        // Construction des conditions de recherche
        const searchConditions = {
            isAvailable: true // Seulement les plantes disponibles
        };
        
        // Recherche textuelle (nom ou nom scientifique)
        if (query && query.trim().length > 0) {
            const searchTerm = query.trim();
            searchConditions[Op.or] = [
                { name: { [Op.like]: `%${searchTerm}%` } },
                { scientificName: { [Op.like]: `%${searchTerm}%` } },
                { description: { [Op.like]: `%${searchTerm}%` } }
            ];
        }
        
        // Filtre par catégorie
        if (category && category !== 'all') {
            searchConditions.categoryId = category;
        }
        
        // Filtre par prix
        if (minPrice || maxPrice) {
            searchConditions.price = {};
            if (minPrice) searchConditions.price[Op.gte] = parseFloat(minPrice);
            if (maxPrice) searchConditions.price[Op.lte] = parseFloat(maxPrice);
        }
        
        // Filtre par difficulté
        if (difficulty && difficulty !== 'all') {
            searchConditions.difficultyLevel = difficulty;
        }
        
        // Filtre par taille
        if (size && size !== 'all') {
            searchConditions.size = size;
        }
        
        console.log('Conditions de recherche:', searchConditions);
        
        // Exécution de la recherche
        const plants = await Plant.findAll({
            where: searchConditions,
            include: [{
                model: Category,
                attributes: ['id', 'name'],
                required: false
            }],
            order: [
                // Tri par pertinence : d'abord les correspondances exactes dans le nom
                query ? [
                    sequelize.literal(`CASE 
                        WHEN name LIKE '${query}%' THEN 1 
                        WHEN name LIKE '%${query}%' THEN 2 
                        ELSE 3 
                    END`)
                ] : ['name', 'ASC']
            ],
            limit: 50 // Limite pour les performances
        });
        
        console.log(`✅ ${plants.length} plante(s) trouvée(s)`);
        
        // Formatage des résultats
        const formattedResults = plants.map(plant => ({
            id: plant.id,
            name: plant.name,
            scientificName: plant.scientificName,
            description: plant.description,
            price: parseFloat(plant.price),
            stockQuantity: plant.stockQuantity,
            imageUrl: plant.imageUrl,
            careInstructions: plant.careInstructions,
            lightRequirements: plant.lightRequirements,
            waterFrequency: plant.waterFrequency,
            size: plant.size,
            difficultyLevel: plant.difficultyLevel,
            category: plant.Category ? plant.Category.name : null,
            categoryId: plant.categoryId
        }));
        
        res.json({
            success: true,
            query: query || '',
            totalResults: plants.length,
            plants: formattedResults
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la recherche:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la recherche',
            error: error.message
        });
    }
});

// Route pour obtenir les suggestions de recherche (autocomplétion)
app.get('/api/search/suggestions', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.trim().length < 2) {
            return res.json({ success: true, suggestions: [] });
        }
        
        const searchTerm = query.trim();
        
        // Recherche de suggestions
        const plants = await Plant.findAll({
            where: {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchTerm}%` } },
                    { scientificName: { [Op.like]: `%${searchTerm}%` } }
                ],
                isAvailable: true
            },
            attributes: ['name', 'scientificName'],
            limit: 10,
            order: [
                sequelize.literal(`CASE 
                    WHEN name LIKE '${searchTerm}%' THEN 1 
                    WHEN scientific_name LIKE '${searchTerm}%' THEN 2 
                    ELSE 3 
                END`)
            ]
        });
        
        // Formatage des suggestions
        const suggestions = plants.map(plant => ({
            name: plant.name,
            scientificName: plant.scientificName,
            displayText: plant.scientificName ? 
                `${plant.name} (${plant.scientificName})` : 
                plant.name
        }));
        
        res.json({
            success: true,
            suggestions: suggestions
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la génération des suggestions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération des suggestions'
        });
    }
});

// Route pour obtenir toutes les catégories (pour les filtres)
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.findAll({
            attributes: ['id', 'name', 'description'],
            order: [['name', 'ASC']]
        });
        
        res.json({
            success: true,
            categories: categories
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des catégories:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des catégories'
        });
    }
});

// Route pour obtenir une plante spécifique
app.get('/api/plants/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const plant = await Plant.findByPk(id, {
            include: [{
                model: Category,
                attributes: ['id', 'name', 'description'],
                required: false
            }]
        });
        
        if (!plant) {
            return res.status(404).json({
                success: false,
                message: 'Plante non trouvée'
            });
        }
        
        res.json({
            success: true,
            plant: {
                id: plant.id,
                name: plant.name,
                scientificName: plant.scientificName,
                description: plant.description,
                price: parseFloat(plant.price),
                stockQuantity: plant.stockQuantity,
                imageUrl: plant.imageUrl,
                careInstructions: plant.careInstructions,
                lightRequirements: plant.lightRequirements,
                waterFrequency: plant.waterFrequency,
                size: plant.size,
                difficultyLevel: plant.difficultyLevel,
                isAvailable: plant.isAvailable,
                category: plant.Category,
                createdAt: plant.createdAt,
                updatedAt: plant.updatedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération de la plante:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération de la plante'
        });
    }
});

// ============================================
// NOUVELLES APIs POUR LE PANIER
// ============================================

// Route pour ajouter un article au panier
app.post('/api/cart/add', async (req, res) => {
    try {
        console.log('🛒 === AJOUT AU PANIER ===');
        const { plantName, quantity = 1, userId } = req.body;
        
        console.log('Données reçues:', { plantName, quantity, userId });
        
        // Chercher la plante par nom
        const plant = await Plant.findOne({
            where: { name: plantName }
        });
        
        if (!plant) {
            return res.status(404).json({
                success: false,
                message: 'Plante non trouvée'
            });
        }
        
        // Vérifier le stock
        if (plant.stockQuantity < quantity) {
            return res.status(400).json({
                success: false,
                message: `Stock insuffisant. Seulement ${plant.stockQuantity} disponible(s)`
            });
        }
        
        // Pour l'instant, on gère le panier sans utilisateur connecté (localStorage côté client)
        // Mais on peut aussi sauvegarder en base si un userId est fourni
        if (userId) {
            // Vérifier si l'article existe déjà dans le panier
            const existingCartItem = await Cart.findOne({
                where: { userId, plantId: plant.id }
            });
            
            if (existingCartItem) {
                // Mettre à jour la quantité
                existingCartItem.quantity += parseInt(quantity);
                await existingCartItem.save();
            } else {
                // Créer un nouvel article
                await Cart.create({
                    userId,
                    plantId: plant.id,
                    quantity: parseInt(quantity)
                });
            }
        }
        
        res.json({
            success: true,
            message: `${plant.name} ajouté au panier`,
            plant: {
                id: plant.id,
                name: plant.name,
                price: parseFloat(plant.price),
                stockQuantity: plant.stockQuantity
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'ajout au panier:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'ajout au panier'
        });
    }
});

// Route pour obtenir le contenu du panier d'un utilisateur
app.get('/api/cart/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const cartItems = await Cart.findAll({
            where: { userId },
            include: [{
                model: Plant,
                attributes: ['id', 'name', 'price', 'stockQuantity', 'imageUrl']
            }]
        });
        
        const formattedCart = cartItems.map(item => ({
            id: item.id,
            quantity: item.quantity,
            plant: {
                id: item.Plant.id,
                name: item.Plant.name,
                price: parseFloat(item.Plant.price),
                stockQuantity: item.Plant.stockQuantity,
                imageUrl: item.Plant.imageUrl
            },
            subtotal: item.quantity * parseFloat(item.Plant.price)
        }));
        
        const total = formattedCart.reduce((sum, item) => sum + item.subtotal, 0);
        
        res.json({
            success: true,
            cartItems: formattedCart,
            total: total,
            totalItems: formattedCart.reduce((sum, item) => sum + item.quantity, 0)
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du panier:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du panier'
        });
    }
});

// Route pour supprimer un article du panier
app.delete('/api/cart/:cartItemId', async (req, res) => {
    try {
        const { cartItemId } = req.params;
        
        const cartItem = await Cart.findByPk(cartItemId);
        
        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Article non trouvé dans le panier'
            });
        }
        
        await cartItem.destroy();
        
        res.json({
            success: true,
            message: 'Article supprimé du panier'
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la suppression:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression'
        });
    }
});

// API de statut
app.get('/api/status', (req, res) => {
    res.json({ 
        message: 'API fonctionnelle avec authentification, recherche et panier', 
        status: 'OK',
        timestamp: new Date().toISOString(),
        features: ['inscription', 'connexion', 'hashage-mot-de-passe', 'recherche', 'panier'],
        defaultPage: 'Espace_Client.html'
    });
});

// ============================================
// ROUTES D'AUTHENTIFICATION (existantes)
// ============================================

app.post('/api/register', contactLimiter, async (req, res) => {
    try {
        console.log('📥 === DÉBUT INSCRIPTION SÉCURISÉE ===');
        console.log('Body reçu:', { ...req.body, password: '[MASQUÉ]' });
        
        const { nom, email, password, adresse, telephone } = req.body;
        
        console.log('🔍 Données extraites:');
        console.log('- nom:', nom);
        console.log('- email:', email);
        console.log('- password: [MASQUÉ]');
        console.log('- adresse:', adresse);
        console.log('- telephone:', telephone);
        
        // VALIDATION COMPLÈTE
        const errors = [];
        
        // Vérifier que tous les champs sont présents
        if (!nom || typeof nom !== 'string' || nom.trim().length === 0) {
            errors.push('Le nom est requis');
        }
        
        if (!email || typeof email !== 'string' || email.trim().length === 0) {
            errors.push('L\'email est requis');
        }
        
        if (!password || typeof password !== 'string') {
            errors.push('Le mot de passe est requis');
        }
        
        if (!adresse || typeof adresse !== 'string' || adresse.trim().length === 0) {
            errors.push('L\'adresse est requise');
        }
        
        if (!telephone || typeof telephone !== 'string' || telephone.trim().length === 0) {
            errors.push('Le téléphone est requis');
        }
        
        // Validation de l'email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email && !emailRegex.test(email)) {
            errors.push('Format d\'email invalide');
        }
        
        // Validation du mot de passe
        if (password && password.length < 6) {
            errors.push('Le mot de passe doit contenir au moins 6 caractères');
        }
        
        // Validation du nom (caractères autorisés)
        if (nom && !/^[a-zA-ZÀ-ÿ\s\-'\.]+$/.test(nom.trim())) {
            errors.push('Le nom contient des caractères non autorisés');
        }
        
        // Validation du téléphone
        if (telephone && !/^[0-9\+\-\s\(\)]+$/.test(telephone)) {
            errors.push('Format de téléphone invalide');
        }
        
        // Validation des longueurs
        if (nom && (nom.trim().length < 2 || nom.trim().length > 100)) {
            errors.push('Le nom doit contenir entre 2 et 100 caractères');
        }
        
        if (email && (email.length < 5 || email.length > 255)) {
            errors.push('L\'email doit contenir entre 5 et 255 caractères');
        }
        
        if (password && password.length > 255) {
            errors.push('Le mot de passe est trop long');
        }
        
        if (adresse && (adresse.trim().length < 5 || adresse.trim().length > 500)) {
            errors.push('L\'adresse doit contenir entre 5 et 500 caractères');
        }
        
        if (telephone && (telephone.trim().length < 8 || telephone.trim().length > 20)) {
            errors.push('Le téléphone doit contenir entre 8 et 20 caractères');
        }
        
        // Si il y a des erreurs de validation
        if (errors.length > 0) {
            console.log('❌ Erreurs de validation:', errors);
            return res.status(400).json({
                success: false,
                message: 'Données invalides',
                errors: errors
            });
        }
        
        console.log('✅ Validation réussie');
        
        // Vérifier si l'email existe déjà
        console.log('🔍 Vérification de l\'unicité de l\'email...');
        const existingUser = await User.findOne({ 
            where: { email: email.toLowerCase().trim() } 
        });
        
        if (existingUser) {
            console.log('❌ Email déjà utilisé');
            return res.status(400).json({
                success: false,
                message: 'Cet email est déjà enregistré'
            });
        }
        
        console.log('✅ Email unique');
        
        // HASHER LE MOT DE PASSE
        console.log('🔐 Hashage du mot de passe...');
        const saltRounds = 12; // Niveau de sécurité élevé
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log('✅ Mot de passe hashé avec succès');
        
        // Créer l'utilisateur avec mot de passe hashé
        console.log('🔨 Création de l\'utilisateur...');
        const newUser = await User.create({
            nom: nom.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword, // STOCKAGE DU HASH
            adresse: adresse.trim(),
            telephone: telephone.trim()
        });
        
        console.log('✅ Utilisateur créé avec ID:', newUser.id);
        
        res.json({ 
            success: true, 
            message: 'Inscription réussie ! Vous pouvez maintenant vous connecter.',
            userId: newUser.id,
            redirectUrl: '/home' // Redirection après inscription
        });
        
        console.log('📤 === FIN INSCRIPTION SÉCURISÉE (SUCCÈS) ===');
        
    } catch (error) {
        console.log('❌ === ERREUR DANS L\'INSCRIPTION ===');
        console.error('Type d\'erreur:', error.name);
        console.error('Message d\'erreur:', error.message);
        console.error('Stack:', error.stack);
        
        // Gestion spécifique des erreurs
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation des données',
                errors: error.errors.map(e => e.message)
            });
        }
        
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Cet email est déjà utilisé'
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur lors de l\'enregistrement' 
        });
        
        console.log('📤 === FIN INSCRIPTION SÉCURISÉE (ERREUR) ===');
    }
});

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        console.log('🔐 === DÉBUT CONNEXION SÉCURISÉE ===');
        console.log('Body reçu:', { ...req.body, password: '[MASQUÉ]' });
        
        const { email, password } = req.body;
        
        console.log('🔍 Données de connexion:');
        console.log('- email:', email);
        console.log('- password: [MASQUÉ]');
        
        // VALIDATION
        if (!email || typeof email !== 'string' || email.trim().length === 0) {
            console.log('❌ Email manquant');
            return res.status(400).json({
                success: false,
                message: 'Email requis'
            });
        }
        
        if (!password || typeof password !== 'string') {
            console.log('❌ Mot de passe manquant');
            return res.status(400).json({
                success: false,
                message: 'Mot de passe requis'
            });
        }
        
        console.log('✅ Validation des champs réussie');
        
        // Chercher l'utilisateur
        console.log('🔍 Recherche de l\'utilisateur...');
        const user = await User.findOne({ 
            where: { email: email.toLowerCase().trim() } 
        });
        
        if (!user) {
            console.log('❌ Utilisateur non trouvé');
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }
        
        console.log('✅ Utilisateur trouvé:', user.nom);
        
        // VÉRIFIER LE MOT DE PASSE
        console.log('🔐 Vérification du mot de passe...');
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log('❌ Mot de passe incorrect');
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }
        
        console.log('✅ Mot de passe correct');
        
        // CONNEXION RÉUSSIE
        console.log('🎉 Connexion réussie pour:', user.email);
        
        res.json({
            success: true,
            message: 'Connexion réussie',
            redirectUrl: '/home', // Redirection après connexion
            user: {
                id: user.id,
                nom: user.nom,
                email: user.email,
                adresse: user.adresse,
                telephone: user.telephone
            }
        });
        
        console.log('📤 === FIN CONNEXION SÉCURISÉE (SUCCÈS) ===');
        
    } catch (error) {
        console.log('❌ === ERREUR DANS LA CONNEXION ===');
        console.error('Type d\'erreur:', error.name);
        console.error('Message d\'erreur:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Erreur serveur lors de la connexion'
        });
        
        console.log('📤 === FIN CONNEXION SÉCURISÉE (ERREUR) ===');
    }
});

// ============================================
// ROUTES DE DEBUG
// ============================================

// Route pour voir tous les utilisateurs
app.get('/api/debug/users', async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'nom', 'email', 'adresse', 'telephone', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        
        // Analyser la sécurité
        const analysis = users.map(user => {
            const userData = user.toJSON();
            const allText = `${userData.nom} ${userData.email} ${userData.adresse}`;
            const hasSuspiciousContent = /<script|javascript:|onload=|alert\(/i.test(allText);
            
            return {
                ...userData,
                securityStatus: hasSuspiciousContent ? '🚨 SUSPECT' : '✅ PROPRE'
            };
        });
        
        res.json({
            success: true,
            totalUsers: users.length,
            users: analysis
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de récupération' });
    }
});

// Route de test simple
app.post('/api/test', (req, res) => {
    console.log('🧪 Route de test appelée');
    console.log('Body:', req.body);
    res.json({ 
        success: true, 
        message: 'Test réussi',
        receivedData: req.body 
    });
});

// ============================================
// GESTION DES ERREURS
// ============================================

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Erreurs globales
app.use((error, req, res, next) => {
    console.error('❌ Erreur globale:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Erreur interne du serveur' 
    });
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

async function startServer() {
    try {
        await testConnection();
        console.log('✅ Connexion à la base de données réussie');
        
        await initDatabase();
        console.log('✅ Base de données initialisée');
        
        app.listen(PORT, '127.0.0.1', () => {
            console.log('\n🔐 ========================');
            console.log(`🚀 SERVEUR COMPLET lancé sur http://localhost:${PORT}`);
            console.log('🎯 PAGE D\'ACCUEIL: Espace Client (Inscription/Connexion)');
            console.log('🛡️ Fonctionnalités activées:');
            console.log('   ✅ Authentification sécurisée');
            console.log('   ✅ Recherche de plantes');
            console.log('   ✅ Gestion du panier');
            console.log('   ✅ APIs complètes');
            console.log('🌐 URLs principales:');
            console.log('   🔐 PAGE D\'ACCUEIL: http://localhost:3000/ (Espace Client)');
        });
    } catch (error) {
        console.error('❌ Erreur lors du démarrage:', error);
        process.exit(1);
    }
}

startServer();