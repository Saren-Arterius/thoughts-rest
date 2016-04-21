var express = require('express');
var router = express.Router();



router.post('/', function (req, res, next) {
  console.log(req.body.query);
  var thoughts = [];
  for (var i = 45; i >= 0; i--) {
    thoughts.push({
      id: i,
      title: req.body.query,
      content: 'Lorem **ipsum** *dolor* _sit_ amet, consectetur adipiscing elit. Nullam ultricies pharetra elit a tempor. Nullam orci urna, convallis a porta in, sodales eget odio. Sed imperdiet lorem nec bibendum auctor. Quisque dolor tellus, fermentum id auctor faucibus, tincidunt vel ipsum. Morbi et auctor justo, non dictum risus. Vestibulum vitae neque non dolor ullamcorper ultrices a a urna. Nulla vitae lorem tempor arcu consequat lobortis.',
      rating: 10,
      hashTags: ['hash1', 'hash2', 'asd', 'cvv', 'sdfsdf', 'dsf', 'svsxf', '2345redg'],
      date: 1400000000000
    });
  }
  res.send({
    success: true,
    hasMore: req.body.page < 5,
    thoughts: thoughts.slice(req.body.page * 10, (req.body.page * 10) + 10)
  });
});

module.exports = router;
