const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
    res.status(200).type('application/json').json({
        message: 'acknowledged',
        url: req.originalUrl,
        status: 200
    })
})

module.exports = router;