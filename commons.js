var config = require('./config');
var redis = require('then-redis');
var secureRandom = require('secure-random');

var definedIP;
var rateLimiters = {};
var redisClient = redis.createClient({
  host: config.redis_host
});
redisClient.select(config.redis_db);

var getIP = function (req) {
  if (definedIP) {
    return definedIP;
  }
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
};

var RateLimiter = function (maxRequestCount, perSeconds) {
  this.lastTimePortion = {};
  this.ipRequestCounter = {};
  var self = this;
  this.middleware = function (req, res, next) {
    var timePortion = Math.floor(Date.now() / (perSeconds * 1000));
    if (self.lastTimePortion[maxRequestCount] !== timePortion) {
      self.ipRequestCounter = {};
      self.lastTimePortion[maxRequestCount] = timePortion;
    }
    var ip = getIP(req);
    if (!(ip in self.ipRequestCounter)) {
      self.ipRequestCounter[ip] = 1;
    }
    if (self.ipRequestCounter[ip] > maxRequestCount) {
      res.status(429).send('Too many requests. Please request again ' +
        Math.ceil(perSeconds / 60) + ' minute(s) later.');
      return;
    }
    self.ipRequestCounter[ip]++;
    next();
  };
  this.reset = function (req) {
    if (!req) {
      self.ipRequestCounter = {};
    } else {
      self.ipRequestCounter[getIP(req)] = 0;
    }
  };
};

module.exports = {
  redis: redisClient,
  getIP: getIP,
  setDefinedIP: function (ip) {
    definedIP = ip;
  },
  rateLimit: function (area, maxRequestCount, perSeconds) {
    var limiter = rateLimiters[area];
    if (!limiter) {
      limiter = new RateLimiter(maxRequestCount, perSeconds);
      rateLimiters[area] = limiter;
    }
    return limiter.middleware;
  },
  resetRateLimit: function (key, req) {
    if (!key) {
      for (var k1 in rateLimiters) {
        rateLimiters[k1].reset(req);
      }
    } else {
      rateLimiters[key].reset(req);
    }
  },
  randomToken: function () {
    var bytes = secureRandom(32, {
      type: 'Buffer'
    });
    return bytes.toString('hex');
  },
  checkThoughtExists: function (req, res, next) {
    if (req.valid) return next();
    if (parseInt(req.params.id, 10) === 0) return res.status(404).send('Thought #' + req.params.id + ' not found.');
    if (isNaN(req.params.id)) return res.status(400).send('ID must be integer.');
    redisClient.hexists(config.redis_prefix + 'thoughts', req.params.id).then(function (result) {
      if (!result) return res.status(404).send('Thought #' + req.params.id + ' not found.');
      next();
    });
  },
  calcRating: function (id, cb) {
    redisClient.hvals(config.redis_prefix + 'votes-' + id).then(function (scores) {
      var sum = 0;
      if (scores) {
        scores.forEach(function (score) {
          sum += parseInt(score, 10);
        });
      }
      cb(sum);
      return redisClient.set(config.redis_prefix + 'rating-' + id, sum);
    }).catch(function (err) {
      throw err;
    });
  },
  cachedCalcRating: function (id, cb) {
    var self = this;
    redisClient.get(config.redis_prefix + 'rating-' + id).then(function (rating) {
      if (rating) return cb(parseInt(rating, 10));
      self.calcRating(id, cb);
    }).catch(function (err) {
      throw err;
    });
  }
};
