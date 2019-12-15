//-----------------------------
// Load Libraries
//-----------------------------
const fs = require('fs');
const imageType = require('image-type');
const http = require('request-promise');
const mysql = require('mysql');
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectID;
const multer = require('multer');
const AWS = require('aws-sdk');
const express = require('express');
const router = express.Router();

// const config = require('./config');
const db = require('../utils/mysql_utils');

//-----------------------------
// Configuration
//-----------------------------
// Body Parser
const urlencoded = express.urlencoded({ extended: true });

// Multer
const uploadPhoto = multer({ dest: __dirname + '/tmp' });

// AWS S3
let do_config, s3_config, mo_config;
if (fs.existsSync(__dirname + '/config.js')) {
    // do_config = require('./config').mysql
    do_config = require('./config').digitalocean;
    do_config.ssl = {
        ca: fs.readFileSync(do_config.cacert)
    };

    s3_config = require('./config.js').s3;

    mo_config = require('./config.js').atlas;
} else {
    do_config = {
        host: 'db-mysql-sgp1-85311-do-user-6881958-0.db.ondigitalocean.com',
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'fitness',
        connectionLimit: 4,
        cacert: process.env.DB_CA_CERT
    };

    s3_config = {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
    }

    mo_config = {
        url: process.env.ATLAS_URL
    } 
}

// MySQL client
console.log('Do Config:', do_config);
console.log('S3 Config:', s3_config);
console.log('At Config:', mo_config);

const pool = mysql.createPool(do_config);
// S3 client
const SPACE_URL = 'sgp1.digitaloceanspaces.com';
const s3 = new AWS.S3({
    endpoint: new AWS.Endpoint(SPACE_URL),
    accessKeyId: s3_config.public,
    secretAccessKey: s3_config.secret
});
// Mongo Client
const client = new MongoClient(mo_config.url, { useUnifiedTopology: true });

// MYSQL
const GET_ALL_USERS = `select * from users`;
const FIND_USER = `select * from users where email = ?`;

const getAllUsers = db.mkQueryFromPool(db.mkQuery(GET_ALL_USERS), pool);
const findUser = db.mkQueryFromPool(db.mkQuery(FIND_USER), pool);

//-----------------------------
// Router rules
//-----------------------------
// Get all user is only valid for admin role
router.get('/', (req, res) => {
    getAllUsers()
        .then(result => {
            if (!result.length)
                return res.status(404).json({
                    message: 'Not found',
                    url: req.originalUrl,
                    status: 404
                })

            res.status(200).json(result);
        })
})

// Find all customers 
router.get('/customers',
    (req, res) => {
        // const userId; // get from jwt token in req
        const skip = req.query.start || 0;
        const limit = req.query.size || 20;

        client.db('fitness').collection('customers').find(
            {
                $and: [
                    // { user_id: userId || null},
                    { deleted: false }
                ]
            })
            .skip(skip)
            .limit(limit)
            .toArray()
            .then(result => {
                if (!result.length)
                    return res.status(404).json({
                        message: 'not found',
                        url: req.originalUrl,
                        status: 404
                    })

                console.info('Customers results: ', result);
                res.status(200).json(result);
            })
            .catch(err => {
                res.status(500).json({
                    message: 'retrieve error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

router.post('/customer', urlencoded,
    (req, res) => {
        const body = req.body;
        const now = new Date();

        client.db('fitness').collection('customers').insertOne({
            name: body.name,
            username: body.user_id || 'vincent_dummy',  // this should get from JWT
            height: parseFloat(body.height),
            birth_year: parseInt(body.birth_year),
            gender: body.gender,
            phone: body.phone,
            deleted: false,
            records: [],
            images: []
        })
            .then(result => {
                console.info('Add customer result: ', result.ops);
                res.status(201).json({
                    message: 'new customer added',
                    url: req.originalUrl,
                    status: 201
                })
            })
            .catch(err => {
                res.status(500).json({
                    message: 'server error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

router.put('/customers/:custId', urlencoded,
    (req, res) => {
        const userId = '' // TODO: retrieve from JWT token in req
        const custId = req.params.custId;
        const body = req.body;
        const now = new Date();

        console.info('Put customer id: ', custId)
        console.info('Put customer: ', body)

        client.db('fitness').collection('customers').updateOne(
            {
                $and: [
                    { _id: ObjectId(custId) }
                    // { user_id: userId }
                ]
            },
            {
                $set: {
                    name: body.name,
                    height: parseFloat(body.height),
                    birth_year: parseInt(body.birth_year),
                    gender: body.gender,
                    phone: body.phone
                }
            })
            .then(result => {
                console.info(`Update customer(${custId}) count: `, result.matchedCount);
                res.status(201).json({
                    message: 'update successful',
                    url: req.originalUrl,
                    status: 200
                })
            })
            .catch(err => {
                res.status(500).json({
                    message: 'server error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

router.delete('/customers/:custId',
    (req, res) => {
        const custId = req.params.custId;
        // const userId; // get from jwt token in req

        client.db('fitness').collection('customers').updateOne(
            {
                $and: [
                    { _id: ObjectId(custId) },
                    // { user_id: userId },
                    { deleted: false }
                ]
            },
            {
                $set: { deleted: true }
            })
            .then(result => {
                console.info(`>>> delete ${custId} count: `, result.modifiedCount);
                res.status(200).json({
                    message: 'deleted',
                    url: req.originalUrl,
                    status: 200
                })
            }).catch(err => {
                console.error(`>>> delete ${custId} error: `, err);
                res.status(500).json({
                    message: 'delete error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

// Find customer detail including records from a customer by id
router.get('/customers/:custId',
    (req, res) => {
        const custId = req.params.custId;

        const getRecords = (param) => {
            return (
                client.db('fitness').collection('records').aggregate(
                    [
                        {
                            $match: {
                                $and: [
                                    { cust_id: param },
                                    { deleted: false }
                                ]
                            }
                        },
                        {
                            $sort: {
                                recorded_date: -1
                            }
                        }
                    ])
                    .toArray()
            )
        }

        const getCustomer = (param) => {
            return (
                client.db('fitness').collection('customers').aggregate(
                    [
                        {
                            $match: {
                                $and: [
                                    { _id: ObjectId(param) },
                                    { deleted: false }
                                ]
                            }
                        }
                    ])
                    .toArray()
            )
        }

        Promise.all([getCustomer(custId), getRecords(custId)])
            .then(results => {
                if (!results[0].length)
                    return res.status(404).json({
                        message: 'not found',
                        url: req.originalUrl,
                        status: 404
                    })

                const customer = results[0][0];
                console.log('customer: ', customer);

                const records = results[1];
                console.log('records: ', records);
                customer['records'] = records;

                res.status(200).json(customer);
            })
            .catch(err => {
                res.status(500).json({
                    message: 'retrieve error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

router.get('/records',
    (req, res) => {
        client.db('fitness').collection('records').find()
            .toArray()
            .then(result => {
                if (!result.length)
                    return res.status(404).json({
                        message: 'not found',
                        url: req.originalUrl,
                        status: 404
                    })
                res.status(200).json(result);
            })
            .catch(err => {
                res.status(500).json({
                    message: 'retrieve error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

// Insert new record for a customer by id
router.post('/record', urlencoded,
    (req, res) => {
        const body = req.body;
        const custId = body.cust_id;
        const now = new Date();

        console.log('New Records Body: ', body);
        client.db('fitness').collection('records').insertOne(
            {
                cust_id: custId,
                weight: parseFloat(body.weight),
                fat_percentage: parseFloat(body.fat_percentage),
                visceral_fat: parseFloat(body.visceral_fat),
                bmi: parseFloat(body.bmi),
                metabolism: parseInt(body.metabolism),
                muscle_percentage: parseFloat(body.muscle_percentage),
                body_age: parseInt(body.body_age),
                carotenoid: parseInt(body.carotenoid),
                updated_on: now,
                recorded_date: Date(body.recorded_date),
                deleted: false
            }
        ).then(result => {
            res.status(201).json({
                message: 'inserted',
                url: req.originalUrl,
                status: 201
            })
        }).catch(err => {
            res.status(500).json({
                message: 'inserted error',
                url: req.originalUrl,
                status: 500
            })
        })
    }
)

// Find one record by id
router.get('/records/:id', (req, res) => {
    const recordId = req.params.id;

    client.db('fitness').collection('records').findOne(
        {
            _id: ObjectId(recordId)
        })
        .then(result => {
            if (result == null)
                return res.status(404).json({
                    message: 'not found',
                    url: req.originalUrl,
                    status: 404
                })
            res.status(200).json(result);
        }).catch(err => {
            console.error(`>>> delete ${recordId} error: `, err);
            res.status(500).json({
                message: 'find one error',
                url: req.originalUrl,
                status: 500
            })
        })
})

// Update a record by id
router.put('/records/:id', urlencoded,
    (req, res) => {
        const recordId = req.params.id;
        const body = req.body;
        const now = new Date();

        client.db('fitness').collection('records').updateOne(
            { _id: ObjectId(recordId) },
            {
                $set: {
                    weight: parseFloat(body.weight),
                    fat_percentage: parseFloat(body.fat_percentage),
                    visceral_fat: parseFloat(body.visceral_fat),
                    bmi: parseFloat(body.bmi),
                    metabolism: parseInt(body.metabolism),
                    muscle_percentage: parseFloat(body.muscle_percentage),
                    body_age: parseInt(body.body_age),
                    updated_on: now,
                    recorded_date: Date(body.recorded_date)
                }
            })
            .then(result => {
                console.info(`>>> updated ${recordId} count: `, result.modifiedCount);
                res.status(200).json({
                    message: 'updated',
                    url: req.originalUrl,
                    status: 200
                })
            }).catch(err => {
                console.error(`>>> updated ${recordId} error: `, err);
                res.status(500).json({
                    message: 'update error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

// Soft delete a record by id
router.delete('/records/:id',
    (req, res) => {
        const recordId = req.params.id;
        client.db('fitness').collection('records').updateOne(
            {
                $and: [
                    { _id: ObjectId(recordId) },
                    { deleted: false }
                ]
            },
            {
                $set: { deleted: true }
            })
            .then(result => {
                console.info(`>>> delete ${recordId} count: `, result.modifiedCount);
                res.status(200).json({
                    message: 'deleted',
                    url: req.originalUrl,
                    status: 200
                })
            }).catch(err => {
                console.error(`>>> delete ${recordId} error: `, err);
                res.status(500).json({
                    message: 'delete error',
                    url: req.originalUrl,
                    status: 500
                })
            })
    }
)

router.post('/photo', uploadPhoto.single('image-file'),
    (req, res) => {
        console.info('Files', req.file);
        console.info('Body', req.body['custId']);
        res.on('finish', () => {
            fs.unlink(req.file.path, err => { });
        })

        const custId = req.body.custId;
        const now = '' + (new Date()).getTime();

        fs.readFile(req.file.path,
            (err, imgFile) => {
                const params = {
                    Bucket: 'fitness',
                    Key: `${custId}/${req.file.filename}`,
                    Body: imgFile,
                    ACL: 'public-read',
                    ContentType: req.file.mimetype,
                    Metadata: {
                        update: now
                    }
                };

                s3.putObject(params, (err, result) => {
                    if (err)
                        return res.status(500).json({
                            message: 'upload photo error',
                            url: req.originalUrl,
                            status: 500
                        })

                    client.db('fitness').collection('customers').updateOne(
                        {
                            _id: ObjectId(custId)
                        },
                        {
                            $push: {
                                images: {
                                    filename: req.file.filename,
                                    path: `${custId}/${req.file.filename}`,
                                    uploaded_on: now
                                }
                            }
                        }
                    )
                        .then(result => {
                            res.status(200).json({
                                filename: req.file.filename
                            })
                        })
                        .catch(err => {
                            res.status(500).json({
                                message: 'delete error',
                                url: req.originalUrl,
                                status: 500
                            })
                        })
                })
            })
    }
)

// Retrieve photo from s3
router.get('/photo', (req, res) => {
    const filepath = req.query.path;
    console.log('Filepath: ', filepath);

    const params = {
        Bucket: 'fitness',
        Key: filepath
    }
    s3.getObject(params, (err, imageFile) => {
        console.log('Image File: ', imageFile);
        res.status(200).type(imageFile.ContentType).send(imageFile.Body);
    })
    // http.get(`https://fitness.sgp1.digitaloceanspaces.com/${filepath}`)
    //     .then(result => {
    //         console.log('image data: ', result);
    //         res.status(200).send(result);
    //     })
    //     .catch(err => {
    //         res.status(500).json({
    //             message: 'get image error',
    //             url: req.originalUrl,
    //             status: 500
    //         })
    //     })
})



//-----------------------------
// Connections
//-----------------------------
const poolConn = () => {
    return (
        new Promise((resolve, reject) => {
            pool.getConnection(
                (err, conn) => {
                    if (err) {
                        console.error('Cannot get database: ', err);
                        reject(err)
                    }
                    conn.ping(err => {
                        if (err) {
                            console.error('Cannot ping database: ', err);
                            return reject(err);
                        }
                        resolve();
                    })
                })
        })
    )
}

const clientConn = () => {
    return (
        new Promise((resolve, reject) => {
            client.connect((err, _) => {
                if (err) {
                    console.error('>>> Could not connect to MongoDB database: ', err);
                    reject(err);
                }

                resolve(null);
            })
        })
    )
}

const connections = {
    pool: poolConn,
    client: clientConn
}

module.exports = { router, connections };