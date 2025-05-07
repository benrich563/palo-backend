import Order from '../models/Order.js';

export const calculateGrowthRate = (current, previous) => {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

export const calculateRetentionRate = (returningUsers, totalUsers) => {
  if (!totalUsers || totalUsers === 0) return 0;
  return (returningUsers / totalUsers) * 100;
};

export const generateDateRanges = (startDate, endDate) => {
  const ranges = {
    daily: [],
    weekly: [],
    monthly: []
  };
  
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  
  while (currentDate <= end) {
    ranges.daily.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return ranges;
};

export const calculateSalesMetrics = async (businessId, startDate, endDate) => {
  const orders = await Order.find({
    business: businessId,
    createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
  });

  return {
    totalSales: orders.reduce((sum, order) => sum + order.total, 0),
    orderCount: orders.length,
    averageOrderValue: orders.length > 0 
      ? orders.reduce((sum, order) => sum + order.total, 0) / orders.length 
      : 0,
    salesByDay: await aggregateSalesByDay(businessId, startDate, endDate),
    topProducts: await getTopProducts(businessId, startDate, endDate),
    salesByChannel: await aggregateSalesByChannel(businessId, startDate, endDate)
  };
};

export const calculateCustomerMetrics = async (businessId, startDate, endDate) => {
  const orders = await Order.find({
    business: businessId,
    createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).populate('user');

  const customers = orders.reduce((acc, order) => {
    if (!acc[order.user._id]) {
      acc[order.user._id] = {
        orders: 0,
        totalSpent: 0,
        lastOrder: order.createdAt
      };
    }
    acc[order.user._id].orders++;
    acc[order.user._id].totalSpent += order.total;
    return acc;
  }, {});

  return {
    totalCustomers: Object.keys(customers).length,
    averageOrdersPerCustomer: orders.length / Object.keys(customers).length,
    topCustomers: Object.entries(customers)
      .sort((a, b) => b[1].totalSpent - a[1].totalSpent)
      .slice(0, 10),
    customerRetentionRate: calculateRetentionRate(
      Object.keys(customers).length,
      orders.length
    ),
    newCustomers: calculateNewCustomers(orders, startDate)
  };
};

export const calculateProductMetrics = async (businessId, startDate, endDate) => {
  const orders = await Order.find({
    business: businessId,
    createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).populate('items.product');

  const productMetrics = orders.reduce((acc, order) => {
    order.items.forEach(item => {
      if (!acc[item.product._id]) {
        acc[item.product._id] = {
          name: item.product.name,
          quantity: 0,
          revenue: 0,
          orders: 0
        };
      }
      acc[item.product._id].quantity += item.quantity;
      acc[item.product._id].revenue += item.price * item.quantity;
      acc[item.product._id].orders++;
    });
    return acc;
  }, {});

  return {
    topSellingProducts: Object.values(productMetrics)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
    mostProfitableProducts: Object.values(productMetrics)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    productPerformance: productMetrics
  };
};

// Helper functions
const aggregateSalesByDay = async (businessId, startDate, endDate) => {
  return await Order.aggregate([
    {
      $match: {
        business: businessId,
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: "$total" }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

const getTopProducts = async (businessId, startDate, endDate) => {
  return await Order.aggregate([
    {
      $match: {
        business: businessId,
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        totalQuantity: { $sum: "$items.quantity" },
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
      }
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: 10 }
  ]);
};

const aggregateSalesByChannel = async (businessId, startDate, endDate) => {
  return await Order.aggregate([
    {
      $match: {
        business: businessId,
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }
    },
    {
      $group: {
        _id: "$channel",
        total: { $sum: "$total" },
        count: { $sum: 1 }
      }
    }
  ]);
};

const calculateNewCustomers = (orders, startDate) => {
  const startDateObj = new Date(startDate);
  const uniqueCustomers = new Set();
  
  orders.forEach(order => {
    if (order.createdAt >= startDateObj) {
      uniqueCustomers.add(order.user._id.toString());
    }
  });
  
  return uniqueCustomers.size;
};
