require('dotenv').config();
const express=require('express');
const bodyParser=require("body-parser");
const bcrypt=require('bcryptjs');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken'); 
const { z } = require('zod');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const cors= require("cors");
const corsOptions ={
    origin:'https://facerecognitionapp-api-zzin.onrender.com/', 
    methods: ['GET', 'POST', 'PUT'],
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

// Zod Schemas for input validation
const registerSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username too long"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .refine((val) => /[A-Z]/.test(val), {
      message: "Password must contain at least one capital letter",
    })
    .refine((val) => /[0-9]/.test(val), {
    message: "Password must contain at least one number",
    })
    .refine((val) => /[!@#$%^&*]/.test(val), {
      message: "Password must contain at least one special character",
    }),
});

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  validate: { xForwardedForHeader: false }, // Disables the strict validation check for dev
  message: { error: 'Too many attempts' }
});


// Middleware
app.use(bodyParser.json());
app.use(cors(corsOptions));
app.use(helmet());

const verifyToken = (req, res, next) => {
    // 1. Get the token from the header (format: "Bearer <token>")
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json('Access denied. No token provided.');
    }

    try {
        // 2. Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. Attach user info to the request object so the route can use it
        req.user = decoded; 
        
        // 4. Move to the next function (the actual route)
        next();
    } catch (err) {
        res.status(403).json('Invalid or expired token.');
    }
};

//Begin Routes

app.get('/',(req,res)=>{
    // res.send(database.users)
    res.send('Face Recognition API is running, test 2');
})


app.post('/register',authLimiter,async (req, res) => {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
        // Zod returns a deeply nested error object; we flatten it for the frontend
        return res.status(400).json({ 
            error: result.error.issues[0].message 
        });
    }
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
      
         const token = jwt.sign(
                { id: result.insertId, username: username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

        // 4. Return success (don't send the hash back to the user)
        res.json({
            token: token,
            user: {
            id: result.insertId,
            username: username,
            joined: new Date(),
            entries:0
        }});

    } catch (err) {
        // Handle unique constraint violation (if username already exists)
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json('Username is already taken');
        }
        
        console.error("Registration Error:", err);
        res.status(500).json('Unable to register at this time');
    }
});



app.post('/signin',authLimiter, async (req, res) => {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
        // Zod returns a deeply nested error object; we flatten it for the frontend
        return res.status(400).json({ 
            error: result.error.issues[0].message 
        });
    }
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
                    joined: user.joined,
                    entries: user.entries
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


app.post('/imageurl',verifyToken, (req, res) => {
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

app.put('/image',verifyToken, async (req, res) => {
    const { username } = req.body;

    try {
        // 1. Update the count in TiDB
        await db.execute(
            'UPDATE users SET entries = entries + 1 WHERE username = ?',
            [username]
        );

        // 2. Get the updated count to send back to the UI
        const [rows] = await db.execute(
            'SELECT entries FROM users WHERE username = ?',
            [username]
        );

        if (rows.length > 0) {
            res.json(rows[0].entries);
        } else {
            res.status(404).json('User not found');
        }
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json('Unable to update entries');
    }
});

// This route is called automatically when the React app refreshes
app.get('/verify', verifyToken, async (req, res) => {
    try {
        // req.user was populated by the verifyToken middleware
        const userId = req.user.id;

        // Fetch the latest user data from TiDB
        const [rows] = await db.execute(
            'SELECT id, username, entries, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User no longer exists' });
        }

        // Send the user data back to the frontend
        // We don't send the password back for security reasons
        res.json(rows[0]);
        
    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT,'0.0.0.0',()=>{
    console.log(`app is running on port ${PORT}`)
})

