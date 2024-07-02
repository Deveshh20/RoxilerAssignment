const express = require('express');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const Transaction = require('./models/Transaction');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://localhost:27017/assignmentDatabase', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('Error connecting to MongoDB', err);
});

const monthMap = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
};

// Initialize database with external JSON data
app.get('/initialize-database', async (req, res) => {
  try {
    const existingTransactions = await Transaction.countDocuments({});
    if (existingTransactions === 0) {
      const response = await fetch('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
      const transactions = await response.json();
      await Transaction.insertMany(transactions);
      res.json({ message: 'Database initialized successfully' });
    } else {
      res.json({ message: 'Database already initialized' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to initialize database', error: error.message });
  }
});

// Generic error handler for MongoDB operations
const handleMongoError = (res, error) => {
  res.status(500).json({ message: 'MongoDB operation failed', error: error.message });
};

// Fetch transactions with optional search, pagination, and month filter
app.get('/transactions', async (req, res) => {
  try {
    const { search = '', page = 1, perPage = 10, month } = req.query;
    const query = {};

    if (search) {
      const priceSearch = parseFloat(search);
      query.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
      if (!isNaN(priceSearch)) {
        query.$or.push({ price: priceSearch });
      }
    }

    const aggregationPipeline = [];
    if (month && monthMap[month]) {
      aggregationPipeline.push({
        $match: { $expr: { $eq: [{ $month: '$dateOfSale' }, monthMap[month]] } }
      });
    }

    aggregationPipeline.push(
      { $skip: (parseInt(page) - 1) * parseInt(perPage) },
      { $limit: parseInt(perPage) }
    );

    const [transactions, total] = await Promise.all([
      Transaction.aggregate(aggregationPipeline),
      Transaction.countDocuments(query)
    ]);

    res.json({ transactions, total, page: parseInt(page), perPage: parseInt(perPage) });
  } catch (error) {
    handleMongoError(res, error);
  }
});

// Fetch statistics for the selected month
app.get('/statistics', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !monthMap[month]) {
      return res.status(400).json({ message: 'Valid month parameter is required' });
    }

    const monthNumber = monthMap[month];

    const [totalSaleAmount, soldItemsCount, notSoldItemsCount] = await Promise.all([
      Transaction.aggregate([
        { $match: { $expr: { $eq: [{ $month: '$dateOfSale' }, monthNumber] } } },
        { $group: { _id: null, totalAmount: { $sum: '$price' } } }
      ]),
      Transaction.countDocuments({ $expr: { $and: [{ $eq: [{ $month: '$dateOfSale' }, monthNumber] }, { $eq: ['$sold', true] }] } }),
      Transaction.countDocuments({ $expr: { $and: [{ $eq: [{ $month: '$dateOfSale' }, monthNumber] }, { $eq: ['$sold', false] }] } })
    ]);

    res.json({ totalSaleAmount: totalSaleAmount[0]?.totalAmount || 0, soldItemsCount, notSoldItemsCount });
  } catch (error) {
    handleMongoError(res, error);
  }
});

// Fetch price range data for the selected month
app.get('/price-range-chart', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !monthMap[month]) {
      return res.status(400).json({ message: 'Valid month parameter is required' });
    }

    const monthNumber = monthMap[month];

    const priceRanges = [
      { min: 0, max: 100 }, { min: 101, max: 200 }, { min: 201, max: 300 },
      { min: 301, max: 400 }, { min: 401, max: 500 }, { min: 501, max: 600 },
      { min: 601, max: 700 }, { min: 701, max: 800 }, { min: 801, max: 900 },
      { min: 901, max: Infinity }
    ];

    const priceRangeData = await Promise.all(priceRanges.map(async range => ({
      range,
      count: await Transaction.countDocuments({
        $expr: {
          $and: [
            { $eq: [{ $month: '$dateOfSale' }, monthNumber] },
            { $gte: ['$price', range.min] },
            { $lte: ['$price', range.max] }
          ]
        }
      })
    })));

    res.json(priceRangeData);
  } catch (error) {
    handleMongoError(res, error);
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
