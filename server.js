//-----------------------------
// Load Libraries
//-----------------------------
const cors = require('cors');
const morgan = require('morgan');
const express = require('express');

// Routers
const auth = require('./router/auth');
const user = require('./router/user');
// const member = require('./router/member');

//-----------------------------
// Configuration
//-----------------------------
const PORT = parseInt(process.argv[2]) || process.env.APP_PORT || 3000;
const app = express();

// Setup standard middleware
app.use(morgan('tiny'));
app.use(cors());

//-----------------------------
// Router rules
//-----------------------------

// login router - handle all login requests
app.use('api/auth', auth)

// handle all protected request
app.use('api/protected', user.router)     // TODO: Check credential before allowing access

// handle all member request
// app.use('/members', member)

// Serve angular application from Server side
// app.use(express.static(path.join(__dirname, 'public')));

// Response 404 in JSON
// This should be the last in order that capture anything undefine.
// Normal practise is to either return 404 or index.html 
// app.use((req, resp) => {
//     resp.status(404).type('application/json')
//         .json({
//             message: 'Page Not Found'
//         })
// })

//-----------------------------
// Starting up application
//-----------------------------
Promise.all([
    // Test all connections asynchronously
    user.connections.pool(),
    user.connections.client()
])
.then(() => {
    app.listen(PORT, () => {
        console.info(`Application started on port ${PORT} at ${new Date()}`);
    })
})
.catch(err => {
    process.exit(-1);
})



