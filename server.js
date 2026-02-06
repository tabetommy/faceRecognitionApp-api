require('dotenv').config();
const express=require('express');
const bodyParser=require("body-parser");
const bcrypt=require('bcryptjs');
const mysql = require('mysql2/promise'); 

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

app.use(bodyParser.json());
app.use(cors(corsOptions));

app.get('/',(req,res)=>{
    // res.send(database.users)
    res.send('Face Recognition API is running');
})

// app.post('/signin', (req,res)=>{
//     const{email,password}= req.body;
//     if(!email||!password){
//         return res.status(400).json('Wrong form submission')
//     }
//  db.select('email', 'hash').from('login')
//  .where('email','=',req.body.email)
//  .then(data=>{
//     const isValid=bcrypt.compareSync(password, data[0].hash)
//     if(isValid){
//         return db.select('*').from('users')
//         .where('email','=',email)
//         .then(user=>{
//             res.json(user[0])
//         })
//         .catch(err=>res.status(400).json('Unable to get user'))
//     }else{
//         res.status(400).json('Wrong credentials')
//     }
//  })
//  .catch(err=>res.status(400).json('Wrong credentials'))
// })

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

// app.get('/profile/:id',(req,res)=>{
//     const{id}=req.params;
//     db.select('*').from('users')
//     .where({id:id})
//     .then(user=>{
//         if(user.length){
//             res.json(user[0])
//         } else{
//             res.status(400).json('Error getting data')
//         }    
//     })
   
// })

// app.put('/image', (req,res)=>{
//     const{id}=req.body;
//     db('users').where('id','=',id)
//     .increment('entries',1)
//     .returning('entries')
//     .then(entries=>{
//         res.json(entries[0])
//     })
//     .catch(err=>res.status(400).json('unable to get entries'))
// })



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

