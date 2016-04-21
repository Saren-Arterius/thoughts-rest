var express = require('express');
var commons = require('../commons');
var config = require('../config');
var router = express.Router();

// HVALS HSET

router.post('/:upOrDown/:id', commons.checkThoughtExists, function (req, res, next) {
  commons.redis.hset(config.redis_prefix + 'votes-' + req.params.id,
      commons.getIP(req), req.params.upOrDown === 'up' ? 1 : -1)
    .then(function (result) {
      commons.calcRating(req.params.id, function (rating) {
        res.send({
          success: true,
          id: parseInt(req.params.id, 10),
          new_score: rating
        });
      });
    });
});

module.exports = router;
