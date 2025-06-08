// server.js - Version complète avec recherche et panier CORRIGÉE ET DÉBOGUÉE
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
// ROUTES POUR LES PLANTES (FRONTEND) - CORRIGÉES
// ============================================

// Route pour récupérer toutes les plantes (pour home.html et fetchPlants())
app.get('/plantes', async (req, res) => {
    try {
        console.log('🌱 Récupération des plantes...');
        
        const plantes = await Plant.findAll({
            where: { isAvailable: true },
            include: [{
                model: Category,
                attributes: ['id', 'name'],
                required: false
            }],
            order: [['name', 'ASC']]
        });
        
        console.log(`✅ ${plantes.length} plante(s) trouvée(s)`);
        
        // Formatter les données pour correspondre au frontend français
        const plantesFormatted = plantes.map(plant => ({
            id: plant.id,
            nom: plant.name, // Convertir 'name' vers 'nom'
            prix: parseFloat(plant.price),
            quantité_en_stock: plant.stockQuantity, // Convertir 'stockQuantity' vers 'quantité_en_stock'
            description: plant.description || 'Description non disponible',
            photo: plant.imageUrl || '/Plants/default.jpg',
            nom_scientifique: plant.scientificName || '',
            categorie: plant.Category ? plant.Category.name : 'Non catégorisé'
        }));
        
        res.json(plantesFormatted);
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des plantes:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la récupération des plantes' 
        });
    }
});

// Route pour gérer le stock des plantes - VERSION SEQUELIZE CORRIGÉE
app.put('/plantes/stock', async (req, res) => {
    try {
        const { nom, action, quantity = 1 } = req.body;
        
        console.log('🔄 Gestion du stock:', { nom, action, quantity });
        
        if (!nom || !action) {
            return res.status(400).json({ error: 'Nom de plante et action requis' });
        }
        
        // Chercher la plante par nom avec Sequelize
        const plant = await Plant.findOne({
            where: { name: nom } // 'name' en anglais dans la base, 'nom' en français depuis le frontend
        });
        
        if (!plant) {
            console.log('❌ Plante non trouvée:', nom);
            return res.status(404).json({ error: 'Plante non trouvée' });
        }
        
        console.log('✅ Plante trouvée:', plant.name, 'Stock actuel:', plant.stockQuantity);
        
        let newStock;
        
        if (action === 'decrease') {
            // Vérifier si assez de stock
            if (plant.stockQuantity < quantity) {
                return res.status(400).json({ error: 'Stock insuffisant' });
            }
            newStock = plant.stockQuantity - quantity;
        } else if (action === 'increase') {
            newStock = plant.stockQuantity + quantity;
        } else {
            return res.status(400).json({ error: 'Action invalide' });
        }
        
        // Mettre à jour le stock avec Sequelize
        await plant.update({
            stockQuantity: newStock
        });
        
        console.log('✅ Stock mis à jour:', plant.name, 'Nouveau stock:', newStock);
        
        res.json({ 
            success: true, 
            message: 'Stock mis à jour',
            newStock: newStock,
            plantName: nom
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour du stock:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la mise à jour du stock' 
        });
    }
});

// ============================================
// ROUTE POUR CRÉER LES PLANTES AVEC LES BONS NOMS DE COLONNES
// ============================================

app.get('/create-plants-final', async (req, res) => {
    try {
        const plants = [
            {
                name: 'Zamioculcas zamiifolia',
                scientific_name: 'Zamioculcas zamiifolia',
                description: 'Une plante résistante parfaite pour les débutants',
                price: 199.99,
                stock_quantity: 32,
                image_url: '/Plants/1st plant.jpg',
                category_id: 1, // Plantes d'intérieur
                care_instructions: 'Arroser quand le sol est sec',
                light_requirements: 'Lumière indirecte',
                water_frequency: '1 fois par semaine',
                size: 'Moyenne',
                difficulty_level: 'Facile',
                is_available: 1
            },
            {
                name: 'Aglaonema',
                scientific_name: 'Aglaonema modestum',
                description: 'Plante tropicale aux feuilles colorées',
                price: 150.00,
                stock_quantity: 17,
                image_url: '/Plants/plante4.jpg',
                category_id: 1,
                care_instructions: 'Arroser régulièrement',
                light_requirements: 'Lumière indirecte',
                water_frequency: '2 fois par semaine',
                size: 'Moyenne',
                difficulty_level: 'Facile',
                is_available: 1
            },
            {
                name: 'Philodendron Xanadu',
                scientific_name: 'Thaumatophyllum xanadu',
                description: 'Philodendron compact aux feuilles lobées',
                price: 50.00,
                stock_quantity: 45,
                image_url: '/Plants/plante3.jpg',
                category_id: 1,
                care_instructions: 'Arroser modérément',
                light_requirements: 'Lumière indirecte',
                water_frequency: '1-2 fois par semaine',
                size: 'Moyenne',
                difficulty_level: 'Facile',
                is_available: 1
            },
            {
                name: 'Sansevieria trifasciata',
                scientific_name: 'Sansevieria trifasciata',
                description: 'Langue de belle-mère, très résistante',
                price: 179.99,
                stock_quantity: 6,
                image_url: '/Plants/plant5.jpg',
                category_id: 1,
                care_instructions: 'Très peu d\'eau',
                light_requirements: 'Toutes lumières',
                water_frequency: '1 fois par mois',
                size: 'Grande',
                difficulty_level: 'Très facile',
                is_available: 1
            }
        ];

        const results = [];
        
        for (const plantData of plants) {
            try {
                // Vérifier si la plante existe déjà
                const [existing] = await sequelize.query(
                    "SELECT id FROM Plants WHERE name = ?",
                    { replacements: [plantData.name] }
                );

                if (existing.length === 0) {
                    // Créer la plante avec tous les champs requis
                    await sequelize.query(`
                        INSERT INTO Plants (
                            name, scientific_name, description, price, stock_quantity, 
                            category_id, image_url, care_instructions, light_requirements, 
                            water_frequency, size, difficulty_level, is_available, 
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                    `, {
                        replacements: [
                            plantData.name,
                            plantData.scientific_name,
                            plantData.description,
                            plantData.price,
                            plantData.stock_quantity,
                            plantData.category_id,
                            plantData.image_url,
                            plantData.care_instructions,
                            plantData.light_requirements,
                            plantData.water_frequency,
                            plantData.size,
                            plantData.difficulty_level,
                            plantData.is_available
                        ]
                    });
                    
                    results.push({ created: plantData.name });
                } else {
                    results.push({ exists: plantData.name });
                }
                
            } catch (error) {
                console.error(`Erreur pour ${plantData.name}:`, error);
                results.push({ error: plantData.name, message: error.message });
            }
        }

        res.json({
            success: true,
            message: 'Plantes créées avec succès!',
            results: results
        });
        
    } catch (error) {
        console.error('Erreur générale:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// NOUVELLES APIs DE RECHERCHE - CORRIGÉES ET DÉBOGUÉES
// ============================================

// Route de recherche principale - CORRIGÉE AVEC DEBUG COMPLET
app.get('/api/search/plants', async (req, res) => {
    try {
        console.log('🔍 === RECHERCHE DE PLANTES DEBUG ===');
        
        const { query, category, minPrice, maxPrice, difficulty, size } = req.query;
        console.log('Paramètres de recherche reçus:', { query, category, minPrice, maxPrice, difficulty, size });
        
        // ÉTAPE 1: Tester d'abord une requête simple pour voir toutes les plantes
        console.log('📊 Test: Récupération de toutes les plantes disponibles...');
        const allPlants = await Plant.findAll({
            where: { isAvailable: true },
            attributes: ['id', 'name', 'scientific_name', 'description'],
            limit: 5,
            raw: true
        });
        console.log('Plantes disponibles (échantillon):', allPlants);
        
        // Construction des conditions de recherche
        const searchConditions = {
            isAvailable: true // Seulement les plantes disponibles
        };
        
        // Recherche textuelle (nom ou nom scientifique) - INSENSIBLE À LA CASSE
        if (query && query.trim().length > 0) {
            const searchTerm = query.trim().toLowerCase();
            console.log('🔍 Terme de recherche:', searchTerm);
            
            // CORRECTION MAJEURE: Utiliser le bon nom de colonne selon votre base
            // Vérifiez dans l'échantillon ci-dessus quel est le vrai nom de la colonne
            searchConditions[Op.or] = [
                sequelize.where(
                    sequelize.fn('LOWER', sequelize.col('name')), 
                    'LIKE', 
                    `%${searchTerm}%`
                ),
                // ATTENTION: Utiliser scientific_name (avec underscore) comme dans votre création de plantes
                sequelize.where(
                    sequelize.fn('LOWER', sequelize.col('scientific_name')), 
                    'LIKE', 
                    `%${searchTerm}%`
                ),
                sequelize.where(
                    sequelize.fn('LOWER', sequelize.col('description')), 
                    'LIKE', 
                    `%${searchTerm}%`
                )
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
        
        console.log('🔧 Conditions de recherche construites:', JSON.stringify(searchConditions, null, 2));
        
        // ÉTAPE 2: Exécution de la recherche avec gestion d'erreur
        console.log('⚡ Exécution de la recherche...');
        let plants;
        try {
            plants = await Plant.findAll({
                where: searchConditions,
                include: [{
                    model: Category,
                    attributes: ['id', 'name'],
                    required: false
                }],
                order: [['name', 'ASC']],
                limit: 50
            });
        } catch (searchError) {
            console.error('❌ Erreur lors de l\'exécution de la recherche:', searchError);
            
            // Tentative avec une requête plus simple sans fonctions SQL
            console.log('🔄 Tentative de recherche simplifiée...');
            const simpleConditions = { isAvailable: true };
            
            if (query && query.trim().length > 0) {
                const searchTerm = query.trim().toLowerCase();
                // Utiliser une approche différente si LOWER() pose problème
                simpleConditions[Op.or] = [
                    { name: { [Op.like]: `%${query}%` } },
                    { scientific_name: { [Op.like]: `%${query}%` } },
                    { description: { [Op.like]: `%${query}%` } }
                ];
            }
            
            plants = await Plant.findAll({
                where: simpleConditions,
                include: [{
                    model: Category,
                    attributes: ['id', 'name'],
                    required: false
                }],
                order: [['name', 'ASC']],
                limit: 50
            });
        }
        
        console.log(`✅ ${plants.length} plante(s) trouvée(s) avec la recherche`);
        
        // DEBUG: Afficher les premières plantes trouvées
        if (plants.length > 0) {
            console.log('🌱 Première plante trouvée:', {
                id: plants[0].id,
                name: plants[0].name,
                scientificName: plants[0].scientific_name || plants[0].scientificName,
                description: plants[0].description?.substring(0, 50) + '...'
            });
        } else {
            console.log('⚠️ Aucune plante trouvée - vérifiez les conditions');
        }
        
        // Formatage des résultats - ATTENTION au mapping des champs
        const formattedResults = plants.map(plant => {
            // Gérer les deux possibilités de noms de colonnes
            const scientificName = plant.scientific_name || plant.scientificName || '';
            
            return {
                id: plant.id,
                name: plant.name,
                scientificName: scientificName,
                description: plant.description,
                price: parseFloat(plant.price),
                stockQuantity: plant.stockQuantity || plant.stock_quantity,
                imageUrl: plant.imageUrl || plant.image_url,
                careInstructions: plant.careInstructions || plant.care_instructions,
                lightRequirements: plant.lightRequirements || plant.light_requirements,
                waterFrequency: plant.waterFrequency || plant.water_frequency,
                size: plant.size,
                difficultyLevel: plant.difficultyLevel || plant.difficulty_level,
                category: plant.Category ? plant.Category.name : null,
                categoryId: plant.categoryId || plant.category_id
            };
        });
        
        res.json({
            success: true,
            query: query || '',
            totalResults: plants.length,
            plants: formattedResults,
            debug: {
                searchTerm: query?.toLowerCase(),
                allPlantsCount: allPlants.length,
                searchConditionsUsed: searchConditions,
                samplePlants: allPlants
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la recherche:', error);
        console.error('Stack trace complète:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la recherche',
            error: error.message,
            stack: error.stack,
            debug: true
        });
    }
});

// Route pour obtenir les suggestions de recherche (autocomplétion) - CORRIGÉE
app.get('/api/search/suggestions', async (req, res) => {
    try {
        const { query } = req.query;
        console.log('🔍 Suggestions pour:', query);
        
        if (!query || query.trim().length < 2) {
            return res.json({ success: true, suggestions: [] });
        }
        
        const searchTerm = query.trim().toLowerCase();
        console.log('🎯 Terme de recherche suggestions:', searchTerm);
        
        // Test simple d'abord pour voir toutes les plantes
        const allPlants = await Plant.findAll({
            where: { isAvailable: true },
            attributes: ['name', 'scientific_name'],
            limit: 10,
            raw: true
        });
        console.log('📋 Toutes les plantes pour suggestions:', allPlants.map(p => ({ name: p.name, scientific: p.scientific_name })));
        
        // Recherche de suggestions - version robuste
        let plants;
        try {
            // Essayer avec LOWER() d'abord
            plants = await Plant.findAll({
                where: {
                    [Op.or]: [
                        sequelize.where(
                            sequelize.fn('LOWER', sequelize.col('name')), 
                            'LIKE', 
                            `%${searchTerm}%`
                        ),
                        sequelize.where(
                            sequelize.fn('LOWER', sequelize.col('scientific_name')), 
                            'LIKE', 
                            `%${searchTerm}%`
                        )
                    ],
                    isAvailable: true
                },
                attributes: ['name', 'scientific_name'],
                limit: 10,
                order: [['name', 'ASC']],
                raw: true
            });
        } catch (lowerError) {
            console.log('⚠️ LOWER() failed, trying simple LIKE...');
            // Fallback sans LOWER()
            plants = await Plant.findAll({
                where: {
                    [Op.or]: [
                        { name: { [Op.like]: `%${query}%` } },
                        { scientific_name: { [Op.like]: `%${query}%` } }
                    ],
                    isAvailable: true
                },
                attributes: ['name', 'scientific_name'],
                limit: 10,
                order: [['name', 'ASC']],
                raw: true
            });
        }
        
        console.log('📝 Suggestions trouvées:', plants.length);
        
        // Formatage des suggestions
        const suggestions = plants.map(plant => ({
            name: plant.name,
            scientificName: plant.scientific_name,
            displayText: plant.scientific_name ? 
                `${plant.name} (${plant.scientific_name})` : 
                plant.name
        }));
        
        res.json({
            success: true,
            suggestions: suggestions,
            debug: {
                searchTerm,
                totalPlants: allPlants.length,
                foundSuggestions: suggestions.length,
                allPlantsNames: allPlants.map(p => p.name)
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la génération des suggestions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération des suggestions',
            error: error.message
        });
    }
});

// ============================================
// ROUTE DE DEBUG POUR VÉRIFIER LA STRUCTURE
// ============================================

app.get('/api/debug/plant-structure', async (req, res) => {
    try {
        console.log('🔍 Debug de la structure des plantes...');
        
        // 1. Vérifier la structure de la table
        const [tableInfo] = await sequelize.query("PRAGMA table_info(Plants)");
        console.log('📋 Structure de la table Plants:', tableInfo);
        
        // 2. Récupérer quelques plantes pour voir les données réelles
        const [rawPlants] = await sequelize.query("SELECT * FROM Plants LIMIT 3");
        console.log('🌱 Échantillon de plantes (données brutes SQL):', rawPlants);
        
        // 3. Récupérer avec Sequelize
        const sequelizePlants = await Plant.findAll({
            limit: 3,
            raw: true
        });
        console.log('🔧 Échantillon avec Sequelize:', sequelizePlants);
        
        // 4. Test de recherche simple
        const testSearch = await Plant.findAll({
            where: {
                name: { [Op.like]: '%Aglaonema%' }
            },
            limit: 5,
            raw: true
        });
        console.log('🎯 Test de recherche "Aglaonema":', testSearch);
        
        // 5. Test avec scientific_name
        const testScientific = await Plant.findAll({
            where: {
                scientific_name: { [Op.like]: '%Aglaonema%' }
            },
            limit: 5,
            raw: true
        });
        console.log('🧬 Test de recherche scientific_name "Aglaonema":', testScientific);
        
        res.json({
            success: true,
            tableStructure: tableInfo,
            rawSQLData: rawPlants,
            sequelizeData: sequelizePlants,
            nameSearchResults: testSearch.length,
            scientificSearchResults: testScientific.length,
            message: 'Debug de la structure terminé - vérifiez la console pour les détails'
        });
        
    } catch (error) {
        console.error('❌ Erreur debug:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// ============================================
// TEST DE RECHERCHE SIMPLE
// ============================================

app.get('/api/test-search', async (req, res) => {
    try {
        console.log('🧪 Test de recherche simple...');
        
        // Test 1: Recherche par nom exact
        const exactMatch = await Plant.findAll({
            where: { name: 'Aglaonema' },
            raw: true
        });
        console.log('Test 1 - Correspondance exacte "Aglaonema":', exactMatch.length);
        
        // Test 2: Recherche avec LIKE
        const likeMatch = await Plant.findAll({
            where: {
                name: { [Op.like]: '%Aglaonema%' }
            },
            raw: true
        });
        console.log('Test 2 - LIKE "Aglaonema":', likeMatch.length);
        
        // Test 3: Recherche insensible à la casse
        const iLikeMatch = await Plant.findAll({
            where: {
                name: { [Op.like]: '%aglaonema%' }
            },
            raw: true
        });
        console.log('Test 3 - LIKE "aglaonema" (minuscules):', iLikeMatch.length);
        
        // Test 4: Toutes les plantes
        const allPlants = await Plant.findAll({
            attributes: ['name', 'scientific_name'],
            raw: true
        });
        console.log('Test 4 - Toutes les plantes:', allPlants.map(p => p.name));
        
        res.json({
            success: true,
            tests: {
                exactMatch: exactMatch.length,
                likeMatch: likeMatch.length,
                iLikeMatch: iLikeMatch.length,
                allPlants: allPlants.map(p => ({ name: p.name, scientific: p.scientific_name }))
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur test de recherche:', error);
        res.status(500).json({
            success: false,
            error: error.message
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
                scientificName: plant.scientificName || plant.scientific_name,
                description: plant.description,
                price: parseFloat(plant.price),
                stockQuantity: plant.stockQuantity || plant.stock_quantity,
                imageUrl: plant.imageUrl || plant.image_url,
                careInstructions: plant.careInstructions || plant.care_instructions,
                lightRequirements: plant.lightRequirements || plant.light_requirements,
                waterFrequency: plant.waterFrequency || plant.water_frequency,
                size: plant.size,
                difficultyLevel: plant.difficultyLevel || plant.difficulty_level,
                isAvailable: plant.isAvailable || plant.is_available,
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
// NOUVELLES APIs POUR LE PANIER - CORRIGÉES
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

// ============================================
// ROUTES DE DEBUG
// ============================================

// Route pour vérifier la structure de la table Plants
app.get('/check-table', async (req, res) => {
    try {
        // Vérifier la structure de la table
        const [columns] = await sequelize.query("PRAGMA table_info(Plants)");
        
        // Vérifier le contenu actuel
        const [rows] = await sequelize.query("SELECT * FROM Plants");
        
        res.json({
            tableStructure: columns,
            currentData: rows,
            message: "Structure et contenu de la table Plants"
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API de statut
app.get('/api/status', (req, res) => {
    res.json({ 
        message: 'API fonctionnelle avec authentification, recherche et panier', 
        status: 'OK',
        timestamp: new Date().toISOString(),
        features: ['inscription', 'connexion', 'hashage-mot-de-passe', 'recherche', 'panier', 'gestion-stock'],
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
// ROUTES DE DEBUG SUPPLÉMENTAIRES
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
            console.log(`🚀 SERVEUR COMPLET DÉBOGUÉ lancé sur http://localhost:${PORT}`);
            console.log('🎯 PAGE D\'ACCUEIL: Espace Client (Inscription/Connexion)');
            console.log('🛡️ Fonctionnalités activées:');
            console.log('   ✅ Authentification sécurisée');
            console.log('   ✅ Recherche de plantes INSENSIBLE À LA CASSE DÉBOGUÉE');
            console.log('   ✅ Gestion du panier');
            console.log('   ✅ Gestion du stock en temps réel');
            console.log('   ✅ APIs complètes avec debug');
            console.log('🌐 URLs principales:');
            console.log('   🔐 PAGE D\'ACCUEIL: http://localhost:3000/ (Espace Client)');
            console.log('   🏠 PAGE PRODUITS: http://localhost:3000/home');
            console.log('   🛒 PANIER: http://localhost:3000/cart.html');
            console.log('   🌱 API PLANTES: http://localhost:3000/plantes');
            console.log('   📊 API STATUS: http://localhost:3000/api/status');
            console.log('   🔧 CRÉER PLANTES: http://localhost:3000/create-plants-final');
            console.log('   🔍 DEBUG STRUCTURE: http://localhost:3000/api/debug/plant-structure');
            console.log('   🧪 TEST RECHERCHE: http://localhost:3000/api/test-search');
            console.log('🆘 Pour résoudre le problème de recherche:');
            console.log('   1. Visitez d\'abord: http://localhost:3000/api/debug/plant-structure');
            console.log('   2. Puis: http://localhost:3000/api/test-search');
            console.log('   3. Vérifiez les logs de la console pour identifier le problème');
        });
    } catch (error) {
        console.error('❌ Erreur lors du démarrage:', error);
        process.exit(1);
    }
}

startServer();