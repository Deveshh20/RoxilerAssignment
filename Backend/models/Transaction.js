const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const transactionSchema = new Schema({
  id: String,
  title: String,
  price: Number,
  description: String,
  category: String,
  image:String,
  sold: Boolean,
  dateOfSale: Date
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
