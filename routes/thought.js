var express = require('express');
var commons = require('../commons');
var config = require('../config');
var router = express.Router();

var gcm = require('node-gcm');
var sender = new gcm.Sender(process.env.GCM_API_KEY);

var checkInput = function (req, res, next) {
  req.body.title = req.body.title.trim();
  req.body.content = req.body.content.trim();
  if (!req.body.title) return res.status(400).send('Please fill-in thought title.');
  if (!req.body.content) return res.status(400).send('Please fill-in thought content.');
  if (req.body.title.length > 100) return res.status(400).send('Thought title is too long.');
  if (req.body.content.length > 5000) return res.status(400).send('Thought content is too long.');
  if (req.body.hashTags.length > 10) return res.status(400).send('Too many HashTags.');
  if (req.body.hashTags.join('') > 100) return res.status(400).send('HashTags too long.');
  next();
};

var makeThoughtObject = function (req, res, next) {
  var hashTags = [];
  var hashTagsLower = [];
  req.body.hashTags.forEach(function (tag) {
    tag = tag.trim();
    if (!tag || hashTagsLower.indexOf(tag.toLowerCase()) !== -1) {
      return;
    }
    hashTags.push(tag);
    hashTagsLower.push(tag.toLowerCase());
  });
  req.thought = {
    title: req.body.title,
    content: req.body.content,
    date: req.oldThoughtDate || Date.now(),
    adminToken: req.params.adminToken || commons.randomToken(),
    hashTags: hashTags
  };
  next();
};

var invokeGCM = function (req, res, next) {
  req.thought.hashTags.forEach(function (hashTag) {
    var message = new gcm.Message({
      data: {
        id: req.thought.id,
        title: req.thought.title,
        hashtag: hashTag
      }
    });

    sender.send(message, {
      topic: '/topics/' + hashTag.toLowerCase()
    }, function (err, response) {
      if (err) console.error(err);
      else console.log(response);
    });
  });
};

var checkToken = function (req, res, next) {
  if (req.valid) return next();
  commons.redis.hget(config.redis_prefix + 'thoughts', req.params.id).then(function (thoughtJSON) {
    var thought = JSON.parse(thoughtJSON);
    if (thought.adminToken !== req.params.adminToken) {
      res.status(401).send('Wrong admin token.');
    }
    next();
  });
};

// Workaround a bug in Android app
var findIDByToken = function (req, res, next) {
  if (parseInt(req.params.id, 10) === 0) {
    commons.redis.hvals(config.redis_prefix + 'thoughts').then(function (thoughts) {
      for (var i in thoughts) {
        var thought = JSON.parse(thoughts[i]);
        if (thought.adminToken === req.params.adminToken) {
          req.params.id = thought.id;
          req.oldThoughtDate = thought.date;
          req.valid = true;
          break;
        }
      }
      return next();
    });
  } else {
    next();
  }
};

router.put('/', checkInput, commons.rateLimit('new', 2, 60), makeThoughtObject, function (req, res, next) {
  commons.redis.get(config.redis_prefix + 'next-id').then(function (nextID) {
    req.thought.id = nextID || 1;
    commons.redis.multi();
    commons.redis.incrby(config.redis_prefix + 'next-id', !nextID ? 2 : 1);
    commons.redis.hset(config.redis_prefix + 'thoughts', req.thought.id, JSON.stringify(req.thought));
    commons.redis.hset(config.redis_prefix + 'votes-' + req.params.id, commons.getIP(req), 1);
    return commons.redis.exec();
  }).then(function (result) {
    commons.cachedCalcRating(req.params.id, function (rating) {
      req.thought.rating = rating;
      res.send({
        success: true,
        thought: req.thought
      });
    });
    next();
  }).catch(function (err) {
    throw err;
  });
}, invokeGCM);

router.post('/:id/:adminToken', checkInput, findIDByToken, commons.checkThoughtExists, checkToken, makeThoughtObject, function (req, res, next) {
  req.thought.id = parseInt(req.params.id, 10);
  commons.redis.hset(config.redis_prefix + 'thoughts', req.params.id, JSON.stringify(req.thought)).then(function (result) {
    commons.cachedCalcRating(req.params.id, function (rating) {
      req.thought.rating = rating;
      res.send({
        success: true,
        thought: req.thought
      });
    });
  }).catch(function (err) {
    throw err;
  });
});

router.delete('/:id/:adminToken', commons.checkThoughtExists, checkToken, function (req, res, next) {
  commons.redis.multi();
  commons.redis.hdel(config.redis_prefix + 'thoughts', req.params.id);
  commons.redis.del(config.redis_prefix + 'votes-' + req.params.id);
  commons.redis.del(config.redis_prefix + 'rating-' + req.params.id);

  commons.redis.exec().then(function (result) {
    console.log(result);
    res.send({
      success: true
    });
  });
});

var sendThought = function (req, res, next) {
  commons.redis.hget(config.redis_prefix + 'thoughts', req.params.id).then(function (thoughtJSON) {
    var thought = JSON.parse(thoughtJSON);
    commons.cachedCalcRating(req.params.id, function (rating) {
      thought.rating = rating;
      delete thought.adminToken;
      res.send({
        success: true,
        thought: thought
      });
    });
  }).catch(function (err) {
    throw err;
  });
};

router.get('/:id', commons.checkThoughtExists, sendThought);

// Latest post
router.get('/', function (req, res, next) {
  commons.redis.hkeys(config.redis_prefix + 'thoughts').then(function (keys) {
    if (!keys.length) {
      return res.send({

        success: true,
        thought: {
          id: 0,
          title: 'No thoughts here so far',
          content: 'Yes, no thoughts here.',
          date: Date.now(),
          hashTags: []
        }
      });
    }
    req.params.id = keys[keys.length - 1];
    next();
  });
}, sendThought);

module.exports = router;
