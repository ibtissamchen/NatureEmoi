// database.js - Version avec les noms exacts de home.html
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Configuration de la connexion SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
  logging: false
});

// Test de la connexion
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données réussie');
  } catch (error) {
    console.error('❌ Erreur de connexion à la base de données:', error);
  }
}

// Définition du modèle User AVEC MOT DE PASSE
const User = sequelize.define('User', {
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 100],
      notEmpty: true
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { 
      isEmail: true,
      len: [5, 255],
      notEmpty: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 255],
      notEmpty: true
    }
  },
  adresse: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [5, 500],
      notEmpty: true
    }
  },
  telephone: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [8, 20],
      notEmpty: true
    }
  }
}, {
  tableName: 'users',
  underscored: true,
  hooks: {
    beforeValidate: (user) => {
      if (user.nom) user.nom = user.nom.trim();
      if (user.email) user.email = user.email.toLowerCase().trim();
      if (user.adresse) user.adresse = user.adresse.trim();
      if (user.telephone) user.telephone = user.telephone.trim();
    }
  }
});

// Modèles pour l'e-commerce 
const Category = sequelize.define('Category', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 100],
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    validate: {
      len: [0, 1000]
    }
  },
  imageUrl: {
    type: DataTypes.STRING,
    field: 'image_url',
    validate: {
      len: [0, 500]
    }
  }
}, {
  tableName: 'categories',
  underscored: true
});

const Plant = sequelize.define('Plant', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 150],
      notEmpty: true
    }
  },
  scientificName: {
    type: DataTypes.STRING,
    field: 'scientific_name',
    validate: {
      len: [0, 200]
    }
  },
  description: {
    type: DataTypes.TEXT,
    validate: {
      len: [0, 2000]
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 999999.99
    }
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'stock_quantity',
    validate: {
      min: 0,
      max: 100000
    }
  },
  categoryId: {
    type: DataTypes.INTEGER,
    field: 'category_id',
    allowNull: true, // Simplifié pour éviter les conflits
    validate: {
      isInt: true,
      min: 1
    }
  },
  imageUrl: {
    type: DataTypes.STRING,
    field: 'image_url',
    validate: {
      len: [0, 500]
    }
  },
  careInstructions: {
    type: DataTypes.TEXT,
    field: 'care_instructions',
    validate: {
      len: [0, 1000]
    }
  },
  lightRequirements: {
    type: DataTypes.STRING,
    field: 'light_requirements',
    validate: {
      len: [0, 100]
    }
  },
  waterFrequency: {
    type: DataTypes.STRING,
    field: 'water_frequency',
    validate: {
      len: [0, 100]
    }
  },
  size: {
    type: DataTypes.STRING,
    validate: {
      len: [0, 50]
    }
  },
  difficultyLevel: {
    type: DataTypes.STRING,
    field: 'difficulty_level',
    validate: {
      isIn: [['Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile']]
    }
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_available'
  }
}, {
  tableName: 'plants',
  underscored: true
});

const Order = sequelize.define('Order', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    validate: {
      isInt: true,
      min: 1
    }
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'total_amount',
    validate: {
      min: 0,
      max: 999999.99
    }
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']]
    }
  },
  shippingAddress: {
    type: DataTypes.TEXT,
    field: 'shipping_address',
    validate: {
      len: [0, 500]
    }
  },
  paymentMethod: {
    type: DataTypes.STRING,
    field: 'payment_method',
    validate: {
      isIn: [['cash', 'card', 'bank_transfer', 'paypal']]
    }
  },
  paymentStatus: {
    type: DataTypes.STRING,
    defaultValue: 'pending',
    field: 'payment_status',
    validate: {
      isIn: [['pending', 'paid', 'failed', 'refunded']]
    }
  }
}, {
  tableName: 'orders',
  underscored: true
});

const OrderItem = sequelize.define('OrderItem', {
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'order_id',
    validate: {
      isInt: true,
      min: 1
    }
  },
  plantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'plant_id',
    validate: {
      isInt: true,
      min: 1
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 1000
    }
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'unit_price',
    validate: {
      min: 0,
      max: 999999.99
    }
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'total_price',
    validate: {
      min: 0,
      max: 999999.99
    }
  }
}, {
  tableName: 'order_items',
  timestamps: false
});

const Cart = sequelize.define('Cart', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    validate: {
      isInt: true,
      min: 1
    }
  },
  plantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'plant_id',
    validate: {
      isInt: true,
      min: 1
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 100
    }
  }
}, {
  tableName: 'cart',
  updatedAt: false
});

// Associations simplifiées
Plant.belongsTo(Category, { 
  foreignKey: 'categoryId',
  constraints: false // Éviter les conflits de contraintes
});
Category.hasMany(Plant, { 
  foreignKey: 'categoryId',
  constraints: false
});

Order.belongsTo(User, { 
  foreignKey: 'userId',
  constraints: false
});
User.hasMany(Order, { 
  foreignKey: 'userId',
  constraints: false
});

OrderItem.belongsTo(Order, { 
  foreignKey: 'orderId',
  constraints: false
});
OrderItem.belongsTo(Plant, { 
  foreignKey: 'plantId',
  constraints: false
});
Order.hasMany(OrderItem, { 
  foreignKey: 'orderId',
  constraints: false
});

Cart.belongsTo(User, { 
  foreignKey: 'userId',
  constraints: false
});
Cart.belongsTo(Plant, { 
  foreignKey: 'plantId',
  constraints: false
});

// Fonction d'initialisation simple
async function initDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');
    
    // Première fois : créer tout
    await sequelize.sync();
    
    console.log('✅ Base de données initialisée');
    
    // Vérifier s'il y a déjà des données
    const userCount = await User.count();
    const categoryCount = await Category.count();
    const plantCount = await Plant.count();
    
    console.log('📊 État actuel de la base:');
    console.log(`   - Utilisateurs: ${userCount}`);
    console.log(`   - Catégories: ${categoryCount}`);
    console.log(`   - Plantes: ${plantCount}`);
    
    // Ajouter des données de test si base vide
    if (categoryCount === 0) {
      console.log('📦 Ajout de données de test...');
      await addSampleData();
    } else {
      console.log('✅ Base contient déjà des données');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    throw error;
  }
}

// Fonction pour ajouter les données EXACTEMENT comme dans home.html
async function addSampleData() {
  try {
    // Créer quelques catégories
    const categories = await Category.bulkCreate([
      { 
        name: 'Plantes d\'intérieur', 
        description: 'Plantes parfaites pour décorer votre intérieur' 
      },
      { 
        name: 'Plantes grasses', 
        description: 'Plantes succulentes faciles d\'entretien' 
      },
      { 
        name: 'Plantes tropicales', 
        description: 'Plantes exotiques et tropicales' 
      }
    ]);

    // PLANTES EXACTEMENT COMME DANS HOME.HTML
    await Plant.bulkCreate([
      {
        name: 'Zamioculcas zamiifolia',
        scientificName: 'Zamioculcas zamiifolia',
        description: 'Plante d\'intérieur très résistante et facile d\'entretien, parfaite pour les débutants. Tolère bien la sécheresse et les conditions de faible luminosité.',
        price: 199.99,
        stockQuantity: 24,
        categoryId: categories[0].id,
        imageUrl: '../Plants/1st plant.jpg',
        careInstructions: 'Arroser quand le sol est complètement sec, environ une fois par mois',
        lightRequirements: 'Lumière indirecte à faible luminosité',
        waterFrequency: '1 fois par mois',
        size: 'Moyenne',
        difficultyLevel: 'Très facile'
      },
      {
        name: 'Aglaonema',
        scientificName: 'Aglaonema commutatum',
        description: 'Plante aux magnifiques feuilles colorées et panachées, idéale pour apporter de la couleur et de la vie dans votre intérieur.',
        price: 150.00,
        stockQuantity: 32,
        categoryId: categories[0].id,
        imageUrl: '../Plants/plante4.jpg',
        careInstructions: 'Maintenir le sol légèrement humide, éviter les courants d\'air froids',
        lightRequirements: 'Lumière indirecte vive',
        waterFrequency: '1-2 fois par semaine',
        size: 'Moyenne',
        difficultyLevel: 'Facile'
      },
      {
        name: 'Philodendron Xanadu',
        scientificName: 'Philodendron bipinnatifidum',
        description: 'Magnifique plante tropicale aux feuilles profondément découpées, apporte une touche exotique et luxuriante à votre décoration.',
        price: 50.00,
        stockQuantity: 17,
        categoryId: categories[2].id,
        imageUrl: '../Plants/plante3.jpg',
        careInstructions: 'Arroser régulièrement, aime l\'humidité ambiante élevée',
        lightRequirements: 'Lumière indirecte vive',
        waterFrequency: '2-3 fois par semaine',
        size: 'Grande',
        difficultyLevel: 'Facile'
      },
      {
        name: 'Sansevieria trifasciata',
        scientificName: 'Sansevieria trifasciata',
        description: 'Aussi appelée "langue de belle-mère", cette plante succulente est quasi-indestructible et excellente pour purifier l\'air intérieur.',
        price: 179.99,
        stockQuantity: 24,
        categoryId: categories[1].id,
        imageUrl: '../Plants/plant5.jpg',
        careInstructions: 'Arroser très peu, laisser le sol sécher complètement entre les arrosages',
        lightRequirements: 'Tolère toutes les conditions de lumière',
        waterFrequency: '1 fois toutes les 2-3 semaines',
        size: 'Grande',
        difficultyLevel: 'Très facile'
      }
    ]);

    console.log('✅ Plantes ajoutées avec les NOMS EXACTS de home.html:');
    console.log('   - Zamioculcas zamiifolia (199.99 DH)');
    console.log('   - Aglaonema (150.00 DH)');
    console.log('   - Philodendron Xanadu (50.00 DH)');
    console.log('   - Sansevieria trifasciata (179.99 DH)');
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout des données de test:', error);
  }
}

module.exports = {
  sequelize,
  User,
  Category,
  Plant,
  Order,
  OrderItem,
  Cart,
  testConnection,
  initDatabase
};