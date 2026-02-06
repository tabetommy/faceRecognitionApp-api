require('dotenv').config();
const express=require('express');
const bodyParser=require("body-parser");
const bcrypt=require('bcryptjs');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken'); 

const cors= require("cors");
const corsOptions ={
    origin:'*', 
    credentials:true,           
    optionSuccessStatus:200,
 }

 const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 4000,
  ssl: {
        rejectUnauthorized: true // Node.js uses built-in CAs, so this works out of the box
    }
    });


 
const app= express();
// Use the port Render gives you, or default to 3000 for local testing
const PORT = process.env.PORT || 3000;
// Use a secret from your .env file!
const JWT_SECRET = process.env.JWT_SECRET ;

app.use(bodyParser.json());
app.use(cors(corsOptions));

app.get('/',(req,res)=>{
    // res.send(database.users)
    res.send('Face Recognition API is running');
})


app.post('/register', async (req, res) => {
    console.log(req.body)
    const { username, password } = req.body;

    // 1. Basic Validation
    if (!username || !password) {
        return res.status(400).json('Username and password are required');
    }

    // 2. Hash Password (never store plain text!)
    const hash = bcrypt.hashSync(password, 10);

    try {
        // 3. Insert into TiDB
       // Destructuring [result] only works with mysql2/promise
        const [result] = await db.execute(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hash] // 'hash' is your variable, 'password' is the DB column
        );

        // 4. Return success (don't send the hash back to the user)
        res.json({
            id: result.insertId,
            username: username,
            joined: new Date()
        });

    } catch (err) {
        // Handle unique constraint violation (if username already exists)
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json('Username is already taken');
        }
        
        console.error("Registration Error:", err);
        res.status(500).json('Unable to register at this time');
    }
});



app.post('/signin', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json('Missing credentials');
    }

    try {
        // 1. Look for user in TiDB
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) {
            return res.status(400).json('Invalid username or password');
        }

        const user = rows[0];

        // 2. Compare hashed password
        const isValid = bcrypt.compareSync(password, user.password);

        if (isValid) {
            // 3. Create a JWT Token
            const token = jwt.sign(
                { id: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            // 4. Send back user info AND the token
            return res.json({
                token: token,
                user: {
                    id: user.id,
                    username: user.username,
                    entries: user.entries, // For your tracking system
                    joined: user.joined
                }
            });
        } else {
            res.status(400).json('Invalid username or password');
        }
    } catch (err) {
        console.error("Signin Error:", err);
        res.status(500).json('Error logging in');
    }
});


app.post('/imageurl', (req, res) => {
  const { input } = req.body;
  
  const raw = JSON.stringify({
    "user_app_id": {
      "user_id": "clarifai", 
      "app_id": "main"  
    },
    "inputs": [
      {
        "data": {
          "image": {
            "url": input
          }
        }
      }
    ]
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Key ' + process.env.CLARIFAI_API_KEY
    },
    body: raw
  };

  // FIXED URL: Points to the 'clarifai' user and 'main' app where the model lives
  fetch("https://api.clarifai.com/v2/models/face-detection/outputs", requestOptions)
    .then(response => response.json())
    .then(data => {
      res.json(data);
    })
    .catch(err => res.status(400).json('unable to work with API'));
});

app.listen(PORT,'0.0.0.0',()=>{
    console.log(`app is running on port ${PORT}`)
})

