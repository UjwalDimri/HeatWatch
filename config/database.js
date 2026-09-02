'use strict';

const mongoose = require('mongoose');

let connected = false;

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and configure it.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  return mongoose.connection;
}

function isConnected() {
  return connected && mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, isConnected, mongoose };
