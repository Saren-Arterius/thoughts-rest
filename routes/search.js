var express = require('express');
var commons = require('../commons');
var config = require('../config');
var router = express.Router();

var checkBody = function (req, res, next) {
  if (isNaN(req.body.page) || parseInt(req.body.page, 10) < 0) return res.status(400).send('Page is not valid.');
  next();
};

var isMatch = function (thought, queries) {
  var lc = thought.content.toLowerCase();
  for (var i in queries) {
    for (var j in thought.hashTags) {
      if (thought.hashTags[j].toLowerCase() === queries[i]) {
        return true;
      }
    }
    if (lc.indexOf(queries[i]) !== -1) {
      return true;
    }
  }
  return false;
};

router.post('/', checkBody, function (req, res, next) {
  var matches = [];
  var queries = req.body.query.split(/,|\s+/);
  var validQueries = [];
  queries.forEach(function (query) {
    query = query.trim().toLowerCase();
    if (!query || validQueries.indexOf(query) !== -1) {
      return;
    }
    if (query.charAt(0) === '#') {
      validQueries.push(query.substr(1));
    } else {
      validQueries.push(query);
    }
  });
  commons.redis.hvals(config.redis_prefix + 'thoughts').then(function (thoughts) {
    for (var i = thoughts.length - 1; i >= 0; i--) {
      var thought = JSON.parse(thoughts[i]);
      if (isMatch(thought, validQueries)) {
        matches.push(thought);
      }
    }
    res.send({
      success: true,
      hasMore: matches.length > req.body.page * 10 + 10,
      thoughts: matches.slice(req.body.page * 10, (req.body.page * 10) + 10)
    });
  });
});

module.exports = router;
