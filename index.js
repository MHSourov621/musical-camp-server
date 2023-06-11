require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }

    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tsr81r8.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();


        const usersCollection = client.db('misicalCamp').collection('users');
        const classesCollection = client.db('misicalCamp').collection('classes');
        const selectedCollection = client.db('misicalCamp').collection('selected');
        const paymentCollection = client.db('misicalCamp').collection('payment');

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '30d' })
            res.send({ token })
        })


        //users api

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send('user already existing')
            }
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.get('/admin/:email', verifyJWT,  async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.send({ admin: false })
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result)
        })

        app.get('/instructor/:email', verifyJWT,  async (req, res) => {
            const email = req.params.email;

            // if (req.decoded.email !== email) {
            //     res.send({ admin: false })
            // }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result)
        })

        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result)
        })

        //instructor api

        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })


        //classes api

        app.get('/classes', async (req, res) => {
            const query = { status: 'approved' }
            const result = await classesCollection.find(query).sort({ available_seats: 1 }).toArray();
            res.send(result)
        })

        app.get('/classesmanage', async (req, res) => {
            const query = { status: 'pending' }
            const result = await classesCollection.find(query).toArray();
            res.send(result)
        })

        app.get('/classes/:email', async(req, res) => {
            const email = req.params.email;
            const query = {email: email};
            const result = await classesCollection.find(query).toArray();
            res.send(result); 
        })

        app.post('/classes', async(req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result)
        })

        app.patch('/classesapprove/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved'
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.patch('/classesdeny/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'deny',
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        

        app.put('/class/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const {seat} = req.body;
            const filter = { $or: [{_id: new ObjectId(id)}, {_id: id}] };
            const updateDoc = {
                $set: {
                    available_seats: parseInt(seat)
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // selected api

        app.get('/selected/:email', async(req, res) => {
            const email = req.params.email;
            const query = {email: email, payment: "pending"};
            const result = await selectedCollection.find(query).toArray();
            res.send(result); 
        })

        app.get('/selectedEnroll/:email', async(req, res) => {
            const email = req.params.email;
            const query = {email: email, payment: "done"};
            const result = await selectedCollection.find(query).toArray();
            res.send(result); 
        })

        app.get('/select/:id', async(req, res) => {
            const id = req.params.id;
            const query = {_id : new ObjectId(id)};
            const result = await selectedCollection.findOne(query);
            res.send(result);
        })

        app.post('/selected', async(req, res) => {
            const course = req.body;
            const result = await selectedCollection.insertOne(course);
            res.send(result);
        })

        app.patch('/selectedpatch/:id', async (req, res) => {
            const id = req.params.id;
            const {seat} = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    payment: 'done',
                    available_seats: parseInt(seat)
                },
            };
            const result = await selectedCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.delete('/selected/:id', async(req, res) => {
            const id = req.params.id;
            const query = {_id : new ObjectId(id)};
            const result = await selectedCollection.deleteOne(query);
            res.send(result)
        })

        //create payment intent

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        //payment api

        app.get('/payments', async(req, res) => {
            const result = await paymentCollection.find().sort({data: -1}).toArray();
            res.send(result);
        })

        app.post('/payments', verifyJWT, async(req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);
            res.send(insertResult)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('musical camp')
})

app.listen(port, () => {
    console.log(`musical camp running on port ${port}`);
})

