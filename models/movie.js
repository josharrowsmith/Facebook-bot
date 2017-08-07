'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MovieSchema = new Schema({
  user_id: { type: String },
  title: { type: String },
  plot: { type: String },
  date: { type: String },
  runtime: { type: String },
  director: { type: String },
  cast: { type: String },
  rating: { type: String },
  poster_url: { type: String }
});

module.exports = mongoose.model('Movie', MovieSchema);
