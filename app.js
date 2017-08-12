'use strict';

const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');


mongoose.Promise = global.Promise;
const db = mongoose.connect("mongodb://josh:yellow@ds035603.mlab.com:35603/spbot", { useMongoClient: true });
//mongoose.connect(`mongodb://localhost:27017/${GITHUB_ISSUE}`, { useMongoClient: true })
const Movie = require('./models/movie');

Promise.reject(new Error('woops'));

const app = express();
const port = process.env.PORT || 5000;

const facebookGraphApiPrefix = `https://graph.facebook.com/v2.6`;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.listen(port);

// Server index page
app.get('/', function (req, res) {
  res.send('Deployed!');
});

// Facebook Webhook
// Used for verification
app.get('/webhook', function (req, res) {
  if (req.query['hub.verify_token'] === process.env.VERIFICATION_TOKEN) {
    console.log('Verified webhook');
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error('Verification failed. The tokens do not match');
    res.sendStatus(403);
  }
});

// All callbacks for Messenger come here
app.post('/webhook', function (req, res) {
  if (req.body.object === 'page') {
    req.body.entry.forEach((entry) =>
      entry.messaging.forEach(processMessengerEvent)
    );
  }


  // app to the page.
  res.sendStatus(200);
});

/**
 * Process all the different messages sent by messenger based on
 * its type.
 */
function processMessengerEvent(event) {
  console.log('processing message');
  if (event.postback) {
    processPostback(event);
  } else if (event.message) {
    processMessage(event);
  }
}

function processPostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;

  switch (payload) {
    case 'Greeting':
      // Get user's first name fro the User Profile API
      return request({
        url: `${facebookGraphApiPrefix}/${senderId}`,
        qs: {
          access_token: process.env.PAGE_ACCESS_TOKEN,
          fields: 'first_name'
        },
        method: 'GET'
      }, function (error, response, body) {
        if (error) {
          console.log(`Error getting user's name: ${error}`)
        }

        const nameGreeting = error
          ? ''
          : `Hi ${JSON.parse(body).first_name}. `;

        console.log(`name: ${nameGreeting}, sender: ${senderId}`);

        const text = nameGreeting +
          `My name is SP Movie Bot. I can tell you various details regarding movies. What movie would you like to know about?`;

        sendMessage(senderId, { text });
      });

    case 'Correct':
      return sendMessage(senderId, { text: `Awesome! What would you like to find out? Enter 'plot', 'date', 'runtime', 'director', 'cast' or 'rating' for the various details.` });

    case 'Incorrect':
      return sendMessage(senderId, { text: `Oops! Sorry about that. Try using the exact title of the movie` });
  }
}

function processMessage(event) {
  if (event.message.is_echo) {
    return;
  }

  const message = event.message;
  const senderId = event.sender.id;

  console.log(`Received message from senderId: ${senderId}`);
  console.log(`Message is: ${JSON.stringify(message)}`);

  // You may get a text or attachment but not both
  if (message.text) {
    const formattedMessage = message.text.toLowerCase().trim();

    // If we recieve a text message, check to see if it matches any special
    // keyowrds and send back the corresponding movie detail.
    // Otherwise, search for new movie.
    switch (formattedMessage) {
      case 'plot':
      case 'date':
      case 'runtime':
      case 'director':
      case 'cast':
      case 'rating':
        getMovieDetail(senderId, formattedMessage);
        break;

      default:
        findMovie(senderId, formattedMessage);
    }
  } else if (message.attachments) {
    sendMessage(senderId, { text: `Sorry, I don't understand your request.` });
  }
}

function getMovieDetail(userId, field) {
  Movie
    .findOne({ user_id: userId })
    .exec()
    .then((movie) => sendMessage(userId, { text: movie[field] }))
    .catch((error) => sendMessage(userId, { text: `Something went wrong. Try again` }));
}

function findMovie(userId, movieTitle) {
  //https://api.themoviedb.org/3/search/movie?api_key={api_key}&query=Jack+Reacher
  //"http://www.omdbapi.com/?t=" + movieTitle + "&apikey=7e0bbc93"
  request("https://api.themoviedb.org/3/search/movie?&api_key=1ac2e46af3c6445c8f78d27dd6debcc1&query=" + movieTitle, function (error, response, body) {
    if (error || response.statusCode !== 200) {
      return sendMessage(userId, { text: `Something went wrong. Try again.` });
    }

    const themoviedb = JSON.parse(body);
    //console.log(themoviedb);

    if (themoviedb.Response === 'False') {
      console.log(themoviedb.Error);
      return sendMessage(userId, { text: themoviedb.Error });
    }

    const query = { user_id: userId };
    const update = {
      user_id: userId,
      title: themoviedb.results.original_title,
      plot: themoviedb.results.overview,
      date: themoviedb.results.date,
      poster_url: themoviedb.results.poster_path
    };
    console.log(themoviedb.results.original_title);
    const options = { upsert: true };
    Movie
      .findOneAndUpdate(query, update, options)
      .exec()
      .then(() => {
        const message = {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: [{
                title: "batman",
                subtitle: 'Is this the movie you are looking for?',
                image_url: "http://seinfeld-v1.tripod.com/pictures/kramer/seinfeld_tkramer4.jpg",
                buttons: [{
                  type: 'postback',
                  title: 'Yes',
                  payload: 'Correct'
                }, {
                  type: 'postback',
                  title: 'No',
                  payload: 'Incorrect'
                }]
              }]
            }
          }
        };
        sendMessage(userId, message);
      })
      .catch((error) => console.log(`Database error: ${error}`));
  });
}

function sendMessage(recipientId, message) {
  console.log(`sending ${message.text} to ${recipientId}`);
  request({
    url: `${facebookGraphApiPrefix}/me/messages`,
    qs: {
      access_token: process.env.PAGE_ACCESS_TOKEN,
    },
    method: 'POST',
    json: {
      recipient: { id: recipientId },
      message
    }
  }, function (error, response, body) {
    if (error) {
      console.error(`Error sending message: ${response.error}`);
    }

    console.log('Send message response', body);
  });
}

process.on('uncaughtException', (err) => {
  console.error(`An error has occurred: ${err}`);
});
