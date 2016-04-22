var express = require('express');
var commons = require('../commons');
var config = require('../config');
var Async = require('async');
var decay = require('decay');
var redditHot = decay.redditHot();
var hackerHot = decay.hackerHot();
var router = express.Router();

const VALID_TYPES = ['hot', 'latest', 'rising', 'controversial', 'top'];
const TIME_SPANS = {
  'd': 86400 * 1000,
  'w': 7 * 86400 * 1000,
  'm': 30 * 86400 * 1000,
  'y': 365 * 86400 * 1000,
  'a': -1
};

var controversy = function (ups, downs) {
  if (downs <= 0 || ups <= 0) return 0;

  var magnitude = ups + downs;
  var balance = ups > downs ? downs / ups : ups / downs;
  return Math.pow(magnitude, balance);
};

var checkParams = function (req, res, next) {
  if (VALID_TYPES.indexOf(req.params.type) === -1) return res.status(400).send('Featured types is not valid.');
  if (!TIME_SPANS[req.params.timeSpan]) return res.status(400).send('TimeSpan is not valid.');
  if (isNaN(req.params.page) || parseInt(req.params.page, 10) < 0) return res.status(400).send('Page is not valid.');
  next();
};

var checkCache = function (req, res, next) {
  commons.redis.get(config.redis_prefix + 'thoughts:' + req.params.type + ':' + req.params.timeSpan).then(function (cache) {
    if (cache) {
      req.cache = JSON.parse(cache);
    }
    next();
  });
};

var getThoughtsByTimeSpan = function (req, res, next) {
  if (req.cache) return next();
  req.thoughts = [];
  commons.redis.hvals(config.redis_prefix + 'thoughts').then(function (thoughts) {
    var now = Date.now();
    for (var i = thoughts.length - 1; i >= 0; i--) {
      var thought = JSON.parse(thoughts[i]);
      if (req.params.timeSpan === 'a' || now - thought.date <= TIME_SPANS[req.params.timeSpan]) {
        req.thoughts.push(thought);
      }
    }
    next();
  });
};

var setCache = function (req, res, next) {
  if (req.cache) return;
  commons.redis.setex(config.redis_prefix + 'thoughts:' + req.params.type + ':' + req.params.timeSpan,
    600, JSON.stringify(req.thoughts)).then(function (result) {});
};

var sortThoughts = function (req, res, next) {
  if (req.cache) return next();
  Async.map(req.thoughts, function (thought, cb) {
    commons.cachedCalcRating(thought.id, function (upvotes, downvotes) {
      return cb(null, [upvotes, downvotes]);
    });
  }, function (err, results) {
    if (err) throw err;
    for (var i in results) {
      req.thoughts[i].rating = results[i][0] - results[i][1];
      req.thoughts[i].upvotes = results[i][0];
      req.thoughts[i].downvotes = results[i][1];
    }

    switch (req.params.type) {
      case 'controversial':
        req.thoughts.sort(function (a, b) {
          return controversy(b.upvotes, b.downvotes) - controversy(a.upvotes, a.downvotes);
        });
        break;
      case 'hot':
        req.thoughts.sort(function (a, b) {
          return redditHot(b.upvotes, b.downvotes, new Date(b.date)) - redditHot(a.upvotes, a.downvotes, new Date(a.date));
        });
        break;
      case 'top':
        req.thoughts.sort(function (a, b) {
          return b.rating - a.rating;
        });
        break;
      case 'latest':
        req.thoughts.sort(function (a, b) {
          return b.date - a.date;
        });
        break;
      case 'rising':
        req.thoughts.sort(function (a, b) {
          return hackerHot(b.upvotes, new Date(b.date)) - hackerHot(a.upvotes, new Date(a.date));
        });
        break;
    }
    console.log('Cache miss');
    req.thoughts.forEach(function (thought) {
      delete thought.upvotes;
      delete thought.downvotes;
    });
    next();
  });
};

router.get('/:type/:timeSpan/:page', commons.noCache, checkParams, checkCache, getThoughtsByTimeSpan, sortThoughts, function (req, res, next) {
  res.send({
    success: true,
    hasMore: (req.thoughts || req.cache).length > req.params.page * 10 + 10,
    thoughts: (req.thoughts || req.cache).slice(req.params.page * 10, (req.params.page * 10) + 10)
  });
  next();
}, setCache);

module.exports = router;
