'use strict';

/**
 * HeatWatch — application entry point.
 * Stack: Node.js + Express.js + EJS + MongoDB/Mongoose (per specification).
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { connectDatabase } = require('./config/database');
const { attachUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(attachUser);

// Pages -----------------------------------------------------------------
app.use('/', require('./routes/pages'));

// APIs ------------------------------------------------------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/weather', require('./routes/weather'));
app.use('/api/utci', require('./routes/utci'));
app.use('/api/risk', require('./routes/risk'));
app.use('/api/government', require('./routes/government'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/location', require('./routes/location'));
app.use('/api/map', require('./routes/map'));
app.use('/api/alerts', require('./routes/alerts'));

// Errors ----------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and configure it.');
    process.exit(1);
  }
  try {
    await connectDatabase();
    console.log('MongoDB connected.');
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    console.error('Start MongoDB and check MONGODB_URI in .env, then restart HeatWatch.');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`HeatWatch running at http://localhost:${PORT}`);
  });
}

if (require.main === module) start();

module.exports = app;
