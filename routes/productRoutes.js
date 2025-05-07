import express from 'express';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import ProductOrder from '../models/ProductOrder.js';
import { auth, businessAuth } from '../middleware/auth.js';
import { batchUpdateProducts, batchDeleteProducts } from '../controllers/productBatchController.js';
import mongoose from 'mongoose';
import { calculateDistance } from '../utils/locationUtils.js';

const router = express.Router();

// Get products with filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search = '',
      category = '',
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      rating,
      userLocation
    } = req.query;

    // Base query
    const query = {
      status: 'ACTIVE'
    };

    // Add filters...
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (rating) query.rating = { $gte: Number(rating) };

    // Check if the category is for perishable goods
    const perishableCategories = ['Food', 'Beverages', 'Fresh Produce', 'Prepared Meals'];
    const isPerishableCategory = category && perishableCategories.includes(category);

    // Location-based query for perishable goods
    let nearbyStores = [];
    if (userLocation && isPerishableCategory) {
      const coordinates = JSON.parse(userLocation);
      
      nearbyStores = await Store.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [coordinates.lng, coordinates.lat]
            },
            $maxDistance: 50000 // 50km in meters
          }
        },
        status: 'ACTIVE'
      }).select('_id');

      if (nearbyStores.length === 0) {
        return res.json({
          products: [],
          totalPages: 0,
          currentPage: Number(page),
          totalProducts: 0,
          categories: await Product.distinct('category'),
          message: 'No stores found in your area delivering this type of product. Try searching for other categories or adjust your location.',
          code: 'NO_NEARBY_STORES'
        });
      }

      query.store = { 
        $in: nearbyStores.map(store => store._id) 
      };
    }

    // Get products with pagination
    const products = await Product.find(query)
      .populate('store', 'name logo banner location promotion')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Calculate total for pagination
    const total = await Product.countDocuments(query);

    // If no products found, return appropriate message
    if (total === 0) {
      let message = 'No products found.';
      let code = 'NO_PRODUCTS';

      if (search) {
        message = `No products found matching '${search}'.`;
        code = 'NO_SEARCH_RESULTS';
      } else if (category) {
        if (isPerishableCategory && userLocation) {
          message = `No ${category.toLowerCase()} available in your area right now. Try again later or check other categories.`;
          code = 'NO_PERISHABLE_PRODUCTS_NEARBY';
        } else {
          message = `No products found in ${category}.`;
          code = 'NO_CATEGORY_PRODUCTS';
        }
      } else if (Object.keys(query).length > 1) { // More filters than just status
        message = 'No products match your selected filters.';
        code = 'NO_FILTER_RESULTS';
      }

      return res.json({
        products: [],
        totalPages: 0,
        currentPage: Number(page),
        totalProducts: 0,
        categories: await Product.distinct('category'),
        message,
        code
      });
    }

    // Enhance products with distance if location provided
    const enhancedProducts = products.map(product => {
      const productObj = product.toObject();
      
      if (userLocation && productObj.store?.location?.coordinates) {
        const distance = calculateDistance(
          JSON.parse(userLocation),
          productObj.store.location.coordinates
        );
        productObj.storeDistance = Number(distance.toFixed(1));
      }

      return productObj;
    });

    // Sort by distance if applicable
    if (userLocation && isPerishableCategory) {
      enhancedProducts.sort((a, b) => a.storeDistance - b.storeDistance);
    }

    res.json({
      products: enhancedProducts,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalProducts: total,
      categories: await Product.distinct('category'),
      message: null,
      code: null
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      message: 'Failed to fetch products',
      error: error.message,
      code: 'FETCH_ERROR'
    });
  }
});

// Add this route to handle product suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const { search = '' } = req.query;

    if (!search || search.length < 2) {
      return res.json([]);
    }

    const suggestions = await Product.find({
      name: { $regex: search, $options: 'i' },
      status: 'ACTIVE'
    })
    .populate('store', 'businessName')
    .select('name price image store')
    .limit(10)
    .sort({ 
      'store.promotion.plan': -1, // Show promoted stores' products first
      createdAt: -1 
    });

    res.json(suggestions);
  } catch (error) {
    console.error('Product suggestions error:', error);
    res.status(500).json({ message: 'Failed to fetch product suggestions' });
  }
});

// New routes for product orders
router.post('/orders', auth, async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod, notes } = req.body;
    
    // Validate products and calculate totals
    const productIds = items.map(item => item.product);
    const products = await Product.find({ 
      _id: { $in: productIds },
      status: 'ACTIVE'
    }).populate('store');

    if (products.length !== items.length) {
      return res.status(400).json({ message: 'One or more products are unavailable' });
    }

    // Group items by store
    const ordersByStore = new Map();
    
    products.forEach((product, index) => {
      const orderItem = {
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: items[index].quantity,
        subtotal: product.price * items[index].quantity
      };

      if (!ordersByStore.has(product.store._id.toString())) {
        ordersByStore.set(product.store._id.toString(), {
          business: product.store._id,
          items: [orderItem],
          customer: {
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            address: deliveryAddress
          },
          paymentMethod,
          notes: { customer: notes },
          timestamps: { ordered: new Date() }
        });
      } else {
        ordersByStore.get(product.store._id.toString()).items.push(orderItem);
      }
    });

    // Create orders for each store
    const orders = await Promise.all(
      Array.from(ordersByStore.values()).map(async (orderData) => {
        const subtotal = orderData.items.reduce((sum, item) => sum + item.subtotal, 0);
        const tax = subtotal * 0.15; // 15% tax

        const order = new ProductOrder({
          ...orderData,
          totals: {
            subtotal,
            tax,
            deliveryFee: 0, // Will be calculated when delivery is arranged
            total: subtotal + tax
          }
        });

        await order.save();
        return order;
      })
    );

    res.status(201).json(orders);
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ 
      message: 'Failed to create order',
      error: error.message 
    });
  }
});

// Get user's orders
router.get('/orders/my', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const query = {
      'customer.email': req.user.email
    };

    if (status) {
      query.processingStatus = status;
    }

    const orders = await ProductOrder.find(query)
      .populate('business', 'name logo')
      .populate('items.product', 'name images')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ProductOrder.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalOrders: total
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch orders',
      error: error.message 
    });
  }
});

// Get order details
router.get('/orders/:id', auth, async (req, res) => {
  try {
    const order = await ProductOrder.findById(req.params.id)
      .populate('business', 'name logo address')
      .populate('items.product', 'name images')
      .populate('deliveryOrder');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify order belongs to user
    if (order.customer.email !== req.user.email) {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch order details',
      error: error.message 
    });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    console.log('Fetching product with ID:', req.params.id); // Debug log

    // Verify if ID is valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.log('Invalid MongoDB ObjectId');
      return res.status(404).json({ 
        message: 'Invalid product ID',
        code: 'INVALID_ID'
      });
    }

    // First check the store status
    const productExists = await Product.findById(req.params.id);
    const store = await Store.findOne({
      owner: productExists.store,  // First try to find store by owner ID
    });

    if (store) {
      // If we found the store by owner, update the product with correct store ID
      await Product.findByIdAndUpdate(productExists._id, {
        store: store._id,
        status: store.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
      });
      
      // Update local copy
      productExists.store = store._id;
      productExists.status = store.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
    } else {
      // If no store found by owner, try direct store ID lookup
      const directStore = await Store.findById(productExists.store);
      if (!directStore) {
        return res.status(404).json({ 
          message: 'Store not found',
          code: 'STORE_NOT_FOUND'
        });
      }
    }

    // Now try with our conditions
    const product = await Product.findOne({
      _id: req.params.id,
      status: { $in: ['ACTIVE', 'OUT_OF_STOCK'] }
    }).populate({
      path: 'store',
      select: 'businessName logo banner status promotion',
      match: { status: 'ACTIVE' }
    });

    console.log('Found product:', product); // Debug log
    console.log('Product status:', productExists?.status); // Debug log
    console.log('Store data:', product?.store); // Debug log

    if (!product) {
      if (!productExists) {
        return res.status(404).json({ 
          message: 'Product not found',
          code: 'PRODUCT_NOT_FOUND'
        });
      } else {
        return res.status(404).json({ 
          message: `Product is ${productExists.status.toLowerCase()}`,
          code: 'PRODUCT_STATUS_' + productExists.status
        });
      }
    }

    // Check if store exists and is active
    if (!product.store || !['ACTIVE'].includes(product.store.status)) {
      console.log('Store validation failed:', { 
        exists: !!product.store, 
        status: product.store?.status 
      }); // Debug log
      
      await Product.findByIdAndUpdate(product._id, {
        status: 'INACTIVE'
      });
      
      return res.status(404).json({ 
        message: 'Product is no longer available',
        code: 'STORE_NOT_FOUND'
      });
    }

    res.json(product);
    
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch product details' });
  }
});

router.post('/batch/update', [businessAuth], batchUpdateProducts);
router.post('/batch/delete', [businessAuth], batchDeleteProducts);

export default router;





















